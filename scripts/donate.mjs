/**
 * Prueba end-to-end del flujo de donación contra el backend ya levantado.
 *
 *   npm start                                   # en una terminal
 *   npm run donate                              # en otra
 *   npm run donate -- --amount 2.50
 *   npm run donate -- --donor '$ilp.interledger-test.dev/donante' --mode receive
 *   npm run donate -- --api https://api.tu-dominio.com
 *
 * Qué hace: pide los datos del fondo, valida la wallet del donante, inicia la
 * donación, imprime la URL de consentimiento y espera. Según cómo esté
 * configurado el backend:
 *
 *   - con PUBLIC_BASE_URL  -> el authorization server devuelve al donante al
 *     callback del backend; este script solo consulta el estado.
 *   - sin PUBLIC_BASE_URL  -> modo polling: el script llama a /confirm hasta
 *     que el consentimiento aparece.
 *
 * No toca llaves ni secretos: habla con la API por HTTP, igual que el frontend.
 */

import dotenv from "dotenv";
import readline from "node:readline/promises";

dotenv.config({ quiet: true });

// ─── Argumentos ──────────────────────────────────────────────────────────────
const args = {};
for (let i = 2; i < process.argv.length; i += 1) {
  const current = process.argv[i];
  if (current.startsWith("--")) args[current.slice(2)] = process.argv[++i] ?? "true";
}

const API = (args.api ?? process.env.DONATE_API ?? `http://localhost:${process.env.PORT ?? 3000}`)
  .replace(/\/$/, "");
const DONOR = args.donor ?? process.env.OP_TEST_DONOR_WALLET_ADDRESS;
const AMOUNT = args.amount ?? "1";
const MODE = args.mode ?? "send";
const TIMEOUT_MS = Number(args.timeout ?? 300) * 1000;

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

const step = (n, text) => console.log(`\n${c.bold(`${n})`)} ${text}`);
const fail = (message, detail) => {
  console.error(`\n${c.red("FALLO")} ${message}`);
  if (detail) console.error(c.dim(typeof detail === "string" ? detail : JSON.stringify(detail, null, 2)));
  process.exit(1);
};

/** Llamada HTTP con el error del backend ya legible. */
async function call(method, path, body, headers = {}) {
  let response;
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json", ...headers } : headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    fail(
      `no se pudo contactar al backend en ${API} (${error.cause?.code ?? error.message}).`,
      "¿Está levantado? `npm start` o `docker compose up -d`.",
    );
  }

  const text = await response.text();
  const payload = text && text.trimStart().startsWith("{") ? JSON.parse(text) : text;

  if (!response.ok && response.status !== 202) {
    fail(`${method} ${path} -> ${response.status}`, payload);
  }
  return { status: response.status, body: payload };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── 1. Salud y datos del fondo ──────────────────────────────────────────────

step(1, "Comprobando el backend y el fondo de destino");
const { body: health } = await call("GET", "/healthz");
console.log(`   backend ok (${health.uptimeSeconds}s en pie)`);

const { body: fund } = await call("GET", "/api/fund");
console.log(`   fondo: ${c.cyan(fund.walletAddress)}`);
console.log(`   nombre: ${fund.publicName ?? "(sin publicName)"}`);
console.log(`   moneda: ${fund.assetCode} (escala ${fund.assetScale})`);
console.log(`   consentimiento: ${c.yellow(fund.consentMode)}`);
if (fund.limits.minAmount || fund.limits.maxAmount) {
  console.log(`   límites: ${fund.limits.minAmount ?? "—"} a ${fund.limits.maxAmount ?? "—"}`);
}

if (!DONOR) {
  fail(
    "falta la wallet address del donante.",
    "Pásala con --donor '$ilp.interledger-test.dev/tu-wallet' o define " +
      "OP_TEST_DONOR_WALLET_ADDRESS en el .env.",
  );
}

// ─── 2. Conectar la wallet del donante ───────────────────────────────────────

step(2, "Conectando la wallet del donante");
const { body: wallet } = await call("POST", "/api/wallet/connect", { walletAddress: DONOR });
if (!wallet.ok) fail("la wallet del donante no se pudo usar.", wallet);
console.log(`   donante: ${c.cyan(wallet.donor.walletAddress)}`);
console.log(`   moneda: ${wallet.donor.assetCode} (escala ${wallet.donor.assetScale})`);
if (wallet.conversionNotice) console.log(`   ${c.yellow(wallet.conversionNotice)}`);

// ─── 3. Iniciar la donación ──────────────────────────────────────────────────

step(3, `Iniciando una donación de ${AMOUNT} (modo ${MODE})`);
const { body: donation } = await call("POST", "/api/donations", {
  donorWalletAddress: DONOR,
  amount: AMOUNT,
  amountMode: MODE,
  description: args.description ?? "Donación de prueba",
  donorName: args.name,
});

console.log(`   donationId: ${c.bold(donation.donationId)}`);
console.log(`   estado: ${donation.status}`);
console.log(`   el donante paga: ${c.bold(donation.amounts.debit.formatted)}`);
console.log(`   el fondo recibe: ${c.bold(donation.amounts.receive.formatted)}`);
console.log(`   incoming payment: ${c.dim(donation.resources.incomingPaymentId)}`);
console.log(`   quote: ${c.dim(donation.resources.quoteId)} ` +
  `${c.dim(`(expira ${donation.resources.quoteExpiresAt})`)}`);

// ─── 4. Consentimiento ───────────────────────────────────────────────────────

step(4, "Autorización del donante");
console.log(`\n   Abre esta URL y acepta el pago:\n\n   ${c.cyan(donation.interact.redirectUrl)}\n`);

const pollMode = donation.interact.mode === "poll";
if (pollMode) {
  console.log(
    c.dim(
      "   (modo polling: el backend no tiene PUBLIC_BASE_URL, así que este\n" +
        "    script preguntará por el consentimiento en lugar del callback)",
    ),
  );
  // Un Enter evita gastar intentos contra el AS mientras nadie ha aceptado.
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question("   Pulsa Enter cuando hayas aceptado… ");
  rl.close();
}

// ─── 5. Esperar el resultado ─────────────────────────────────────────────────

step(5, "Esperando el resultado del pago");
const deadline = Date.now() + TIMEOUT_MS;
let delay = 2000;
let last = donation;

while (Date.now() < deadline) {
  if (pollMode && last.status === "awaiting_consent") {
    const { status, body } = await call("POST", `/api/donations/${donation.donationId}/confirm`);
    last = body;
    if (status === 202) {
      console.log(`   ${c.dim(`consentimiento pendiente, reintento en ${body.retryAfterSeconds}s`)}`);
      await sleep((body.retryAfterSeconds ?? 5) * 1000);
      continue;
    }
  } else {
    const { body } = await call("GET", `/api/donations/${donation.donationId}`);
    last = body;
  }

  console.log(
    `   estado: ${c.bold(last.status)}` +
      (last.amounts?.sent ? c.dim(`  enviado: ${last.amounts.sent.formatted}`) : ""),
  );

  if (["completed", "failed", "expired", "cancelled"].includes(last.status)) break;

  await sleep(delay);
  delay = Math.min(delay * 1.5, 5000);
}

// ─── Resultado ───────────────────────────────────────────────────────────────

console.log("");
if (last.status === "completed") {
  console.log(c.green("DONACIÓN COMPLETADA"));
  console.log(`  debitado al donante: ${last.amounts.debit.formatted}`);
  console.log(`  recibido por el fondo: ${last.amounts.received?.formatted ?? "—"}`);
  console.log(`  outgoing payment: ${c.dim(last.resources.outgoingPaymentId)}`);
  console.log(
    `\n  Verifícalo en el test wallet: la cuenta del donante debe mostrar el\n` +
      `  pago saliente y la del fondo el entrante.\n`,
  );
  process.exit(0);
}

if (last.status === "sending") {
  console.log(c.yellow("SIGUE EN CURSO"));
  console.log("  El envío por ILP es asíncrono y el tiempo de espera se agotó.");
  console.log(`  Esto NO es un fallo: consulta ${API}/api/donations/${donation.donationId}.`);
  console.log(c.red("  No reintentes la donación: duplicarías el cobro.\n"));
  process.exit(0);
}

console.log(c.red(`TERMINÓ EN "${last.status}"`));
if (last.failureReason) console.log(`  motivo: ${last.failureReason}`);
console.log(`  ${last.nextStep ?? ""}\n`);
process.exit(1);
