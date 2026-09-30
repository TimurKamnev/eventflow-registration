// Asia/Bishkek не переходит на летнее время, смещение фиксировано: UTC+6.
const BISHKEK_OFFSET_MINUTES = 6 * 60;

/** UTC ISO-строка -> значение для <input type="datetime-local"> в Asia/Bishkek. */
export function utcIsoToBishkekInputValue(utcIso: string): string {
  const utcMs = new Date(utcIso).getTime();
  const local = new Date(utcMs + BISHKEK_OFFSET_MINUTES * 60_000);
  return local.toISOString().slice(0, 16);
}

/** Значение <input type="datetime-local"> (интерпретируется как Asia/Bishkek) -> UTC ISO-строка. */
export function bishkekInputValueToUtcIso(localValue: string): string {
  const localMs = new Date(`${localValue}:00Z`).getTime();
  return new Date(localMs - BISHKEK_OFFSET_MINUTES * 60_000).toISOString();
}

/** UTC ISO-строка -> читаемая дата/время в Asia/Bishkek для отображения. */
export function formatBishkek(utcIso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Bishkek",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(utcIso));
}
