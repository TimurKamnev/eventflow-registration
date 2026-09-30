import { useState } from "react";
import { api, type EventRecord } from "./api";
import { LoginForm } from "./LoginForm";
import { EventsList } from "./EventsList";
import { EventForm } from "./EventForm";
import "./App.css";

type View = { kind: "list" } | { kind: "create" } | { kind: "edit"; event: EventRecord };

function App() {
  const [authed, setAuthed] = useState(false);
  const [view, setView] = useState<View>({ kind: "list" });
  const [reloadKey, setReloadKey] = useState(0);

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
    </main>
  );
}

export default App;
