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
  /** Procedural sky: cloud tint, cloud coverage [0..1], star strength [0..1]. */
  cloudColor: string;
  cloudAmount: number;
  starIntensity: number;
}

export const SUN_PRESETS: Record<string, SunPreset> = {
  day: {
    sunDir: [0.6, 0.34, 0.42],
    sunColor: "#fff4e0",
    sunIntensity: 2.2,
    ambient: "#bfd4de",
    ambientIntensity: 0.9,
    zenith: "#1c4e7e",
    horizon: "#e5e9df",
    deep: "#0a3450",
    crest: "#2b7d95",
    skyTint: "#e9ece4",
    cloudColor: "#ffffff",
    cloudAmount: 0.62,
    starIntensity: 0,
  },
  golden: {
    sunDir: [0.85, 0.12, 0.3],
    sunColor: "#ffb45e",
    sunIntensity: 2.6,
    ambient: "#c9a98a",
    ambientIntensity: 0.7,
    zenith: "#2a4066",
    horizon: "#f2c98e",
    deep: "#123246",
    crest: "#a06b3f",
    skyTint: "#f4cf9a",
    cloudColor: "#f6c79a",
    cloudAmount: 0.75,
    starIntensity: 0,
  },
  moonlit: {
    sunDir: [-0.4, 0.13, 0.35],
    sunColor: "#cfe0f5",
    sunIntensity: 1.1,
    ambient: "#3d4f63",
    ambientIntensity: 0.55,
    zenith: "#0a1626",
    horizon: "#31435a",
    deep: "#04121f",
    crest: "#16405a",
    skyTint: "#9db6cf",
    cloudColor: "#54677e",
    cloudAmount: 0.35,
    starIntensity: 1,
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

/** Interpolate two presets (smooth time-of-day transitions). */
export function lerpPreset(a: SunPreset, b: SunPreset, t: number): SunPreset {
  const mix = (x: number, y: number) => x + (y - x) * t;
  const mixHex = (x: string, y: string) => {
    const px = parseInt(x.slice(1), 16);
    const py = parseInt(y.slice(1), 16);
    const ch = (v: number, s: number) => (v >> s) & 0xff;
    const m = (s: number) => Math.round(mix(ch(px, s), ch(py, s)));
    return `#${((m(16) << 16) | (m(8) << 8) | m(0)).toString(16).padStart(6, "0")}`;
  };
  return {
    sunDir: [
      mix(a.sunDir[0], b.sunDir[0]),
      mix(a.sunDir[1], b.sunDir[1]),
      mix(a.sunDir[2], b.sunDir[2]),
    ],
    sunColor: mixHex(a.sunColor, b.sunColor),
    sunIntensity: mix(a.sunIntensity, b.sunIntensity),
    ambient: mixHex(a.ambient, b.ambient),
    ambientIntensity: mix(a.ambientIntensity, b.ambientIntensity),
    zenith: mixHex(a.zenith, b.zenith),
    horizon: mixHex(a.horizon, b.horizon),
    deep: mixHex(a.deep, b.deep),
    crest: mixHex(a.crest, b.crest),
    skyTint: mixHex(a.skyTint, b.skyTint),
    cloudColor: mixHex(a.cloudColor, b.cloudColor),
    cloudAmount: mix(a.cloudAmount, b.cloudAmount),
    starIntensity: mix(a.starIntensity, b.starIntensity),
  };
}
