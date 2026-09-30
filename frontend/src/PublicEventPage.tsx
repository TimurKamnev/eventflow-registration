import { useEffect, useState } from "react";
import { api, ApiError, type PublicEvent } from "./api";
import { formatBishkek } from "./time";

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

  if (event === null) return <main style={{ padding: "2rem" }}>Загрузка...</main>;
  if (event === "not_found") return <main style={{ padding: "2rem" }}>Событие не найдено.</main>;

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 480 }}>
      <h1>{event.title}</h1>
      {event.description && <p>{event.description}</p>}
      <p>
        <strong>Дата:</strong> {formatBishkek(event.starts_at)}
      </p>
      <p>
        {event.isFull
          ? "Свободных мест нет — новые заявки попадают в лист ожидания."
          : `Свободных мест: ${event.remaining} из ${event.capacity}`}
      </p>

      {submitted ? (
        <p>{submitted}</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <label>
            Email
            <br />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ width: "100%" }}
            />
          </label>
          {error && <p style={{ color: "crimson" }}>{error}</p>}
          <button type="submit" disabled={busy} style={{ marginTop: 8 }}>
            {busy ? "Отправляю..." : "Зарегистрироваться"}
          </button>
        </form>
      )}
    </main>
  );
}
