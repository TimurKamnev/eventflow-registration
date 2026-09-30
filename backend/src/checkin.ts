import type { Response } from "express";
import { pool } from "./db.js";
import type { AuthedRequest } from "./auth.js";
import { handleError } from "./http.js";
import { computeEventCounts } from "./eventStats.js";
import { broadcastEventCounts } from "./ws.js";

export async function checkinByCode(req: AuthedRequest, res: Response) {
  try {
    const code = (req.body ?? {}).code;
    if (typeof code !== "string" || !code.trim()) {
      return res.status(400).json({ error: "code is required" });
    }
    const ticketCode = code.trim();

    // Атомарный переход одним UPDATE с условием в WHERE — повторный ввод
    // того же кода не найдёт строку в статусе 'confirmed' второй раз,
    // счётчик пришедших не задвоится.
    const result = await pool.query(
      `update registrations
       set status = 'checked_in', checked_in_at = now(), updated_at = now()
       where ticket_code = $1 and status = 'confirmed'
       returning event_id`,
      [ticketCode]
    );

    if (result.rows.length === 0) {
      const existing = await pool.query(
        "select status from registrations where ticket_code = $1",
        [ticketCode]
      );
      const status = existing.rows[0]?.status;
      if (!status) return res.status(404).json({ error: "not_found" });
      if (status === "checked_in") return res.status(409).json({ error: "already_checked_in" });
      // cancelled сохраняет старый ticket_code как историю; waitlisted вообще
      // не имеет ticket_code (он null, сюда и не могла попасть строка).
      return res.status(409).json({ error: "not_confirmed" });
    }

    const eventId = result.rows[0].event_id;
    await broadcastEventCounts(eventId);
    res.json({ status: "checked_in" });
  } catch (err) {
    handleError(err, res);
  }
}

export async function getEventCounts(req: AuthedRequest, res: Response) {
  try {
    const counts = await computeEventCounts(req.params.id);
    res.json(counts);
  } catch (err) {
    handleError(err, res);
  }
}
