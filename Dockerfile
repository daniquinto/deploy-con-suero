# ---------- Stage 1: build de la app React ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Se copia todo el proyecto para que la imagen funcione aunque el repo
# todavia no tenga la app React. Cuando el proyecto tenga dependencias
# estables, conviene copiar primero package*.json y aprovechar la cache.
COPY . .

# Soporta Vite (dist/) y Create React App (build/). El resultado siempre
# queda en /out, que es lo unico que pasa al stage de nginx.
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
        '<p>Aun no hay una app React en el repo. El contenedor y nginx funcionan.</p>' \
        '</body></html>' > /out/index.html; \
    fi

# ---------- Stage 2: servir los estaticos con nginx ----------
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /out /usr/share/nginx/html

# Puerto publicado hacia afuera del contenedor.
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
