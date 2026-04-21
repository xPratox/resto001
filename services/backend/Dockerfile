FROM node:22-bookworm-slim

WORKDIR /app/backend

COPY package.json /app/package.json
COPY services/backend/package*.json ./

RUN npm install

COPY services/backend ./

EXPOSE 5000

CMD ["node", "--watch", "server.js"]
