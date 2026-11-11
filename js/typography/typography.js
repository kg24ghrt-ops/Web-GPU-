export const FONT_FAMILY = "'Noto Serif Myanmar','Noto Sans Myanmar','Myanmar Text','Segoe UI Symbol',Arial,sans-serif";
export const FONT_SIZE = '18px';
export const LINE_HEIGHT = 1.6;
export function fontCss() { return `font-family:${FONT_FAMILY};font-size:${FONT_SIZE};line-height:${LINE_HEIGHT};`; }
const MYANMAR = /[\u1000-\u109F\uA9E0-\uA9FF]/;
export function containsMyanmar(text) { return MYANMAR.test(String(text)); }
export async function ensureFonts() {
  if (typeof document === 'undefined' || !document.fonts) return;
  try { await document.fonts.ready; } catch { /* fonts unavailable; continue with system fallback */ }
}
