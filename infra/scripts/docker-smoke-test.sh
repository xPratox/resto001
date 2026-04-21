#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.docker"

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
fi

backend_port="${BACKEND_HOST_PORT:-5000}"
admin_port="${ADMIN_WEB_HOST_PORT:-5174}"
mesonero_port="${MESONERO_WEB_HOST_PORT:-5173}"
caja_port="${CAJA_WEB_HOST_PORT:-5175}"
cocina_port="${COCINA_WEB_HOST_PORT:-5176}"

echo "[smoke] Verificando endpoints del stack Resto 001..."

check() {
  local name="$1"
  local url="$2"
  local attempt=1
  local max_attempts=20

  echo "[smoke] ${name}: ${url}"

  until curl -fsS "$url" >/dev/null; do
    if (( attempt >= max_attempts )); then
      echo "[smoke] ${name} no respondio despues de ${max_attempts} intentos" >&2
      return 1
    fi

    attempt=$((attempt + 1))
    sleep 1
  done
}

check "Backend health" "http://127.0.0.1:${backend_port}/api/health"
check "Admin Web" "http://127.0.0.1:${admin_port}"
check "Mesonero Web" "http://127.0.0.1:${mesonero_port}"
check "Caja Web" "http://127.0.0.1:${caja_port}"
check "Cocina Web" "http://127.0.0.1:${cocina_port}"

echo "[smoke] Todo responde correctamente."