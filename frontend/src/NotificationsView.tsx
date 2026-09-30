import { useEffect, useState } from "react";
import { api, type EventNotification, type EventRecord } from "./api";
import { formatBishkek } from "./time";

const TYPE_LABELS: Record<EventNotification["type"], string> = {
  waitlist: "В лист ожидания",
  ticket: "Билет",
  reminder: "Напоминание",
  reschedule: "Перенос события",
};

export function NotificationsView({ event, onBack }: { event: EventRecord; onBack: () => void }) {
  const [items, setItems] = useState<EventNotification[] | null>(null);

  useEffect(() => {
    api.eventNotifications(event.id).then((res) => setItems(res.notifications));
  }, [event.id]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Эмулированные письма: {event.title}</h1>
        <button onClick={onBack}>Назад к событиям</button>
      </div>
      <p style={{ color: "#666" }}>
        Реальная отправка появится позже — здесь то, что фактически «отправлено» бы участникам.
        Ссылка на регистрацию доступна только здесь, так как содержит секретный access_token.
      </p>
      {items === null && <p>Загрузка...</p>}
      {items?.length === 0 && <p>Писем пока нет.</p>}
      {items && items.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Когда</th>
              <th style={{ textAlign: "left" }}>Тип</th>
              <th style={{ textAlign: "left" }}>Email</th>
              <th style={{ textAlign: "left" }}>Код билета</th>
              <th style={{ textAlign: "left" }}>Ссылка на регистрацию</th>
            </tr>
          </thead>
          <tbody>
            {items.map((n) => (
              <tr key={n.id}>
                <td>{formatBishkek(n.created_at)}</td>
                <td>{TYPE_LABELS[n.type]}</td>
                <td>{n.registration_email}</td>
                <td>{n.payload.ticket_code ?? "—"}</td>
                <td>
                  <a href={n.payload.my_registration_url} target="_blank" rel="noreferrer">
                    открыть
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
