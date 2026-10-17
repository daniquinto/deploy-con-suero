# Imagen generica para cualquier aplicacion Node.js del backend.
FROM node:20-alpine

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

# Se copia todo el proyecto: asi la imagen funciona aunque el repo
# todavia no tenga package.json. Cuando el proyecto ya tenga
# dependencias estables, conviene copiar primero package*.json
# para aprovechar la cache de capas de Docker.
COPY . .

RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev; \
    elif [ -f package.json ]; then \
      npm install --omit=dev; \
    else \
      echo "Sin package.json todavia: no hay dependencias que instalar."; \
    fi \
 && npm cache clean --force \
 && chown -R node:node /app

COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER node

# Puerto publicado hacia afuera del contenedor.
EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
