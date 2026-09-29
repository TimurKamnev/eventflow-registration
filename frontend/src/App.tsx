import { useEffect, useState } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

type HealthState =
  | { kind: "loading" }
  | { kind: "ok"; now: string }
  | { kind: "error"; message: string };

function App() {
  const [health, setHealth] = useState<HealthState>({ kind: "loading" });

  useEffect(() => {
    fetch(`${API_URL}/health/db`)
      .then((res) => res.json())
      .then((data) => setHealth({ kind: "ok", now: data.now }))
      .catch((err) => setHealth({ kind: "error", message: String(err) }));
  }, []);

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>EventFlow</h1>
      <p>Каркас проекта: frontend и backend общаются по сети, backend подключён к PostgreSQL.</p>
      <p>
        Статус backend/DB:{" "}
        {health.kind === "loading" && "проверяю..."}
        {health.kind === "ok" && `ok, время БД (UTC): ${health.now}`}
        {health.kind === "error" && `ошибка: ${health.message}`}
      </p>
    </main>
  );
}

export default App;
