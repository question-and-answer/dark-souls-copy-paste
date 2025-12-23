const DEFAULTS = {
  // Timing
  durationMs: 900,            // base show time (used if not syncing to audio)
  comboExtendMs: 450,         // extra time per additional event in a burst
  comboWindowMs: 650,         // repeats within this window count as same burst
  maxCombo: 9,

  // Audio
  volume: 0.85,
  soundFile: "sounds/souls_chime.mp3",

  // If true, overlay lasts at least as long as the audio (plus padding).
  syncOverlayToAudio: true,
  audioPaddingMs: 150,

  // Text
  copyPhrases: [
    "COPIED",
    "CLIPBOARD ACQUIRED",
    "TEXT STOLEN",
    "CTRL+C CONFIRMED",
    "SNATCHED"
  ],
  pastePhrases: [
    "PASTED",
    "CLIPBOARD UNLEASHED",
    "CTRL+V ACTIVATED",
    "TEXT SUMMONED",
    "IT IS DONE"
  ],

  // Optional: also listen to real clipboard events (copy/paste).
  // Keydown already triggers as requested.
  alsoListenClipboardEvents: false,

  // Optional: ignore auto-repeat when holding keys down
  ignoreKeyRepeat: false
};

// ---------------- Overlay DOM ----------------
let root, backdrop, textEl, grain;
let hideTimer = null;

function ensureOverlay() {
  if (root) return;

  root = document.createElement("div");
  root.id = "soulsOverlayRoot";

  backdrop = document.createElement("div");
  backdrop.id = "soulsOverlayBackdrop";

  textEl = document.createElement("div");
  textEl.id = "soulsOverlayText";

  grain = document.createElement("div");
  grain.id = "soulsOverlayGrain";

  root.appendChild(backdrop);
  root.appendChild(textEl);
  root.appendChild(grain);

  document.documentElement.appendChild(root);
}

function restartShowAnimation() {
  root.style.display = "block";
  root.classList.remove("souls-hide");
  // Restart animations reliably
  void root.offsetHeight;
  root.classList.add("souls-show");
}

function hideOverlay() {
  if (!root) return;

  root.classList.remove("souls-show");
  void root.offsetHeight;
  root.classList.add("souls-hide");

  setTimeout(() => {
    if (!root) return;
    root.style.display = "none";
  }, 260);
}

// Click anywhere to dismiss (also Esc)
window.addEventListener("pointerdown", () => {
  hideOverlay();
}, true);

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") hideOverlay();
}, true);

// ---------------- Settings ----------------
async function loadSettings() {
  const data = await chrome.storage.sync.get(DEFAULTS);
  return {
    durationMs: typeof data.durationMs === "number" ? data.durationMs : DEFAULTS.durationMs,
    comboExtendMs: typeof data.comboExtendMs === "number" ? data.comboExtendMs : DEFAULTS.comboExtendMs,
    comboWindowMs: typeof data.comboWindowMs === "number" ? data.comboWindowMs : DEFAULTS.comboWindowMs,
    maxCombo: typeof data.maxCombo === "number" ? data.maxCombo : DEFAULTS.maxCombo,

    volume: typeof data.volume === "number" ? data.volume : DEFAULTS.volume,
    soundFile: typeof data.soundFile === "string" ? data.soundFile : DEFAULTS.soundFile,

    syncOverlayToAudio: typeof data.syncOverlayToAudio === "boolean" ? data.syncOverlayToAudio : DEFAULTS.syncOverlayToAudio,
    audioPaddingMs: typeof data.audioPaddingMs === "number" ? data.audioPaddingMs : DEFAULTS.audioPaddingMs,

    copyPhrases: Array.isArray(data.copyPhrases) && data.copyPhrases.length ? data.copyPhrases : DEFAULTS.copyPhrases,
    pastePhrases: Array.isArray(data.pastePhrases) && data.pastePhrases.length ? data.pastePhrases : DEFAULTS.pastePhrases,

    alsoListenClipboardEvents: typeof data.alsoListenClipboardEvents === "boolean"
      ? data.alsoListenClipboardEvents
      : DEFAULTS.alsoListenClipboardEvents,

    ignoreKeyRepeat: typeof data.ignoreKeyRepeat === "boolean"
      ? data.ignoreKeyRepeat
      : DEFAULTS.ignoreKeyRepeat
  };
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------- WebAudio (synced) ----------------
let audioCtx = null;
let audioBuffer = null;
let audioLoading = null;

async function ensureAudioReady() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state !== "running") {
    try { await audioCtx.resume(); } catch (_) {}
  }

  if (audioBuffer) return;
  if (audioLoading) return audioLoading;

  audioLoading = (async () => {
    const s = await loadSettings();
    const url = chrome.runtime.getURL(s.soundFile);
    const resp = await fetch(url);
    const arr = await resp.arrayBuffer();
    audioBuffer = await audioCtx.decodeAudioData(arr);
  })();

  try {
    await audioLoading;
  } finally {
    audioLoading = null;
  }
}

async function playSoundOnce() {
  const s = await loadSettings();
  await ensureAudioReady();
  if (!audioCtx || !audioBuffer) return;

  const src = audioCtx.createBufferSource();
  src.buffer = audioBuffer;

  const gain = audioCtx.createGain();
  gain.gain.value = s.volume;

  src.connect(gain);
  gain.connect(audioCtx.destination);
  src.start(0);
}

// ---------------- Combo / burst logic ----------------
let comboType = null;          // "copy" | "paste"
let comboCount = 0;
let comboLastAt = 0;
let comboBaseText = "";
let comboBaseMs = 0;

function formatComboText(base, count) {
  return count <= 1 ? base : `${base} ×${count}`;
}

async function computeBaseMs(s) {
  let baseMs = s.durationMs;

  if (s.syncOverlayToAudio) {
    // Ensure audio is ready and has duration
    await ensureAudioReady();
    if (audioBuffer) {
      const audioMs = Math.round(audioBuffer.duration * 1000) + (s.audioPaddingMs || 0);
      baseMs = Math.max(baseMs, audioMs);
    }
  }
  return baseMs;
}

async function showCombo(type) {
  ensureOverlay();
  const s = await loadSettings();

  const now = Date.now();
  const withinWindow = (type === comboType) && (now - comboLastAt <= s.comboWindowMs);

  if (!withinWindow) {
    // New burst
    comboType = type;
    comboCount = 1;
    comboLastAt = now;

    comboBaseText = type === "copy"
      ? pickRandom(s.copyPhrases)
      : pickRandom(s.pastePhrases);

    // Compute base duration once per burst (audio-based if enabled)
    comboBaseMs = await computeBaseMs(s);

    textEl.textContent = formatComboText(comboBaseText, comboCount);
    restartShowAnimation();

    // Start sound as close as possible to visual start
    playSoundOnce();

    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideOverlay, comboBaseMs);
    return;
  }

  // Same burst: increment and extend
  comboLastAt = now;
  comboCount = Math.min(comboCount + 1, s.maxCombo);

  textEl.textContent = formatComboText(comboBaseText, comboCount);

  // Keep it visible without full animation restart (less flicker)
  root.style.display = "block";
  root.classList.add("souls-show");
  root.classList.remove("souls-hide");

  const extra = (comboCount - 1) * s.comboExtendMs;
  const total = comboBaseMs + extra;

  clearTimeout(hideTimer);
  hideTimer = setTimeout(hideOverlay, total);
}

// ---------------- Key handling ----------------
window.addEventListener("keydown", async (e) => {
  const ctrlOrCmd = e.ctrlKey || e.metaKey;
  if (!ctrlOrCmd) return;
  if (e.altKey) return;

  if (e.repeat) {
    const s = await loadSettings();
    if (s.ignoreKeyRepeat) return;
  }

  const k = (e.key || "").toLowerCase();
  if (k !== "c" && k !== "v") return;

  // Keydown is a user gesture => unlock audio ASAP
  try { await ensureAudioReady(); } catch (_) {}

  if (k === "c") showCombo("copy");
  else showCombo("paste");
}, true);

// Optional: listen to actual clipboard events too
(async function maybeListenClipboardEvents() {
  const s = await loadSettings();
  if (!s.alsoListenClipboardEvents) return;

  document.addEventListener("copy", () => showCombo("copy"), true);
  document.addEventListener("paste", () => showCombo("paste"), true);
})();
