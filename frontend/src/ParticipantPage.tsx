import { useEffect, useState } from "react";
import { api, type MyRegistration } from "./api";
import { formatBishkek } from "./time";

const STATUS_LABELS: Record<MyRegistration["status"], string> = {
  confirmed: "Место подтверждено",
  waitlisted: "В листе ожидания",
  cancelled: "Регистрация отменена",
  checked_in: "Отмечены на входе",
};

export function ParticipantPage({ token }: { token: string }) {
  const [reg, setReg] = useState<MyRegistration | null | "not_found">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .myRegistration(token)
      .then(setReg)
      .catch(() => setReg("not_found"));
  }

  useEffect(load, [token]);

  async function handleCancel() {
    setError(null);
    setBusy(true);
    try {
      await api.cancelMyRegistration(token);
      load();
    } catch {
      setError("Не удалось отменить регистрацию");
    } finally {
      setBusy(false);
    }
  }

  if (reg === null) return <main style={{ padding: "2rem" }}>Загрузка...</main>;
  if (reg === "not_found")
    return <main style={{ padding: "2rem" }}>Регистрация не найдена — проверьте ссылку.</main>;

  const canCancel = reg.status === "confirmed" || reg.status === "waitlisted";

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 480 }}>
      <h1>{reg.event.title}</h1>
      <p>
        <strong>Дата:</strong> {formatBishkek(reg.event.starts_at)}
      </p>
      <p>
        <strong>Статус:</strong> {STATUS_LABELS[reg.status]}
      </p>
      {reg.status === "waitlisted" && reg.waitlist_position !== null && (
        <p>Позиция в очереди: {reg.waitlist_position}</p>
      )}
      {reg.ticket_code && (
        <p>
          <strong>Код билета:</strong> {reg.ticket_code}
        </p>
      )}
      {reg.status === "checked_in" && <p>Отмена недоступна — вы уже прошли чекин на входе.</p>}

      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {canCancel && (
        <button onClick={handleCancel} disabled={busy}>
          {busy ? "Отменяю..." : "Отказаться от участия"}
        </button>
      )}
    </main>
  );
}
