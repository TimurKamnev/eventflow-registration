import { useEffect, useState } from "react";
import { api, type EventRecord } from "./api";
import { LoginForm } from "./LoginForm";
import { EventsList } from "./EventsList";
import { EventForm } from "./EventForm";
import { PublicEventPage } from "./PublicEventPage";
import { ParticipantPage } from "./ParticipantPage";
import { NotificationsView } from "./NotificationsView";
import { CheckinView } from "./CheckinView";
import "./App.css";

type View =
  | { kind: "list" }
  | { kind: "create" }
  | { kind: "edit"; event: EventRecord }
  | { kind: "notifications"; event: EventRecord }
  | { kind: "checkin"; event: EventRecord };

function App() {
  // Все хуки вызываются безусловно и первыми — раннее ветвление по маршруту
  // идёт только в JSX ниже, иначе порядок хуков менялся бы между рендерами.
  const [authed, setAuthed] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [view, setView] = useState<View>({ kind: "list" });
  const [reloadKey, setReloadKey] = useState(0);

  // Публичные страницы (ссылка на событие, ссылка участника из письма) не
  // требуют организаторской сессии и открываются по прямому URL — своего
  // роутера пока достаточно двух путей, react-router не нужен.
  const path = window.location.pathname;
  const eventMatch = path.match(/^\/e\/([^/]+)$/);
  const myMatch = path.match(/^\/my\/([^/]+)$/);
  const isPublicRoute = Boolean(eventMatch || myMatch);

  // Кука сессии (httpOnly) переживает перезагрузку страницы сама по себе —
  // без этой проверки при маунте authed всегда стартовал бы с false и
  // организатора встречала форма логина даже с ещё валидной сессией.
  useEffect(() => {
    if (isPublicRoute) {
      setCheckingSession(false);
      return;
    }
    api
      .me()
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false))
      .finally(() => setCheckingSession(false));
  }, [isPublicRoute]);

  if (eventMatch) return <PublicEventPage eventId={eventMatch[1]} />;
  if (myMatch) return <ParticipantPage token={myMatch[1]} />;

  if (checkingSession) return null;

  if (!authed) {
    return (
      <main style={{ fontFamily: "sans-serif", padding: "2rem" }}>
        <LoginForm onSuccess={() => setAuthed(true)} />
      </main>
    );
  }

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={async () => {
            await api.logout();
            setAuthed(false);
          }}
        >
          Выйти
        </button>
      </div>

      {view.kind === "list" && (
        <EventsList
          reloadKey={reloadKey}
          onCreate={() => setView({ kind: "create" })}
          onEdit={(event) => setView({ kind: "edit", event })}
          onViewNotifications={(event) => setView({ kind: "notifications", event })}
          onCheckin={(event) => setView({ kind: "checkin", event })}
        />
      )}

      {view.kind === "create" && (
        <EventForm
          onSaved={() => {
            setReloadKey((k) => k + 1);
            setView({ kind: "list" });
          }}
          onCancel={() => setView({ kind: "list" })}
        />
      )}

      {view.kind === "edit" && (
        <EventForm
          event={view.event}
          onSaved={() => {
            setReloadKey((k) => k + 1);
            setView({ kind: "list" });
          }}
          onCancel={() => setView({ kind: "list" })}
        />
      )}

      {view.kind === "notifications" && (
        <NotificationsView event={view.event} onBack={() => setView({ kind: "list" })} />
      )}

      {view.kind === "checkin" && (
        <CheckinView event={view.event} onBack={() => setView({ kind: "list" })} />
      )}
    </main>
  );
}

export default App;
