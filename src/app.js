/**
 * App Express: middlewares comunes y montaje de módulos.
 *
 * Cada módulo vive en src/modules/<nombre>/ y se monta aquí con una línea,
 * para que varias personas puedan agregar los suyos sin pisarse.
 */
import express from "express";
import cors from "cors";
import { serverConfig } from "./config/server.js";
import { query } from "./db/pool.js";
import { errorHandler, notFound } from "./http/errors.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { causesRouter, foundationsRouter } from "./modules/foundations/foundations.routes.js";
import { donorsRouter } from "./modules/donors/donors.routes.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1); // detrás del nginx de la VPS
  app.use(cors({ origin: serverConfig.corsOrigins }));
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", async (_req, res) => {
    let database = "ok";
    try {
      await query("SELECT 1");
    } catch {
      database = "error";
    }
    res.status(database === "ok" ? 200 : 503).json({ status: database === "ok" ? "ok" : "degraded", database });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/foundations", foundationsRouter);
  app.use("/api/causes", causesRouter);
  app.use("/api/donors", donorsRouter);

  app.use("/api", (_req, _res, next) => next(notFound("Ruta no encontrada.")));
  app.use(errorHandler);

  return app;
}
