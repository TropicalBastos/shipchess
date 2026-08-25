/** Sun-angle presets (plan Phase 7): each is a complete lighting palette. */

export interface SunPreset {
  sunDir: [number, number, number];
  sunColor: string;
  sunIntensity: number;
  ambient: string;
  ambientIntensity: number;
  zenith: string;
  horizon: string;
  deep: string;
  crest: string;
  skyTint: string;
}

export const SUN_PRESETS: Record<string, SunPreset> = {
  day: {
    sunDir: [0.6, 0.34, 0.42],
    sunColor: "#fff4e0",
    sunIntensity: 2.2,
    ambient: "#bfd4de",
    ambientIntensity: 0.9,
    zenith: "#2a6390",
    horizon: "#e5e9df",
    deep: "#0a3450",
    crest: "#2b7d95",
    skyTint: "#e9ece4",
  },
  golden: {
    sunDir: [0.85, 0.12, 0.3],
    sunColor: "#ffb45e",
    sunIntensity: 2.6,
    ambient: "#c9a98a",
    ambientIntensity: 0.7,
    zenith: "#3c5a80",
    horizon: "#f2c98e",
    deep: "#123246",
    crest: "#a06b3f",
    skyTint: "#f4cf9a",
  },
  moonlit: {
    sunDir: [-0.4, 0.5, 0.35],
    sunColor: "#cfe0f5",
    sunIntensity: 1.1,
    ambient: "#3d4f63",
    ambientIntensity: 0.55,
    zenith: "#0a1626",
    horizon: "#31435a",
    deep: "#04121f",
    crest: "#16405a",
    skyTint: "#9db6cf",
  },
};

export type SunPresetName = keyof typeof SUN_PRESETS;

/** The one place that decides which preset colors feed the ocean — fog is
 * the HORIZON, never the fresnel sky tint (P7-04; locked by test). */
export function oceanPaletteArgs(
  p: SunPreset,
): [string, string, string, string] {
  return [p.deep, p.crest, p.skyTint, p.horizon];
}
