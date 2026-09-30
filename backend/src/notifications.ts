import type { Response } from "express";
import { pool } from "./db.js";
import type { AuthedRequest } from "./auth.js";
import { handleError } from "./http.js";

// Эмулированные письма хранятся как есть (с access_token/ticket_code в payload),
// поэтому список виден только организатору — это фактически чужая почта.
export async function listEventNotifications(req: AuthedRequest, res: Response) {
  try {
    const result = await pool.query(
      `select n.id, n.type, n.schedule_version, n.payload, n.dispatch_status,
              n.created_at, n.sent_at, r.email as registration_email
       from notifications n
       join registrations r on r.id = n.registration_id
       where n.event_id = $1
       order by n.created_at asc`,
      [req.params.id]
    );
    res.json({ notifications: result.rows });
  } catch (err) {
    handleError(err, res);
  }
}
