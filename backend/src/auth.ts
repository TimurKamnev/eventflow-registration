import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "./db.js";

const SESSION_COOKIE = "session";
const SESSION_TTL = "12h";

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return secret;
}

export interface AuthedRequest extends Request {
  organizerId?: string;
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "email and password are required" });
  }

  const result = await pool.query(
    "select id, password_hash from organizers where email = $1",
    [email]
  );
  const organizer = result.rows[0];
  if (!organizer) {
    return res.status(401).json({ error: "invalid_credentials" });
  }

  const ok = await bcrypt.compare(password, organizer.password_hash);
  if (!ok) {
    return res.status(401).json({ error: "invalid_credentials" });
  }

  const token = jwt.sign({ sub: organizer.id }, sessionSecret(), { expiresIn: SESSION_TTL });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // локальная разработка по http; в проде нужно true за https
    maxAge: 12 * 60 * 60 * 1000,
  });
  res.json({ email });
}

export function logout(_req: Request, res: Response) {
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
}

export function me(req: AuthedRequest, res: Response) {
  res.json({ organizerId: req.organizerId });
}

export function requireOrganizer(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) {
    return res.status(401).json({ error: "unauthorized" });
  }
  try {
    const decoded = jwt.verify(token, sessionSecret()) as { sub: string };
    req.organizerId = decoded.sub;
    next();
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
}
