import { useEffect, useState } from "react";
import { api, type EventRecord } from "./api";
import { formatBishkek, isEventStarted } from "./time";
import { Badge, PageHeader } from "./ui";

interface Props {
  onCreate: () => void;
  onEdit: (event: EventRecord) => void;
  onViewNotifications: (event: EventRecord) => void;
  onCheckin: (event: EventRecord) => void;
}

export function EventsList({ onCreate, onEdit, onViewNotifications, onCheckin }: Props) {
  const [events, setEvents] = useState<EventRecord[] | null>(null);

  useEffect(() => {
    api.listEvents().then((res) => setEvents(res.events));
  }, []);

  return (
    <div>
      <PageHeader
        title="События"
        actions={
          <button className="btn btn-primary" onClick={onCreate}>
            Создать событие
          </button>
        }
      />

      {events === null && <p>Загрузка...</p>}
      {events?.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-title">Событий пока нет</div>
          <p>Создайте первое, чтобы получить публичную ссылку для регистрации.</p>
        </div>
      )}
      {events && events.length > 0 && (
        <div className="table-wrap">
          <table className="table table-cards">
            <thead>
              <tr>
                <th>Название</th>
                <th>Дата (Asia/Bishkek)</th>
                <th>Лимит</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="col-main" data-label="Название">
                    {event.title}
                  </td>
                  <td className="col-muted" data-label="Дата">
                    {formatBishkek(event.starts_at)}
                  </td>
                  <td data-label="Лимит">{event.capacity}</td>
                  <td data-label="Статус">
                    {isEventStarted(event.starts_at) ? (
                      <Badge tone="warning">Началось</Badge>
                    ) : (
                      <Badge tone="neutral">Предстоит</Badge>
                    )}
                  </td>
                  <td className="cell-actions">
                    <div className="row-actions">
                      <button className="btn btn-sm" onClick={() => onEdit(event)}>
                        Редактировать
                      </button>
                      <div className="row-actions-secondary">
                        <a
                          className="btn btn-sm btn-ghost"
                          href={`/e/${event.id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Страница регистрации
                        </a>
                        <button className="btn btn-sm btn-ghost" onClick={() => onViewNotifications(event)}>
                          Письма
                        </button>
                        <button className="btn btn-sm btn-ghost" onClick={() => onCheckin(event)}>
                          Чекин
                        </button>
                      </div>
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
