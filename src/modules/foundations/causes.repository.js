import { query } from "../../db/pool.js";

/**
 * Columnas de una causa tal como las consume el frontend.
 *
 * `raised` y `donationsCount` salen en 0 hasta que exista la tabla de donaciones
 * (la trabaja otra parte del equipo). Cuando exista, se calculan aquí con un
 * LEFT JOIN sobre las donaciones completadas de cada causa.
 */
const CAUSE_SELECT = `
  SELECT c.id,
         c.foundation_id AS "foundationId",
         f.name          AS "foundationName",
         c.title, c.description, c.location,
         c.goal_amount   AS goal,
         0               AS raised,
         c.currency,
         0               AS "donationsCount",
         c.status,
         c.created_at    AS "createdAt"
    FROM causes c
    JOIN foundations f ON f.id = c.foundation_id`;

export async function listActiveCauses() {
  // Solo causas de fundaciones ACTIVAS reciben donaciones (regla de negocio).
  const { rows } = await query(
    `${CAUSE_SELECT} WHERE c.status = 'active' AND f.status = 'ACTIVA' ORDER BY c.created_at DESC LIMIT 200`,
  );
  return rows;
}

export async function listCausesByFoundation(foundationId) {
  const { rows } = await query(`${CAUSE_SELECT} WHERE c.foundation_id = $1 ORDER BY c.created_at DESC`, [foundationId]);
  return rows;
}

export async function findCause(id) {
  const { rows } = await query(`${CAUSE_SELECT} WHERE c.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function insertCause(foundationId, currency, input) {
  const { rows } = await query(
    `INSERT INTO causes (foundation_id, title, description, location, goal_amount, currency)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [foundationId, input.title, input.description, input.location, input.goal, currency],
  );
  return findCause(rows[0].id);
}

/** Actualiza solo los campos presentes en `changes`. Devuelve null si la causa no es de esa fundación. */
export async function updateCause(id, foundationId, changes) {
  const columns = { title: "title", description: "description", location: "location", goal: "goal_amount", status: "status" };
  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(columns)) {
    if (changes[key] === undefined) continue;
    values.push(changes[key]);
    sets.push(`${column} = $${values.length}`);
  }
  if (sets.length === 0) return findCause(id);

  values.push(id, foundationId);
  const { rowCount } = await query(
    `UPDATE causes SET ${sets.join(", ")}, updated_at = now()
      WHERE id = $${values.length - 1} AND foundation_id = $${values.length}`,
    values,
  );
  return rowCount ? findCause(id) : null;
}
