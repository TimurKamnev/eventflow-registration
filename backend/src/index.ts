import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { pool } from "./db.js";
import { login, logout, requireOrganizer } from "./auth.js";
import { createEvent, listEvents, getEvent, updateEvent } from "./events.js";

const app = express();
const port = Number(process.env.PORT) || 3000;
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";

app.use(cors({ origin: frontendOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());

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

app.post("/api/auth/login", login);
app.post("/api/auth/logout", logout);

app.post("/api/events", requireOrganizer, createEvent);
app.get("/api/events", requireOrganizer, listEvents);
app.get("/api/events/:id", requireOrganizer, getEvent);
app.patch("/api/events/:id", requireOrganizer, updateEvent);

app.listen(port, () => {
  console.log(`backend listening on http://localhost:${port}`);
});
