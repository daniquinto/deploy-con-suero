/**
 * CRUD del donante sobre su propia cuenta (el "create" es POST /api/auth/register).
 *
 *   GET    /api/donors/me            ver mi perfil
 *   PATCH  /api/donors/me            editar nombres, apellidos, género, nombre público, país, wallet, moneda, anonimato
 *   PATCH  /api/donors/me/password  { currentPassword, newPassword }
 *   DELETE /api/donors/me            { password }  elimina la cuenta y su perfil
 *
 * Todas exigen sesión (Bearer) con role = donor. El documento no se edita
 * desde aquí: identifica a la persona.
 */
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query, withTransaction } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../auth/tokens.js";
import { badRequest, notFound } from "../../http/errors.js";
import { optionalWalletAddress } from "../../http/validation.js";
import { GENDERS } from "../auth/auth.routes.js";

const BCRYPT_ROUNDS = 12;

const updateSchema = z
  .object({
    firstNames: z.string().trim().min(2, "Escribe tus nombres.").max(80),
    lastNames: z.string().trim().min(2, "Escribe tus apellidos.").max(80),
    gender: z.enum(GENDERS, { error: "Elige una opción de género." }),
    publicName: z.string().trim().max(120).transform((v) => (v === "" ? null : v)).nullable(),
    country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "El país debe ser un código de 2 letras, por ejemplo CO."),
    walletAddress: optionalWalletAddress,
    preferredCurrency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "La moneda debe ser un código de 3 letras, por ejemplo USD.")
      .nullable(),
    isAnonymous: z.boolean({ error: "isAnonymous debe ser true o false." }),
  })
  .partial();

const passwordSchema = z.object({
  currentPassword: z.string({ error: "Escribe tu contraseña actual." }).min(1, "Escribe tu contraseña actual."),
  newPassword: z
    .string({ error: "Escribe la nueva contraseña." })
    .min(8, "La nueva contraseña debe tener al menos 8 caracteres.")
    .max(72, "La contraseña es demasiado larga."),
});

const deleteSchema = z.object({
  password: z.string({ error: "Confirma con tu contraseña." }).min(1, "Confirma con tu contraseña."),
});

async function findDonor(userId) {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email,
            u.wallet_address     AS "walletAddress",
            d.first_names        AS "firstNames",
            d.last_names         AS "lastNames",
            d.document_type      AS "documentType",
            d.document_number    AS "documentNumber",
            d.gender,
            d.public_name        AS "publicName",
            d.country,
            d.preferred_currency AS "preferredCurrency",
            d.is_anonymous       AS "isAnonymous",
            u.created_at         AS "createdAt"
       FROM users u
       JOIN donors d ON d.user_id = u.id
      WHERE u.id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

/** 400 y no 401: la sesión es válida; un 401 haría que el frontend cierre la sesión. */
async function checkPassword(userId, password) {
  const { rows } = await query("SELECT password_hash FROM users WHERE id = $1", [userId]);
  const ok = rows[0] && (await bcrypt.compare(password, rows[0].password_hash));
  if (!ok) throw badRequest("La contraseña no es correcta.");
}

export const donorsRouter = Router();
const me = Router();
me.use(requireAuth, requireRole("donor"));

me.get("/", async (req, res) => {
  const donor = await findDonor(req.auth.userId);
  if (!donor) throw notFound("No encontramos tu perfil de donante.");
  res.json({ donor });
});

me.patch("/", async (req, res) => {
  const changes = updateSchema.parse(req.body);
  if (Object.keys(changes).length === 0) throw badRequest("No enviaste ningún cambio.");

  await withTransaction(async (db) => {
    const profile = {
      first_names: changes.firstNames,
      last_names: changes.lastNames,
      gender: changes.gender,
      public_name: changes.publicName,
      country: changes.country,
      preferred_currency: changes.preferredCurrency,
      is_anonymous: changes.isAnonymous,
    };
    const columns = Object.keys(profile).filter((k) => profile[k] !== undefined);
    if (columns.length) {
      const values = columns.map((c) => profile[c]);
      values.push(req.auth.userId);
      await db.query(
        `UPDATE donors SET ${columns.map((c, i) => `${c} = $${i + 1}`).join(", ")}, updated_at = now()
          WHERE user_id = $${values.length}`,
        values,
      );
    }

    // users.name se mantiene como "nombres apellidos"; la wallet vive en users.
    await db.query(
      `UPDATE users u
          SET name = d.first_names || ' ' || d.last_names,
              wallet_address = CASE WHEN $2::boolean THEN $3 ELSE u.wallet_address END,
              updated_at = now()
         FROM donors d
        WHERE d.user_id = u.id AND u.id = $1`,
      [req.auth.userId, changes.walletAddress !== undefined, changes.walletAddress ?? null],
    );
  });

  res.json({ donor: await findDonor(req.auth.userId) });
});

me.patch("/password", async (req, res) => {
  const input = passwordSchema.parse(req.body);
  await checkPassword(req.auth.userId, input.currentPassword);
  const hash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
  await query("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2", [hash, req.auth.userId]);
  res.status(204).end();
});

me.delete("/", async (req, res) => {
  const input = deleteSchema.parse(req.body);
  await checkPassword(req.auth.userId, input.password);
  // ON DELETE CASCADE borra también el perfil en `donors`.
  await query("DELETE FROM users WHERE id = $1 AND role = 'donor'", [req.auth.userId]);
  res.status(204).end();
});

donorsRouter.use("/me", me);
