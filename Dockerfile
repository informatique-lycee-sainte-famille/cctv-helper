FROM node:20-alpine

WORKDIR /app

# add edge repos for ffmpeg-full
RUN echo "https://dl-cdn.alpinelinux.org/alpine/edge/community" >> /etc/apk/repositories \
 && echo "https://dl-cdn.alpinelinux.org/alpine/edge/main" >> /etc/apk/repositories \
 && apk add --no-cache bash wget ffmpeg tzdata curl

# Install rtsp-simple-server
RUN curl -L -o /tmp/rtsp.tar.gz https://github.com/bluenviron/mediamtx/releases/download/v1.15.3/mediamtx_v1.15.3_linux_amd64.tar.gz \
 && tar -xzf /tmp/rtsp.tar.gz -C /usr/local/bin mediamtx \
 && rm /tmp/rtsp.tar.gz

# Copy app files
COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000 8554 9000-9999
ENV HTTP_PORT=3000

CMD ["bash", "-c", "mediamtx /app/mediamtx.yml & node server.js"]
