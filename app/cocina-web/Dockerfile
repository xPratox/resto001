FROM node:22-bookworm-slim

WORKDIR /app/cocina-web

COPY package.json /app/package.json
COPY app/cocina-web/package*.json ./

RUN npm install

COPY app/cocina-web ./

EXPOSE 5174

CMD ["npm", "run", "dev"]
