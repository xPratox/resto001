FROM node:22-bookworm-slim

WORKDIR /app/mesonero-web

COPY package.json /app/package.json
COPY app/mesonero-web/package*.json ./

RUN npm install

COPY app/mesonero-web ./

EXPOSE 5173

CMD ["npm", "run", "dev"]
