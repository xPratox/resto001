FROM node:22-bookworm-slim

WORKDIR /app/resto-mobile

COPY package.json /app/package.json
COPY app/mobile/resto-mobile/package*.json ./

RUN npm install

COPY app/mobile/resto-mobile ./

EXPOSE 19006

CMD ["npm", "run", "web", "--", "--host", "lan", "--port", "19006"]