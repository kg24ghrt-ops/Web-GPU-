/**
 * Physical unit system.
 *
 * All paper dimensions are stored in millimetres (mm), consistent with ISO 216
 * and JIS P 0138 standards. Conversion to CSS pixels uses the CSS reference
 * pixel: 1 inch = 96 px, 1 inch = 25.4 mm, so 1 mm = 96 / 25.4 px ≈ 3.7795 px.
 *
 * Sources:
 *   - ISO 216:2007 (A and B series paper sizes)
 *   - JIS P 0138:1998 (JIS B series paper sizes)
 *   - CSS Values and Units Module Level 4 (reference pixel = 96 dpi)
 */

/** Millimetres per inch. */
export const MM_PER_INCH = 25.4;

/** CSS reference pixels per inch. */
export const CSS_PX_PER_INCH = 96;

/** Millimetres per CSS pixel (at 96 dpi reference). */
export const MM_PER_PX = MM_PER_INCH / CSS_PX_PER_INCH;

/** CSS pixels per millimetre (at 96 dpi reference). */
export const PX_PER_MM = CSS_PX_PER_INCH / MM_PER_INCH;

/**
 * Convert millimetres to CSS reference pixels.
 * @param {number} mm - Millimetres
 * @returns {number} CSS pixels
 */
export function mmToPx(mm) {
  return mm * PX_PER_MM;
}

/**
 * Convert CSS reference pixels to millimetres.
 * @param {number} px - CSS pixels
 * @returns {number} Millimetres
 */
export function pxToMm(px) {
  return px * MM_PER_PX;
}

/**
 * Round a pixel value to the nearest whole pixel for crisp rendering.
 * @param {number} px - CSS pixels
 * @returns {number} Rounded pixels
 */
export function snapPx(px) {
  return Math.round(px * 1000) / 1000;
}
