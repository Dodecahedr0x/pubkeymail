export const presets = {
  youtube: { width: 1920, height: 1080, fps: 30 },
  tiktok: { width: 1080, height: 1920, fps: 30 },
  instagram: { width: 1080, height: 1080, fps: 30 },
  twitter: { width: 1280, height: 720, fps: 30 },
} as const;

export type PresetName = keyof typeof presets;
export type Preset = (typeof presets)[PresetName];

export const getPreset = (name: PresetName): Preset => presets[name];

export const defaultPreset: PresetName = 'youtube';
