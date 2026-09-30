export class ValidationError extends Error {}

export function parseTitle(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError("title must be a non-empty string");
  }
  return value.trim();
}

export function parseDescription(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value !== "string") {
    throw new ValidationError("description must be a string");
  }
  return value;
}

// Зона обязательна (Z или ±HH:MM) — без неё "2026-11-01T10:00:00" парсится
// как локальное время процесса Node, и один и тот же запрос давал бы разный
// момент времени в зависимости от TZ окружения, где запущен backend.
const ISO_DATE_WITH_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

export function parseStartsAt(value: unknown): Date {
  if (typeof value !== "string" || !ISO_DATE_WITH_TZ.test(value)) {
    throw new ValidationError(
      "starts_at must be an ISO 8601 date-time string with an explicit timezone (Z or ±HH:MM)"
    );
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError("starts_at must be a valid date");
  }
  if (parsed.getTime() <= Date.now()) {
    throw new ValidationError("starts_at must be in the future");
  }
  return parsed;
}

export function parseCapacity(value: unknown): number {
  // Строго JSON-число: строки ("3"), null, boolean и дробные не приводим и не принимаем.
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ValidationError("capacity must be a JSON number: a positive integer");
  }
  return value;
}
