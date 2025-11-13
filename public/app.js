let editing = null;

async function refresh() {
  const res = await fetch("/api/cameras");
  const cams = await res.json();
  const grid = document.getElementById("camera-grid");
  grid.innerHTML = ""; // clear once

  for (const cam of cams) {
    const streamUrl = `${window.location.protocol}//${window.location.hostname}:${cam.port}/?action=stream`;
    const previewUrl = `/api/preview/${encodeURIComponent(cam.name)}`;

    // Build card safely
    const card = document.createElement("div");
    card.className = "bg-white rounded shadow p-3 hover:shadow-lg transition border";
    card.innerHTML = `
      <h3 class="font-semibold text-gray-700 flex justify-between items-center">
        ${cam.name}
      </h3>
      <div class="relative">
        <img id="img-${cam.name}" src="${streamUrl}" alt="Stream of ${cam.name}"
             class="rounded mt-2 w-full border object-contain">
        <span id="badge-${cam.name}"
              class="hidden absolute top-2 left-2 bg-yellow-500 text-white text-xs px-2 py-1 rounded">
          Preview mode
        </span>
      </div>
      <p class="text-xs text-gray-600 mt-1">Port: <b>${cam.port}</b></p>
      <div class="flex justify-between mt-2">
        <button onclick="copyStreamUrl('${streamUrl}')"
                class="bg-gray-500 text-white px-2 py-1 rounded hover:bg-gray-600 text-sm">🔗 Copy URL</button>
        <div class="flex gap-2">
          <button onclick="editCam('${cam.name}')"
                  class="bg-yellow-500 text-white px-2 py-1 rounded hover:bg-yellow-600 text-sm">✏️ Edit</button>
          <button onclick="removeCam('${cam.name}')"
                  class="bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 text-sm">🗑 Delete</button>
        </div>
      </div>
    `;

    grid.appendChild(card);

    // ⚙️ Attach independent fallback after element exists
    handleStreamFallback(cam.name, streamUrl, previewUrl);
  }
}

/**
 * Handles fallback from stream → preview → "no preview"
 */
function handleStreamFallback(camName, streamUrl, previewUrl) {
  const img = document.getElementById(`img-${camName}`);
  const badge = document.getElementById(`badge-${camName}`);
  let fallbackTriggered = false;
  let timeout = setTimeout(triggerPreview, 5000); // fallback after 5s

  img.onerror = triggerPreview;
  img.onload = () => {
    clearTimeout(timeout);
    badge.classList.add("hidden");
  };

  function triggerPreview() {
    if (fallbackTriggered) return;
    fallbackTriggered = true;
    clearTimeout(timeout);

    // Load cached preview with cache-busting timestamp
    const uniquePreviewUrl = `${previewUrl}?t=${Date.now()}`;
    const testImg = new Image();

    testImg.onload = () => {
      img.src = uniquePreviewUrl;
      badge.classList.remove("hidden");
    };

    testImg.onerror = () => {
      triggerNoPreview();
    };

    testImg.src = uniquePreviewUrl;
  }

  function triggerNoPreview() {
    img.onerror = null;
    badge.classList.add("hidden");
    img.src =
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='200'>
           <rect width='100%' height='100%' fill='#111827'/>
           <text x='50%' y='50%' text-anchor='middle' dominant-baseline='middle'
             font-size='20' fill='#9ca3af'>No preview available</text>
         </svg>`
      );
  }
}

async function removeCam(name) {
  await fetch("/api/cameras/" + name, { method: "DELETE" });
  if (editing === name) editing = null;
  refresh();
}

async function editCam(name) {
  const res = await fetch("/api/cameras");
  const cams = await res.json();
  const cam = cams.find((c) => c.name === name);
  if (!cam) return;
  document.getElementById("name").value = cam.name;
  document.getElementById("url").value = cam.url;
  document.getElementById("port").value = cam.port;
  document.getElementById("refresh").value = cam.refresh;
  editing = cam.name;
  refresh();
}

document.getElementById("addForm").onsubmit = async (e) => {
  e.preventDefault();
  const cam = {
    name: document.getElementById("name").value,
    url: document.getElementById("url").value,
    port: document.getElementById("port").value,
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
