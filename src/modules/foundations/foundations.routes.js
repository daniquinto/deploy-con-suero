/**
 * Fundaciones y sus causas.
 *
 * Públicas:
 *   GET   /api/causes                       causas activas
 *   GET   /api/causes/:id                   detalle de una causa
 *   GET   /api/foundations/:id              perfil público de una fundación
 *
 * Fundación con sesión (Bearer, role = foundation):
 *   GET   /api/foundations/me               su perfil
 *   PATCH /api/foundations/me               editar perfil (nombre, lugar, descripción, wallet)
 *   GET   /api/foundations/me/causes        sus causas (activas y cerradas)
 *   POST  /api/foundations/me/causes        crear causa
 *   PATCH /api/foundations/me/causes/:id    editar causa o cambiar estado (active | closed)
 */
import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../auth/tokens.js";
import { badRequest, forbidden, notFound } from "../../http/errors.js";
import { optionalWalletAddress } from "../../http/validation.js";
import * as causes from "./causes.repository.js";

const uuid = z.uuid({ error: "Identificador inválido." });

const causeFields = {
  title: z.string().trim().min(5, "El título debe tener al menos 5 caracteres.").max(80, "Máximo 80 caracteres en el título."),
  description: z
    .string()
    .trim()
    .min(20, "Cuenta en al menos 20 caracteres a qué se destinará el dinero.")
    .max(600, "Máximo 600 caracteres en la descripción."),
  location: z.string().trim().min(1, "Indica dónde se usará la ayuda.").max(120),
  goal: z.coerce
    .number({ error: "La meta debe ser un número." })
    .int("La meta debe ser un número entero.")
    .positive("La meta debe ser mayor que cero.")
    .max(1_000_000_000_000, "La meta es demasiado alta."),
};

const createCauseSchema = z.object(causeFields);
const updateCauseSchema = z
  .object({ ...causeFields, status: z.enum(["active", "closed"], { error: "Estado inválido." }) })
  .partial();

const updateFoundationSchema = z
  .object({
    name: z.string().trim().min(2, "Escribe el nombre de la fundación.").max(120),
    legalRepresentative: z.string().trim().min(3, "Escribe la persona responsable.").max(120),
    location: z.string().trim().max(120),
    description: z.string().trim().max(600),
    walletAddress: optionalWalletAddress,
  })
  .partial();

const FOUNDATION_SELECT = `
  SELECT id, name, location, description,
         coalesce(wallet_address, '') AS "walletAddress", currency,
         status, legal_representative AS "legalRepresentative",
         id_type AS "idType", id_number AS "idNumber"
    FROM foundations`;

/** Regla de negocio: solo una fundación ACTIVA puede crear o publicar causas. */
function requireActive(foundation) {
  if (foundation.status !== "ACTIVA") {
    throw forbidden(
      foundation.status === "SUSPENDIDA"
        ? "Tu fundación está suspendida y no puede publicar causas."
        : "Tu fundación está pendiente de activación. Podrás publicar causas cuando una entidad la active.",
    );
  }
}

async function findFoundation(where, value) {
  const { rows } = await query(`${FOUNDATION_SELECT} WHERE ${where} = $1`, [value]);
  return rows[0] ?? null;
}

/** Carga la fundación del usuario en sesión y la deja en req.foundation. */
async function loadMyFoundation(req, _res, next) {
  const foundation = await findFoundation("user_id", req.auth.userId);
  if (!foundation) return next(notFound("Tu cuenta no tiene un perfil de fundación."));
  req.foundation = foundation;
  return next();
}

// ── Públicas ─────────────────────────────────────────────────────────

export const causesRouter = Router();

causesRouter.get("/", async (_req, res) => {
  res.json({ causes: await causes.listActiveCauses() });
});

causesRouter.get("/:id", async (req, res) => {
  const id = uuid.safeParse(req.params.id);
  const cause = id.success ? await causes.findCause(id.data) : null;
  if (!cause) throw notFound("La causa no existe.");
  res.json({ cause });
});

export const foundationsRouter = Router();

// ── Fundación en sesión (va antes de /:id para que "me" no se tome como id) ──

const me = Router();
me.use(requireAuth, requireRole("foundation"), loadMyFoundation);

me.get("/", (req, res) => {
  res.json({ foundation: req.foundation });
});

me.patch("/", async (req, res) => {
  const changes = updateFoundationSchema.parse(req.body);
  const columns = {
    name: "name",
    legalRepresentative: "legal_representative",
    location: "location",
    description: "description",
    walletAddress: "wallet_address",
  };
  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(columns)) {
    if (changes[key] === undefined) continue;
    values.push(changes[key]);
    sets.push(`${column} = $${values.length}`);
  }
  if (sets.length) {
    values.push(req.foundation.id);
    await query(`UPDATE foundations SET ${sets.join(", ")}, updated_at = now() WHERE id = $${values.length}`, values);
  }
  res.json({ foundation: await findFoundation("id", req.foundation.id) });
});

me.get("/causes", async (req, res) => {
  res.json({ causes: await causes.listCausesByFoundation(req.foundation.id) });
});

me.post("/causes", async (req, res) => {
  requireActive(req.foundation);
  const input = createCauseSchema.parse(req.body);
  const cause = await causes.insertCause(req.foundation.id, req.foundation.currency, input);
  res.status(201).json({ cause });
});

me.patch("/causes/:id", async (req, res) => {
  const id = uuid.safeParse(req.params.id);
  if (!id.success) throw notFound("La causa no existe.");
  const changes = updateCauseSchema.parse(req.body);
  if (Object.keys(changes).length === 0) throw badRequest("No enviaste ningún cambio.");
  // Cerrar siempre se puede; publicar o reactivar exige fundación ACTIVA.
  if (changes.status === "active") requireActive(req.foundation);

  const cause = await causes.updateCause(id.data, req.foundation.id, changes);
  // 404 también si la causa es de otra fundación: no revelamos que existe.
  if (!cause) throw notFound("La causa no existe.");
  res.json({ cause });
});

foundationsRouter.use("/me", me);

// ── Perfil público ───────────────────────────────────────────────────

foundationsRouter.get("/:id", async (req, res) => {
  const id = uuid.safeParse(req.params.id);
  const foundation = id.success ? await findFoundation("id", id.data) : null;
  if (!foundation) throw notFound("La fundación no existe.");
  // Vista pública: sin datos de la persona responsable ni de identificación.
  const { legalRepresentative: _r, idType: _t, idNumber: _n, ...publicFoundation } = foundation;
  res.json({ foundation: publicFoundation });
});
