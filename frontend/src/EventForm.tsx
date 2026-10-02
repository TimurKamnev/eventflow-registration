import { useState } from "react";
import { api, ApiError, type EventRecord } from "./api";
import { bishkekInputValueToUtcIso, utcIsoToBishkekInputValue } from "./time";
import { Banner, Field, PageHeader } from "./ui";

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
  const [capacityError, setCapacityError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCapacityError(false);
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
          setCapacityError(true);
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
    <div>
      <PageHeader title={event ? "Редактировать событие" : "Новое событие"} backTo="/admin/events" backLabel="К событиям" />
      <div className="card" style={{ maxWidth: 480 }}>
        <form onSubmit={handleSubmit}>
          <Field label="Название" htmlFor="event-title">
            <input
              id="event-title"
              className="input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              required
            />
          </Field>

          <Field label="Описание" htmlFor="event-description">
            <textarea
              id="event-description"
              className="textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
            />
          </Field>

          <Field
            label="Дата и время (Asia/Bishkek)"
            htmlFor="event-starts-at"
            hint="Вид поля (dd.mm.yyyy или mm/dd/yyyy, 24ч или AM/PM) зависит от браузера и ОС. Указанное время понимается как Asia/Bishkek; на сервере хранится в UTC. Например: 05.11.2026 14:00."
          >
            <input
              id="event-starts-at"
              className="input"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              disabled={busy}
              required
            />
          </Field>

          <Field
            label="Лимит мест"
            htmlFor="event-capacity"
            error={capacityError ? error : null}
            hint={
              !capacityError && event
                ? `Версия расписания: ${event.schedule_version}. Перенос даты отправит уведомление всем активным участникам.`
                : undefined
            }
          >
            <input
              id="event-capacity"
              className={`input${capacityError ? " has-error" : ""}`}
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => {
                setCapacity(e.target.value);
                setCapacityError(false);
              }}
              disabled={busy}
              required
            />
          </Field>

          {error && !capacityError && <Banner tone="error">{error}</Banner>}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Сохраняю..." : "Сохранить"}
            </button>
            <button type="button" className="btn" onClick={onCancel} disabled={busy}>
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
