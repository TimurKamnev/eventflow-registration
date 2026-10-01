import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { pool } from "./db.js";
import { login, logout, me, requireOrganizer } from "./auth.js";
import { createEvent, listEvents, getEvent, updateEvent } from "./events.js";
import {
  getPublicEvent,
  registerForEvent,
  getMyRegistration,
  cancelMyRegistration,
} from "./registrations.js";
import { listEventNotifications } from "./notifications.js";
import { checkinByCode, getEventCounts } from "./checkin.js";
import { attachWebSocketServer } from "./ws.js";
import { runWorkerTick } from "./worker.js";

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
app.get("/api/auth/me", requireOrganizer, me);

app.post("/api/events", requireOrganizer, createEvent);
app.get("/api/events", requireOrganizer, listEvents);
app.get("/api/events/:id", requireOrganizer, getEvent);
app.patch("/api/events/:id", requireOrganizer, updateEvent);
app.get("/api/events/:id/notifications", requireOrganizer, listEventNotifications);

app.get("/api/events/:id/counts", requireOrganizer, getEventCounts);
app.post("/api/checkin", requireOrganizer, checkinByCode);

app.get("/api/events/:id/public", getPublicEvent);
app.post("/api/events/:id/registrations", registerForEvent);
app.get("/api/my/:token", getMyRegistration);
app.post("/api/my/:token/cancel", cancelMyRegistration);

const server = app.listen(port, () => {
  console.log(`backend listening on http://localhost:${port}`);
});

attachWebSocketServer(server);

// Фоновая обработка notifications: создание напоминаний за 24ч и эмуляция
// отправки pending-писем. Идемпотентность — на уровне БД (уникальный индекс,
// FOR UPDATE SKIP LOCKED), поэтому интервал и рестарт процесса безопасны.
const WORKER_INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS) || 30_000;
runWorkerTick().catch((err) => console.error("worker tick failed:", err));
setInterval(() => {
  runWorkerTick().catch((err) => console.error("worker tick failed:", err));
}, WORKER_INTERVAL_MS);
