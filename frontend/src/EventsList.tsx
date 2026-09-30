import { useEffect, useState } from "react";
import { api, type EventRecord } from "./api";
import { formatBishkek } from "./time";

interface Props {
  onCreate: () => void;
  onEdit: (event: EventRecord) => void;
  onViewNotifications: (event: EventRecord) => void;
  reloadKey: number;
}

export function EventsList({ onCreate, onEdit, onViewNotifications, reloadKey }: Props) {
  const [events, setEvents] = useState<EventRecord[] | null>(null);

  useEffect(() => {
    api.listEvents().then((res) => setEvents(res.events));
  }, [reloadKey]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>События</h1>
        <button onClick={onCreate}>Создать событие</button>
      </div>
      {events === null && <p>Загрузка...</p>}
      {events?.length === 0 && <p>Событий пока нет.</p>}
      {events && events.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Название</th>
              <th style={{ textAlign: "left" }}>Дата (Asia/Bishkek)</th>
              <th style={{ textAlign: "left" }}>Лимит</th>
              <th style={{ textAlign: "left" }}>Версия</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td>{event.title}</td>
                <td>{formatBishkek(event.starts_at)}</td>
                <td>{event.capacity}</td>
                <td>{event.schedule_version}</td>
                <td style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => onEdit(event)}>Редактировать</button>
                  <a href={`/e/${event.id}`} target="_blank" rel="noreferrer">
                    Публичная страница
                  </a>
                  <button onClick={() => onViewNotifications(event)}>Письма</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
