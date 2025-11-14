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
 * Wait until a valid snapshot file is created (non-empty)
 */
async function waitForValidSnapshot(file) {
  for (let i = 0; i < 25; i++) {
    if (fs.existsSync(file)) {
      const buf = fs.readFileSync(file);
      if (buf.length > 2000) return true;
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}


/**
 * Start snapshot loop + ffmpeg RTSP stream
 */
export async function startCamera(cam) {
  const { name, url, refresh } = cam;
  const safeName = name.replace(/[^a-z0-9_-]/gi, "_");
  const snapPath = path.join(SNAP_DIR, `${safeName}.jpg`);

  console.log(`▶ Starting camera ${name} (RTSP path /${safeName})`);

  // --- Fetch loop (wget snapshots) ---
  const fetchCmd = [
    "while true; do",
    `wget -q -O "${snapPath}" "${url}" || echo "⚠ ${name} snapshot failed";`,
    `sleep ${refresh || 0.2};`,
    "done"
  ].join(" ");

  const fetchLoop = spawn("bash", ["-c", fetchCmd], { stdio: "inherit" });

  // --- Wait for first valid frame ---
  await waitForValidSnapshot(snapPath);

  // --- Build RTSP path ---
  const rtspPath = `rtsp://127.0.0.1:9554/${safeName}`;

  // --- FFmpeg → H264 → RTSP ---
  const ffmpegCmd = `
    ffmpeg -re -loop 1 -i "${snapPath}" \
      -c:v libx264 -preset ultrafast -tune zerolatency \
      -pix_fmt yuv420p -vf fps=5 \
      -f rtsp "${rtspPath}"
  `;

  const ffmpegProc = spawn("bash", ["-c", ffmpegCmd], { stdio: "inherit" });

  activeCameras.set(name, { fetchLoop, ffmpegProc });

  ffmpegProc.on("exit", (code, sig) => {
    console.log(`↩ FFmpeg stream for ${name} exited (${code}, ${sig})`);
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
