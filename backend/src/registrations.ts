import type { Request, Response } from "express";
import { pool } from "./db.js";
import { OCCUPYING_STATUSES } from "./constants.js";
import { generateAccessToken, generateTicketCode } from "./ids.js";
import { parseEmail } from "./validation.js";
import { handleError } from "./http.js";
import { broadcastEventCounts } from "./ws.js";
import { myRegistrationUrl } from "./links.js";

const NEUTRAL_RESPONSE = {
  message: "Если регистрация возможна, письмо с деталями придёт на указанный email.",
};

// Имена constraint'ов из backend/db/schema.sql — используются, чтобы отличить
// "уже есть активная регистрация на этот email" (ожидаемо, ответ нейтральный)
// от коллизии сгенерированного access_token/ticket_code (не про email вообще,
// нужно просто перегенерировать и повторить вставку).
const ACTIVE_EMAIL_CONSTRAINT = "registrations_active_email_idx";
const ACCESS_TOKEN_CONSTRAINT = "registrations_access_token_key";
const TICKET_CODE_CONSTRAINT = "registrations_ticket_code_key";
const MAX_ID_COLLISION_ATTEMPTS = 3;

interface PgError extends Error {
  code?: string;
  constraint?: string;
}

export async function getPublicEvent(req: Request, res: Response) {
  try {
    const result = await pool.query("select * from events where id = $1", [req.params.id]);
    const event = result.rows[0];
    if (!event) return res.status(404).json({ error: "not_found" });

    const occupied = await pool.query(
      `select count(*)::int as count from registrations
       where event_id = $1 and status = any($2)`,
      [event.id, OCCUPYING_STATUSES]
    );
    const remaining = Math.max(0, event.capacity - occupied.rows[0].count);

    res.json({
      event: {
        id: event.id,
        title: event.title,
        description: event.description,
        starts_at: event.starts_at,
        capacity: event.capacity,
        remaining,
        isFull: remaining <= 0,
      },
    });
  } catch (err) {
    handleError(err, res);
  }
}

export async function registerForEvent(req: Request, res: Response) {
  try {
    const email = parseEmail((req.body ?? {}).email);
    await registerWithRetry(req.params.id, email, res);
  } catch (err) {
    handleError(err, res);
  }
}

// Коллизия access_token/ticket_code не про регистрацию/email вообще — это
// просто редкое совпадение случайных значений. Транзакция после unique_violation
// уже в состоянии aborted, поэтому единственный вариант — начать заново с
// новой сгенерированной парой значений, а не пытаться продолжить ту же транзакцию.
async function registerWithRetry(eventId: string, email: string, res: Response) {
  for (let attempt = 1; attempt <= MAX_ID_COLLISION_ATTEMPTS; attempt++) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const eventResult = await client.query("select * from events where id = $1 for update", [
        eventId,
      ]);
      const event = eventResult.rows[0];
      if (!event) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "not_found" });
      }

      // Регистрация после начала события закрыта — правило общее для любого
      // email, не зависит от того, зарегистрирован ли он уже, поэтому здесь
      // уместен обычный явный ответ, а не нейтральный (это не про приватность).
      if (new Date(event.starts_at).getTime() <= Date.now()) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "event_already_started" });
      }

      // Активная регистрация на этот email уже есть — не создаём второе место
      // и не сообщаем об этом иначе, чем для новой заявки: email не доказывает
      // владение регистрацией, статус и токены сюда не попадают.
      const existing = await client.query(
        `select id from registrations
         where event_id = $1 and lower(email) = $2 and status <> 'cancelled'`,
        [event.id, email]
      );

      const isNewRegistration = existing.rows.length === 0;
      if (isNewRegistration) {
        const occupied = await client.query(
          `select count(*)::int as count from registrations
           where event_id = $1 and status = any($2)`,
          [event.id, OCCUPYING_STATUSES]
        );
        const isConfirmed = occupied.rows[0].count < event.capacity;
        const accessToken = generateAccessToken();
        const ticketCode = isConfirmed ? generateTicketCode() : null;

        const inserted = await client.query(
          `insert into registrations (event_id, email, status, access_token, ticket_code)
           values ($1, $2, $3, $4, $5)
           returning id`,
          [event.id, email, isConfirmed ? "confirmed" : "waitlisted", accessToken, ticketCode]
        );

        await client.query(
          `insert into notifications (event_id, registration_id, type, schedule_version, payload)
           values ($1, $2, $3, $4, $5)
           on conflict (registration_id, type, schedule_version) do nothing`,
          [
            event.id,
            inserted.rows[0].id,
            isConfirmed ? "ticket" : "waitlist",
            event.schedule_version,
            JSON.stringify({
              event_title: event.title,
              starts_at: event.starts_at,
              ticket_code: ticketCode,
              my_registration_url: myRegistrationUrl(accessToken),
            }),
          ]
        );
      }

      await client.query("COMMIT");
      if (isNewRegistration) await broadcastEventCounts(event.id);
      return res.status(202).json(NEUTRAL_RESPONSE);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      const constraint = (err as PgError).constraint;

      if (constraint === ACTIVE_EMAIL_CONSTRAINT) {
        // Гонку поймал уникальный индекс БД (защита на случай, если блокировка
        // строки события почему-то не сработала) — тот же нейтральный ответ.
        return res.status(202).json(NEUTRAL_RESPONSE);
      }

      const isIdCollision =
        constraint === ACCESS_TOKEN_CONSTRAINT || constraint === TICKET_CODE_CONSTRAINT;
      if (isIdCollision && attempt < MAX_ID_COLLISION_ATTEMPTS) {
        continue; // новая попытка с новыми access_token/ticket_code
      }

      handleError(err, res);
      return;
    } finally {
      client.release();
    }
  }
}

export async function getMyRegistration(req: Request, res: Response) {
  try {
    const result = await pool.query(
      `select r.*, e.title as event_title, e.description as event_description,
              e.starts_at as event_starts_at
       from registrations r
       join events e on e.id = r.event_id
       where r.access_token = $1`,
      [req.params.token]
    );
    const reg = result.rows[0];
    if (!reg) return res.status(404).json({ error: "not_found" });

    let waitlistPosition: number | null = null;
    if (reg.status === "waitlisted") {
      const position = await pool.query(
        `select count(*)::int as count from registrations
         where event_id = $1 and status = 'waitlisted' and seq < $2`,
        [reg.event_id, reg.seq]
      );
      waitlistPosition = position.rows[0].count + 1;
    }

    res.json({
      event: {
        title: reg.event_title,
        description: reg.event_description,
        starts_at: reg.event_starts_at,
      },
      status: reg.status,
      ticket_code: reg.ticket_code,
      waitlist_position: waitlistPosition,
      checked_in_at: reg.checked_in_at,
    });
  } catch (err) {
    handleError(err, res);
  }
}

export async function cancelMyRegistration(req: Request, res: Response) {
  for (let attempt = 1; attempt <= MAX_ID_COLLISION_ATTEMPTS; attempt++) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const lookup = await client.query(
        "select event_id from registrations where access_token = $1",
        [req.params.token]
      );
      if (lookup.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "not_found" });
      }
      const eventId = lookup.rows[0].event_id;

      // Блокировка строки события — тот же порядок, что и в регистрации/PATCH
      // события, иначе возможна гонка между отменой и параллельной регистрацией.
      const eventResult = await client.query("select * from events where id = $1 for update", [
        eventId,
      ]);
      const event = eventResult.rows[0];

      const regResult = await client.query(
        "select * from registrations where access_token = $1 for update",
        [req.params.token]
      );
      const registration = regResult.rows[0];

      if (registration.status === "checked_in") {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "cannot_cancel_after_checkin" });
      }
      if (registration.status === "cancelled") {
        await client.query("COMMIT");
        return res.json({ status: "cancelled" });
      }

      const wasConfirmed = registration.status === "confirmed";

      await client.query(
        "update registrations set status = 'cancelled', updated_at = now() where id = $1",
        [registration.id]
      );

      // Событие уже началось — очередь больше не двигаем. Отмена самого места
      // всё ещё разрешена (участник просто не придёт), но раздавать его дальше
      // по листу ожидания после старта не имеет смысла.
      const eventAlreadyStarted = new Date(event.starts_at).getTime() <= Date.now();

      if (wasConfirmed && !eventAlreadyStarted) {
        const nextInLine = await client.query(
          `select * from registrations
           where event_id = $1 and status = 'waitlisted'
           order by seq asc
           limit 1
           for update`,
          [event.id]
        );
        const promoted = nextInLine.rows[0];
        if (promoted) {
          const ticketCode = generateTicketCode();
          await client.query(
            "update registrations set status = 'confirmed', ticket_code = $1, updated_at = now() where id = $2",
            [ticketCode, promoted.id]
          );
          await client.query(
            `insert into notifications (event_id, registration_id, type, schedule_version, payload)
             values ($1, $2, 'ticket', $3, $4)
             on conflict (registration_id, type, schedule_version) do nothing`,
            [
              event.id,
              promoted.id,
              event.schedule_version,
              JSON.stringify({
                event_title: event.title,
                starts_at: event.starts_at,
                ticket_code: ticketCode,
                my_registration_url: myRegistrationUrl(promoted.access_token),
              }),
            ]
          );
        }
      }

      await client.query("COMMIT");
      await broadcastEventCounts(event.id);
      return res.json({ status: "cancelled" });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});

      // Та же редкая коллизия случайного ticket_code, что и при регистрации
      // (см. registerWithRetry) — только здесь генерируется при продвижении
      // из очереди, а не при создании новой записи. Без повтора вся отмена
      // целиком откатывалась бы из-за случайного совпадения, не связанного
      // с действием участника.
      const constraint = (err as PgError).constraint;
      if (constraint === TICKET_CODE_CONSTRAINT && attempt < MAX_ID_COLLISION_ATTEMPTS) {
        continue;
      }

      handleError(err, res);
      return;
    } finally {
      client.release();
    }
  }
}
