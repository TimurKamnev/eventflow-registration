import type { Server } from "node:http";
import { parseCookie } from "cookie";
import jwt from "jsonwebtoken";
import { WebSocketServer, WebSocket } from "ws";
import { computeEventCounts } from "./eventStats.js";

const SESSION_COOKIE = "session";
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";

// Подписки по eventId — только в памяти процесса, переживать рестарт не
// должны (клиент переподключается и запрашивает состояние заново через REST).
const subscribers = new Map<string, Set<WebSocket>>();

function isAllowedOrigin(origin: string | undefined): boolean {
  return origin === FRONTEND_ORIGIN;
}

function verifyOrganizerCookie(cookieHeader: string | undefined): boolean {
  if (!cookieHeader) return false;
  const token = parseCookie(cookieHeader)[SESSION_COOKIE];
  if (!token) return false;
  try {
    jwt.verify(token, process.env.SESSION_SECRET ?? "");
    return true;
  } catch {
    return false;
  }
}

function subscribe(eventId: string, ws: WebSocket) {
  if (!subscribers.has(eventId)) subscribers.set(eventId, new Set());
  subscribers.get(eventId)!.add(ws);
}

function unsubscribe(ws: WebSocket) {
  for (const set of subscribers.values()) set.delete(ws);
}

export async function broadcastEventCounts(eventId: string): Promise<void> {
  const set = subscribers.get(eventId);
  if (!set || set.size === 0) return;
  try {
    const counts = await computeEventCounts(eventId);
    // Только агрегированные числа — никаких email/access_token/ticket_code.
    const message = JSON.stringify({ type: "counts", eventId, ...counts });
    for (const ws of set) {
      if (ws.readyState === WebSocket.OPEN) ws.send(message);
    }
  } catch (err) {
    console.error("broadcastEventCounts failed:", err);
  }
}

export function attachWebSocketServer(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    if (!request.url?.startsWith("/ws")) {
      socket.destroy();
      return;
    }
    // Origin у WS-апгрейда браузер подставляет сам и странице не подделать —
    // проверяем его наравне с cookie, а не полагаемся только на сессию.
    if (!isAllowedOrigin(request.headers.origin)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    if (!verifyOrganizerCookie(request.headers.cookie)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (ws, request) => {
    const url = new URL(request.url ?? "", "http://internal");
    const eventId = url.searchParams.get("eventId");
    if (eventId) subscribe(eventId, ws);
    ws.on("close", () => unsubscribe(ws));
  });
}
