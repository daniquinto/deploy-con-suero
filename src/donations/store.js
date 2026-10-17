/**
 * Almacenamiento de las donaciones en curso.
 *
 * Implementación en memoria con snapshot opcional a un archivo JSON. El
 * contrato de métodos es el mismo que tendría un repositorio sobre Postgres
 * (el esquema SQL está en el README de este directorio), así que migrar es
 * sustituir este archivo sin tocar `flow.js`.
 *
 * Por qué hay snapshot: una donación vive partida en dos (antes y después del
 * consentimiento, que ocurre en el navegador del donante). Si el contenedor se
 * reinicia en medio —deploy, OOM— sin persistencia perdemos el `continue
 * token` y el pago queda huérfano: el donante autoriza y nadie crea el
 * outgoing payment. Los tokens se guardan ya cifrados por `tokens.js`, así que
 * el archivo no contiene credenciales en claro.
 *
 * Límite conocido: un solo proceso. Con varias réplicas hace falta Postgres y
 * `SELECT … FOR UPDATE SKIP LOCKED` en `claimContinue`/`resumable`.
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

/** Estados desde los que una donación todavía puede avanzar sola. */
export const RESUMABLE_STATUSES = ["awaiting_consent", "authorized", "sending"];

/** Estados terminales: ya no cambian. */
export const TERMINAL_STATUSES = ["completed", "failed", "expired", "cancelled"];

/**
 * @param {{ filePath?: string|null }} [options]
 */
export function createDonationStore({ filePath = null } = {}) {
  /** @type {Map<string, object>} */
  const rows = new Map();
  /** @type {Map<string, string>} externalRef -> id */
  const byExternalRef = new Map();

  if (filePath) loadSnapshot();

  // ─── Snapshot ──────────────────────────────────────────────────────────────

  function loadSnapshot() {
    try {
      if (!fs.existsSync(filePath)) return;
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      for (const row of parsed.donations ?? []) {
        rows.set(row.id, row);
        byExternalRef.set(row.externalRef, row.id);
      }
      console.log(`[store] ${rows.size} donaciones recuperadas de ${filePath}`);
    } catch (error) {
      // Un snapshot corrupto no debe impedir arrancar: se pierde el historial,
      // no el servicio. Se avisa fuerte porque puede haber pagos a medio camino.
      console.error(`[store] no se pudo leer ${filePath}: ${error.message}`);
    }
  }

  // Escritura serializada y agrupada: muchas actualizaciones seguidas (un
  // polling activo) no deben lanzar una escritura por cada una.
  let writing = null;
  let pending = false;

  function scheduleSnapshot() {
    if (!filePath) return;
    pending = true;
    if (writing) return;
    writing = (async () => {
      try {
        while (pending) {
          pending = false;
          const payload = JSON.stringify(
            { savedAt: new Date().toISOString(), donations: [...rows.values()] },
            null,
            2,
          );
          await fsp.mkdir(path.dirname(filePath), { recursive: true });
          // Escritura atómica: un reinicio a mitad de escritura no deja un
          // JSON truncado que luego no se puede leer.
          const tmp = `${filePath}.tmp`;
          await fsp.writeFile(tmp, payload, { mode: 0o600 });
          await fsp.rename(tmp, filePath);
        }
      } catch (error) {
        console.error(`[store] no se pudo guardar ${filePath}: ${error.message}`);
      } finally {
        writing = null;
      }
    })();
  }

  // ─── API ───────────────────────────────────────────────────────────────────

  return {
    /**
     * Inserta la donación. Si ya existe una con el mismo `externalRef`,
     * devuelve esa: es la clave de idempotencia (equivale al UNIQUE de la
     * tabla), para que un doble clic o un reintento del frontend no genere
     * dos cobros.
     */
    async create(row) {
      const existingId = byExternalRef.get(row.externalRef);
      if (existingId) return { row: rows.get(existingId), created: false };

      const stored = { ...row, createdAt: row.createdAt ?? new Date().toISOString() };
      stored.updatedAt = stored.createdAt;
      rows.set(stored.id, stored);
      byExternalRef.set(stored.externalRef, stored.id);
      scheduleSnapshot();
      return { row: stored, created: true };
    },

    async get(id) {
      return rows.get(id) ?? null;
    },

    async getByExternalRef(externalRef) {
      const id = byExternalRef.get(externalRef);
      return id ? rows.get(id) ?? null : null;
    },

    async update(id, patch) {
      const row = rows.get(id);
      if (!row) return null;
      Object.assign(row, patch, { updatedAt: new Date().toISOString() });
      scheduleSnapshot();
      return row;
    },

    /**
     * Marca el continue token como consumido y devuelve `true` solo la primera
     * vez. El continue token de GNAP es de un solo uso: si el donante recarga
     * el callback en el navegador, la segunda pasada no debe volver a crear un
     * outgoing payment. En Postgres esto es
     * `UPDATE … SET continue_consumed = true WHERE id = $1 AND NOT continue_consumed`
     * y se mira el número de filas afectadas.
     */
    async claimContinue(id) {
      const row = rows.get(id);
      if (!row || row.continueConsumed) return false;
      row.continueConsumed = true;
      row.updatedAt = new Date().toISOString();
      scheduleSnapshot();
      return true;
    },

    /** Donaciones que el job de reanudación debe revisar. */
    async resumable() {
      return [...rows.values()].filter((row) => RESUMABLE_STATUSES.includes(row.status));
    },

    /** Listado para diagnóstico, más reciente primero. */
    async list({ limit = 50, status } = {}) {
      return [...rows.values()]
        .filter((row) => !status || row.status === status)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, limit);
    },

    /** Conteo por estado: la métrica mínima para saber si el flujo funciona. */
    async countByStatus() {
      const counts = {};
      for (const row of rows.values()) {
        counts[row.status] = (counts[row.status] ?? 0) + 1;
      }
      return counts;
    },

    /** Vacía el store. Solo para tests. */
    async clear() {
      rows.clear();
      byExternalRef.clear();
    },

    /** Espera a que termine el snapshot pendiente. Para un cierre limpio. */
    async flush() {
      await writing;
    },
  };
}
