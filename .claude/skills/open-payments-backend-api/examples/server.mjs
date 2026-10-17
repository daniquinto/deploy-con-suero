/**
 * Backend de pagos con Open Payments: el flujo partido en dos mitades porque el
 * usuario se va al navegador a consentir.
 *
 *   POST /api/payments            -> incoming payment + quote + grant pendiente
 *   GET  /api/op/callback         -> verifica hash, continua el grant, crea el pago
 *   GET  /api/payments/:id        -> estado (para polling del frontend / app)
 *   POST /api/payments/:id/cancel -> cierra el cobro y revoca credenciales
 *   GET  /healthz
 *
 * El store es en memoria para que el ejemplo corra solo. Sustituir `store` por
 * Postgres: el contrato de metodos es el mismo (ver el esquema SQL en SKILL.md).
 *
 * Variables de entorno:
 *   OP_CLIENT_WALLET_ADDRESS, OP_KEY_ID, OP_PRIVATE_KEY_PATH
 *   PUBLIC_BASE_URL   base https de ESTE backend (para el interact.finish.uri)
 *   FRONTEND_URL      a donde se redirige al usuario al terminar
 *   PORT              default 3000
 */
import express from "express";
import crypto from "node:crypto";
import {
  createAuthenticatedClient,
  isFinalizedGrant,
  isPendingGrant,
  OpenPaymentsClientError,
} from "@interledger/open-payments";

// ─── Config: fallar rapido ───────────────────────────────────────────────────
const required = ["OP_CLIENT_WALLET_ADDRESS", "OP_KEY_ID", "PUBLIC_BASE_URL"];
for (const k of required) {
  if (!process.env[k]) throw new Error(`Falta la variable de entorno ${k}`);
}
const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
const FRONTEND_URL = (process.env.FRONTEND_URL ?? PUBLIC_BASE_URL).replace(/\/$/, "");

// ─── Cliente de Open Payments: UNA instancia por proceso ─────────────────────
const client = await createAuthenticatedClient({
  walletAddressUrl: process.env.OP_CLIENT_WALLET_ADDRESS,
  privateKey: process.env.OP_PRIVATE_KEY_PATH ?? "private.key",
  keyId: process.env.OP_KEY_ID,
  requestTimeoutMs: 10_000,
});

// ─── Utilidades ──────────────────────────────────────────────────────────────

/** Normaliza lo que escribe el usuario: $pointer, http, barras finales. */
function toWalletAddressUrl(input) {
  const raw = String(input ?? "").trim();
  if (!raw) throw new HttpError(400, "Falta la wallet address");
  let url;
  if (raw.startsWith("$")) {
    const rest = raw.slice(1);
    url = rest.includes("/") ? `https://${rest}` : `https://${rest}/.well-known/pay`;
  } else {
    url = raw.startsWith("http") ? raw : `https://${raw}`;
  }
  let u;
  try { u = new URL(url); } catch { throw new HttpError(400, "Wallet address invalida"); }
  if (u.protocol !== "https:") throw new HttpError(400, "La wallet address debe ser https://");
  if (u.search || u.hash) throw new HttpError(400, "La wallet address no admite query ni fragment");
  u.pathname = u.pathname.replace(/\/+$/, "") || "/.well-known/pay";
  return u.toString().replace(/\/$/, "");
}

/**
 * El hash del callback prueba que la redireccion viene del authorization server.
 *
 * El hash_base de GNAP concatena client_nonce, as_nonce, interact_ref y el
 * endpoint del grant separados por "\n". Las implementaciones difieren en si
 * incluyen el salto de linea FINAL, asi que aceptamos las dos variantes.
 * Verifica contra tu authorization server cual usa y deja solo esa.
 */
function verifyInteractHash({ clientNonce, asNonce, interactRef, grantEndpoint, hash }) {
  if (!hash || !interactRef) return false;
  const norm = (s) =>
    Buffer.from(String(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
  const given = norm(hash);
  const base = `${clientNonce}\n${asNonce}\n${interactRef}\n${grantEndpoint}`;
  for (const candidate of [base, `${base}\n`]) {
    const expected = norm(crypto.createHash("sha-256").update(candidate).digest("base64url"));
    if (expected.length === given.length && crypto.timingSafeEqual(expected, given)) return true;
  }
  return false;
}

/** Cifrado de tokens en reposo. En produccion: KMS o un secreto gestionado. */
const ENC_KEY = crypto
  .createHash("sha256")
  .update(process.env.TOKEN_ENC_SECRET ?? "cambia-esto-en-produccion")
  .digest();
const seal = (plain) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const ct = Buffer.concat([c.update(String(plain), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
};
const open = (sealed) => {
  if (!sealed) return null;
  const buf = Buffer.from(sealed, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", ENC_KEY, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
};

const fmt = (a) =>
  a && { ...a, formatted: (Number(BigInt(a.value)) / 10 ** a.assetScale).toFixed(a.assetScale) };

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ─── Store (reemplazable por Postgres) ───────────────────────────────────────
const rows = new Map();
const byExternalRef = new Map();
const store = {
  async create(row) {
    if (byExternalRef.has(row.externalRef)) {
      return rows.get(byExternalRef.get(row.externalRef));   // idempotencia por orderId
    }
    rows.set(row.id, row);
    byExternalRef.set(row.externalRef, row.id);
    return row;
  },
  async get(id) { return rows.get(id) ?? null; },
  async update(id, patch) {
    const row = rows.get(id);
    if (!row) return null;
    Object.assign(row, patch, { updatedAt: new Date() });
    return row;
  },
  /** Marca el continue token como consumido de forma atomica; false si ya lo estaba. */
  async claimContinue(id) {
    const row = rows.get(id);
    if (!row || row.continueConsumed) return false;
    row.continueConsumed = true;
    return true;
  },
  async resumable() {
    return [...rows.values()].filter((r) =>
      ["awaiting_consent", "authorized", "sending"].includes(r.status));
  },
};

const publicView = (p) => ({
  paymentId: p.id,
  externalRef: p.externalRef,
  status: p.status,
  debitAmount: fmt(p.debitAmount),
  receiveAmount: fmt(p.receiveAmount),
  quoteExpiresAt: p.quoteExpiresAt,
  failureReason: p.failureReason ?? null,
  redirectUrl: p.status === "awaiting_consent" ? p.redirectUrl : undefined,
});

// ─── Mitad 1: preparar el pago ───────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: "32kb" }));

app.post("/api/payments", async (req, res, next) => {
  try {
    const { senderWalletAddress, receiverWalletAddress, amount, externalRef, description } = req.body ?? {};
    if (!/^\d+$/.test(String(amount ?? ""))) {
      throw new HttpError(400, "amount debe ser un entero en string, en la escala del activo");
    }
    if (!externalRef) throw new HttpError(400, "externalRef es obligatorio (idempotencia)");

    const senderUrl = toWalletAddressUrl(senderWalletAddress);
    const receiverUrl = toWalletAddressUrl(receiverWalletAddress);

    const [sender, receiver] = await Promise.all([
      client.walletAddress.get({ url: senderUrl }),
      client.walletAddress.get({ url: receiverUrl }),
    ]);

    // 1. Grant + incoming payment: lado del RECEPTOR
    const ipGrant = await client.grant.request(
      { url: receiver.authServer },
      { access_token: { access: [{ type: "incoming-payment", actions: ["create", "read", "complete"] }] } },
    );
    if (!isFinalizedGrant(ipGrant)) throw new HttpError(502, "El grant de incoming-payment no se finalizo");

    const incomingPayment = await client.incomingPayment.create(
      { url: receiver.resourceServer, accessToken: ipGrant.access_token.value },
      {
        walletAddress: receiver.id,
        incomingAmount: {
          assetCode: receiver.assetCode,
          assetScale: receiver.assetScale,
          value: String(amount),
        },
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        metadata: { description: description ?? "", externalRef: String(externalRef) },
      },
    );

    // 2. Grant + quote: lado del EMISOR
    const quoteGrant = await client.grant.request(
      { url: sender.authServer },
      { access_token: { access: [{ type: "quote", actions: ["create", "read"] }] } },
    );
    if (!isFinalizedGrant(quoteGrant)) throw new HttpError(502, "El grant de quote no se finalizo");

    const quote = await client.quote.create(
      { url: sender.resourceServer, accessToken: quoteGrant.access_token.value },
      { walletAddress: sender.id, receiver: incomingPayment.id, method: "ilp" },
    );

    // 3. Grant interactivo con finish: el AS devolvera al usuario a este backend
    const paymentId = crypto.randomUUID();
    const clientNonce = crypto.randomUUID();

    const pending = await client.grant.request(
      { url: sender.authServer },
      {
        access_token: {
          access: [{
            type: "outgoing-payment",
            actions: ["create", "read"],
            identifier: sender.id,
            limits: { debitAmount: quote.debitAmount, receiver: incomingPayment.id },
          }],
        },
        interact: {
          start: ["redirect"],
          finish: {
            method: "redirect",
            uri: `${PUBLIC_BASE_URL}/api/op/callback?state=${paymentId}`,
            nonce: clientNonce,
          },
        },
      },
    );
    if (!isPendingGrant(pending)) throw new HttpError(502, "Se esperaba un grant interactivo");

    const row = await store.create({
      id: paymentId,
      externalRef: String(externalRef),
      status: "awaiting_consent",
      senderWalletUrl: sender.id,
      receiverWalletUrl: receiver.id,
      authServer: sender.authServer,
      resourceServer: sender.resourceServer,
      incomingPaymentId: incomingPayment.id,
      quoteId: quote.id,
      debitAmount: quote.debitAmount,
      receiveAmount: quote.receiveAmount,
      quoteExpiresAt: quote.expiresAt,
      ipAccessToken: seal(ipGrant.access_token.value),
      ipTokenManage: ipGrant.access_token.manage,
      continueUri: pending.continue.uri,
      continueToken: seal(pending.continue.access_token.value),
      continueWait: pending.continue.wait ?? 5,
      clientNonce,
      asNonce: pending.interact.finish,
      continueConsumed: false,
      redirectUrl: pending.interact.redirect,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    res.status(201).json(publicView(row));
  } catch (err) { next(err); }
});

// ─── Mitad 2: el usuario vuelve del consentimiento ───────────────────────────
app.get("/api/op/callback", async (req, res, next) => {
  const back = (id, status) => res.redirect(302, `${FRONTEND_URL}/pago/${id}?status=${status}`);
  try {
    const { state, hash, interact_ref: interactRef, result } = req.query;
    const payment = await store.get(String(state ?? ""));
    if (!payment) throw new HttpError(404, "Pago no encontrado");

    // El usuario declino: no es un error del sistema
    if (result === "grant_rejected") {
      await cancelPayment(payment, "El usuario rechazo la autorizacion");
      return back(payment.id, "cancelled");
    }

    // Una recarga del navegador no debe volver a cobrar
    if (payment.continueConsumed) return back(payment.id, payment.status);

    if (!verifyInteractHash({
      clientNonce: payment.clientNonce,
      asNonce: payment.asNonce,
      interactRef,
      grantEndpoint: payment.authServer,
      hash,
    })) {
      throw new HttpError(400, "Hash de interaccion invalido");
    }

    if (!(await store.claimContinue(payment.id))) return back(payment.id, payment.status);

    const finalized = await client.grant.continue(
      { url: payment.continueUri, accessToken: open(payment.continueToken) },
      { interact_ref: String(interactRef) },
    );
    if (!isFinalizedGrant(finalized)) {
      await store.update(payment.id, { status: "expired", failureReason: "El grant no se finalizo" });
      return back(payment.id, "expired");
    }

    await store.update(payment.id, {
      status: "authorized",
      opAccessToken: seal(finalized.access_token.value),
      opTokenManage: finalized.access_token.manage,
      opTokenExpiresAt: finalized.access_token.expires_in
        ? new Date(Date.now() + finalized.access_token.expires_in * 1000)
        : null,
    });

    const updated = await createOutgoingPayment(await store.get(payment.id));
    return back(updated.id, updated.status);
  } catch (err) { next(err); }
});

/** Crea el outgoing payment. Protegido contra duplicados por estado. */
async function createOutgoingPayment(payment) {
  if (payment.outgoingPaymentId) return payment;              // ya existe: no duplicar
  if (payment.status !== "authorized") return payment;

  try {
    const op = await client.outgoingPayment.create(
      { url: payment.resourceServer, accessToken: open(payment.opAccessToken) },
      {
        walletAddress: payment.senderWalletUrl,
        quoteId: payment.quoteId,
        metadata: { externalRef: payment.externalRef },
      },
    );
    return await store.update(payment.id, { status: "sending", outgoingPaymentId: op.id });
  } catch (err) {
    const reason = err instanceof OpenPaymentsClientError
      ? `${err.status}: ${err.description}`
      : String(err.message);
    // 4xx = la quote expiro o el limite no alcanza -> terminal. 5xx = reintentable.
    const terminal = err instanceof OpenPaymentsClientError && err.status >= 400 && err.status < 500;
    return await store.update(payment.id, {
      status: terminal ? "failed" : "authorized",
      failureReason: reason,
    });
  }
}

/** Consulta el outgoing payment y avanza el estado. El envio ILP es asincrono. */
async function refreshOutgoingPayment(payment) {
  if (payment.status !== "sending" || !payment.outgoingPaymentId) return payment;
  try {
    const op = await client.outgoingPayment.get({
      url: payment.outgoingPaymentId,
      accessToken: open(payment.opAccessToken),
    });
    if (op.failed) {
      return await store.update(payment.id, {
        status: "failed",
        failureReason: `Pago fallido. Enviado: ${op.sentAmount.value}`,
      });
    }
    if (BigInt(op.sentAmount.value) >= BigInt(op.debitAmount.value)) {
      await revokeCredentials(payment);
      return await store.update(payment.id, { status: "completed" });
    }
    return payment;                                            // sigue en curso
  } catch (err) {
    // Un error de consulta NO cambia el estado del pago: solo no sabemos todavia.
    console.warn(`[refresh] ${payment.id}: ${err.message}`);
    return payment;
  }
}

async function revokeCredentials(payment) {
  const tasks = [];
  if (payment.opTokenManage && payment.opAccessToken) {
    tasks.push(client.token.revoke({
      url: payment.opTokenManage, accessToken: open(payment.opAccessToken),
    }));
  }
  if (payment.ipTokenManage && payment.ipAccessToken) {
    tasks.push(client.token.revoke({
      url: payment.ipTokenManage, accessToken: open(payment.ipAccessToken),
    }));
  }
  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === "rejected") console.warn(`[revoke] ${payment.id}: ${r.reason?.message}`);
  }
}

async function cancelPayment(payment, reason) {
  if (["completed", "sending"].includes(payment.status)) {
    throw new HttpError(409, "El pago ya esta en curso o completado");
  }
  // Cerrar el cobro para que no acepte fondos
  if (payment.incomingPaymentId && payment.ipAccessToken) {
    try {
      await client.incomingPayment.complete({
        url: payment.incomingPaymentId, accessToken: open(payment.ipAccessToken),
      });
    } catch (err) { console.warn(`[cancel/complete] ${payment.id}: ${err.message}`); }
  }
  // Cancelar el grant pendiente
  if (payment.status === "awaiting_consent" && !payment.continueConsumed) {
    try {
      await client.grant.cancel({
        url: payment.continueUri, accessToken: open(payment.continueToken),
      });
    } catch (err) { console.warn(`[cancel/grant] ${payment.id}: ${err.message}`); }
  }
  await revokeCredentials(payment);
  return store.update(payment.id, { status: "cancelled", failureReason: reason ?? null });
}

// ─── Consulta y cancelacion ──────────────────────────────────────────────────
app.get("/api/payments/:id", async (req, res, next) => {
  try {
    let payment = await store.get(req.params.id);
    if (!payment) throw new HttpError(404, "Pago no encontrado");
    if (payment.status === "sending") payment = await refreshOutgoingPayment(payment);
    res.json(publicView(payment));
  } catch (err) { next(err); }
});

app.post("/api/payments/:id/cancel", async (req, res, next) => {
  try {
    const payment = await store.get(req.params.id);
    if (!payment) throw new HttpError(404, "Pago no encontrado");
    res.json(publicView(await cancelPayment(payment, req.body?.reason)));
  } catch (err) { next(err); }
});

app.get("/healthz", (_req, res) => res.json({ ok: true, client: Boolean(client) }));

// ─── Errores: nunca filtrar credenciales ─────────────────────────────────────
app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof OpenPaymentsClientError) {
    console.error(`[op] ${err.status} ${err.description}`, err.validationErrors ?? "");
    return res.status(502).json({ error: "Error del proveedor de Open Payments", status: err.status });
  }
  console.error(err);
  res.status(500).json({ error: "Error interno" });
});

// ─── Reanudacion: el contenedor se reinicia con pagos a medio camino ─────────
// En Postgres: SELECT ... FOR UPDATE SKIP LOCKED para que dos replicas no choquen.
setInterval(async () => {
  for (const p of await store.resumable()) {
    try {
      if (p.status === "awaiting_consent" && new Date(p.quoteExpiresAt) < new Date()) {
        await store.update(p.id, { status: "expired", failureReason: "La quote expiro" });
      } else if (p.status === "authorized") {
        await createOutgoingPayment(p);     // el POST nunca se hizo
      } else if (p.status === "sending") {
        await refreshOutgoingPayment(p);
      }
    } catch (err) { console.warn(`[resume] ${p.id}: ${err.message}`); }
  }
}, 30_000).unref();

app.listen(PORT, () => console.log(`Open Payments backend escuchando en :${PORT}`));
