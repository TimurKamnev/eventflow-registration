import { useEffect, useState } from "react";
import { api, ApiError, type PublicEvent } from "./api";
import { formatBishkek } from "./time";
import { Banner, Field } from "./ui";
import "./App.css";

export function PublicEventPage({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<PublicEvent | null | "not_found">(null);
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .publicEvent(eventId)
      .then((res) => setEvent(res.event))
      .catch(() => setEvent("not_found"));
  }, [eventId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.register(eventId, email);
      setSubmitted(res.message);
    } catch (err) {
      if (err instanceof ApiError && (err.body as { error?: string })?.error === "event_already_started") {
        setError("Регистрация закрыта — событие уже началось.");
      } else {
        setError("Не удалось отправить заявку, попробуйте ещё раз");
      }
    } finally {
      setBusy(false);
    }
  }

  if (event === null) {
    return (
      <div className="public-shell">
        <p>Загрузка...</p>
      </div>
    );
  }
  if (event === "not_found") {
    return (
      <div className="public-shell">
        <p>Событие не найдено.</p>
      </div>
    );
  }

  return (
    <div className="public-shell">
      <div className="card public-card">
        <h1>{event.title}</h1>
        {event.description && (
          <p style={{ color: "var(--text-muted)", marginTop: "var(--space-2)" }}>{event.description}</p>
        )}
        <div style={{ marginTop: "var(--space-4)" }}>
          <div className="kv">
            <span className="kv-label">Дата</span>
            <span>{formatBishkek(event.starts_at)}</span>
          </div>
          <div className="kv">
            <span className="kv-label">Места</span>
            <span>
              {event.isFull
                ? "Свободных мест нет — новые заявки попадают в лист ожидания"
                : `Свободно ${event.remaining} из ${event.capacity}`}
            </span>
          </div>
        </div>

        {submitted ? (
          <div style={{ marginTop: "var(--space-5)" }}>
            <Banner tone="success">{submitted}</Banner>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ marginTop: "var(--space-5)" }}>
            <Field label="Email" htmlFor="register-email">
              <input
                id="register-email"
                className={`input${error ? " has-error" : ""}`}
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                disabled={busy}
                required
              />
            </Field>
            {error && <Banner tone="error">{error}</Banner>}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={busy} style={{ width: "100%" }}>
                {busy ? "Отправляю..." : "Зарегистрироваться"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
