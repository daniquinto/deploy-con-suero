/**
 * Punto de entrada del backend: aplica migraciones pendientes y levanta la API.
 *   npm run dev   (recarga al guardar)
 *   npm start     (producción / Docker)
 */
import { createApp } from "./app.js";
import { serverConfig } from "./config/server.js";
import { pool } from "./db/pool.js";
import { migrate } from "./db/migrate.js";

async function main() {
  if (serverConfig.autoMigrate) await migrate();

  const server = createApp().listen(serverConfig.port, () => {
    console.log(`[api] escuchando en http://localhost:${serverConfig.port} (${serverConfig.env})`);
  });

  const shutdown = () => {
    server.close(() => pool.end().finally(() => process.exit(0)));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("[api] no pudo arrancar:", err.message);
  process.exit(1);
});
