/**
 * Guarded localStorage-backed settings. Storage access must NEVER break boot:
 * every read/write is try/caught, the blob is schema-versioned, and any
 * failure or mismatch falls back to defaults in memory (plan Phase 5).
 */

export interface Settings {
  version: 1;
  fastAnimations: boolean;
  cameraGlide: boolean;
  volume: number; // reserved for Phase 7
}

const DEFAULTS: Settings = {
  version: 1,
  fastAnimations: false,
  cameraGlide: true,
  volume: 0.8,
};

const KEY = "shipchess.settings";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    if (parsed.version !== 1) return { ...DEFAULTS };
    // Per-field type/range validation — a valid version does not make the
    // fields trustworthy (review P5-08).
    return {
      version: 1,
      fastAnimations:
        typeof parsed.fastAnimations === "boolean"
          ? parsed.fastAnimations
          : DEFAULTS.fastAnimations,
      cameraGlide:
        typeof parsed.cameraGlide === "boolean"
          ? parsed.cameraGlide
          : DEFAULTS.cameraGlide,
      volume:
        typeof parsed.volume === "number" &&
        parsed.volume >= 0 &&
        parsed.volume <= 1
          ? parsed.volume
          : DEFAULTS.volume,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage unavailable (private mode, blocked) — settings stay in memory.
  }
}
