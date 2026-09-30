import { useEffect, useRef, useState } from "react";
import { api, ApiError, eventCountsWsUrl, type EventCounts, type EventRecord } from "./api";

const CHECKIN_ERROR_LABELS: Record<string, string> = {
  not_found: "Билет с таким кодом не найден",
  already_checked_in: "Этот билет уже отмечен на входе",
  not_confirmed: "Билет не подтверждён (лист ожидания или отменён) — вход закрыт",
};

export function CheckinView({ event, onBack }: { event: EventRecord; onBack: () => void }) {
  const [counts, setCounts] = useState<EventCounts | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<string | null>(null);
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
      setResult("Отмечен на входе");
      setCode("");
    } catch (err) {
      if (err instanceof ApiError) {
        const errorCode = (err.body as { error?: string })?.error;
        setResult(errorCode ? CHECKIN_ERROR_LABELS[errorCode] ?? errorCode : "Не удалось отметить билет");
      } else {
        setResult("Не удалось отметить билет");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Чекин: {event.title}</h1>
        <button onClick={onBack}>Назад к событиям</button>
      </div>
      <p style={{ color: wsConnected ? "#2a2" : "#a22" }}>
        {wsConnected ? "live-обновление подключено" : "переподключение..."}
      </p>

      <div style={{ display: "flex", gap: 24, margin: "1rem 0" }}>
        <Counter
          label="Зарегистрировано"
          value={counts ? counts.confirmed + counts.checked_in : undefined}
        />
        <Counter label="В листе ожидания" value={counts?.waitlisted} />
        <Counter label="Пришло" value={counts?.checked_in} />
      </div>

      <form onSubmit={handleCheckin} style={{ maxWidth: 320 }}>
        <label>
          Код билета
          <br />
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            style={{ width: "100%" }}
          />
        </label>
        <button type="submit" disabled={busy || !code.trim()} style={{ marginTop: 8 }}>
          {busy ? "Проверяю..." : "Отметить"}
        </button>
      </form>
      {result && <p>{result}</p>}
    </div>
  );
}

function Counter({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#666" }}>{label}</div>
      <div style={{ fontSize: 28 }}>{value ?? "…"}</div>
    </div>
  );
}
