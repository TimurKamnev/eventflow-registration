import { ApiError } from "./api";

// Нейтральное сообщение для любого кода/текста ошибки backend, которого нет
// в KNOWN_ERROR_MESSAGES ниже — чтобы сырые английские сообщения валидации
// backend (например, "starts_at must be in the future") никогда не попадали
// в интерфейс напрямую.
export const FALLBACK_ERROR_MESSAGE = "Не удалось выполнить действие. Попробуйте ещё раз";

// Ключи — это буквальные значения поля "error" в ответах backend: либо
// короткий код (см. auth.ts/checkin.ts/events.ts/registrations.ts), либо,
// для ValidationError (validation.ts), весь текст сообщения как есть —
// backend не присваивает валидационным ошибкам отдельных кодов.
const KNOWN_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Неверный email или пароль",
  unauthorized: "Сессия истекла — войдите снова",
  not_found: "Не найдено",
  already_checked_in: "Этот билет уже отмечен на входе",
  not_confirmed: "Билет не подтверждён (лист ожидания или отменён) — вход закрыт",
  event_already_started: "Регистрация закрыта — событие уже началось",
  cannot_cancel_after_checkin: "Нельзя отменить регистрацию — билет уже отмечен на входе",
  "code is required": "Введите код билета",
  "email and password are required": "Введите email и пароль",
  "title must be a non-empty string": "Укажите название события",
  "description must be a string": "Некорректное описание",
  "starts_at must be an ISO 8601 date-time string with an explicit timezone (Z or ±HH:MM)":
    "Некорректные дата и время",
  "starts_at must be a valid date": "Некорректные дата и время",
  "starts_at must be in the future": "Дата и время события должны быть в будущем",
  "capacity must be a JSON number: a positive integer": "Лимит мест должен быть положительным числом",
  "email must be a valid email address": "Введите корректный email",
};

/** Код/текст ошибки из тела ответа ApiError, если он есть и является строкой. */
export function errorCodeFrom(err: unknown): string | undefined {
  if (err instanceof ApiError && err.body && typeof err.body === "object") {
    const code = (err.body as { error?: unknown }).error;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/** Готовое сообщение на русском для показа пользователю — известное или нейтральный фолбэк. */
export function localizeError(err: unknown): string {
  const code = errorCodeFrom(err);
  return (code && KNOWN_ERROR_MESSAGES[code]) || FALLBACK_ERROR_MESSAGE;
}
