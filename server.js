import express from "express";
import bodyParser from "body-parser";
import basicAuth from "basic-auth";
import fs from "fs-extra";
import path from "path";
import os from "os";
import dotenv from "dotenv";

dotenv.config();

import {
  loadCameras,
  saveCameras,
  startCamera,
  stopCamera,
  stopAllCameras ,
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

// --- Load cameras ---
let cameras = [];
try {
  cameras = JSON.parse(fs.readFileSync(DATA_FILE, "utf8") || "[]");
} catch {
  cameras = [];
}

// --- Middlewares ---
app.use(bodyParser.json());
app.use(express.static("public"));

// --- Basic Auth ---
app.use((req, res, next) => {
  const user = basicAuth(req);
  if (!user || user.name !== ADMIN_USER || user.pass !== ADMIN_PASSWORD) {
    res.set("WWW-Authenticate", 'Basic realm="CCTV Helper"');
    return res.status(401).send("Authentication required");
  }
  next();
});

// --- API: Cameras CRUD ---
app.get("/api/cameras", (req, res) => res.json(cameras));

app.post("/api/cameras", (req, res) => {
  const cam = req.body;
  if (!cam.name || !cam.url || !cam.port)
    return res.status(400).json({ error: "Missing fields" });
  if (cameras.find((c) => c.name === cam.name))
    return res.status(400).json({ error: "Camera name already exists" });
  cameras.push(cam);
  fs.writeFileSync(DATA_FILE, JSON.stringify(cameras, null, 2));
  res.json({ success: true });
  startCamera(cam);
});

app.put("/api/cameras/:name", (req, res) => {
  const idx = cameras.findIndex((c) => c.name === req.params.name);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  cameras[idx] = req.body;
  fs.writeFileSync(DATA_FILE, JSON.stringify(cameras, null, 2));
  res.json({ success: true });
  stopCamera(req.params.name);
  startCamera(req.body);
});

app.delete("/api/cameras/:name", (req, res) => {
  const name = req.params.name;
  cameras = cameras.filter((c) => c.name !== name);
  fs.writeFileSync(DATA_FILE, JSON.stringify(cameras, null, 2));
  res.json({ success: true });
  stopCamera(name);
});

// --- API: Preview snapshot (fetch & save with Node) ---
app.post("/api/preview", async (req, res) => {
  const { url, name } = req.body;
  if (!url) return res.status(400).send("Missing URL");

  const safeName = name?.replace(/[^a-z0-9_-]/gi, "_") || "preview";
  const basePath = path.join(PREVIEW_DIR, `${safeName}.jpg`);

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Bad response");

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(basePath, buffer);

    const stats = await fs.stat(basePath);
    if (!stats.size) throw new Error("Empty file");

    res.sendFile(path.resolve(basePath), () => {
    });
  } catch (err) {
    console.error(`⚠️ Preview fetch failed for ${url}:`, err.message);
    res.status(404).send("No preview");
  }
});

// --- Serve stored snapshots ---
app.get("/api/preview/:name", (req, res) => {
  const safeName = req.params.name.replace(/[^a-z0-9_-]/gi, "_");
  const previewPath = path.join(PREVIEW_DIR, `${safeName}.jpg`);
  if (!fs.existsSync(previewPath)) return res.status(404).end();
  res.sendFile(path.resolve(previewPath));
});

// --- Start server ---
app.listen(HTTP_PORT, () => {
  console.log(`🚀 CCTV Helper running on port ${HTTP_PORT}`);
  restartAllCameras(loadCameras());
});

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