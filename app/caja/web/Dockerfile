FROM node:22-bookworm-slim

WORKDIR /app/caja-web

COPY app/caja/web/package*.json ./

RUN npm install

COPY app/caja/web ./

EXPOSE 5175

CMD ["npm", "run", "dev"]
