import { useState } from "react";
import { api, ApiError } from "./api";
import { Banner, Field } from "./ui";

export function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.login(email, password);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Неверный email или пароль");
      } else {
        setError("Не удалось войти, попробуйте ещё раз");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h1 style={{ marginBottom: "var(--space-5)" }}>Вход для организатора</h1>
      <form onSubmit={handleSubmit}>
        <Field label="Email" htmlFor="login-email">
          <input
            id="login-email"
            className={`input${error ? " has-error" : ""}`}
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            autoComplete="username"
            disabled={busy}
            required
          />
        </Field>
        <Field label="Пароль" htmlFor="login-password">
          <input
            id="login-password"
            className={`input${error ? " has-error" : ""}`}
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            autoComplete="current-password"
            disabled={busy}
            required
          />
        </Field>
        {error && <Banner tone="error">{error}</Banner>}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy} style={{ width: "100%" }}>
            {busy ? "Вхожу..." : "Войти"}
          </button>
        </div>
      </form>
    </div>
  );
}
