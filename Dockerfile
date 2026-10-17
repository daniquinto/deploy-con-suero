# ---------- Stage 1: build de la app React ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Se copia todo el proyecto para que la imagen funcione aunque el repo
# todavia no tenga la app React. Cuando el proyecto tenga dependencias
# estables, conviene copiar primero package*.json y aprovechar la cache.
COPY . .

# Soporta Vite (dist/) y Create React App (build/). El resultado siempre
# queda en /out, que es lo unico que pasa al stage final.
RUN set -e; \
    if [ -f package.json ]; then \
      if [ -f package-lock.json ]; then npm ci || npm install; else npm install; fi; \
      if npm run 2>/dev/null | grep -q '^  build'; then \
        npm run build; \
      else \
        echo "package.json sin script 'build': se omite el build."; \
      fi; \
    else \
      echo "Sin package.json todavia: no hay app React que construir."; \
    fi; \
    if [ -d dist ]; then \
      cp -r dist /out; \
    elif [ -d build ]; then \
      cp -r build /out; \
    else \
      mkdir -p /out; \
      printf '%s\n' \
        '<!doctype html><html lang="es"><head><meta charset="utf-8">' \
        '<title>frontend placeholder</title></head><body>' \
        '<h1>frontend placeholder</h1>' \
        '<p>Aun no hay una app React en el repo. El contenedor funciona.</p>' \
        '</body></html>' > /out/index.html; \
    fi

# ---------- Stage 2: servir los estaticos con Node ----------
# Sin nginx en la imagen: el proxy reverso lo hace el nginx de la VPS.
FROM node:20-alpine

ENV NODE_ENV=production \
    PORT=8080 \
    STATIC_ROOT=/app/public

WORKDIR /app

COPY --chown=node:node serve-static.js ./serve-static.js
COPY --from=builder --chown=node:node /out ./public

USER node

# Puerto fijo al que apunta el proxy reverso del host.
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1 || exit 1

CMD ["node", "serve-static.js"]
