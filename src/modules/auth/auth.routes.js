/**
 * Registro e inicio de sesión.
 *
 *   POST /api/auth/register
 *     Donante:   { role: "donor", firstNames, lastNames, documentType, documentNumber, gender, email, password, country? }
 *     Fundación: { role: "foundation", name, legalRepresentative, idType, idNumber, email, password, location?, description? }
 *   POST /api/auth/login     { email, password }
 *   GET  /api/auth/me        (Bearer)
 *
 * Responde { token, user }. La wallet address se agrega después desde el perfil.
 */
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query, withTransaction } from "../../db/pool.js";
import { requireAuth, signToken } from "../../auth/tokens.js";
import { serverConfig } from "../../config/server.js";
import { conflict, unauthorized } from "../../http/errors.js";
import { email } from "../../http/validation.js";

const BCRYPT_ROUNDS = 12;

export const DOCUMENT_TYPES = ["CC", "CE", "TI", "PA", "PPT", "DNI"];
export const GENDERS = ["F", "M", "NB", "ND"];
export const FOUNDATION_ID_TYPES = ["NIT", "RUT", "REGISTRO_EXTRANJERO", "OTRO"];

const password = z
  .string({ error: "Escribe una contraseña." })
  .min(8, "La contraseña debe tener al menos 8 caracteres.")
  .max(72, "La contraseña es demasiado larga.");

const personName = (label) =>
  z.string({ error: `Escribe tus ${label}.` }).trim().min(2, `Escribe tus ${label}.`).max(80);

const documentNumber = z
  .string({ error: "Escribe el número de documento." })
  .trim()
  .regex(/^[0-9A-Za-z.-]{4,20}$/, "El número de documento no es válido.");

const donorSchema = z.object({
  role: z.literal("donor"),
  firstNames: personName("nombres"),
  lastNames: personName("apellidos"),
  documentType: z.enum(DOCUMENT_TYPES, { error: "Elige el tipo de documento." }),
  documentNumber,
  gender: z.enum(GENDERS, { error: "Elige una opción de género." }),
  email,
  password,
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "El país debe ser un código de 2 letras, por ejemplo CO.")
    .optional()
    .default("CO"),
});

const foundationSchema = z.object({
  role: z.literal("foundation"),
  name: z.string({ error: "Escribe el nombre de la fundación." }).trim().min(2, "Escribe el nombre de la fundación.").max(120),
  legalRepresentative: z
    .string({ error: "Escribe la persona responsable." })
    .trim()
    .min(3, "Escribe la persona responsable.")
    .max(120),
  idType: z.enum(FOUNDATION_ID_TYPES, { error: "Elige el tipo de identificación." }),
  idNumber: documentNumber,
  email,
  password,
  location: z.string().trim().max(120).optional().default(""),
  description: z.string().trim().max(600).optional().default(""),
});

const registerSchema = z.discriminatedUnion("role", [donorSchema, foundationSchema], {
  error: "Elige si eres donante o fundación.",
});

const loginSchema = z.object({
  email,
  password: z.string({ error: "Escribe tu contraseña." }).min(1, "Escribe tu contraseña."),
});

const USER_COLUMNS = `
  u.id, u.role, u.name, u.email, u.wallet_address AS "walletAddress",
  f.id AS "foundationId", f.status AS "foundationStatus"`;

async function findUserById(id) {
  const { rows } = await query(
    `SELECT ${USER_COLUMNS} FROM users u LEFT JOIN foundations f ON f.user_id = u.id WHERE u.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

// Hash fijo para comparar cuando el correo no existe: así el tiempo de respuesta
// no revela qué correos están registrados.
const DUMMY_HASH = bcrypt.hashSync("no-existe-este-usuario", BCRYPT_ROUNDS);

/** Traduce violaciones de UNIQUE a mensajes claros. */
function uniqueViolation(err) {
  if (err.code !== "23505") return err;
  if (err.constraint?.includes("email")) return conflict("Ya existe una cuenta con ese correo.");
  if (err.constraint?.startsWith("donors_")) return conflict("Ya existe una cuenta con ese documento.");
  if (err.constraint?.startsWith("foundations_")) return conflict("Ya existe una fundación con esa identificación.");
  return conflict("Esos datos ya están registrados.");
}

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const input = registerSchema.parse(req.body);
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const displayName = input.role === "donor" ? `${input.firstNames} ${input.lastNames}` : input.name;

  const userId = await withTransaction(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO users (role, name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id`,
      [input.role, displayName, input.email, passwordHash],
    );
    const id = rows[0].id;

    if (input.role === "donor") {
      await db.query(
        `INSERT INTO donors (user_id, first_names, last_names, document_type, document_number, gender, country)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, input.firstNames, input.lastNames, input.documentType, input.documentNumber, input.gender, input.country],
      );
    } else {
      const active = serverConfig.autoActivateFoundations;
      await db.query(
        `INSERT INTO foundations (user_id, name, legal_representative, id_type, id_number, location, description, status, activated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          id, input.name, input.legalRepresentative, input.idType, input.idNumber,
          input.location, input.description, active ? "ACTIVA" : "PENDIENTE", active ? new Date() : null,
        ],
      );
    }
    return id;
  }).catch((err) => {
    throw uniqueViolation(err);
  });

  const user = await findUserById(userId);
  res.status(201).json({ token: signToken(user), user });
});

authRouter.post("/login", async (req, res) => {
  const input = loginSchema.parse(req.body);
  const { rows } = await query("SELECT id, password_hash FROM users WHERE email = $1", [input.email]);
  const record = rows[0];

  const valid = await bcrypt.compare(input.password, record?.password_hash ?? DUMMY_HASH);
  if (!record || !valid) throw unauthorized("Correo o contraseña incorrectos.");

  const user = await findUserById(record.id);
  res.json({ token: signToken(user), user });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await findUserById(req.auth.userId);
  if (!user) throw unauthorized("Tu cuenta ya no existe.");
  res.json({ user });
});
