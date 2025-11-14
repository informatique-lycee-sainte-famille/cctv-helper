import { spawn } from "child_process";
import fs from "fs-extra";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const DATA_DIR = "/data";
const SNAP_DIR = path.join(DATA_DIR, "snaps");
const CAM_FILE = path.join(DATA_DIR, "cameras.json");

fs.ensureDirSync(SNAP_DIR);

const activeCameras = new Map();

export function loadCameras(file = CAM_FILE) {
  try {
    if (!fs.existsSync(file)) return [];
    return fs.readJsonSync(file);
  } catch (err) {
    console.error("⚠ Failed to load cameras:", err);
    return [];
  }
}

export function saveCameras(cams, file = CAM_FILE) {
  try {
    fs.writeJsonSync(file, cams, { spaces: 2 });
  } catch (err) {
    console.error("⚠ Failed to save cameras:", err);
  }
}

/**
 * Start snapshot loop + ffmpeg RTSP stream
 */
export function startCamera(cam) {
  const { name, url, port, refresh } = cam;
  const safeName = name.replace(/[^a-z0-9_-]/gi, "_");
  const snapPath = path.join(SNAP_DIR, `${safeName}.jpg`);

  console.log(`▶ Starting camera ${name} (RTSP on port ${port})`);

  // --- Snapshot loop (unchanged) ---
  const fetchCmd = `
    while true; do 
      wget -q -O "${snapPath}" "${url}" || echo "⚠ ${name} snapshot failed";
      sleep ${refresh || 0.2};
    done
  `;

  const fetchLoop = spawn("bash", ["-c", fetchCmd], {
    stdio: "inherit",
  });

  // --- Replace mjpg_streamer with ffmpeg RTSP push ---
  const ffmpegCmd = `
    ffmpeg -re -loop 1 -i "${snapPath}" \
      -vf fps=${Math.max(1, Math.floor(1 / (refresh || 0.2)))} \
      -c:v libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p \
      -f rtsp rtsp://127.0.0.1:${port}/stream
  `;

  const ffmpeg = spawn("bash", ["-c", ffmpegCmd], {
    stdio: "inherit",
  });

  activeCameras.set(name, { fetchLoop, ffmpeg });

  fetchLoop.on("exit", (code, signal) => {
    console.log(`↩ Fetch loop for ${name} exited (${code}, ${signal})`);
  });

  ffmpeg.on("exit", (code, signal) => {
    console.log(`↩ FFmpeg stream for ${name} exited (${code}, ${signal})`);
  });
}

/**
 * Stop and clean up a running camera
 */
export function stopCamera(name) {
  const cam = activeCameras.get(name);
  if (!cam) {
    console.log(`⚠ Tried to stop unknown camera ${name}`);
    return;
  }
  console.log(`⏹ Stopping camera ${name}`);
  cam.fetchLoop.kill("SIGTERM");
  cam.ffmpeg.kill("SIGTERM");
  activeCameras.delete(name);
}

/**
 * Restart all cameras (useful on app reload)
 */
export function restartAllCameras(cameras) {
  stopAllCameras();
  cameras.forEach((cam) => startCamera(cam));
}

/**
 * Stop all cameras
 */
export function stopAllCameras() {
  for (const [name] of activeCameras.entries()) {
    stopCamera(name);
  }
}
