/**
 * Punto de entrada del backend.
 *
 *   npm start          (o `node src/server.js`)
 *
 * Orden del arranque, a propósito:
 *   1. cargar y validar el .env             -> un error de config se ve aquí
 *   2. crear el cliente de Open Payments    -> una sola instancia por proceso
 *   3. levantar el HTTP y el job de reanudación
 *
 * Si algo de 1 o 2 falla, el proceso no escucha: es mejor que el contenedor
 * no arranque que un servicio que acepta donaciones y las pierde.
 */

import { config, describeConfig } from "./open-payments/index.js";
import { createDonations } from "./donations/index.js";
import { createApp } from "./http/app.js";

const { service, store } = await createDonations();
const app = createApp({ service, store });

const server = app.listen(config.port, () => {
  console.log(`\nDonaciones con Open Payments escuchando en :${config.port}`);
  for (const [key, value] of Object.entries(describeConfig())) {
    console.log(`  ${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`);
  }
  if (!config.interact.finishUrl) {
    console.log(
      "\n  Modo consentimiento: POLLING (no hay PUBLIC_BASE_URL).\n" +
        "  El cliente debe llamar a POST /api/donations/:id/confirm tras autorizar.\n",
    );
  }
  if (!config.donations.storePath) {
    console.log(
      "  Aviso: el store es solo en memoria. Un reinicio pierde las donaciones\n" +
        "  a medio camino. Define DONATIONS_STORE_PATH para persistirlas.\n",
    );
  }
});

// ─── Job de reanudación ──────────────────────────────────────────────────────
// Rescata lo que quedó a medias: pagos autorizados cuyo POST nunca se hizo,
// envíos en curso que hay que consultar y cotizaciones caducadas.
const resumeTimer = setInterval(async () => {
  try {
    const summary = await service.resumeAll();
    if (summary.avanzadas || summary.expiradas) {
      console.log(`[resume] ${JSON.stringify(summary)}`);
    }
  } catch (error) {
    console.warn(`[resume] ${error.message}`);
  }
}, config.donations.resumeIntervalSeconds * 1000);
resumeTimer.unref();

// ─── Cierre ordenado ─────────────────────────────────────────────────────────
// En un deploy Docker manda SIGTERM: hay que dejar de aceptar conexiones,
// terminar las que están en vuelo (puede haber un pago creándose) y guardar
// el snapshot del store antes de morir.
let closing = false;
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, async () => {
    if (closing) return;
    closing = true;
    console.log(`\n${signal} recibido: cerrando.`);
    clearInterval(resumeTimer);
    server.close(async () => {
      await store.flush();
      process.exit(0);
    });
    // Sin esto, una conexión keep-alive inactiva (cualquier frontend) retrasa
    // el cierre hasta el timeout y alarga cada deploy.
    server.closeIdleConnections?.();
    // Red de seguridad: si una conexión no cierra, no quedarse colgado.
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
