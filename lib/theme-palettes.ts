import { APP_PREF_KEYS } from "./app-prefs.ts";

/**
 * Built-in colour themes ("主题"), a layer above the light/dark colour mode.
 * The mode keeps owning `data-theme` / `.dark`; a palette owns `data-palette`
 * on <html> and repaints the same semantic tokens in app/native-theme.css.
 * "default" removes the attribute, so the base palette shows through.
 *
 * Adding a built-in theme = one entry here + its token blocks at the end of
 * native-theme.css. Labels are i18n keys resolved in the settings UI.
 */
export const PALETTE_OPTIONS = [
  { id: "default", label: "settings.paletteDefault" },
  // Claude Desktop's warm terracotta look, after Nwflower/dsh-claude-style.
  { id: "claude", label: "settings.paletteClaude" },
] as const;

export type ThemePalette = (typeof PALETTE_OPTIONS)[number]["id"];
export const DEFAULT_PALETTE: ThemePalette = "default";
export const PALETTE_STORAGE_KEY = APP_PREF_KEYS.palette;

export function isThemePalette(value: unknown): value is ThemePalette {
  return PALETTE_OPTIONS.some((option) => option.id === value);
}

export function applyThemePalette(palette: ThemePalette): void {
  if (palette === DEFAULT_PALETTE) delete document.documentElement.dataset.palette;
  else document.documentElement.dataset.palette = palette;
}

// Apply the saved palette before first paint (and when storage is blocked).
export const PALETTE_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(PALETTE_STORAGE_KEY)});if(${JSON.stringify(PALETTE_OPTIONS.map((option) => option.id).filter((id) => id !== DEFAULT_PALETTE))}.includes(p))document.documentElement.dataset.palette=p}catch(e){}})();`;