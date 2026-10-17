import pg from "pg";
import { serverConfig } from "../config/server.js";

// BIGINT (int8) llega como string por defecto; los montos caben en Number sin perder precisión.
pg.types.setTypeParser(20, (value) => Number(value));

export const pool = new pg.Pool({
  connectionString: serverConfig.databaseUrl,
  ssl: serverConfig.databaseSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (err) => {
  console.error("[db] error en una conexión inactiva:", err.message);
});

/** Atajo para consultas simples. */
export function query(text, params) {
  return pool.query(text, params);
}

/** Ejecuta `fn` dentro de una transacción; hace rollback si lanza. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
