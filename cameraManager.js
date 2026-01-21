import { spawn } from "child_process";
import fs from "fs-extra";
import path from "path";
import dotenv from "dotenv";
import net from "net";
import { startBubbleStream } from "./bubbleStreamer.js";

dotenv.config();

const DATA_FILE = "/data/cameras.json";
const activeCameras = new Map();

const RTP_BASE_PORT = 8000;

/* -----------------------------
   Persistence helpers (REST API)
-------------------------------- */

export function loadCameras(file = DATA_FILE) {
  try {
    if (!fs.existsSync(file)) return [];
    return fs.readJsonSync(file);
  } catch (err) {
    console.error("⚠ Failed to load cameras:", err);
    return [];
  }
}

export function saveCameras(cameras, file = DATA_FILE) {
  try {
    fs.writeJsonSync(file, cameras, { spaces: 2 });
  } catch (err) {
    console.error("⚠ Failed to save cameras:", err);
  }
}


/**
 * Start ffmpeg process for a camera
 */
export async function startCamera(cam) {
  if (!cam.enabled) {
    console.log(`⏭ Camera ${cam.name} disabled`);
    return;
  }

  const { name, ip, channel = 0, stream = 0 } = cam;
  const safeName = name.replace(/[^a-z0-9_-]/gi, "_");
  const rtspTarget = `rtsp://127.0.0.1:8556/${safeName}`;

  console.log(`▶ Starting Bubble camera ${name} (${ip}) → ${safeName}`);

  const ffmpeg = spawn("ffmpeg", [
    "-loglevel", "warning",
    "-fflags", "+genpts",
    "-use_wallclock_as_timestamps", "1",
    "-f", "h264",
    "-i", "-",
    "-c", "copy",
    "-f", "rtsp",
    rtspTarget
  ], { stdio: ["pipe", "inherit", "inherit"] });

  const bubbleSocket = startBubbleStream({
    camIp: ip,
    channel,
    stream,
    onNal: (nal) => ffmpeg.stdin.write(nal),
    onError: (err) => {
      console.log(`⚠ Bubble error on ${name}: ${err.message}`);
      stopCamera(name);
    }
  });

  const pingInterval = setInterval(() => {
    const s = new net.Socket();
    s.setTimeout(1000);
    s.once("error", () => s.destroy());
    s.once("timeout", () => s.destroy());
    s.connect(80, ip, () => s.end());
  }, 5000);

  activeCameras.set(name, {
    ffmpeg,
    bubbleSocket,
    pingInterval,
    cam
  });

  ffmpeg.on("exit", () => stopCamera(name));
}

/**
 * Stop running camera
 */
export function stopCamera(name) {
  const cam = activeCameras.get(name);
  if (!cam) return;
  if (!cam) return;

  console.log(`⏹ Stopping ${name}`);

  try { cam.bubbleSocket.destroy(); } catch {}
  try { cam.ffmpeg.kill("SIGTERM"); } catch {}
  try { clearInterval(cam.pingInterval); } catch {}

  activeCameras.delete(name);
}

export function stopAllCameras() {
  for (const name of activeCameras.keys()) {
    stopCamera(name);
  }
}

export function restartAllCameras(cameras) {
  stopAllCameras();
  cameras.forEach((cam, index) => startCamera(cam, index));
}
