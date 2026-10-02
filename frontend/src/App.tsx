import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { api } from "./api";
import { LoginForm } from "./LoginForm";
import { EventsList } from "./EventsList";
import { EventForm } from "./EventForm";
import { PublicEventPage } from "./PublicEventPage";
import { ParticipantPage } from "./ParticipantPage";
import { NotificationsView } from "./NotificationsView";
import { CheckinView } from "./CheckinView";
import "./App.css";

interface AuthState {
  authed: boolean;
  checking: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function useTitle(title: string) {
  useEffect(() => {
    document.title = title ? `EventFlow — ${title}` : "EventFlow";
  }, [title]);
}

function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

// Кука сессии (httpOnly) переживает перезагрузку страницы сама по себе —
// без этой проверки на старте authed всегда начинался бы с false и
// организатора встречала форма логина даже с ещё валидной сессией.
function AuthProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);

  async function refresh() {
    try {
      await api.me();
      setAuthed(true);
    } catch {
      setAuthed(false);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logout() {
    await api.logout();
    setAuthed(false);
  }

  return <AuthContext.Provider value={{ authed, checking, refresh, logout }}>{children}</AuthContext.Provider>;
}

function RequireAuth() {
  const { authed, checking } = useAuth();
  const location = useLocation();

  if (checking) return null;
  if (!authed) {
    return <Navigate to="/admin/login" state={{ from: location.pathname }} replace />;
  }
  return <Outlet />;
}

function AdminLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/admin/login", { replace: true });
  }

  return (
    <div>
      <div className="topbar">
        <Link to="/admin/events" className="topbar-brand">
          Event<span>Flow</span>
        </Link>
        <div className="topbar-right">
          <button className="btn btn-sm" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </div>
      <div className="container">
        <Outlet />
      </div>
    </div>
  );
}

function LoginRoute() {
  const { authed, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/admin/events";
  useTitle("Вход");

  if (authed) {
    return <Navigate to={from} replace />;
  }

  return (
    <div className="center-shell">
      <div className="auth-card">
        <LoginForm
          onSuccess={async () => {
            await refresh();
            navigate(from, { replace: true });
          }}
        />
      </div>
    </div>
  );
}

function EventsListRoute() {
  const navigate = useNavigate();
  useTitle("События");
  return (
    <EventsList
      onCreate={() => navigate("/admin/events/new")}
      onEdit={(event) => navigate(`/admin/events/${event.id}/edit`)}
      onViewNotifications={(event) => navigate(`/admin/events/${event.id}/notifications`)}
      onCheckin={(event) => navigate(`/admin/events/${event.id}/checkin`)}
    />
  );
}

function EventFormRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const back = () => navigate("/admin/events");
  useTitle(id ? "Редактировать событие" : "Новое событие");

  if (!id) {
    return <EventForm onSaved={back} onCancel={back} />;
  }
  return <EventFormWithEvent id={id} onSaved={back} onCancel={back} />;
}

function EventFormWithEvent({ id, onSaved, onCancel }: { id: string; onSaved: () => void; onCancel: () => void }) {
  const fetched = useEventFetch(id);
  if (fetched.status === "loading") return <p>Загрузка...</p>;
  if (fetched.status === "error") return <p>Событие не найдено.</p>;
  return <EventForm event={fetched.event} onSaved={onSaved} onCancel={onCancel} />;
}

function NotificationsRoute() {
  const { id } = useParams<{ id: string }>();
  const fetched = useEventFetch(id);
  useTitle(fetched.status === "ready" ? `Письма: ${fetched.event.title}` : "Письма");
  if (fetched.status === "loading") return <p>Загрузка...</p>;
  if (fetched.status === "error") return <p>Событие не найдено.</p>;
  return <NotificationsView event={fetched.event} />;
}

function CheckinRoute() {
  const { id } = useParams<{ id: string }>();
  const fetched = useEventFetch(id);
  useTitle(fetched.status === "ready" ? `Чекин: ${fetched.event.title}` : "Чекин");
  if (fetched.status === "loading") return <p>Загрузка...</p>;
  if (fetched.status === "error") return <p>Событие не найдено.</p>;
  return <CheckinView event={fetched.event} />;
}

type EventFetchState =
  | { status: "loading" }
  | { status: "ready"; event: import("./api").EventRecord }
  | { status: "error" };

function useEventFetch(id: string | undefined): EventFetchState {
  const [state, setState] = useState<EventFetchState>({ status: "loading" });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setState({ status: "loading" });
    api
      .getEvent(id)
      .then((res) => {
        if (!cancelled) setState({ status: "ready", event: res.event });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) return { status: "error" };
  return state;
}

function PublicEventRoute() {
  const { id } = useParams<{ id: string }>();
  return <PublicEventPage eventId={id!} />;
}

function ParticipantRoute() {
  const { token } = useParams<{ token: string }>();
  return <ParticipantPage token={token!} />;
}

function NotFound() {
  return (
    <div className="center-shell">
      <p>Страница не найдена.</p>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/admin/login" element={<LoginRoute />} />
          <Route element={<RequireAuth />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<Navigate to="/admin/events" replace />} />
              <Route path="/admin/events" element={<EventsListRoute />} />
              <Route path="/admin/events/new" element={<EventFormRoute />} />
              <Route path="/admin/events/:id/edit" element={<EventFormRoute />} />
              <Route path="/admin/events/:id/notifications" element={<NotificationsRoute />} />
              <Route path="/admin/events/:id/checkin" element={<CheckinRoute />} />
            </Route>
          </Route>
          <Route path="/e/:id" element={<PublicEventRoute />} />
          <Route path="/my/:token" element={<ParticipantRoute />} />
          <Route path="/" element={<Navigate to="/admin/events" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
