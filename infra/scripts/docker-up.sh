#!/usr/bin/env bash

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.docker"
COMPOSE_FILE="${ROOT_DIR}/infra/docker/docker-compose.yml"
COMPOSE_PROJECT_NAME="resto001"

cd "${ROOT_DIR}"

if [[ -f "${ENV_FILE}" ]]; then
	set -a
	# shellcheck disable=SC1091
	. "${ENV_FILE}"
	set +a
fi

BACKEND_HOST_PORT=${BACKEND_HOST_PORT:-5000}
ADMIN_WEB_HOST_PORT=${ADMIN_WEB_HOST_PORT:-5174}
MESONERO_WEB_HOST_PORT=${MESONERO_WEB_HOST_PORT:-5173}
MESONERO_MOBILE_HOST_PORT=${MESONERO_MOBILE_HOST_PORT:-19006}
CAJA_WEB_HOST_PORT=${CAJA_WEB_HOST_PORT:-5175}
COCINA_WEB_HOST_PORT=${COCINA_WEB_HOST_PORT:-5176}

docker compose -p "${COMPOSE_PROJECT_NAME}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up --build -d

echo
echo "Stack Docker iniciado."
echo
echo "Accesos por navegador:"
echo "- Backend: http://localhost:${BACKEND_HOST_PORT}"
echo "- Admin: http://localhost:${ADMIN_WEB_HOST_PORT}"
echo "- Mesonero Web: http://localhost:${MESONERO_WEB_HOST_PORT}"
echo "- Caja: http://localhost:${CAJA_WEB_HOST_PORT}"
echo "- Cocina: http://localhost:${COCINA_WEB_HOST_PORT}"
echo "- Mesonero Mobile Web (secundario): http://localhost:${MESONERO_MOBILE_HOST_PORT}"
echo "Abriendo Expo para mesonero-mobile en modo LAN..."
echo "Escanea el QR con Expo Go."
echo "Para detener Docker luego usa: npm run docker:down"
echo

npm --prefix app/mobile/resto-mobile run start -- --lan