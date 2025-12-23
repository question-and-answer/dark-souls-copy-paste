const DEFAULTS = {
  durationMs: 900,
  comboExtendMs: 450,
  comboWindowMs: 650,
  maxCombo: 9,

  volume: 0.85,
  soundFile: "sounds/souls_chime.mp3",

  syncOverlayToAudio: true,
  audioPaddingMs: 150,

  alsoListenClipboardEvents: false,
  ignoreKeyRepeat: false,

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
  ]
};

const elDuration = document.getElementById("durationMs");
const elExtend = document.getElementById("comboExtendMs");
const elWindow = document.getElementById("comboWindowMs");
const elMaxCombo = document.getElementById("maxCombo");

const elVolume = document.getElementById("volume");
const elVolLabel = document.getElementById("volLabel");
const elSoundFile = document.getElementById("soundFile");

const elSync = document.getElementById("syncOverlayToAudio");
const elPad = document.getElementById("audioPaddingMs");

const elClipboardEvents = document.getElementById("alsoListenClipboardEvents");
const elIgnoreRepeat = document.getElementById("ignoreKeyRepeat");

const elCopy = document.getElementById("copyPhrases");
const elPaste = document.getElementById("pastePhrases");

const elSave = document.getElementById("save");
const elStatus = document.getElementById("status");

function listToLines(list) { return (list || []).map(String).join("\n"); }
function linesToList(text) {
  return String(text || "")
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);
}
function setVolLabel(v) { elVolLabel.textContent = `${Math.round(v * 100)}%`; }

async function load() {
  const s = await chrome.storage.sync.get(DEFAULTS);

  elDuration.value = s.durationMs;
  elExtend.value = s.comboExtendMs;
  elWindow.value = s.comboWindowMs;
  elMaxCombo.value = s.maxCombo;

  elVolume.value = s.volume;
  setVolLabel(Number(s.volume));

  elSoundFile.value = s.soundFile || DEFAULTS.soundFile;

  elSync.checked = !!s.syncOverlayToAudio;
  elPad.value = s.audioPaddingMs;

  elClipboardEvents.checked = !!s.alsoListenClipboardEvents;
  elIgnoreRepeat.checked = !!s.ignoreKeyRepeat;

  elCopy.value = listToLines(s.copyPhrases);
  elPaste.value = listToLines(s.pastePhrases);
}

async function save() {
  const durationMs = Number(elDuration.value);
  const comboExtendMs = Number(elExtend.value);
  const comboWindowMs = Number(elWindow.value);
  const maxCombo = Number(elMaxCombo.value);

  const volume = Number(elVolume.value);
  const soundFile = String(elSoundFile.value || DEFAULTS.soundFile).trim();

  const syncOverlayToAudio = !!elSync.checked;
  const audioPaddingMs = Number(elPad.value);

  const alsoListenClipboardEvents = !!elClipboardEvents.checked;
  const ignoreKeyRepeat = !!elIgnoreRepeat.checked;

  const copyPhrases = linesToList(elCopy.value);
  const pastePhrases = linesToList(elPaste.value);

  await chrome.storage.sync.set({
    durationMs: Number.isFinite(durationMs) ? durationMs : DEFAULTS.durationMs,
    comboExtendMs: Number.isFinite(comboExtendMs) ? comboExtendMs : DEFAULTS.comboExtendMs,
    comboWindowMs: Number.isFinite(comboWindowMs) ? comboWindowMs : DEFAULTS.comboWindowMs,
    maxCombo: Number.isFinite(maxCombo) ? maxCombo : DEFAULTS.maxCombo,

    volume: Number.isFinite(volume) ? volume : DEFAULTS.volume,
    soundFile,

    syncOverlayToAudio,
    audioPaddingMs: Number.isFinite(audioPaddingMs) ? audioPaddingMs : DEFAULTS.audioPaddingMs,

    alsoListenClipboardEvents,
    ignoreKeyRepeat,

    copyPhrases: copyPhrases.length ? copyPhrases : DEFAULTS.copyPhrases,
    pastePhrases: pastePhrases.length ? pastePhrases : DEFAULTS.pastePhrases
  });

  elStatus.textContent = "Saved!";
  elStatus.classList.add("ok");
  setTimeout(() => {
    elStatus.textContent = "";
    elStatus.classList.remove("ok");
  }, 1200);
}

elVolume.addEventListener("input", () => setVolLabel(Number(elVolume.value)));
elSave.addEventListener("click", save);

load();
