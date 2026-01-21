// server.js
import express from "express";
import bodyParser from "body-parser";
import basicAuth from "basic-auth";
import fs from "fs-extra";
import path from "path";
import dotenv from "dotenv";
import { exec } from "child_process";

dotenv.config();

import {
  loadCameras,
  saveCameras,
  startCamera,
  stopCamera,
  stopAllCameras,
  restartAllCameras,
} from "./cameraManager.js";

const app = express();
const HTTP_PORT = process.env.HTTP_PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";

const DATA_FILE = "/data/cameras.json";
const PREVIEW_DIR = "/data/previews";

fs.ensureDirSync(PREVIEW_DIR);
fs.ensureFileSync(DATA_FILE);

// -------------------------
// Load cameras config
// -------------------------
let cameras = [];
try {
  cameras = JSON.parse(fs.readFileSync(DATA_FILE, "utf8") || "[]");
} catch {
  cameras = [];
}

// -------------------------
// Ping status (runtime only)
// -------------------------
const pingStatus = new Map();

function pingCamera(ip) {
  return new Promise((resolve) => {
    exec(`ping -c 1 -W 1 ${ip}`, (err) => {
      resolve(!err);
    });
  });
}

async function refreshPingStatus() {
  for (const cam of cameras) {
    if (!cam.ip) continue;
    try {
      const ok = await pingCamera(cam.ip);
      pingStatus.set(cam.name, ok);
    } catch {
      pingStatus.set(cam.name, false);
    }
  }
}

// initial + periodic refresh
refreshPingStatus();
setInterval(refreshPingStatus, 5000);

// -------------------------
// Middlewares
// -------------------------
app.use(bodyParser.json());
app.use(express.static("public"));

// -------------------------
// Basic Auth
// -------------------------
app.use((req, res, next) => {
  const user = basicAuth(req);
  if (!user || user.name !== ADMIN_USER || user.pass !== ADMIN_PASSWORD) {
    res.set("WWW-Authenticate", 'Basic realm="CCTV Helper"');
    return res.status(401).send("Authentication required");
  }
  next();
});

// -------------------------
// API: Cameras
// -------------------------
app.get("/api/cameras", (req, res) => {
  const enriched = cameras.map((cam) => ({
    ...cam,
    ping: pingStatus.get(cam.name) ?? false,
  }));
  res.json(enriched);
});

app.post("/api/cameras", (req, res) => {
  const cam = req.body;

  if (!cam.name || !cam.ip)
    return res.status(400).json({ error: "Missing fields" });

  if (cameras.find((c) => c.name === cam.name))
    return res.status(400).json({ error: "Camera name already exists" });

  cameras.push(cam);
  fs.writeFileSync(DATA_FILE, JSON.stringify(cameras, null, 2));

  res.json({ success: true });

  if (cam.enabled !== false) {
    startCamera(cam);
  }
});

app.put("/api/cameras/:name", (req, res) => {
  const idx = cameras.findIndex((c) => c.name === req.params.name);
  if (idx === -1) return res.status(404).json({ error: "Not found" });

  const old = cameras[idx];
  cameras[idx] = req.body;

  fs.writeFileSync(DATA_FILE, JSON.stringify(cameras, null, 2));

  stopCamera(old.name);

  if (req.body.enabled !== false) {
    startCamera(req.body);
  }

  res.json({ success: true });
});

app.delete("/api/cameras/:name", (req, res) => {
  const name = req.params.name;
  cameras = cameras.filter((c) => c.name !== name);
  fs.writeFileSync(DATA_FILE, JSON.stringify(cameras, null, 2));
  stopCamera(name);
  res.json({ success: true });
});

// -------------------------
// API: Snapshot (backend only)
// -------------------------
app.get("/api/preview/:name", async (req, res) => {
  const camName = req.params.name;
  const cam = cameras.find((c) => c.name === camName);

  if (!cam || cam.enabled === false) {
    return res.status(404).send("Camera not available");
  }

  const snapshotUrl = process.env.SNAPSHOT_URL_TEMPLATE.replace("{ip}", cam.ip);

  try {
    const response = await fetch(snapshotUrl, { timeout: 3000 });
    if (!response.ok) throw new Error("Bad response");

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) throw new Error("Empty snapshot");

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(buffer);
  } catch (err) {
    console.error(`⚠ Snapshot failed for ${camName}:`, err.message);
    res.status(404).send("No preview");
  }
});

// -------------------------
// Start server
// -------------------------
app.listen(HTTP_PORT, () => {
  console.log(`🚀 CCTV Helper running on port ${HTTP_PORT}`);
  restartAllCameras(loadCameras());
});

// -------------------------
// Graceful shutdown
// -------------------------
process.on("SIGINT", () => {
  console.log("\n🛑 Stopping all cameras before exit...");
  stopAllCameras();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Received SIGTERM, stopping all cameras...");
  stopAllCameras();
  process.exit(0);
});
