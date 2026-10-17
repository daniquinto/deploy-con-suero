/**
 * Migraciones SQL simples: aplica en orden los archivos de `migrations/`
 * que aún no estén en la tabla `schema_migrations`. Cada archivo corre en
 * su propia transacción.
 *
 *   npm run db:migrate
 *
 * Para cambiar el esquema: crea un archivo nuevo con fecha y hora al inicio
 * (AAAAMMDD_HHMM_descripcion.sql) para no chocar con las migraciones de otros.
 * Nunca edites uno que ya se aplicó en la VPS.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

export async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    // Evita que dos instancias migren a la vez.
    await client.query("SELECT pg_advisory_lock(727274)");

    const { rows } = await client.query("SELECT name FROM schema_migrations");
    const applied = new Set(rows.map((r) => r.name));
    const files = (await fs.readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`[db] migración aplicada: ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`La migración ${file} falló: ${err.message}`, { cause: err });
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(727274)").catch(() => {});
    client.release();
  }
}

// Ejecutado directamente: `node src/db/migrate.js`
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  migrate()
    .then(() => console.log("[db] esquema al día"))
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
