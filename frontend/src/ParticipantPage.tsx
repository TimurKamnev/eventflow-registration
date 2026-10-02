import { useEffect, useState } from "react";
import { api, type MyRegistration } from "./api";
import { formatBishkek } from "./time";
import { Badge, Banner } from "./ui";
import "./App.css";

const STATUS_LABELS: Record<MyRegistration["status"], string> = {
  confirmed: "Место подтверждено",
  waitlisted: "В листе ожидания",
  cancelled: "Регистрация отменена",
  checked_in: "Отмечены на входе",
};

const STATUS_TONE: Record<MyRegistration["status"], "neutral" | "success" | "warning" | "danger"> = {
  confirmed: "success",
  waitlisted: "warning",
  cancelled: "danger",
  checked_in: "success",
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

  if (reg === null) {
    return (
      <div className="public-shell">
        <p>Загрузка...</p>
      </div>
    );
  }
  if (reg === "not_found") {
    return (
      <div className="public-shell">
        <p>Регистрация не найдена — проверьте ссылку.</p>
      </div>
    );
  }

  const canCancel = reg.status === "confirmed" || reg.status === "waitlisted";

  return (
    <div className="public-shell">
      <div className="card public-card">
        <h1>{reg.event.title}</h1>
        <div style={{ marginTop: "var(--space-4)" }}>
          <div className="kv">
            <span className="kv-label">Дата</span>
            <span>{formatBishkek(reg.event.starts_at)}</span>
          </div>
          <div className="kv">
            <span className="kv-label">Статус</span>
            <Badge tone={STATUS_TONE[reg.status]}>{STATUS_LABELS[reg.status]}</Badge>
          </div>
          {reg.status === "waitlisted" && reg.waitlist_position !== null && (
            <div className="kv">
              <span className="kv-label">В очереди</span>
              <span>позиция {reg.waitlist_position}</span>
            </div>
          )}
          {reg.ticket_code && (
            <div className="kv">
              <span className="kv-label">Код билета</span>
              <code className={reg.status === "cancelled" ? "code-void" : undefined}>{reg.ticket_code}</code>
              {reg.status === "cancelled" && <Badge tone="danger">аннулирован</Badge>}
            </div>
          )}
        </div>

        {reg.status === "checked_in" && (
          <div style={{ marginTop: "var(--space-4)" }}>
            <Banner tone="neutral">Отмена недоступна — вы уже прошли чекин на входе.</Banner>
          </div>
        )}

        {error && (
          <div style={{ marginTop: "var(--space-4)" }}>
            <Banner tone="error">{error}</Banner>
          </div>
        )}

        {canCancel && (
          <>
            <hr className="kv-divider" />
            <div className="form-actions" style={{ marginTop: 0 }}>
              <button className="btn btn-danger" onClick={handleCancel} disabled={busy}>
                {busy ? "Отменяю..." : "Отказаться от участия"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
