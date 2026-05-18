FROM node:22-alpine

WORKDIR /workspace

# Solo copia package.json y package-lock.json para instalar dependencias primero
COPY package*.json ./
RUN [ -f package.json ] && npm install || true

# Copia el resto del código
COPY . .

# Por defecto, no ejecuta nada. El usuario decide el comando en VS Code.
