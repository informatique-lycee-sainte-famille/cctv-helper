// cameraManager.js
import { spawn } from "child_process";
import fs from "fs-extra";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const DATA_DIR = "/data";
const CAM_FILE = path.join(DATA_DIR, "cameras.json");

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
 * Start GStreamer RTSP stream from HTTP snapshots
 */
export async function startCamera(cam) {
  const { name, url, refresh = 0.1 } = cam;
  const safeName = name.replace(/[^a-z0-9_-]/gi, "_");

  console.log(`▶ Starting camera ${name} → RTSP: /${safeName}`);

  const rtspTarget = `rtsp://127.0.0.1:8554/${safeName}`;

  // -------------------------
  //  SNAPSHOT FETCH LOOP
  // -------------------------
  const fetchCmd = `while true; do curl -s "${url}" ; sleep ${refresh}; done`;

  const fetchProc = spawn("bash", ["-c", fetchCmd], {
    stdio: ["ignore", "pipe", "inherit"],
  });

  // -------------------------
  //  GSTREAMER PIPELINE
  // -------------------------
  const gstCmd = [
    "gst-launch-1.0",
    "-v",
    "fdsrc", // input from curl pipe
    '!', 'image/jpeg,framerate=10/1,width=1280,height=960',
    '!', 'jpegdec',
    '!', 'videoconvert',
    '!', 'videoscale',
    '!', 'video/x-raw,framerate=10/1,width=1280,height=960',
    '!',
    "x264enc tune=zerolatency speed-preset=ultrafast bitrate=2000 key-int-max=20",
    "!",
    `rtspclientsink location=${rtspTarget} protocols=4`
  ].join(" ");

  const gstProc = spawn("bash", ["-c", gstCmd], {
    stdio: ["pipe", "inherit", "inherit"],
  });

  // pipe curl output → gstreamer input
  fetchProc.stdout.pipe(gstProc.stdin);

  activeCameras.set(name, { fetchProc, gstProc });

  // logs
  gstProc.on("exit", (code) => {
    console.log(`↩ GStreamer for ${name} stopped (code ${code}).`);
  });
  fetchProc.on("exit", () => {
    console.log(`↩ Fetch loop for ${name} stopped.`);
  });
}

/**
 * Stop running camera
 */
export function stopCamera(name) {
  const cam = activeCameras.get(name);
  if (!cam) return console.log(`⚠ Tried to stop unknown camera ${name}`);

  console.log(`⏹ Stopping camera ${name}`);

  try { cam.fetchProc.kill("SIGTERM"); } catch {}
  try { cam.gstProc.kill("SIGTERM"); } catch {}

  activeCameras.delete(name);
}

/**
 * Stop all
 */
export function stopAllCameras() {
  for (const [name] of activeCameras.entries()) stopCamera(name);
}

/**
 * Restart all
 */
export function restartAllCameras(cameras) {
  stopAllCameras();
  cameras.forEach((cam) => startCamera(cam));
}
