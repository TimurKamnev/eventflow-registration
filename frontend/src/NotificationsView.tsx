import { useEffect, useState } from "react";
import { api, type EventNotification, type EventRecord } from "./api";
import { formatBishkek } from "./time";
import { Badge, Banner, PageHeader } from "./ui";

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

const STATUS_TONE: Record<EventNotification["dispatch_status"], "neutral" | "success" | "warning" | "danger"> = {
  pending: "neutral",
  sent: "success",
  failed: "danger",
  skipped: "warning",
};

type CopiedField = { id: string; field: "link" | "ticket" } | null;

export function NotificationsView({ event }: { event: EventRecord }) {
  const [items, setItems] = useState<EventNotification[] | null>(null);
  const [copied, setCopied] = useState<CopiedField>(null);

  function reload() {
    api.eventNotifications(event.id).then((res) => setItems(res.notifications));
  }

  useEffect(reload, [event.id]);

  async function copyToClipboard(id: string, field: "link" | "ticket", value: string) {
    await navigator.clipboard.writeText(value);
    setCopied({ id, field });
    setTimeout(() => setCopied((current) => (current?.id === id && current.field === field ? null : current)), 1500);
  }

  return (
    <div>
      <PageHeader
        title={`Письма: ${event.title}`}
        backTo="/admin/events"
        backLabel="К событиям"
        actions={
          <button className="btn btn-sm" onClick={reload}>
            Обновить
          </button>
        }
      />

      <Banner tone="neutral">
        Реальная отправка не подключена — здесь то, что фоновый воркер фактически «отправил» бы
        участникам (раз в 30 секунд автоматически, либо вручную: <code>npm run worker</code>).
        Ссылка на регистрацию доступна только здесь, так как содержит секретный access_token —
        открывайте или копируйте её, не показывайте текстом.
      </Banner>

      {items === null && <p>Загрузка...</p>}
      {items?.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-title">Писем пока нет</div>
          <p>Появятся после первой регистрации или тика фонового воркера.</p>
        </div>
      )}
      {items && items.length > 0 && (
        <div className="table-wrap">
          <table className="table table-cards">
            <thead>
              <tr>
                <th>Когда</th>
                <th>Тип</th>
                <th>Email</th>
                <th>Статус</th>
                <th>Билет</th>
                <th>Ссылка</th>
              </tr>
            </thead>
            <tbody>
              {items.map((n) => (
                <tr key={n.id}>
                  <td className="col-muted" data-label="Когда">
                    {formatBishkek(n.created_at)}
                  </td>
                  <td data-label="Тип">
                    <Badge tone="neutral">{TYPE_LABELS[n.type]}</Badge>
                  </td>
                  <td className="col-email" data-label="Email" title={n.registration_email}>
                    {n.registration_email}
                  </td>
                  <td data-label="Статус">
                    <Badge tone={STATUS_TONE[n.dispatch_status]}>
                      {STATUS_LABELS[n.dispatch_status]}
                      {n.skip_reason ? ` · ${n.skip_reason}` : ""}
                    </Badge>
                  </td>
                  <td data-label="Билет">
                    {n.payload.ticket_code ? (
                      <div className="row-actions-secondary">
                        <code>{n.payload.ticket_code}</code>
                        <button
                          type="button"
                          className={`btn-icon copy-btn${copied?.id === n.id && copied.field === "ticket" ? " copied" : ""}`}
                          aria-label="Скопировать код билета"
                          title="Скопировать код билета"
                          onClick={() => copyToClipboard(n.id, "ticket", n.payload.ticket_code!)}
                        >
                          ⧉
                        </button>
                      </div>
                    ) : (
                      <code>—</code>
                    )}
                  </td>
                  <td className="cell-actions" data-label="Ссылка">
                    <div className="row-actions-secondary">
                      <a
                        className="btn btn-sm btn-ghost"
                        href={n.payload.my_registration_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Открыть
                      </a>
                      <button
                        type="button"
                        className={`btn btn-sm btn-ghost copy-btn${copied?.id === n.id && copied.field === "link" ? " copied" : ""}`}
                        onClick={() => copyToClipboard(n.id, "link", n.payload.my_registration_url)}
                      >
                        Копировать
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
