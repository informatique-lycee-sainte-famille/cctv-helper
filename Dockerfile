FROM node:20-alpine

WORKDIR /app

# Install packages, including mjpg-streamer from edge/testing
RUN echo "https://dl-cdn.alpinelinux.org/alpine/edge/testing" >> /etc/apk/repositories && \
    apk add --no-cache bash wget mjpg-streamer tzdata

# Copy app
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 3000 9000-9999
ENV HTTP_PORT=3000
CMD ["node", "server.js"]
