// Единый воспроизводимый интеграционный сценарий для кейса №9. Не тестовый
// фреймворк — обычный скрипт (тот же стиль, что migrate.ts/seed.ts/workerCli.ts),
// запускается через `npm run scenario`. Требует уже поднятый backend
// (реальные HTTP-запросы через fetch — иначе гонку за последнее место не
// проверить) и читает тот же .env, что и сам backend (DATABASE_URL,
// ORGANIZER_EMAIL/ORGANIZER_PASSWORD).
//
// Что проверяется — через API и напрямую через БД, не только по HTTP-кодам
// (у публичного API кейса №9 намеренно нейтральные ответы, см. registrations.ts):
//   1. Два параллельных запроса на последнее место -> ровно один confirmed,
//      один waitlisted.
//   2. Третий участник, зарегистрированный следом, -> второй в очереди
//      (waitlisted), чтобы в очереди реально было двое — иначе FIFO не
//      доказать, порядок для одного элемента не значит ничего.
//   3. Повторная регистрация тем же email -> не меняет число активных
//      (не cancelled) строк.
//   4. Отмена confirmed-регистрации -> ПЕРВЫЙ по seq в очереди становится
//      confirmed и получает ticket_code, ВТОРОЙ остаётся waitlisted без
//      ticket_code — порядок проверяется по seq, не по случайному порядку
//      выборки.
//   5. Повторный чекин тем же кодом -> первый раз успех, второй раз отказ.
//   6. Повторный тик воркера подряд -> не создаёт дублей notifications.
//   7. Напоминание за 24ч до события создаётся и отправляется ровно один раз
//      на подтверждённого участника; повторный тик не дублирует.
//   8. Перенос даты события: уже ждущее отправки напоминание, устаревшее по
//      schedule_version, помечается skipped (а не отправляется с неактуальной
//      датой), а переносу соответствует собственное reschedule-уведомление,
//      которое доходит; место участника не теряется.
//
// Проверки 7 и 8 — на отдельных тестовых событиях (каждое со своим cleanup),
// а не на общем событии из проверок 1-6: там в это время уже отменённые/
// продвинутые/отмеченные чекином регистрации, что сделало бы напоминания и
// перенос даты не показательными.
//
// createDueReminders()/runWorkerTick() работают по ВСЕЙ подключённой БД, не
// только по тестовым событиям (см. оговорку про проверку 6 ниже) — поэтому
// ни одна проверка 7/8 не доверяет агрегатным числам, которые они возвращают
// (там может быть учтено чужое due-событие или чужая pending-запись). Вместо
// этого после каждого тика запрашивается состояние notifications, отдельно
// отфильтрованное по event_id/registration_id именно этого прогона.
//
// Проверка 8 (перенос даты) ещё и гонится с собственным фоновым интервалом
// backend (`WORKER_INTERVAL_MS`, по умолчанию 30с, index.ts): сценарий сам
// создаёт due-напоминание и намеренно НЕ обрабатывает его сразу, чтобы
// перенести дату, пока оно ещё pending, — если в этот момент успеет
// сработать интервал backend, он обработает напоминание раньше переноса, и
// проверка "устаревшее skipped" ничего не докажет. Перед запуском сценария
// backend стоит поднимать с большим WORKER_INTERVAL_MS (см. README); при
// маленьком интервале сценарий просто предупреждает об этом в консоли.
//
// Ничего не удаляет, кроме собственного тестового события (по конкретному id,
// созданному этим же прогоном) — с этим он же и группами данных, привязанными
// к нему по event_id. Не печатает access_token/ticket_code. Завершается
// ненулевым кодом при любой проваленной проверке.

import "dotenv/config";
import { pool } from "./db.js";
import { createDueReminders, runWorkerTick } from "./worker.js";

const API_URL = process.env.API_URL ?? "http://localhost:3000";
const ORGANIZER_EMAIL = process.env.ORGANIZER_EMAIL;
const ORGANIZER_PASSWORD = process.env.ORGANIZER_PASSWORD;

class ScenarioError extends Error {}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ScenarioError(message);
}

let sessionCookie = "";

async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      ...(options.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function ensureBackendReachable() {
  try {
    const res = await fetch(`${API_URL}/health`);
    assert(res.ok, `GET /health returned ${res.status}`);
  } catch (err) {
    throw new ScenarioError(
      `backend недоступен на ${API_URL} — запусти его отдельно (npm run dev) перед сценарием. (${
        err instanceof Error ? err.message : err
      })`
    );
  }
}

async function login() {
  assert(
    ORGANIZER_EMAIL && ORGANIZER_PASSWORD,
    "ORGANIZER_EMAIL/ORGANIZER_PASSWORD не заданы — проверь backend/.env"
  );
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ORGANIZER_EMAIL, password: ORGANIZER_PASSWORD }),
  });
  assert(res.status === 200, `логин организатора не удался: HTTP ${res.status}`);
  const setCookie = res.headers.get("set-cookie");
  assert(!!setCookie, "логин не вернул session cookie");
  sessionCookie = setCookie!.split(";")[0];
}

async function createTestEvent(): Promise<string> {
  const startsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const title = `[integration-scenario] ${new Date().toISOString()}`;
  const res = await api("/api/events", {
    method: "POST",
    body: JSON.stringify({ title, starts_at: startsAt, capacity: 1 }),
  });
  assert(res.status === 201, `не удалось создать тестовое событие: HTTP ${res.status}`);
  return res.body.event.id as string;
}

async function registerParticipant(eventId: string, email: string) {
  const res = await api(`/api/events/${eventId}/registrations`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  assert(res.status === 202, `регистрация ${email} должна вернуть 202, получено ${res.status}`);
}

async function scenarioRaceForLastSpot(eventId: string) {
  const emailA = `scenario-race-a-${Date.now()}@example.test`;
  const emailB = `scenario-race-b-${Date.now()}@example.test`;

  const [resA, resB] = await Promise.all([
    api(`/api/events/${eventId}/registrations`, {
      method: "POST",
      body: JSON.stringify({ email: emailA }),
    }),
    api(`/api/events/${eventId}/registrations`, {
      method: "POST",
      body: JSON.stringify({ email: emailB }),
    }),
  ]);
  // Ответ API намеренно нейтральный (202 в обоих случаях, кто бы ни победил) —
  // реальный исход проверяем в БД, а не по HTTP-коду.
  assert(
    resA.status === 202 && resB.status === 202,
    `оба запроса регистрации должны вернуть 202, получено ${resA.status}/${resB.status}`
  );

  const { rows } = await pool.query(
    `select email, status from registrations where event_id = $1 order by seq`,
    [eventId]
  );
  assert(rows.length === 2, `ожидались 2 регистрации, найдено ${rows.length}`);
  const confirmed = rows.filter((r) => r.status === "confirmed");
  const waitlisted = rows.filter((r) => r.status === "waitlisted");
  assert(confirmed.length === 1, `ожидался ровно 1 confirmed, получено ${confirmed.length}`);
  assert(waitlisted.length === 1, `ожидался ровно 1 waitlisted, получено ${waitlisted.length}`);

  console.log("[OK] гонка за последнее место -> ровно 1 confirmed и 1 waitlisted");
  return { emailA };
}

// Один человек в очереди не доказывает FIFO — порядок для единственного
// элемента ничего не значит. Регистрируем третьего участника ПОСЛЕ гонки
// (обычным последовательным запросом, не параллельно), чтобы перед отменой
// в очереди реально было двое в известном порядке прибытия.
async function scenarioAddSecondInQueue(eventId: string): Promise<string> {
  const emailC = `scenario-queue-c-${Date.now()}@example.test`;
  await registerParticipant(eventId, emailC);

  const { rows } = await pool.query(
    "select status from registrations where event_id = $1 and email = $2",
    [eventId, emailC]
  );
  assert(
    rows[0]?.status === "waitlisted",
    `третий участник должен попасть в лист ожидания, статус: ${rows[0]?.status}`
  );

  console.log("[OK] третий участник — второй в очереди (waitlisted), в очереди теперь двое");
  return emailC;
}

async function scenarioDuplicateEmail(eventId: string, email: string) {
  const activeCountQuery =
    "select count(*)::int as count from registrations where event_id = $1 and status <> 'cancelled'";
  const before = await pool.query(activeCountQuery, [eventId]);
  const res = await api(`/api/events/${eventId}/registrations`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  assert(res.status === 202, `повторная регистрация должна вернуть 202, получено ${res.status}`);
  const after = await pool.query(activeCountQuery, [eventId]);
  assert(
    before.rows[0].count === after.rows[0].count,
    `повторная регистрация тем же email не должна менять число активных строк (было ${before.rows[0].count}, стало ${after.rows[0].count})`
  );
  console.log("[OK] повторная регистрация тем же email не меняет число активных строк");
}

// Ключевая проверка FIFO: перед отменой в очереди должно быть РОВНО двое,
// чтобы порядок продвижения вообще что-то доказывал. Кто из них первый —
// определяем строго по seq (присваивается в БД при вставке под блокировкой
// события, см. registrations.ts), а не по порядку строк в ответе запроса.
async function scenarioCancelPromotesFirstInQueueByFifo(eventId: string): Promise<string> {
  const { rows } = await pool.query(
    "select id, status, access_token, ticket_code, seq from registrations where event_id = $1 order by seq",
    [eventId]
  );
  const confirmedRows = rows.filter((r) => r.status === "confirmed");
  const waitlistedRows = rows.filter((r) => r.status === "waitlisted"); // уже упорядочены по seq

  assert(
    confirmedRows.length === 1,
    `перед отменой ожидался ровно 1 confirmed, получено ${confirmedRows.length}`
  );
  assert(
    waitlistedRows.length === 2,
    `перед отменой ожидались ровно 2 waitlisted (для проверки FIFO нужно минимум двое), получено ${waitlistedRows.length}`
  );

  const confirmedRow = confirmedRows[0];
  const [firstInQueue, secondInQueue] = waitlistedRows;
  assert(
    firstInQueue.seq < secondInQueue.seq,
    "нарушен порядок seq в самой выборке — до отмены проверять нечего"
  );

  const cancelRes = await api(`/api/my/${confirmedRow.access_token}/cancel`, { method: "POST" });
  assert(
    cancelRes.status === 200 && cancelRes.body?.status === "cancelled",
    `отмена не удалась: HTTP ${cancelRes.status}`
  );

  const { rows: afterRows } = await pool.query(
    "select id, status, ticket_code from registrations where id = any($1::uuid[])",
    [[firstInQueue.id, secondInQueue.id]]
  );
  const firstAfter = afterRows.find((r) => r.id === firstInQueue.id)!;
  const secondAfter = afterRows.find((r) => r.id === secondInQueue.id)!;

  assert(
    firstAfter.status === "confirmed",
    `первый по seq в очереди должен стать confirmed после отмены, статус: ${firstAfter.status}`
  );
  assert(!!firstAfter.ticket_code, "у продвинутого первым по seq должен появиться ticket_code");
  assert(
    secondAfter.status === "waitlisted",
    `второй по seq должен остаться waitlisted, статус: ${secondAfter.status}`
  );
  assert(!secondAfter.ticket_code, "второй по seq не должен получить ticket_code");

  console.log(
    "[OK] отмена продвигает первого ПО SEQ в очереди (confirmed+ticket), второй остаётся waitlisted без билета — FIFO подтверждён на двоих"
  );
  return firstAfter.ticket_code as string;
}

async function scenarioDoubleCheckin(ticketCode: string) {
  const first = await api("/api/checkin", {
    method: "POST",
    body: JSON.stringify({ code: ticketCode }),
  });
  assert(
    first.status === 200 && first.body?.status === "checked_in",
    `первый чекин должен быть успешным, получено HTTP ${first.status}`
  );

  const second = await api("/api/checkin", {
    method: "POST",
    body: JSON.stringify({ code: ticketCode }),
  });
  assert(
    second.status === 409,
    `повторный чекин тем же кодом должен быть отклонён (409), получено ${second.status}`
  );

  console.log("[OK] повторный чекин тем же кодом: первый раз успех, второй — отказ");
}

// Вызывает тот же runWorkerTick, что и фоновый интервал в index.ts/CLI
// npm run worker — это глобальная функция по всей таблице notifications, не
// только по тестовому событию. Побочный эффект: если в базе уже лежали
// реальные pending-уведомления (от текущей работы через приложение), они
// тоже будут обработаны раньше срока — это ожидаемо и безопасно (то же самое
// каждые WORKER_INTERVAL_MS делает сам backend), не разрушительно.
async function scenarioWorkerTickNoDuplicates(eventId: string) {
  await runWorkerTick();
  const second = await runWorkerTick();
  assert(
    second.remindersCreated === 0 && second.notificationsProcessed === 0,
    `второй тик подряд должен быть пустым, получено ${JSON.stringify(second)}`
  );

  const { rows: dupes } = await pool.query(
    `select registration_id, type, schedule_version, count(*)::int as count
     from notifications
     where event_id = $1
     group by registration_id, type, schedule_version
     having count(*) > 1`,
    [eventId]
  );
  assert(dupes.length === 0, `найдены дублирующиеся notifications: ${JSON.stringify(dupes)}`);

  console.log("[OK] повторный тик воркера подряд не создаёт дублей уведомлений");
}

async function createNotificationsTestEvent(startsAtMs: number, capacity: number): Promise<string> {
  const title = `[integration-scenario] notifications ${new Date().toISOString()}`;
  const res = await api("/api/events", {
    method: "POST",
    body: JSON.stringify({
      title,
      starts_at: new Date(startsAtMs).toISOString(),
      capacity,
    }),
  });
  assert(
    res.status === 201,
    `не удалось создать тестовое событие для проверки уведомлений: HTTP ${res.status}`
  );
  return res.body.event.id as string;
}

async function reminderRowsForEvent(eventId: string) {
  const { rows } = await pool.query(
    `select registration_id, dispatch_status from notifications
     where event_id = $1 and type = 'reminder'`,
    [eventId]
  );
  return rows as { registration_id: string; dispatch_status: string }[];
}

// Требование кейса №9: "За сутки до события всем участникам приходит
// напоминание. Ровно одно." Событие создаётся сразу внутри 24-часового окна,
// поэтому createDueReminders подхватывает его немедленно, без ожидания
// реального времени.
//
// runWorkerTick() не фильтруется по событию — его агрегатные счётчики могут
// отражать чужие due-события или совпасть по времени с фоновым интервалом
// backend. Поэтому ниже ни разу не проверяется возвращаемое значение
// runWorkerTick(), только состояние notifications этого event_id.
async function scenarioReminderCreatedOnceWithin24h(): Promise<void> {
  const eventId = await createNotificationsTestEvent(Date.now() + 2 * 60 * 60 * 1000, 2);
  try {
    const emailA = `scenario-reminder-a-${Date.now()}@example.test`;
    const emailB = `scenario-reminder-b-${Date.now()}@example.test`;
    await registerParticipant(eventId, emailA);
    await registerParticipant(eventId, emailB);

    // Один тик создаёт due-напоминания и сразу же их обрабатывает (та же
    // функция создаёт и дренирует очередь, см. runWorkerTick) — после него
    // оба участника должны иметь ровно одно отправленное напоминание.
    await runWorkerTick();

    const afterFirstTick = await reminderRowsForEvent(eventId);
    assert(
      afterFirstTick.length === 2,
      `ожидалось ровно 2 напоминания (по одному на confirmed-участника), получено ${afterFirstTick.length}`
    );
    assert(
      afterFirstTick.every((r) => r.dispatch_status === "sent"),
      `все напоминания должны быть sent после первого тика, получено: ${JSON.stringify(afterFirstTick)}`
    );

    await runWorkerTick();

    const afterSecondTick = await reminderRowsForEvent(eventId);
    assert(
      afterSecondTick.length === 2,
      `повторный тик не должен создавать новые напоминания для тестовых регистраций (их должно остаться 2, не больше), получено ${afterSecondTick.length}`
    );

    console.log(
      "[OK] напоминание за 24ч создаётся и отправляется ровно один раз на участника, повторный тик не создаёт новых (проверено по event_id, не по глобальным счётчикам тика)"
    );
  } finally {
    await cleanup(eventId);
  }
}

const WORKER_INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS) || 30_000;
const SAFE_WORKER_INTERVAL_MS = 5 * 60 * 1000; // ниже этого предупреждаем — см. комментарий ниже

// Требование кейса №9 ("организатор перенёс событие — все участники получают
// письмо") плюс фикс этапа 5: напоминание, уже ждущее отправки и устаревшее
// по schedule_version после переноса, должно быть пропущено, а не отправлено
// со старой датой; сам перенос должен породить собственное reschedule-
// уведомление, которое доходит, и не лишить участника места.
//
// Этот сценарий намеренно оставляет напоминание pending между его созданием
// и переносом даты — а значит, гонится с собственным фоновым интервалом
// backend (runWorkerTick каждые WORKER_INTERVAL_MS, index.ts): если интервал
// backend успеет обработать это напоминание раньше PATCH, оно станет sent
// ДО переноса, и проверка "устаревшее -> skipped" ничего не докажет (не
// упадёт молча — просто не будет найдено ни одной pending/skipped записи, и
// ассерт ниже прямо об этом сообщит). Чтобы не зависеть от удачи, backend
// для прогона сценария стоит поднимать с большим WORKER_INTERVAL_MS (см.
// README) — здесь только предупреждаем в консоли, если он маленький.
async function scenarioRescheduleSkipsStaleReminderAndNotifiesActive(): Promise<void> {
  if (WORKER_INTERVAL_MS < SAFE_WORKER_INTERVAL_MS) {
    // Это значение из ЭТОГО процесса (.env сценария), не живой опрос backend —
    // сигнал верен только если backend запущен из того же .env/окружения (как
    // и требование про общий DATABASE_URL выше). Если backend поднят отдельно
    // с явным override WORKER_INTERVAL_MS, предупреждение может сработать
    // ложно (как у сценария, так и наоборот) — ориентируйся на то, с каким
    // интервалом реально поднят backend, а не только на этот вывод.
    console.warn(
      `[WARN] WORKER_INTERVAL_MS=${WORKER_INTERVAL_MS} у сценария — если backend запущен с тем же ` +
        `маленьким интервалом, он может обработать due-напоминание раньше переноса даты и сделать ` +
        `проверку устаревания недостоверной. Перед сценарием подними backend с большим ` +
        `WORKER_INTERVAL_MS (например, 3600000).`
    );
  }

  const eventId = await createNotificationsTestEvent(Date.now() + 2 * 60 * 60 * 1000, 1);
  try {
    const email = `scenario-reschedule-${Date.now()}@example.test`;
    await registerParticipant(eventId, email);

    const { rows: regRows } = await pool.query(
      "select id, access_token from registrations where event_id = $1 and email = $2",
      [eventId, email]
    );
    const registrationId = regRows[0].id as string;
    const accessToken = regRows[0].access_token as string;

    // createDueReminders() сканирует ВСЮ БД, не только тестовое событие —
    // его возвращаемое число ничего не доказывает про эту регистрацию.
    // Намеренно не вызываем полный runWorkerTick: напоминание должно
    // остаться pending до переноса даты, иначе устаревать будет уже нечему.
    await createDueReminders();
    const pending = await pool.query(
      "select dispatch_status from notifications where registration_id = $1 and type = 'reminder'",
      [registrationId]
    );
    assert(
      pending.rows.length === 1 && pending.rows[0].dispatch_status === "pending",
      `ожидалась ровно 1 pending reminder-запись для тестовой регистрации сразу после создания, получено ${JSON.stringify(pending.rows)} ` +
        `(если напоминание уже sent — скорее всего, фоновый интервал backend успел его обработать раньше; см. предупреждение про WORKER_INTERVAL_MS выше)`
    );

    // Перенос далеко за пределы 24-часового окна, чтобы новое напоминание по
    // актуальной версии точно не создалось само в ближайшем тике.
    const newStartsAt = new Date(Date.now() + 30 * 60 * 60 * 1000).toISOString();
    const patchRes = await api(`/api/events/${eventId}`, {
      method: "PATCH",
      body: JSON.stringify({ starts_at: newStartsAt }),
    });
    assert(patchRes.status === 200, `перенос даты не удался: HTTP ${patchRes.status}`);

    await runWorkerTick();

    const { rows: notifications } = await pool.query(
      `select type, dispatch_status, skip_reason from notifications
       where registration_id = $1 order by created_at`,
      [registrationId]
    );

    const reminders = notifications.filter((n) => n.type === "reminder");
    assert(
      reminders.length === 1,
      `после переноса для тестовой регистрации должно остаться ровно 1 напоминание (устаревшее, без новых), получено ${reminders.length}`
    );
    assert(
      reminders[0].dispatch_status === "skipped" && reminders[0].skip_reason === "stale_schedule_version",
      `устаревшее напоминание должно быть skipped по stale_schedule_version, получено ${JSON.stringify(reminders[0])}`
    );

    const reschedule = notifications.find((n) => n.type === "reschedule");
    assert(!!reschedule, "перенос даты должен создать reschedule-уведомление активному участнику");
    assert(
      reschedule!.dispatch_status === "sent",
      `reschedule-уведомление должно быть отправлено, получено ${JSON.stringify(reschedule)}`
    );

    const myReg = await api(`/api/my/${accessToken}`);
    assert(
      myReg.status === 200 && myReg.body?.status === "confirmed",
      "участник должен остаться confirmed после переноса, не потеряв место"
    );

    console.log(
      "[OK] перенос даты: устаревшее напоминание пропущено (stale_schedule_version), reschedule-уведомление отправлено, место участника сохранено (проверено по registration_id, не по глобальным счётчикам тика)"
    );
  } finally {
    await cleanup(eventId);
  }
}

async function cleanup(eventId: string | null) {
  if (!eventId) return;
  // Удаляем только собственные данные этого прогона, по конкретному event_id —
  // никогда не трогаем чужие события/регистрации и не чистим таблицы целиком.
  await pool.query("delete from notifications where event_id = $1", [eventId]);
  await pool.query("delete from registrations where event_id = $1", [eventId]);
  await pool.query("delete from events where id = $1", [eventId]);
  console.log(`[cleanup] тестовое событие ${eventId} и его данные удалены`);
}

async function main() {
  console.log(`== интеграционный сценарий кейса №9 (API: ${API_URL}) ==`);
  await ensureBackendReachable();
  await login();

  let eventId: string | null = null;
  try {
    eventId = await createTestEvent();
    console.log(`[setup] тестовое событие создано: ${eventId}`);

    const { emailA } = await scenarioRaceForLastSpot(eventId);
    await scenarioAddSecondInQueue(eventId);
    await scenarioDuplicateEmail(eventId, emailA);
    const ticketCode = await scenarioCancelPromotesFirstInQueueByFifo(eventId);
    await scenarioDoubleCheckin(ticketCode);
    await scenarioWorkerTickNoDuplicates(eventId);
  } finally {
    await cleanup(eventId);
  }

  await scenarioReminderCreatedOnceWithin24h();
  await scenarioRescheduleSkipsStaleReminderAndNotifiesActive();
}

main()
  .then(() => {
    console.log("ALL CHECKS PASSED");
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error("SCENARIO FAILED:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
