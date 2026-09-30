import "dotenv/config";
import { runWorkerTick } from "./worker.js";
import { pool } from "./db.js";

async function main() {
  const result = await runWorkerTick();
  console.log(`worker tick: ${JSON.stringify(result)}`);
  await pool.end();
}

main().catch((err) => {
  console.error("worker tick failed:", err);
  process.exit(1);
});
