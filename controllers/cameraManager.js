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

/**
 * Load camera list from JSON file
 */
export function loadCameras(file = CAM_FILE) {
  try {
    if (!fs.existsSync(file)) return [];
    return fs.readJsonSync(file);
  } catch (err) {
    console.error("⚠ Failed to load cameras:", err);
    return [];
  }
}

/**
 * Save camera list to JSON file
 */
export function saveCameras(cams, file = CAM_FILE) {
  try {
    fs.writeJsonSync(file, cams, { spaces: 2 });
  } catch (err) {
    console.error("⚠ Failed to save cameras:", err);
  }
}

/**
 * Start fetching snapshots + mjpg_streamer for a given camera
 */
export function startCamera(cam) {
  const { name, url, port, refresh } = cam;
  const safeName = name.replace(/[^a-z0-9_-]/gi, "_");
  const snapPath = path.join(SNAP_DIR, `${safeName}.jpg`);

  console.log(`▶ Starting camera ${name} on port ${port}`);

  // --- Fetch loop ---
  const fetchCmd = [
    "while true; do",
    `wget -q -O "${snapPath}" "${url}" || echo "⚠ ${name} fetch failed";`,
    `sleep ${refresh || 0.2};`,
    "done"
  ].join(" ");

  const fetchLoop = spawn("bash", ["-c", fetchCmd], {
    stdio: "inherit",
  });

  // --- MJPG Streamer ---
  const streamerCmd = [
    "LD_LIBRARY_PATH=/usr/local/lib",
    "mjpg_streamer",
    `-i "input_file.so -d ${refresh || 0.2} -f ${SNAP_DIR} -n ${safeName}.jpg"`,
    `-o "output_http.so -w /usr/local/share/mjpg-streamer/www -p ${port}"`,
  ].join(" ");

  const streamer = spawn("bash", ["-c", streamerCmd], {
    stdio: "inherit",
  });

  // --- Track active camera processes ---
  activeCameras.set(name, { fetchLoop, streamer });

  fetchLoop.on("exit", (code, signal) => {
    console.log(`↩ Fetch loop for ${name} exited (code=${code}, signal=${signal})`);
  });

  streamer.on("exit", (code, signal) => {
    console.log(`↩ Streamer for ${name} exited (code=${code}, signal=${signal})`);
  });
}

/**
 * Stop and clean up a running camera
 */
export function stopCamera(name) {
  const cam = activeCameras.get(name);
  if (cam) {
    console.log(`⏹ Stopping camera ${name}`);
    cam.fetchLoop.kill("SIGTERM");
    cam.streamer.kill("SIGTERM");
    activeCameras.delete(name);
  } else {
    console.log(`⚠ Tried to stop unknown camera ${name}`);
  }
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
  for (const [name, cam] of activeCameras.entries()) {
    stopCamera(name);
  }
}
