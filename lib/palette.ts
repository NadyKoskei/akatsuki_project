/**
 * The Board palette.
 *
 * These are the eight categorical slots from the validated data-viz palette, in
 * their fixed order. Boards store a slot *key*, never a hex, so every mark
 * re-steps itself correctly in dark mode. Slots are assigned in order as boards
 * are created and are never cycled or generated — a ninth board takes the
 * reserved "other" gray in charts, and charts fold the tail into "Other".
 *
 * Validator (OKLab dE x100, adjacent pairlist):
 *   light on #fcfcfb — lightness/chroma/CVD/normal-vision PASS; contrast WARN on
 *     aqua, yellow, magenta, so charts carry direct labels + a table view.
 *   dark on #141416 — all six checks PASS.
 */
export interface PaletteSlot {
  key: string;
  name: string;
  /** CSS var reference used for every mark and swatch */
  cssVar: string;
  light: string;
  dark: string;
}

export const BOARD_COLORS: PaletteSlot[] = [
  { key: "blue", name: "Blue", cssVar: "var(--series-1)", light: "#2a78d6", dark: "#3987e5" },
  { key: "orange", name: "Orange", cssVar: "var(--series-2)", light: "#eb6834", dark: "#d95926" },
  { key: "aqua", name: "Aqua", cssVar: "var(--series-3)", light: "#1baf7a", dark: "#199e70" },
  { key: "yellow", name: "Yellow", cssVar: "var(--series-4)", light: "#eda100", dark: "#c98500" },
  { key: "magenta", name: "Magenta", cssVar: "var(--series-5)", light: "#e87ba4", dark: "#d55181" },
  { key: "green", name: "Green", cssVar: "var(--series-6)", light: "#008300", dark: "#008300" },
  { key: "violet", name: "Violet", cssVar: "var(--series-7)", light: "#4a3aa7", dark: "#9085e9" },
  { key: "red", name: "Red", cssVar: "var(--series-8)", light: "#e34948", dark: "#e66767" },
];

export const OTHER_SLOT: PaletteSlot = {
  key: "other",
  name: "Other",
  cssVar: "var(--series-other)",
  light: "#898781",
  dark: "#898781",
};

export function slotFor(colorCode: string): PaletteSlot {
  return BOARD_COLORS.find((c) => c.key === colorCode) ?? OTHER_SLOT;
}

export function colorVar(colorCode: string): string {
  return slotFor(colorCode).cssVar;
}

/** Next unused slot, in fixed order; falls back to slot 1 once all eight are taken. */
export function nextColor(taken: string[]): string {
  return BOARD_COLORS.find((c) => !taken.includes(c.key))?.key ?? BOARD_COLORS[0].key;
}
