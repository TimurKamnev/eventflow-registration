import { useEffect, useState } from "react";
import { api, type EventNotification, type EventRecord } from "./api";
import { formatBishkek } from "./time";

const TYPE_LABELS: Record<EventNotification["type"], string> = {
  waitlist: "В лист ожидания",
  ticket: "Билет",
  reminder: "Напоминание",
  reschedule: "Перенос события",
};

const STATUS_LABELS: Record<EventNotification["dispatch_status"], string> = {
  pending: "Ожидает обработки",
  sent: "Отправлено (эмуляция)",
  failed: "Ошибка",
  skipped: "Пропущено",
};

export function NotificationsView({ event, onBack }: { event: EventRecord; onBack: () => void }) {
  const [items, setItems] = useState<EventNotification[] | null>(null);

  function reload() {
    api.eventNotifications(event.id).then((res) => setItems(res.notifications));
  }

  useEffect(reload, [event.id]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Эмулированные письма: {event.title}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={reload}>Обновить</button>
          <button onClick={onBack}>Назад к событиям</button>
        </div>
      </div>
      <p style={{ color: "#666" }}>
        Реальная отправка не подключена — здесь то, что фоновый воркер фактически «отправил» бы
        участникам (раз в 30 секунд автоматически, либо вручную: <code>npm run worker</code>).
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
              <th style={{ textAlign: "left" }}>Статус</th>
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
                <td>
                  {STATUS_LABELS[n.dispatch_status]}
                  {n.skip_reason ? ` (${n.skip_reason})` : ""}
                </td>
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
