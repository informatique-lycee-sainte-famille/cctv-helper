// bubbleStreamer.js
import net from "net";
import dotenv from "dotenv";

dotenv.config();

const CAM_USERNAME = process.env.CAM_USERNAME;
const CAM_PASSWORD = process.env.CAM_PASSWORD;

if (!CAM_USERNAME || !CAM_PASSWORD) {
  throw new Error("CAM_USERNAME or CAM_PASSWORD missing in .env");
}

/*
  CONFIRMED STRUCTURE (Wireshark):
  - header   : 20 bytes
  - username : 16 bytes (ASCII, null padded)
  - password : 16 bytes (ASCII, null padded)
  TOTAL      : 52 bytes
*/

const AUTH_HEADER = Buffer.from(
  "aa000000350000e636b10000002c00000000",
  "hex"
);

function buildAuthBlob(username, password) {
  const userBuf = Buffer.alloc(16, 0x00);
  const passBuf = Buffer.alloc(16, 0x00);

  userBuf.write(username.slice(0, 16), "ascii");
  passBuf.write(password.slice(0, 16), "ascii");

  return Buffer.concat([AUTH_HEADER, userBuf, passBuf]);
}

const AUTH_BLOB = buildAuthBlob(CAM_USERNAME, CAM_PASSWORD);

// 🔎 Debug sanity checks
console.log("✅ Bubble auth blob ready");
console.log("AUTH_BLOB length:", AUTH_BLOB.length); // MUST be 52
console.log("AUTH_BLOB hex:", AUTH_BLOB.toString("hex"));

// START blob (protocol-only, no secrets)
const START_BLOB = Buffer.from(
  "aa000000150a00e6371e00000000000000000100000000000000",
  "hex"
);

const NAL = Buffer.from([0x00, 0x00, 0x00, 0x01]);

export function startBubbleStream({
  camIp,
  channel = 0,
  stream = 0,
  onNal,
  onError,
}) {
  const socket = new net.Socket();
  let buffer = Buffer.alloc(0);
  let closed = false;

  socket.connect(80, camIp, () => {
    socket.write(
      `GET /bubble/live?ch=${channel}&stream=${stream}&av=1 HTTP/1.1\r\n` +
      `Host: ${camIp}\r\n` +
      `Connection: keep-alive\r\n\r\n`
    );

    setTimeout(() => socket.write(AUTH_BLOB), 50);
    setTimeout(() => socket.write(START_BLOB), 100);
  });

  socket.on("data", (data) => {
    buffer = Buffer.concat([buffer, data]);

    while (true) {
      const start = buffer.indexOf(NAL);
      if (start === -1) break;

      const next = buffer.indexOf(NAL, start + 4);
      if (next === -1) break;

      onNal(buffer.slice(start, next));
      buffer = buffer.slice(next);
    }
  });

  socket.on("error", (err) => {
    if (closed) return;
    closed = true;
    onError(err);
  });

  socket.on("close", () => {
    if (closed) return;
    closed = true;
    onError(new Error("Bubble socket closed"));
  });

  return socket;
}
