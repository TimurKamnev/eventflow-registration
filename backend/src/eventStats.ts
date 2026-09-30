import { pool } from "./db.js";

export interface EventCounts {
  confirmed: number;
  waitlisted: number;
  checked_in: number;
}

export async function computeEventCounts(eventId: string): Promise<EventCounts> {
  const result = await pool.query(
    `select status, count(*)::int as count from registrations
     where event_id = $1 and status in ('confirmed', 'waitlisted', 'checked_in')
     group by status`,
    [eventId]
  );

  const counts: EventCounts = { confirmed: 0, waitlisted: 0, checked_in: 0 };
  for (const row of result.rows) {
    counts[row.status as keyof EventCounts] = row.count;
  }
  return counts;
}
