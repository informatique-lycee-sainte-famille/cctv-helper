let editing = null;

/* ========================= */
/* Main refresh              */
/* ========================= */

async function refresh() {
  const res = await fetch("/api/cameras");
  const cams = await res.json();

  const grid = document.getElementById("camera-grid");
  grid.innerHTML = "";

  for (const cam of cams) {
    const rtspUrl = `rtsp://${window.location.hostname}:8556/${encodeURIComponent(cam.name)}`;
    const previewUrl = `/api/preview/${encodeURIComponent(cam.name)}`;
    const pingEmoji = cam.ping ? "🟢" : "🔴";

    const card = document.createElement("div");
    card.className = "bg-white rounded shadow p-3 border";

    card.innerHTML = `
      <h3 class="font-semibold text-gray-700 flex justify-between items-center">
        <span>${pingEmoji} ${cam.name}</span>
        ${cam.enabled === false ? `<span class="text-xs text-red-500">disabled</span>` : ""}
      </h3>

      <div class="relative mt-2">
        <img
          id="img-${cam.name}"
          class="rounded w-full border object-contain bg-gray-100"
          style="min-height:180px"
        />
      </div>

      <div class="flex justify-between mt-2">
        <button onclick="copyStreamUrl('${rtspUrl}')"
          class="bg-gray-500 text-white px-2 py-1 rounded hover:bg-gray-600 text-sm">
          🔗 RTSP
        </button>

        <div class="flex gap-2">
          <button onclick="previewCam('${cam.name}')"
            class="bg-gray-600 text-white px-2 py-1 rounded hover:bg-gray-700 text-sm">
            👁️ Preview
          </button>

          <button onclick="editCam('${cam.name}')"
            class="bg-yellow-500 text-white px-2 py-1 rounded hover:bg-yellow-600 text-sm">
            ✏️
          </button>

          <button onclick="removeCam('${cam.name}')"
            class="bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 text-sm">
            🗑
          </button>
        </div>
      </div>
    `;

    grid.appendChild(card);

    // Auto preview only if enabled
    if (cam.enabled === false) {
      setDisabledPlaceholder(cam.name);
    } else {
      loadPreview(cam.name);
    }
  }
}

/* ========================= */
/* Preview helpers           */
/* ========================= */

function loadPreview(name) {
  const img = document.getElementById(`img-${name}`);
  const url = `/api/preview/${encodeURIComponent(name)}?t=${Date.now()}`;

  img.src = "";
  img.alt = "Loading preview...";

  const test = new Image();
  test.onload = () => (img.src = url);
  test.onerror = () => setNoPreviewPlaceholder(name);
  test.src = url;
}

function previewCam(name) {
  loadPreview(name);
}

function setDisabledPlaceholder(name) {
  const img = document.getElementById(`img-${name}`);
  img.src =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(`
      <svg xmlns='http://www.w3.org/2000/svg' width='400' height='200'>
        <rect width='100%' height='100%' fill='#1f2937'/>
        <text x='50%' y='50%' text-anchor='middle'
          font-size='20' fill='#9ca3af'>Camera disabled</text>
      </svg>
    `);
}

function setNoPreviewPlaceholder(name) {
  const img = document.getElementById(`img-${name}`);
  img.src =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(`
      <svg xmlns='http://www.w3.org/2000/svg' width='400' height='200'>
        <rect width='100%' height='100%' fill='#111827'/>
        <text x='50%' y='50%' text-anchor='middle'
          font-size='20' fill='#9ca3af'>No preview available</text>
      </svg>
    `);
}

/* ========================= */
/* CRUD                      */
/* ========================= */

async function editCam(name) {
  const res = await fetch("/api/cameras");
  const cams = await res.json();
  const cam = cams.find((c) => c.name === name);
  if (!cam) return;

  document.getElementById("name").value = cam.name;
  document.getElementById("ip").value = cam.ip;
  document.getElementById("enabled").checked = cam.enabled !== false;

  editing = cam.name;
}

async function removeCam(name) {
  if (!confirm(`Delete camera ${name}?`)) return;
  await fetch(`/api/cameras/${encodeURIComponent(name)}`, { method: "DELETE" });
  refresh();
}

async function copyStreamUrl(url) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(url);
    } else {
      // Fallback for HTTP / insecure context
      const textArea = document.createElement("textarea");
      textArea.value = url;
      textArea.style.position = "fixed"; // avoid scrolling
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    }
    alert("✅ Stream URL copied!");
  } catch (err) {
    console.error("Clipboard error:", err);
    alert("⚠️ Failed to copy URL");
  }
}

/* ========================= */
/* FORM HANDLER (FIX)        */
/* ========================= */

document.getElementById("addForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const cam = {
    name: document.getElementById("name").value.trim(),
    ip: document.getElementById("ip").value.trim(),
    enabled: document.getElementById("enabled").checked,
  };

  if (!cam.name || !cam.ip) {
    alert("Missing fields");
    return;
  }

  if (editing) {
    await fetch(`/api/cameras/${encodeURIComponent(editing)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cam),
    });
    editing = null;
  } else {
    await fetch("/api/cameras", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cam),
    });
  }

  e.target.reset();
  refresh();
});

/* ========================= */
/* Init                      */
/* ========================= */

refresh();
setInterval(refresh, 5000);
