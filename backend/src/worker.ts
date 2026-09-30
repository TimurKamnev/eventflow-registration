import { pool } from "./db.js";
import { frontendOrigin } from "./links.js";

export interface WorkerTickResult {
  remindersCreated: number;
  notificationsProcessed: number;
}

// Напоминание получают подтверждённые участники и те, кто уже прошёл чекин —
// оба всё ещё "участники события" в смысле этого уведомления. 'waitlisted' и
// 'cancelled' напоминание не получают.
const REMINDER_RECIPIENT_STATUSES = ["confirmed", "checked_in"];

// Один SQL-запрос на всех подходящих участников события, до которого осталось
// не более 24 часов, но которое ещё не наступило. ON CONFLICT — та же
// гарантия "один раз на schedule_version", что и у ticket/waitlist: не
// зависит от того, сколько раз запущен воркер и сколько раз перезапускался
// backend, потому что уникальность живёт в БД, а не в памяти процесса.
export async function createDueReminders(): Promise<number> {
  const result = await pool.query(
    `insert into notifications (event_id, registration_id, type, schedule_version, payload)
     select
       r.event_id,
       r.id,
       'reminder',
       e.schedule_version,
       jsonb_build_object(
         'event_title', e.title,
         'starts_at', e.starts_at,
         'ticket_code', r.ticket_code,
         'my_registration_url', $2 || '/my/' || r.access_token
       )
     from registrations r
     join events e on e.id = r.event_id
     where r.status = any($1)
       and e.starts_at > now()
       and e.starts_at <= now() + interval '24 hours'
     on conflict (registration_id, type, schedule_version) do nothing
     returning notifications.id`,
    [REMINDER_RECIPIENT_STATUSES, frontendOrigin()]
  );
  return result.rowCount ?? 0;
}

// Почему проверка версии расписания не одинакова для всех типов:
// - reminder/reschedule сообщают КОНКРЕТНУЮ дату; версия, отличная от текущей,
//   означает, что дата уже другая, и это письмо просто устарело — по нему
//   либо уже создано, либо будет создано свежее для актуальной версии.
// - ticket/waitlist сообщают не дату, а факт "у вас есть место"/"вы в
//   очереди" — этот факт не устаревает от переноса даты. Пропускать их из-за
//   несовпадения версии означало бы отобрать у участника единственное
//   уведомление о месте/очереди только потому, что организатор
//   поменял дату до того, как воркер успел их обработать. Поэтому для этих
//   типов версия не проверяется, а дата в письме берётся актуальная на
//   момент отправки (событие могло быть перенесено уже после постановки
//   письма в очередь).
function isStaleByScheduleVersion(type: string): boolean {
  return type === "reminder" || type === "reschedule";
}

// Забирает и обрабатывает одну pending-запись атомарно.
//
// SKIP LOCKED на notifications защищает только от двух воркеров, взявших
// ОДНУ И ТУ ЖЕ запись — но registrations/events, присоединённые обычным
// JOIN без блокировки, могли бы за время между чтением и COMMIT измениться
// из-под нас (отмена регистрации, перенос события). Поэтому после захвата
// notification эти две строки перечитываются и блокируются ЗДЕСЬ ЖЕ, в той
// же транзакции, и решение sent/skipped принимается только по данным,
// прочитанным после захвата собственных блокировок — не по join-у из
// первого запроса.
//
// Порядок блокировок — event, затем registration — совпадает с
// cancelMyRegistration и updateEvent (см. registrations.ts/events.ts): все
// три места лочат в одном и том же порядке, поэтому цикл ожидания
// (deadlock) между воркером и любым из этих обработчиков невозможен.
// Единственное, что может произойти, — воркер подождёт на LOCK события,
// пока не закоммитится чужая транзакция, и увидит уже свежие данные.
async function processOnePendingNotification(): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const claimed = await client.query(
      `select id, type, schedule_version, event_id, registration_id
       from notifications
       where dispatch_status = 'pending'
       order by created_at
       for update skip locked
       limit 1`
    );

    const notification = claimed.rows[0];
    if (!notification) {
      await client.query("ROLLBACK");
      return false;
    }

    // Обычный FOR UPDATE (не SKIP LOCKED) — здесь мы должны дождаться и
    // увидеть актуальное состояние, а не пропустить работу при конфликте.
    const eventResult = await client.query(
      "select schedule_version, starts_at, title from events where id = $1 for update",
      [notification.event_id]
    );
    const event = eventResult.rows[0];

    const registrationResult = await client.query(
      "select status from registrations where id = $1 for update",
      [notification.registration_id]
    );
    const registration = registrationResult.rows[0];

    // Проверяем актуальность по данным, прочитанным только что, под своей
    // же блокировкой — не по устаревшему снимку из момента постановки в
    // очередь и не по join-у, который никто не лочил.
    let skipReason: string | null = null;
    if (registration.status === "cancelled") {
      skipReason = "registration_cancelled";
    } else if (notification.type === "waitlist" && registration.status !== "waitlisted") {
      // Место уже занято (confirmed/checked_in) — про очередь напоминать
      // нечего, отдельное 'ticket'-уведомление про место уже создано при
      // продвижении и будет обработано своей строкой.
      skipReason = "promoted_since_queued";
    } else if (
      isStaleByScheduleVersion(notification.type) &&
      notification.schedule_version !== event.schedule_version
    ) {
      skipReason = "stale_schedule_version";
    } else if (notification.type === "reminder" && new Date(event.starts_at).getTime() <= Date.now()) {
      skipReason = "event_already_started";
    }

    if (skipReason) {
      await client.query(
        `update notifications
         set dispatch_status = 'skipped', skip_reason = $2, processed_at = now()
         where id = $1`,
        [notification.id, skipReason]
      );
    } else {
      // Здесь была бы реальная отправка через SMTP. Она эмулируется: письмо
      // не гарантированно доставлено куда-то вовне, гарантируется только то,
      // что запись создана один раз (уникальный индекс) и обработана один
      // раз (эта транзакция). Дата/название в payload обновляются на
      // актуальные из events — событие могло быть перенесено уже после
      // постановки этого письма в очередь (актуально для ticket/waitlist,
      // для reminder/reschedule они и так совпадают — иначе письмо было бы
      // помечено skipped выше). Не логируем payload — в нём access_token/ticket_code.
      await client.query(
        `update notifications
         set dispatch_status = 'sent',
             sent_at = now(),
             processed_at = now(),
             payload = payload || jsonb_build_object('event_title', $2::text, 'starts_at', $3::timestamptz)
         where id = $1`,
        [notification.id, event.title, event.starts_at]
      );
    }

    await client.query("COMMIT");
    console.log(
      `notification ${notification.id} (${notification.type}) -> ${
        skipReason ? `skipped: ${skipReason}` : "sent"
      }`
    );
    return true;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("processOnePendingNotification failed:", err);
    return false;
  } finally {
    client.release();
  }
}

async function processAllPendingNotifications(): Promise<number> {
  let processed = 0;
  // Пока claim находит строки — обрабатываем; false означает "очередь пуста"
  // (или единичная ошибка, тоже останавливаемся, чтобы не крутиться вхолостую).
  while (await processOnePendingNotification()) {
    processed++;
  }
  return processed;
}

export async function runWorkerTick(): Promise<WorkerTickResult> {
  const remindersCreated = await createDueReminders();
  const notificationsProcessed = await processAllPendingNotifications();
  return { remindersCreated, notificationsProcessed };
}
