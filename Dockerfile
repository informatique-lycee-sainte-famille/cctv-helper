FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

RUN apk add --no-cache bash wget mjpg-streamer tzdata

EXPOSE 3000 9000-9999

CMD ["node", "server.js"]

VOLUME [ "/data" ]