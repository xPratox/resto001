# Workspace Map

## Active Modules

- `services/backend`: API, auth, Socket.IO, menu, reports, tables, rates.
- `app/admin-web`: React/Vite admin dashboard.
- `app/mesonero-web`: React/Vite waiter workstation.
- `app/cocina-web`: React/Vite kitchen workstation.
- `app/caja/web`: React/Vite Caja workstation.
- `app/mobile/resto-mobile`: Expo mobile client for Expo Go.

## Wrappers And Infrastructure

- `app/caja`: command wrapper for the active Caja frontend.
- `infra/scripts`: operational shell scripts such as `docker-up.sh` and `docker-smoke-test.sh`.
- `infra/docker/docker-compose.yml`: development stack.
- `infra/docker/docker-compose.prod.yml`: production-like static build stack.
- `infra/env`: environment templates for Docker workflows.
- `.env.docker`, `.env.docker.prod`: live Docker environment files kept at the repo root.

## Root Commands

- `npm run dev:all`: start all active development modules.
- `npm run verify:active`: build/lint the active modules that are part of the current system.
- `npm run docker:up`: start Docker services and Expo Go flow.
- `npm run docker:smoke`: verify the HTTP modules exposed by the Docker development stack.

## Naming Notes

- `app/caja` preserves the historical Caja wrapper shape, but the active app now lives at `app/caja/web`.
- `app/mobile/resto-mobile` remains nested because Expo expects the mobile project root below the mobile container folder.
- The repository-wide physical reorg into `app/` and `services/` is already applied.