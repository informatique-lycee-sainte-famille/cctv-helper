FROM debian:12

RUN apt update && apt install -y \
    curl bash wget tzdata \
    gstreamer1.0-tools \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-bad \
    gstreamer1.0-plugins-ugly \
    gstreamer1.0-libav \
    nodejs npm

WORKDIR /app

# Install MediaMTX
RUN curl -L -o /tmp/rtsp.tar.gz https://github.com/bluenviron/mediamtx/releases/download/v1.15.3/mediamtx_v1.15.3_linux_amd64.tar.gz \
    && tar -xzf /tmp/rtsp.tar.gz -C /usr/local/bin mediamtx \
    && rm /tmp/rtsp.tar.gz

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000 8555
ENV HTTP_PORT=3000

CMD ["bash", "-c", "/usr/local/bin/mediamtx /app/mediamtx.yml & node server.js"]