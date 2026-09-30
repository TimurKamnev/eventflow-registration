import type { Response } from "express";
import { ValidationError } from "./validation.js";

export function handleError(err: unknown, res: Response) {
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.message });
  }
  // Реальная причина остаётся только в серверном логе — клиенту нельзя отдавать
  // текст ошибки БД (может содержать структуру схемы, значения параметров и т.д.).
  console.error("request failed:", err);
  return res.status(500).json({ error: "internal_error" });
}
