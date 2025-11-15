FROM node:20-alpine

WORKDIR /app

# Repos edge pour GStreamer complet
RUN echo "https://dl-cdn.alpinelinux.org/alpine/edge/main" >> /etc/apk/repositories \
 && echo "https://dl-cdn.alpinelinux.org/alpine/edge/community" >> /etc/apk/repositories \
 && echo "https://dl-cdn.alpinelinux.org/alpine/edge/testing" >> /etc/apk/repositories \
 && apk add --no-cache bash curl tzdata \
    gstreamer gstreamer-tools \
    gst-plugins-base gst-plugins-good gst-plugins-bad gst-plugins-ugly \
    gst-libav

# Install MediaMTX (you said you'll handle config)
RUN curl -L -o /tmp/rtsp.tar.gz \
      https://github.com/bluenviron/mediamtx/releases/download/v1.15.3/mediamtx_v1.15.3_linux_amd64.tar.gz \
 && tar -xzf /tmp/rtsp.tar.gz -C /usr/local/bin mediamtx \
 && rm /tmp/rtsp.tar.gz

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000 8554
ENV HTTP_PORT=3000

CMD ["bash", "-c", "/usr/local/bin/mediamtx /app/mediamtx.yml & node server.js"]