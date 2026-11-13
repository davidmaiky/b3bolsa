#!/bin/sh
set -e
# O volume montado em /data costuma nascer como root: acerta o dono e segue sem privilégios.
mkdir -p /data
chown -R node:node /data
run() { exec setpriv --reuid=node --regid=node --init-groups "$@"; }

# Cria/atualiza as tabelas do SQLite. Sem --accept-data-loss: se uma mudança de schema apagasse dados, o container para em vez de apagar.
setpriv --reuid=node --regid=node --init-groups node node_modules/prisma/build/index.js db push --skip-generate

run "$@"
