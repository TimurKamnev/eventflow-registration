import "dotenv/config";
import bcrypt from "bcryptjs";
import { pool } from "./db.js";

async function main() {
  const email = process.env.ORGANIZER_EMAIL;
  const password = process.env.ORGANIZER_PASSWORD;
  if (!email || !password) {
    throw new Error("ORGANIZER_EMAIL and ORGANIZER_PASSWORD must be set in .env");
  }

  const existing = await pool.query("select id from organizers where email = $1", [email]);
  if (existing.rows.length > 0) {
    console.log(`organizer already seeded: ${email}`);
    await pool.end();
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query(
    "insert into organizers (email, password_hash) values ($1, $2)",
    [email, passwordHash]
  );
  console.log(`organizer seeded: ${email}`);
  await pool.end();
}

main().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});
