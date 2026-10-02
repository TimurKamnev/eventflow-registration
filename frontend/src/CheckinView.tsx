import { useEffect, useRef, useState } from "react";
import { api, eventCountsWsUrl, type EventCounts, type EventRecord } from "./api";
import { errorCodeFrom, localizeError } from "./errors";
import { Badge, Banner, Field, PageHeader } from "./ui";

// not_found — общий код на несколько ручек backend (события, регистрации,
// чекин); здесь по контексту он всегда означает конкретно билет, поэтому
// локальная подпись точнее общей из errors.ts.
const CHECKIN_NOT_FOUND_MESSAGE = "Билет с таким кодом не найден";

export function CheckinView({ event }: { event: EventRecord }) {
  const [counts, setCounts] = useState<EventCounts | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    // Растущий "номер" запроса/события — устаревший GET, который вернулся
    // позже более свежих данных (WS-сообщения или другого GET), не должен
    // затирать экран. Без этого медленный начальный GET мог бы откатить
    // счётчики назад уже после того, как onopen/WS принесли актуальные.
    let latestSeq = 0;

    function refreshCounts() {
      const seq = ++latestSeq;
      api.eventCounts(event.id).then((res) => {
        if (!cancelled && seq === latestSeq) setCounts(res);
      });
    }

    function connect() {
      // При каждом (пере)подключении сперва явно перечитываем состояние через
      // REST — сообщения WS не гарантированно доставлены за время разрыва
      // связи, поэтому на них одних полагаться нельзя.
      refreshCounts();

      const ws = new WebSocket(eventCountsWsUrl(event.id));
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        setWsConnected(true);
        // Подписка на сервере уже установлена к этому моменту (она
        // регистрируется синхронно при обработке апгрейда, до отправки
        // клиенту ответа на handshake) — переспрашиваем ещё раз, чтобы
        // закрыть промежуток между самым первым GET (мог уйти до того, как
        // подписка встала) и последующими live-обновлениями.
        refreshCounts();
      };
      ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === "counts" && data.eventId === event.id) {
          latestSeq++; // живое сообщение всегда свежее любого летящего GET
          setCounts({
            confirmed: data.confirmed,
            waitlisted: data.waitlisted,
            checked_in: data.checked_in,
          });
        }
      };
      ws.onclose = () => {
        if (cancelled) return;
        setWsConnected(false);
        reconnectTimer = setTimeout(connect, 1500);
      };
    }

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [event.id]);

  async function handleCheckin(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    setBusy(true);
    try {
      await api.checkin(code.trim());
      setResult({ ok: true, text: "Отмечен на входе" });
      setCode("");
    } catch (err) {
      const text = errorCodeFrom(err) === "not_found" ? CHECKIN_NOT_FOUND_MESSAGE : localizeError(err);
      setResult({ ok: false, text });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={`Чекин: ${event.title}`}
        backTo="/admin/events"
        backLabel="К событиям"
        actions={<Badge tone={wsConnected ? "success" : "danger"}>{wsConnected ? "live-обновление подключено" : "переподключение..."}</Badge>}
      />

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">Зарегистрировано</div>
          <div className="stat-value">{counts ? counts.confirmed + counts.checked_in : "…"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">В листе ожидания</div>
          <div className="stat-value">{counts?.waitlisted ?? "…"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Пришло</div>
          <div className="stat-value">{counts?.checked_in ?? "…"}</div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 360 }}>
        <form onSubmit={handleCheckin}>
          <Field label="Код билета" htmlFor="checkin-code">
            <input
              id="checkin-code"
              className={`input${result && !result.ok ? " has-error" : ""}`}
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setResult(null);
              }}
              autoComplete="off"
              disabled={busy}
              required
            />
          </Field>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={busy || !code.trim()} style={{ width: "100%" }}>
              {busy ? "Проверяю..." : "Отметить"}
            </button>
          </div>
        </form>
        {result && <div style={{ marginTop: "var(--space-4)" }}><Banner tone={result.ok ? "success" : "error"}>{result.text}</Banner></div>}
      </div>
    </div>
  );
}
