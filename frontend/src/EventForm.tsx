import { useState } from "react";
import { api, ApiError, type EventRecord } from "./api";
import { bishkekInputValueToUtcIso, utcIsoToBishkekInputValue } from "./time";

interface Props {
  event?: EventRecord;
  onSaved: () => void;
  onCancel: () => void;
}

export function EventForm({ event, onSaved, onCancel }: Props) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [startsAt, setStartsAt] = useState(
    event ? utcIsoToBishkekInputValue(event.starts_at) : ""
  );
  const [capacity, setCapacity] = useState(event ? String(event.capacity) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const data = {
      title,
      description,
      starts_at: bishkekInputValueToUtcIso(startsAt),
      capacity: Number(capacity),
    };
    try {
      if (event) {
        await api.updateEvent(event.id, data);
      } else {
        await api.createEvent(data);
      }
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.body && typeof err.body === "object") {
        const body = err.body as { error?: string; occupied?: number };
        if (body.error === "capacity_below_occupied") {
          setError(`Нельзя уменьшить лимит: уже занято мест — ${body.occupied}`);
        } else {
          setError(body.error ?? "Не удалось сохранить событие");
        }
      } else {
        setError("Не удалось сохранить событие");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 420 }}>
      <h2>{event ? "Редактировать событие" : "Новое событие"}</h2>
      <div>
        <label>
          Название
          <br />
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            style={{ width: "100%" }}
          />
        </label>
      </div>
      <div style={{ marginTop: 8 }}>
        <label>
          Описание
          <br />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ width: "100%" }}
          />
        </label>
      </div>
      <div style={{ marginTop: 8 }}>
        <label>
          Дата и время (Asia/Bishkek)
          <br />
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            required
          />
        </label>
      </div>
      <div style={{ marginTop: 8 }}>
        <label>
          Лимит мест
          <br />
          <input
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            required
          />
        </label>
      </div>
      {event && (
        <p style={{ color: "#666", fontSize: 14 }}>
          Изменение даты уведомит участников (появится в следующем этапе). Версия расписания: {event.schedule_version}.
        </p>
      )}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
        <button type="submit" disabled={busy}>
          {busy ? "Сохраняю..." : "Сохранить"}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          Отмена
        </button>
      </div>
    </form>
  );
}
