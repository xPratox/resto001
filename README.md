# Resto 001

Proyecto con tres partes:

- `backend`: API Node.js + MongoDB local.
- `mobile/resto-mobile`: app Expo para mesonero.
- `mesonero-web`: version web del mesonero con Vite.

## Requisitos

- Node.js
- MongoDB local
- Expo Go para probar mobile

## Backend

```bash
cd backend
npm install
npm start
```

Servidor esperado en `http://192.168.0.100:5000`.

## Mobile

```bash
cd mobile/resto-mobile
npm install
cp .env.example .env
npx expo start --clear
```

## Web

```bash
cd mesonero-web
npm install
cp .env.example .env
npm run dev
```

## Base de datos

- MongoDB local
- Base usada por el backend: `resto001`
- Coleccion principal de pedidos: `orders`
