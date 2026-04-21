FROM node:22-bookworm-slim

WORKDIR /app/admin-web

COPY package.json /app/package.json
COPY app/admin-web/package*.json ./

RUN npm install

COPY app/admin-web ./

EXPOSE 5174

CMD ["npm", "run", "dev"]
