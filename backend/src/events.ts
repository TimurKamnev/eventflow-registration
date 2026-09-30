import type { Response } from "express";
import { pool } from "./db.js";
import type { AuthedRequest } from "./auth.js";
import {
  ValidationError,
  parseCapacity,
  parseDescription,
  parseStartsAt,
  parseTitle,
} from "./validation.js";

const OCCUPYING_STATUSES = ["confirmed", "checked_in"];

function handleError(err: unknown, res: Response) {
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.message });
  }
  // Реальная причина остаётся только в серверном логе — клиенту нельзя отдавать
  // текст ошибки БД (может содержать структуру схемы, значения параметров и т.д.).
  console.error("events request failed:", err);
  return res.status(500).json({ error: "internal_error" });
}

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

    await client.query("COMMIT");
    res.json({ event: updated.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    handleError(err, res);
  } finally {
    client.release();
  }
}
