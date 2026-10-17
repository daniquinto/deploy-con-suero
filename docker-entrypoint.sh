#!/bin/sh
# Arranca la app Node.js buscando el punto de entrada mas probable.
set -e

if [ -f package.json ] && npm run 2>/dev/null | grep -q '^  start'; then
  echo "==> npm start"
  exec npm start
fi

for f in server.js index.js app.js src/server.js src/index.js src/app.js dist/index.js dist/main.js; do
  if [ -f "$f" ]; then
    echo "==> node $f"
    exec node "$f"
  fi
done

echo "!! No se encontro punto de entrada (script 'start' ni server.js/index.js/app.js)."
echo "!! Levantando un servidor placeholder en el puerto ${PORT:-3000} para validar el despliegue."
exec node -e '
  const port = process.env.PORT || 3000;
  require("http")
    .createServer((_, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("backend placeholder: aun no hay aplicacion Node.js en el repo\n");
    })
    .listen(port, () => console.log("placeholder escuchando en " + port));
'
