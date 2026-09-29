import "dotenv/config";
import express from "express";
import cors from "cors";
import { pool } from "./db.js";

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/health/db", async (_req, res) => {
  try {
    const result = await pool.query("select now() as now");
    res.json({ status: "ok", now: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ status: "error", message: (err as Error).message });
  }
});

app.listen(port, () => {
  console.log(`backend listening on http://localhost:${port}`);
});
