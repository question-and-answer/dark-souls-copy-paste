const DEFAULTS = {
  durationMs: 900,            // base show time
  comboExtendMs: 450,         // extra time added per additional event in a burst
  comboWindowMs: 650,         // if next event happens within this window => same burst
  maxCombo: 9,                // cap for display
  syncOverlayToAudio: true,     // if true, overlay duration = audio duration (plus optional padding)
  audioPaddingMs: 150,           // extra time after audio ends


  volume: 0.85,
  soundFile: "sounds/souls_chime.mp3",

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

  // If true, also react to real clipboard events (copy/paste). Some sites restrict paste events.
  alsoListenClipboardEvents: false
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
  // restart animations reliably
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
    copyPhrases: Array.isArray(data.copyPhrases) && data.copyPhrases.length ? data.copyPhrases : DEFAULTS.copyPhrases,
    pastePhrases: Array.isArray(data.pastePhrases) && data.pastePhrases.length ? data.pastePhrases : DEFAULTS.pastePhrases,
    syncOverlayToAudio: typeof data.syncOverlayToAudio === "boolean" ? data.syncOverlayToAudio : DEFAULTS.syncOverlayToAudio,
    audioPaddingMs: typeof data.audioPaddingMs === "number" ? data.audioPaddingMs : DEFAULTS.audioPaddingMs,
    alsoListenClipboardEvents: typeof data.alsoListenClipboardEvents === "boolean"
      ? data.alsoListenClipboardEvents
      : DEFAULTS.alsoListenClipboardEvents
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
let comboSoundPlayed = false;

function formatComboText(base, count) {
  if (count <= 1) return base;
  return `${base} ×${count}`;
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
    comboSoundPlayed = false;

    const base = type === "copy"
      ? pickRandom(s.copyPhrases)
      : pickRandom(s.pastePhrases);

    comboBaseText = base;

    textEl.textContent = formatComboText(comboBaseText, comboCount);
    restartShowAnimation();

    // Start sound as close as possible to visual start
    comboSoundPlayed = true;
    playSoundOnce();

    // timer
    let baseMs = s.durationMs;

    if (s.syncOverlayToAudio) {
      // Ensure audio buffer is ready and has duration
      await ensureAudioReady();
      if (audioBuffer) {
        baseMs = Math.max(baseMs, Math.round(audioBuffer.duration * 1000) + (s.audioPaddingMs || 0));
      }
    }

    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideOverlay, baseMs);
    return;
  }

  // Same burst: increment and extend
  comboLastAt = now;
  comboCount = Math.min(comboCount + 1, s.maxCombo);

  textEl.textContent = formatComboText(comboBaseText, comboCount);

  // Don’t fully restart animation every time (less flicker),
  // but ensure it stays visible:
  root.style.display = "block";
  root.classList.add("souls-show");
  root.classList.remove("souls-hide");

  // Extend visibility
  let baseMs = s.durationMs;

  if (s.syncOverlayToAudio) {
    // audioBuffer likely already loaded after first event
    if (audioBuffer) baseMs = Math.max(baseMs, Math.round(audioBuffer.duration * 1000) +   (s.audioPaddingMs || 0));
  }

  const extra = (comboCount - 1) * s.comboExtendMs;
  const total = baseMs + extra;

  clearTimeout(hideTimer);
  hideTimer = setTimeout(hideOverlay, total);

  // Sound: play only once per burst (already played)
}

// ---------------- Key handling ----------------
function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (target.isContentEditable) return true;
  return false;
}

window.addEventListener("keydown", async (e) => {
  const ctrlOrCmd = e.ctrlKey || e.metaKey;
  if (!ctrlOrCmd) return;
  if (e.altKey) return;

  const k = (e.key || "").toLowerCase();
  if (k !== "c" && k !== "v") return;

  // Keydown is a user gesture => unlock audio ASAP
  try { await ensureAudioReady(); } catch (_) {}

  // Optional: avoid triggering when user is doing browser-level copy on non-editable?
  // (You asked to react when user presses Ctrl+C/V, so we always do it.)
  // If you want to only trigger in editable fields, uncomment:
  // if (!isEditableTarget(e.target)) return;

  if (k === "c") showCombo("copy");
  else showCombo("paste");
}, true);

// Optional: listen to actual clipboard events
(async function maybeListenClipboardEvents() {
  const s = await loadSettings();
  if (!s.alsoListenClipboardEvents) return;

  document.addEventListener("copy", () => showCombo("copy"), true);
  document.addEventListener("paste", () => showCombo("paste"), true);
})();
