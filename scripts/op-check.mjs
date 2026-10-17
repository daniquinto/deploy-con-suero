/**
 * Verificación de humo de la conexión con Open Payments.
 *
 *   npm run op:check
 *
 * No mueve dinero: valida el .env, la llave, el keyId contra el JWKS y que las
 * wallets del proyecto resuelvan. Ejecútalo después de completar el .env y
 * cada vez que rotes la llave.
 */

const ok = (value) => (value ? "\x1b[32mOK\x1b[0m" : "\x1b[31mFALLO\x1b[0m");

// Import dinámico: el módulo valida el .env al evaluarse, y así un .env
// incompleto se reporta como un mensaje legible en vez de un stack trace.
let checkConnection;
try {
  ({ checkConnection } = await import("../src/open-payments/index.js"));
} catch (error) {
  if (error?.code === "OP_CONFIG_INVALID") {
    console.error(`\n[${ok(false)}] Configuración inválida: ${error.message}\n`);
    process.exit(1);
  }
  throw error;
}

const report = await checkConnection();

console.log("\nConfiguración activa:");
for (const [key, value] of Object.entries(report.config)) {
  console.log(`  ${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`);
}

console.log("\nChequeos:");
for (const check of report.checks) {
  console.log(`  [${ok(check.ok)}] ${check.name} (${check.ms} ms)`);
  if (check.ok) {
    console.log(`        ${JSON.stringify(check.detail)}`);
  } else {
    console.log(`        ${check.error.message}`);
    if (check.error.hint) console.log(`        -> ${check.error.hint}`);
  }
}

console.log(
  report.ok
    ? "\nConexión lista: ya puedes implementar el flujo de pago.\n"
    : "\nHay chequeos en rojo: corrígelos antes de seguir.\n",
);

process.exit(report.ok ? 0 : 1);
