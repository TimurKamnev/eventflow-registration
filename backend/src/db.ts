import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Без этого обработчика ошибка на простаивающем соединении пула (обрыв связи с
// БД, её перезапуск) всплывает как необработанное событие 'error' и роняет
// весь процесс — см. https://node-postgres.com/apis/pool#error.
pool.on("error", (err) => {
  console.error("unexpected pg pool error:", err);
});
