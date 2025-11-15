# ===========================
#  Stage 1 — Build node deps
# ===========================
FROM node:24-debian-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm install --production


# ===========================
#  Stage 2 — Runtime
# ===========================
FROM node:24-debian-slim AS runtime

WORKDIR /app

# Install minimal runtime deps + GStreamer full stack
RUN apt update && apt install -y --no-install-recommends \
    ca-certificates curl bash tzdata \
    gstreamer1.0-tools \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-bad \
    gstreamer1.0-plugins-ugly \
    gstreamer1.0-libav \
    && rm -rf /var/lib/apt/lists/*

# Install MediaMTX
RUN curl -L -o /tmp/rtsp.tar.gz \
      https://github.com/bluenviron/mediamtx/releases/download/v1.15.3/mediamtx_v1.15.3_linux_amd64.tar.gz \
    && tar -xzf /tmp/rtsp.tar.gz -C /usr/local/bin mediamtx \
    && rm /tmp/rtsp.tar.gz

# Copy Node modules from build stage
COPY --from=build /app/node_modules ./node_modules

# Copy application
COPY . .

EXPOSE 3000 8556
ENV HTTP_PORT=3000

CMD bash -c "/usr/local/bin/mediamtx /app/mediamtx.yml & node server.js"
