# Resto 001

Sistema Integral de Gestion para Restaurantes.

## Mapa Rapido

- Backend real: `services/backend`
- Admin web: `app/admin-web`
- Mesonero web: `app/mesonero-web`
- Cocina web: `app/cocina-web`
- Caja web activa: `app/caja/web`
- Wrapper de Caja: `app/caja`
- Mesonero mobile activo: `app/mobile/resto-mobile`
- Infraestructura compartida: `infra/scripts`, `infra/docker`, `.env.docker*`

## Descripcion

Resto 001 es una plataforma orientada a la operacion integral de restaurantes. El sistema centraliza pedidos, productos, pagos, reportes y sincronizacion en tiempo real entre distintas estaciones de trabajo.

## Stack Tecnologico

Este proyecto utiliza el stack MERN:

- MongoDB
- Express.js
- React
- Node.js

Ademas, integra sincronizacion Real-Time para mantener la informacion operativa actualizada entre los distintos modulos.

## Estructura del Proyecto

- `/services/backend`: backend principal y servicios de negocio.
- `/app/admin-web`: panel administrativo React/Vite.
- `/app/mesonero-web`: estacion web para mesonero.
- `/app/cocina-web`: estacion web de cocina en tiempo real para despacho de comandas.
- `/app/caja`: wrapper del modulo Caja. La app activa vive en `/app/caja/web`.
- `/app/mobile/resto-mobile`: aplicacion movil Expo para operacion en sala.
- `/infra`: Docker Compose, scripts operativos y plantillas de entorno.

## Organizacion Actual

El repo quedo organizado por responsabilidad:

- Apps web activas: `app/admin-web`, `app/mesonero-web`, `app/cocina-web`, `app/caja/web`
- App movil activa: `app/mobile/resto-mobile`
- Servicio backend: `services/backend`
- Wrapper/compatibilidad: `app/caja`
- Infra y operacion: `infra/scripts`, `infra/docker`, `infra/env`, `.env.docker*`

La reorganizacion fisica principal ya quedo aplicada sin cambiar los comandos raiz del sistema.

## Comandos Raiz

- `npm run dev:backend`
- `npm run dev:admin`
- `npm run dev:caja`
- `npm run dev:cocina`
- `npm run dev:mesonero-web`
- `npm run dev:mesonero-mobile`
- `npm run dev:all`
- `npm run verify:active`

## Estaciones del Sistema

- Admin Web
- Mesonero Movil
- Mesonero Web
- Caja Web
- Cocina Web

## Funcionalidades Generales

- Gestion de pedidos
- Gestion de productos
- Registro de pagos
- Reportes operativos
- Sincronizacion en tiempo real
- Soporte para multiples estaciones de trabajo

## Objetivo

Proveer una solucion unificada para mejorar la velocidad de atencion, el control operativo y la trazabilidad de la informacion dentro del restaurante.

## Estado del Proyecto

En desarrollo.

## Docker

El workspace incluye configuracion Docker para desarrollo y produccion.

### Requisitos

- Docker
- Docker Compose v2

### Desarrollo

Levanta MongoDB, Backend, Admin Web, Mesonero Web, Caja Web y Cocina Web con hot reload, y ademas abre Expo Go para Mesonero Mobile:

```bash
npm run docker:up
```

Ese comando deja Docker corriendo en segundo plano y mantiene Expo en la terminal para mostrar el QR de Mesonero Mobile.
Antes de abrir Expo, tambien imprime en la terminal las URLs de acceso por navegador para cada modulo.

Si quieres subir solo los contenedores Docker sin abrir Expo Go:

```bash
npm run docker:up:docker
```

Si quieres ver los logs en primer plano en lugar de dejar el stack en segundo plano:

```bash
npm run docker:up:fg
```

Puertos expuestos:

- Backend: `http://localhost:5000`
- Admin Web: `http://localhost:5174`
- Mesonero Web: `http://localhost:5173`
- Caja Web: `http://localhost:5175`
- Cocina Web: `http://localhost:5176`

Mesonero Mobile se usa principalmente con Expo Go desde el QR que imprime `npm run docker:up`.
Como acceso secundario de prueba en navegador, el contenedor Expo Web responde en `http://localhost:19006`.

MongoDB no se publica al host en el stack de desarrollo para evitar conflictos con una instancia local ya corriendo en `27017`.
Los puertos publicados se pueden cambiar desde `.env.docker` con `BACKEND_HOST_PORT`, `ADMIN_WEB_HOST_PORT`, `MESONERO_WEB_HOST_PORT`, `MESONERO_MOBILE_HOST_PORT`, `CAJA_WEB_HOST_PORT` y `COCINA_WEB_HOST_PORT`.

Detener stack:

```bash
npm run docker:down
```

Ver estado y logs:

```bash
npm run docker:ps
npm run docker:logs
```

Smoke test:

```bash
npm run docker:smoke
```

### Produccion local

Levanta el stack usando builds estaticos en Nginx para los frontends:

```bash
npm run docker:prod:up
```

Puertos expuestos:

- Backend: `http://localhost:5000`
- Admin Web: `http://localhost:8081`
- Mesonero Web: `http://localhost:8082`
- Mesonero Movil Web: `http://localhost:8085`
- Caja Web: `http://localhost:8083`
- Cocina Web: `http://localhost:8084`

Detener stack:

```bash
npm run docker:prod:down
```

### Variables de entorno

- Desarrollo: `.env.docker`
- Produccion: `.env.docker.prod`
- Plantillas: `infra/env/.env.docker.example` y `infra/env/.env.docker.prod.example`

Los frontends en Docker usan proxy interno hacia el servicio `backend`, por lo que ya no dependen de IPs locales para hablar con la API o Socket.IO.
