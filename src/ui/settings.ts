/**
 * Guarded localStorage-backed settings. Storage access must NEVER break boot:
 * every read/write is try/caught, the blob is schema-versioned, and any
 * failure or mismatch falls back to defaults in memory (plan Phase 5).
 */

export interface Settings {
  version: 1;
  fastAnimations: boolean;
  cameraGlide: boolean;
  volume: number;
  quality: "high" | "low";
  reducedMotion: boolean;
  sunPreset: "day" | "moonlit";
  /** Checkered strategy-map board (off = open-water chart with grid only). */
  checkeredBoard: boolean;
}

const DEFAULTS: Settings = {
  version: 1,
  fastAnimations: false,
  cameraGlide: true,
  volume: 0.8,
  quality: "high",
  reducedMotion: false,
  sunPreset: "day",
  checkeredBoard: true,
};

const KEY = "navalchess.settings";

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
      // Retired from the settings UI (2026-08-27): pinned to defaults so a
      // previously stored value can't leave the game in a state the menu
      // can no longer reach. Fields kept for easy reinstatement.
      cameraGlide: DEFAULTS.cameraGlide,
      volume: DEFAULTS.volume,
      quality: DEFAULTS.quality,
      reducedMotion: DEFAULTS.reducedMotion,
      sunPreset:
        parsed.sunPreset === "day" || parsed.sunPreset === "moonlit"
          ? parsed.sunPreset
          : DEFAULTS.sunPreset,
      checkeredBoard:
        typeof parsed.checkeredBoard === "boolean"
          ? parsed.checkeredBoard
          : DEFAULTS.checkeredBoard,
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
