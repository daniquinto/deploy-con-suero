/**
 * Entorno mínimo para los tests.
 *
 * `src/open-payments/config.js` valida el .env al importarse: sin esto los
 * tests dependerían del .env real y de una llave privada en el disco. Aquí se
 * genera una llave Ed25519 al vuelo (nunca un fixture con una llave de
 * verdad en el repo) y se fijan wallets de ejemplo.
 *
 * Importar ESTE módulo antes que cualquier otro del proyecto: las variables de
 * entorno ya puestas ganan sobre las del .env (dotenv no sobreescribe).
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { privateKey } = crypto.generateKeyPairSync("ed25519");
const keyPath = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "dcs-test-")),
  "private.key",
);
fs.writeFileSync(keyPath, privateKey.export({ type: "pkcs8", format: "pem" }), {
  mode: 0o600,
});

Object.assign(process.env, {
  NODE_ENV: "test",
  OP_PRIVATE_KEY_PATH: keyPath,
  OP_CLIENT_WALLET_ADDRESS: "https://ilp.example.test/cliente",
  OP_KEY_ID: "test-key-id",
  OP_FUND_WALLET_ADDRESS: "https://ilp.example.test/fondo",
  OP_TEST_DONOR_WALLET_ADDRESS: "",
  OP_TEST_MERCHANT_WALLET_ADDRESS: "",
  PUBLIC_BASE_URL: "https://api.example.test",
  FRONTEND_URL: "",
  TOKEN_ENC_SECRET: "secreto-de-pruebas-con-mas-de-32-caracteres",
  DONATIONS_STORE_PATH: "",
  OP_LOG_LEVEL: "silent",
});

/** Wallet address resuelta de mentira, con la forma que devuelve el SDK. */
export function fakeWallet(overrides = {}) {
  return {
    id: "https://ilp.example.test/alguien",
    assetCode: "USD",
    assetScale: 2,
    authServer: "https://auth.example.test",
    resourceServer: "https://ilp.example.test",
    publicName: "Alguien",
    ...overrides,
  };
}

export const FUND = fakeWallet({
  id: "https://ilp.example.test/fondo",
  publicName: "Fondo de emergencia",
});

export const DONOR = fakeWallet({
  id: "https://ilp.example.test/donante",
  publicName: "Donante",
});

/**
 * Cliente falso con la misma superficie que usa el flujo. Registra cada
 * llamada en `calls` para poder afirmar sobre el orden, las URLs y los tokens.
 */
export function fakeClient(overrides = {}) {
  const calls = [];
  /** Último incomingAmount creado: lo necesita la quote para cotizar. */
  let lastIncomingAmount = null;
  const record = (name, ...args) => calls.push({ name, args });

  const base = {
    calls,
    grant: {
      async request(server, body) {
        record("grant.request", server, body);
        const type = body.access_token.access[0].type;
        if (type === "outgoing-payment" && body.interact) {
          return {
            interact: {
              redirect: "https://auth.example.test/interact/abc/123",
              // El AS solo devuelve su nonce si pedimos `finish`.
              ...(body.interact.finish ? { finish: "nonce-del-as" } : {}),
            },
            continue: {
              uri: "https://auth.example.test/continue/abc",
              access_token: { value: "continue-token" },
              wait: 4,
            },
          };
        }
        return {
          access_token: {
            value: `token-${type}`,
            manage: `https://auth.example.test/token/${type}`,
            expires_in: 600,
            access: body.access_token.access,
          },
        };
      },
      async continue(args, body) {
        record("grant.continue", args, body);
        return {
          access_token: {
            value: "token-outgoing-payment",
            manage: "https://auth.example.test/token/outgoing",
            expires_in: 600,
            access: [],
          },
        };
      },
      async cancel(args) {
        record("grant.cancel", args);
      },
    },
    incomingPayment: {
      async create(args, body) {
        record("incomingPayment.create", args, body);
        lastIncomingAmount = body.incomingAmount ?? null;
        return {
          id: "https://ilp.example.test/incoming-payments/ip-1",
          walletAddress: body.walletAddress,
          incomingAmount: body.incomingAmount,
          receivedAmount: { value: "0", assetCode: "USD", assetScale: 2 },
          completed: false,
          metadata: body.metadata,
        };
      },
      async get(args) {
        record("incomingPayment.get", args);
        return {
          id: args.url,
          receivedAmount: { value: "1000", assetCode: "USD", assetScale: 2 },
          completed: true,
        };
      },
      async complete(args) {
        record("incomingPayment.complete", args);
        return { id: args.url, completed: true };
      },
    },
    quote: {
      async create(args, body) {
        record("quote.create", args, body);
        // Comisión ficticia de 30 (0,30 con assetScale 2) para que los dos
        // montos nunca sean iguales, como en un proveedor real.
        const FEE = 30n;
        const amounts = body.debitAmount
          ? // fixed-send: sale lo pedido, llega eso menos la comisión
            {
              debitAmount: body.debitAmount,
              receiveAmount: {
                ...body.debitAmount,
                value: String(BigInt(body.debitAmount.value) - FEE),
              },
            }
          : // fixed-receive: llega el incomingAmount, sale eso más la comisión
            {
              debitAmount: {
                ...(lastIncomingAmount ?? { assetCode: "USD", assetScale: 2 }),
                value: String(BigInt(lastIncomingAmount?.value ?? "1000") + FEE),
              },
              receiveAmount: lastIncomingAmount ?? {
                value: "1000",
                assetCode: "USD",
                assetScale: 2,
              },
            };

        return {
          id: "https://ilp.example.test/quotes/q-1",
          walletAddress: body.walletAddress,
          receiver: body.receiver,
          ...amounts,
          expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        };
      },
    },
    outgoingPayment: {
      async create(args, body) {
        record("outgoingPayment.create", args, body);
        return {
          id: "https://ilp.example.test/outgoing-payments/op-1",
          walletAddress: body.walletAddress,
          quoteId: body.quoteId,
          debitAmount: { value: "1000", assetCode: "USD", assetScale: 2 },
          receiveAmount: { value: "1000", assetCode: "USD", assetScale: 2 },
          sentAmount: { value: "0", assetCode: "USD", assetScale: 2 },
          failed: false,
        };
      },
      async get(args) {
        record("outgoingPayment.get", args);
        return {
          id: args.url,
          debitAmount: { value: "1000", assetCode: "USD", assetScale: 2 },
          sentAmount: { value: "1000", assetCode: "USD", assetScale: 2 },
          failed: false,
        };
      },
    },
    token: {
      async revoke(args) {
        record("token.revoke", args);
      },
      async rotate(args) {
        record("token.rotate", args);
        return { access_token: { value: "rotado", manage: args.url, expires_in: 600 } };
      },
    },
  };

  // Mezcla superficial por namespace, para sobreescribir un solo método.
  for (const [namespace, methods] of Object.entries(overrides)) {
    base[namespace] = { ...base[namespace], ...methods };
  }
  return base;
}

/** Resolución de wallets sin red: donante y fondo. */
export function fakeResolver({ donor = DONOR, fund = FUND } = {}) {
  return async (input) => {
    const url = String(input);
    if (url.includes("fondo")) return fund;
    if (url.includes("donante")) return donor;
    throw Object.assign(new Error(`wallet desconocida: ${url}`), { code: "ENOTFOUND" });
  };
}
