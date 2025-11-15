let editing = null;

async function refresh() {
  const res = await fetch("/api/cameras");
  const cams = await res.json();
  const grid = document.getElementById("camera-grid");
  grid.innerHTML = ""; // clear once

  for (const cam of cams) {
    const rtspUrl = `rtsp://${window.location.hostname}:8555/${encodeURIComponent(cam.name)}`;
    const previewUrl = `/api/preview/${encodeURIComponent(cam.name)}`;

    // 🟦 On affiche le snapshot, pas le RTSP
    const imgUrl = `${previewUrl}?t=${Date.now()}`;

    const card = document.createElement("div");
    card.className = "bg-white rounded shadow p-3 hover:shadow-lg transition border";
    card.innerHTML = `
      <h3 class="font-semibold text-gray-700 flex justify-between items-center">
        ${cam.name}
      </h3>
      <div class="relative">
        <img id="img-${cam.name}" src="${imgUrl}" alt="Preview of ${cam.name}"
             class="rounded mt-2 w-full border object-contain">
        <span id="badge-${cam.name}"
              class="hidden absolute top-2 left-2 bg-yellow-500 text-white text-xs px-2 py-1 rounded">
          Preview mode
        </span>
      </div>
      <div class="flex justify-between mt-2">
        <button onclick="copyStreamUrl('${rtspUrl}')"
                class="bg-gray-500 text-white px-2 py-1 rounded hover:bg-gray-600 text-sm">
          🔗 Copy RTSP URL
        </button>
        <div class="flex gap-2">
          <button onclick="editCam('${cam.name}')"
                  class="bg-yellow-500 text-white px-2 py-1 rounded hover:bg-yellow-600 text-sm">✏️ Edit</button>
          <button onclick="removeCam('${cam.name}')"
                  class="bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 text-sm">🗑 Delete</button>
        </div>
      </div>
    `;

    grid.appendChild(card);

    // keep snapshot fallback logic
    handleStreamFallback(cam.name, imgUrl, previewUrl);
  }
}

/**
 * Handles fallback from snapshot (always) → preview → "no preview"
 */
function handleStreamFallback(camName, streamUrl, previewUrl) {
  const img = document.getElementById(`img-${camName}`);
  const badge = document.getElementById(`badge-${camName}`);

  // always preview mode (because no RTSP in <img>)
  badge.classList.remove("hidden");

  // still validate preview snapshot
  const testImg = new Image();
  const uniquePreviewUrl = `${previewUrl}?t=${Date.now()}`;

  testImg.onload = () => {
    img.src = uniquePreviewUrl;
  };

  testImg.onerror = () => {
    img.src =
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='200'>
           <rect width='100%' height='100%' fill='#111827'/>
           <text x='50%' y='50%' text-anchor='middle'
             font-size='20' fill='#9ca3af'>No preview available</text>
         </svg>`
      );
  };

  testImg.src = uniquePreviewUrl;
}

async function editCam(name) {
  const res = await fetch("/api/cameras");
  const cams = await res.json();
  const cam = cams.find((c) => c.name === name);
  if (!cam) return;
  document.getElementById("name").value = cam.name;
  document.getElementById("url").value = cam.url;
  document.getElementById("refresh").value = cam.refresh;
  editing = cam.name;
  refresh();
}

document.getElementById("addForm").onsubmit = async (e) => {
  e.preventDefault();
  const cam = {
    name: document.getElementById("name").value,
    url: document.getElementById("url").value,
    refresh: document.getElementById("refresh").value,
  };
  if (editing) {
    await fetch("/api/cameras/" + editing, {
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
  document.getElementById("previewBox").classList.add("hidden");
  refresh();
};

document.getElementById("previewBtn").onclick = async () => {
  const urlField = document.getElementById("url");
  const nameField = document.getElementById("name");
  if (!urlField.value) return alert("Enter a snapshot URL first.");
  const res = await fetch("/api/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: urlField.value, name: nameField.value || "preview" }),
  });
  if (!res.ok) return alert("Failed to load preview.");
  const blob = await res.blob();
  const img = URL.createObjectURL(blob);
  document.getElementById("previewImg").src = img;
  document.getElementById("previewBox").classList.remove("hidden");
};

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

refresh();