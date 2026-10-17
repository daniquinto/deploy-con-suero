/**
 * API HTTP del sistema de donaciones.
 *
 *   GET  /healthz                      ¿está vivo el proceso?
 *   GET  /health/op                    diagnóstico de la conexión con Open Payments
 *   GET  /api/fund                     a dónde va el dinero, moneda y límites
 *   POST /api/wallet/connect           "conectar" la wallet del donante (validarla)
 *   POST /api/donations                iniciar la donación -> redirectUrl + montos
 *   GET  /api/donations/:id            estado (polling del frontend / la app)
 *   POST /api/donations/:id/confirm    modo polling: "ya autoricé"
 *   POST /api/donations/:id/cancel     cancelar antes de que salga el dinero
 *   GET  /api/donations                últimas donaciones (diagnóstico)
 *   GET  /op/callback/:id              el authorization server devuelve al donante
 *
 * Quién llama a qué: el frontend y la app usan /api/*; el authorization server
 * (en el navegador del donante) solo llega al callback.
 *
 * La app se construye aquí y se escucha en `server.js`, para poder montarla en
 * un test sin abrir un puerto.
 */

import express from "express";

import { config, describeConfig, checkConnection } from "../open-payments/index.js";
import {
  DonationError,
  toPublicDonation,
  verifyInteractHash,
} from "../donations/index.js";

const DONATIONS_PATH = "/api/donations";

/**
 * @param {object} deps
 * @param {ReturnType<import("../donations/flow.js").createDonationService>} deps.service
 * @param {ReturnType<import("../donations/store.js").createDonationStore>} deps.store
 */
export function createApp({ service, store }) {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", true); // detrás de nginx/Traefik en la VPS
  app.use(express.json({ limit: "32kb" }));
  app.use(cors(config.http.corsOrigins));
  app.use(accessLog());

  const view = (row) => toPublicDonation(row, { basePath: DONATIONS_PATH });

  // ─── Salud ─────────────────────────────────────────────────────────────────

  // Liveness: no toca la red. Es lo que mira el healthcheck del contenedor.
  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, service: "donaciones", uptimeSeconds: Math.round(process.uptime()) });
  });

  // Diagnóstico completo: valida llave, keyId contra el JWKS y las wallets.
  // Cuesta varias peticiones de red, así que no sirve como healthcheck.
  app.get("/health/op", async (_req, res, next) => {
    try {
      const report = await checkConnection();
      res.status(report.ok ? 200 : 503).json({
        ...report,
        donaciones: await store.countByStatus(),
      });
    } catch (error) {
      next(error);
    }
  });

  // ─── Datos para el formulario ──────────────────────────────────────────────

  app.get("/api/fund", async (_req, res, next) => {
    try {
      const fund = await service.getFundInfo();
      res.json({
        ...fund,
        suggestedAmounts: config.donations.suggestedAmounts,
        expiryMinutes: config.donations.expiryMinutes,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Paso "conectarse": el donante escribe su wallet address y comprobamos que
   * existe antes de dejarle elegir monto. Devuelve su moneda y avisa si habrá
   * conversión. No firma nada: es una lectura pública.
   */
  app.post("/api/wallet/connect", async (req, res, next) => {
    try {
      const input = req.body?.walletAddress ?? req.body?.paymentPointer;
      if (!input) {
        throw new DonationError(400, "Falta `walletAddress` en el cuerpo de la petición.", {
          code: "DONATION_WALLET_REQUIRED",
        });
      }
      const result = await service.connectDonorWallet(String(input));
      res.status(result.ok ? 200 : 422).json(result);
    } catch (error) {
      next(error);
    }
  });

  // ─── Mitad 1: iniciar la donación ──────────────────────────────────────────

  app.post(DONATIONS_PATH, async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const { row, created } = await service.start({
        donorWalletAddress: body.donorWalletAddress ?? body.walletAddress,
        amount: body.amount,
        amountValue: body.amountValue,
        amountMode: body.amountMode ?? "send",
        // Cabecera estándar de idempotencia, o el campo del body.
        externalRef: req.get("Idempotency-Key") ?? body.externalRef,
        description: body.description,
        donorName: body.donorName,
      });
      // 200 en lugar de 201 si ya existía: el cliente reintentó y recibe la
      // misma donación, no una nueva.
      res.status(created ? 201 : 200).json(view(row));
    } catch (error) {
      next(error);
    }
  });

  // ─── Mitad 2: consentimiento ───────────────────────────────────────────────

  /**
   * Callback del authorization server. Llega en el navegador del donante, así
   * que no devuelve JSON: redirige al frontend (o muestra una página mínima si
   * no hay FRONTEND_URL configurada, que es el caso en local).
   */
  const callbackHandler = async (req, res, next) => {
    const donationId = req.params.id ?? req.query.state;
    try {
      const row = await service.getStatus(donationId, { refresh: false });
      const { row: updated, outcome } = await service.finishFromCallback({
        row,
        hash: req.query.hash,
        interactRef: req.query.interact_ref,
        result: req.query.result,
        verifyHash: verifyInteractHash,
      });
      console.log(`[callback ${updated.id}] ${outcome} -> ${updated.status}`);
      return finishPage(res, updated);
    } catch (error) {
      // Un callback roto no puede devolverle un stack trace al donante.
      if (error instanceof DonationError && error.status < 500) {
        console.warn(`[callback ${donationId}] ${error.code}: ${error.message}`);
        return errorPage(res, error);
      }
      return next(error);
    }
  };

  // El id va en la ruta; se admite también `?state=` por si un AS reescribe la
  // finish uri.
  app.get(`${config.interact.finishPath}/:id`, callbackHandler);
  app.get(config.interact.finishPath, callbackHandler);

  /** Modo polling: el cliente avisa de que el donante ya autorizó. */
  app.post(`${DONATIONS_PATH}/:id/confirm`, async (req, res, next) => {
    try {
      const { row, outcome, retryAfter } = await service.confirmPending(req.params.id);
      if (outcome === "pending") {
        // 202: la petición es válida, el consentimiento todavía no está.
        res.set("Retry-After", String(retryAfter));
        return res.status(202).json({
          ...view(row),
          pending: true,
          retryAfterSeconds: retryAfter,
          message:
            "El authorization server todavía no registra el consentimiento. " +
            "Vuelve a intentarlo después de los segundos indicados.",
        });
      }
      res.json(view(row));
    } catch (error) {
      next(error);
    }
  });

  // ─── Consulta y cancelación ────────────────────────────────────────────────

  app.get(`${DONATIONS_PATH}/:id`, async (req, res, next) => {
    try {
      res.json(view(await service.getStatus(req.params.id)));
    } catch (error) {
      next(error);
    }
  });

  app.post(`${DONATIONS_PATH}/:id/cancel`, async (req, res, next) => {
    try {
      const row = await service.cancel(req.params.id, req.body?.reason);
      res.json(view(row));
    } catch (error) {
      next(error);
    }
  });

  // Listado de diagnóstico. No es un endpoint de producto: en una API pública
  // iría detrás de autenticación de administrador.
  app.get(DONATIONS_PATH, async (req, res, next) => {
    try {
      const rows = await store.list({
        limit: Math.min(Number(req.query.limit ?? 50), 200),
        status: req.query.status,
      });
      res.json({
        total: rows.length,
        porEstado: await store.countByStatus(),
        donaciones: rows.map(view),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/", (_req, res) => {
    res.json({
      service: "deploy-con-suero · donaciones con Open Payments",
      config: describeConfig(),
      endpoints: {
        fondo: "GET /api/fund",
        conectarWallet: "POST /api/wallet/connect",
        donar: `POST ${DONATIONS_PATH}`,
        estado: `GET ${DONATIONS_PATH}/:id`,
        confirmar: `POST ${DONATIONS_PATH}/:id/confirm`,
        cancelar: `POST ${DONATIONS_PATH}/:id/cancel`,
        callback: `GET ${config.interact.finishPath}/:id`,
        salud: "GET /healthz · GET /health/op",
      },
    });
  });

  app.use((req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: `No existe ${req.path}` } });
  });

  app.use(errorHandler());

  return app;
}

// ─── Páginas para el navegador del donante ───────────────────────────────────

const STATUS_TEXT = {
  sending: "¡Gracias! Tu donación va en camino.",
  completed: "¡Gracias! Tu donación llegó al fondo.",
  authorized: "Autorización recibida, estamos enviando el pago.",
  cancelled: "La donación se canceló.",
  expired: "La autorización caducó. Puedes volver a intentarlo.",
  failed: "El pago no se pudo completar.",
  awaiting_consent: "Falta autorizar el pago en tu proveedor.",
};

function page(res, status, title, detail) {
  res.status(status).type("html").send(
    `<!doctype html><html lang="es"><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${title}</title>` +
      `<body style="font-family:system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1rem;line-height:1.5">` +
      `<h1 style="font-size:1.4rem">${title}</h1><p>${detail}</p></body></html>`,
  );
}

/** Tras el callback: al frontend si está configurado, o a una página mínima. */
function finishPage(res, row) {
  if (config.interact.frontendUrl) {
    // La URL de retorno es fija y sale de la configuración: tomarla de un
    // parámetro del request sería un open redirect.
    return res.redirect(
      302,
      `${config.interact.frontendUrl}/donacion/${row.id}?status=${row.status}`,
    );
  }
  return page(
    res,
    200,
    STATUS_TEXT[row.status] ?? "Donación registrada",
    `Estado: <code>${row.status}</code>. Referencia: <code>${row.id}</code>.` +
      `<br><br>Puedes seguirla en <code>GET ${DONATIONS_PATH}/${row.id}</code>.`,
  );
}

function errorPage(res, error) {
  if (config.interact.frontendUrl) {
    return res.redirect(302, `${config.interact.frontendUrl}/donacion/error?code=${error.code}`);
  }
  return page(res, error.status, "No se pudo completar la donación", error.message);
}

// ─── Middleware ──────────────────────────────────────────────────────────────

/**
 * CORS a mano para no añadir una dependencia: la API la consumen el frontend y
 * la app móvil desde otro origen. Con la lista vacía no se emite ninguna
 * cabecera y solo funcionan las llamadas servidor a servidor.
 */
function cors(origins) {
  const allowAll = origins.includes("*");
  return (req, res, next) => {
    const origin = req.get("Origin");
    if (origin && (allowAll || origins.includes(origin.replace(/\/$/, "")))) {
      res.set("Access-Control-Allow-Origin", allowAll ? "*" : origin);
      res.set("Vary", "Origin");
      res.set("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key");
      res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.set("Access-Control-Max-Age", "600");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  };
}

/** Log de una línea por petición. Nunca el cuerpo: trae wallet addresses. */
function accessLog() {
  return (req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - startedAt}ms`);
    });
    next();
  };
}

/**
 * Único punto donde se serializa un error. Nunca sale un stack trace ni nada
 * que pueda contener un token.
 */
function errorHandler() {
  return (error, _req, res, _next) => {
    if (error instanceof DonationError) {
      if (error.status >= 500) console.error(`[${error.code}] ${error.message}`, error.cause ?? "");
      return res.status(error.status).json({
        error: { code: error.code, message: error.message, hint: error.hint ?? null },
      });
    }
    if (error?.code === "OP_CONFIG_INVALID") {
      console.error(`[config] ${error.message}`);
      return res.status(500).json({
        error: { code: error.code, message: "Configuración del servidor inválida." },
      });
    }
    if (error instanceof SyntaxError && "body" in error) {
      return res.status(400).json({
        error: { code: "BAD_JSON", message: "El cuerpo de la petición no es JSON válido." },
      });
    }
    console.error(error);
    res.status(500).json({ error: { code: "INTERNAL", message: "Error interno." } });
  };
}
