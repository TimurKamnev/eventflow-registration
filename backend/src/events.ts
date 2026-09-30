import type { Response } from "express";
import { pool } from "./db.js";
import type { AuthedRequest } from "./auth.js";
import { parseCapacity, parseDescription, parseStartsAt, parseTitle } from "./validation.js";
import { OCCUPYING_STATUSES } from "./constants.js";
import { handleError } from "./http.js";
import { frontendOrigin } from "./links.js";

export async function createEvent(req: AuthedRequest, res: Response) {
  try {
    const body = req.body ?? {};
    const title = parseTitle(body.title);
    const description = parseDescription(body.description);
    const startsAt = parseStartsAt(body.starts_at);
    const capacity = parseCapacity(body.capacity);

    const result = await pool.query(
      `insert into events (title, description, starts_at, capacity)
       values ($1, $2, $3, $4)
       returning *`,
      [title, description, startsAt.toISOString(), capacity]
    );
    res.status(201).json({ event: result.rows[0] });
  } catch (err) {
    handleError(err, res);
  }
}

export async function listEvents(_req: AuthedRequest, res: Response) {
  try {
    const result = await pool.query("select * from events order by starts_at asc");
    res.json({ events: result.rows });
  } catch (err) {
    handleError(err, res);
  }
}

export async function getEvent(req: AuthedRequest, res: Response) {
  try {
    const result = await pool.query("select * from events where id = $1", [req.params.id]);
    const event = result.rows[0];
    if (!event) return res.status(404).json({ error: "not_found" });
    res.json({ event });
  } catch (err) {
    handleError(err, res);
  }
}

export async function updateEvent(req: AuthedRequest, res: Response) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const current = await client.query("select * from events where id = $1 for update", [
      req.params.id,
    ]);
    const event = current.rows[0];
    if (!event) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "not_found" });
    }

    const body = req.body ?? {};
    // Те же функции валидации, что и в createEvent — PATCH не должен быть строже
    // или мягче POST для одних и тех же полей. Поле, которого нет в теле запроса,
    // остаётся прежним (частичное обновление); присланное — проверяется наравне с созданием.
    const nextTitle = body.title !== undefined ? parseTitle(body.title) : event.title;
    const nextDescription =
      body.description !== undefined ? parseDescription(body.description) : event.description;
    const nextStartsAt =
      body.starts_at !== undefined ? parseStartsAt(body.starts_at) : new Date(event.starts_at);
    const nextCapacity = body.capacity !== undefined ? parseCapacity(body.capacity) : event.capacity;

    if (nextCapacity !== event.capacity) {
      const occupied = await client.query(
        `select count(*)::int as count from registrations
         where event_id = $1 and status = any($2)`,
        [event.id, OCCUPYING_STATUSES]
      );
      const occupiedCount = occupied.rows[0].count;
      if (nextCapacity < occupiedCount) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "capacity_below_occupied",
          occupied: occupiedCount,
        });
      }
    }

    const startsAtChanged = nextStartsAt.getTime() !== new Date(event.starts_at).getTime();
    const nextVersion = startsAtChanged ? event.schedule_version + 1 : event.schedule_version;

    const updated = await client.query(
      `update events
       set title = $1, description = $2, starts_at = $3, capacity = $4,
           schedule_version = $5, updated_at = now()
       where id = $6
       returning *`,
      [nextTitle, nextDescription, nextStartsAt.toISOString(), nextCapacity, nextVersion, event.id]
    );

    // Перенос даты — уведомление reschedule всем активным участникам, в той
    // же транзакции, что и сам перенос. Правка только capacity/title/description
    // (startsAtChanged=false) уведомлений не создаёт — это не то же событие
    // для участника, который уже получил билет на конкретную дату.
    // checked_in — тоже активный участник: чекин не привязан к тому, началось
    // ли событие (checkinByCode это не проверяет), поэтому перенос может
    // случиться уже после того, как кто-то отмечен на входе, и его тоже нужно
    // предупредить.
    if (startsAtChanged) {
      await client.query(
        `insert into notifications (event_id, registration_id, type, schedule_version, payload)
         select
           $1, r.id, 'reschedule', $2,
           jsonb_build_object(
             'event_title', $3::text,
             'starts_at', $4::timestamptz,
             'ticket_code', r.ticket_code,
             'my_registration_url', $5 || '/my/' || r.access_token
           )
         from registrations r
         where r.event_id = $1 and r.status in ('confirmed', 'waitlisted', 'checked_in')
         on conflict (registration_id, type, schedule_version) do nothing`,
        [event.id, nextVersion, nextTitle, nextStartsAt.toISOString(), frontendOrigin()]
      );
    }

    await client.query("COMMIT");
    res.json({ event: updated.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    handleError(err, res);
  } finally {
    client.release();
  }
}
