/**
 * Standard paper size definitions.
 *
 * All dimensions are in millimetres (width × height), portrait orientation.
 *
 * Sources:
 *   - ISO 216:2007 — Writing paper and certain classes of printed matter —
 *     Trimmed sizes — A and B series (https://www.iso.org/standard/36631.html)
 *   - JIS P 0138:1998 — Writing paper and certain classes of printed matter —
 *     Trimmed sizes — A and B series (JIS B series differs from ISO B series)
 *   - US Letter / Legal / Executive — common North American sizes
 */

/**
 * Paper size record.
 * @typedef {Object} PaperSize
 * @property {string} id - Unique identifier
 * @property {string} name - Human-readable name
 * @property {string} series - 'iso-a' | 'iso-b' | 'jis-b' | 'us'
 * @property {number} widthMm - Width in millimetres
 * @property {number} heightMm - Height in millimetres
 * @property {string} orientation - 'portrait' | 'landscape'
 */

/** ISO A series (ISO 216:2007). */
export const ISO_A_SIZES = [
  { id: 'a0', name: 'A0', series: 'iso-a', widthMm: 841, heightMm: 1189, orientation: 'portrait' },
  { id: 'a1', name: 'A1', series: 'iso-a', widthMm: 594, heightMm: 841, orientation: 'portrait' },
  { id: 'a2', name: 'A2', series: 'iso-a', widthMm: 420, heightMm: 594, orientation: 'portrait' },
  { id: 'a3', name: 'A3', series: 'iso-a', widthMm: 297, heightMm: 420, orientation: 'portrait' },
  { id: 'a4', name: 'A4', series: 'iso-a', widthMm: 210, heightMm: 297, orientation: 'portrait' },
  { id: 'a5', name: 'A5', series: 'iso-a', widthMm: 148, heightMm: 210, orientation: 'portrait' },
  { id: 'a6', name: 'A6', series: 'iso-a', widthMm: 105, heightMm: 148, orientation: 'portrait' },
  { id: 'a7', name: 'A7', series: 'iso-a', widthMm: 74, heightMm: 105, orientation: 'portrait' },
  { id: 'a8', name: 'A8', series: 'iso-a', widthMm: 52, heightMm: 74, orientation: 'portrait' },
  { id: 'a9', name: 'A9', series: 'iso-a', widthMm: 37, heightMm: 52, orientation: 'portrait' },
  { id: 'a10', name: 'A10', series: 'iso-a', widthMm: 26, heightMm: 37, orientation: 'portrait' },
];

/** ISO B series (ISO 216:2007). */
export const ISO_B_SIZES = [
  { id: 'b0', name: 'B0', series: 'iso-b', widthMm: 1000, heightMm: 1414, orientation: 'portrait' },
  { id: 'b1', name: 'B1', series: 'iso-b', widthMm: 707, heightMm: 1000, orientation: 'portrait' },
  { id: 'b2', name: 'B2', series: 'iso-b', widthMm: 500, heightMm: 707, orientation: 'portrait' },
  { id: 'b3', name: 'B3', series: 'iso-b', widthMm: 353, heightMm: 500, orientation: 'portrait' },
  { id: 'b4', name: 'B4', series: 'iso-b', widthMm: 250, heightMm: 353, orientation: 'portrait' },
  { id: 'b5', name: 'B5', series: 'iso-b', widthMm: 176, heightMm: 250, orientation: 'portrait' },
  { id: 'b6', name: 'B6', series: 'iso-b', widthMm: 125, heightMm: 176, orientation: 'portrait' },
  { id: 'b7', name: 'B7', series: 'iso-b', widthMm: 88, heightMm: 125, orientation: 'portrait' },
  { id: 'b8', name: 'B8', series: 'iso-b', widthMm: 62, heightMm: 88, orientation: 'portrait' },
  { id: 'b9', name: 'B9', series: 'iso-b', widthMm: 44, heightMm: 62, orientation: 'portrait' },
  { id: 'b10', name: 'B10', series: 'iso-b', widthMm: 31, heightMm: 44, orientation: 'portrait' },
];

/** JIS B series (JIS P 0138:1998). Differs from ISO B series. */
export const JIS_B_SIZES = [
  { id: 'jis-b0', name: 'JIS B0', series: 'jis-b', widthMm: 1030, heightMm: 1456, orientation: 'portrait' },
  { id: 'jis-b1', name: 'JIS B1', series: 'jis-b', widthMm: 728, heightMm: 1030, orientation: 'portrait' },
  { id: 'jis-b2', name: 'JIS B2', series: 'jis-b', widthMm: 515, heightMm: 728, orientation: 'portrait' },
  { id: 'jis-b3', name: 'JIS B3', series: 'jis-b', widthMm: 364, heightMm: 515, orientation: 'portrait' },
  { id: 'jis-b4', name: 'JIS B4', series: 'jis-b', widthMm: 257, heightMm: 364, orientation: 'portrait' },
  { id: 'jis-b5', name: 'JIS B5', series: 'jis-b', widthMm: 182, heightMm: 257, orientation: 'portrait' },
  { id: 'jis-b6', name: 'JIS B6', series: 'jis-b', widthMm: 128, heightMm: 182, orientation: 'portrait' },
  { id: 'jis-b7', name: 'JIS B7', series: 'jis-b', widthMm: 91, heightMm: 128, orientation: 'portrait' },
  { id: 'jis-b8', name: 'JIS B8', series: 'jis-b', widthMm: 64, heightMm: 91, orientation: 'portrait' },
  { id: 'jis-b9', name: 'JIS B9', series: 'jis-b', widthMm: 45, heightMm: 64, orientation: 'portrait' },
  { id: 'jis-b10', name: 'JIS B10', series: 'jis-b', widthMm: 32, heightMm: 45, orientation: 'portrait' },
];

/** US paper sizes. */
export const US_SIZES = [
  { id: 'us-letter', name: 'US Letter', series: 'us', widthMm: 215.9, heightMm: 279.4, orientation: 'portrait' },
  { id: 'us-legal', name: 'US Legal', series: 'us', widthMm: 215.9, heightMm: 355.6, orientation: 'portrait' },
  { id: 'us-executive', name: 'US Executive', series: 'us', widthMm: 184.2, heightMm: 266.7, orientation: 'portrait' },
];

/** All paper sizes, flattened. */
export const ALL_PAPER_SIZES = [...ISO_A_SIZES, ...ISO_B_SIZES, ...JIS_B_SIZES, ...US_SIZES];

/**
 * Look up a paper size by id.
 * @param {string} id - Paper size id
 * @returns {PaperSize | undefined}
 */
export function getPaperSize(id) {
  return ALL_PAPER_SIZES.find(s => s.id === id);
}

/**
 * List all available paper sizes.
 * @returns {PaperSize[]}
 */
export function listPaperSizes() {
  return ALL_PAPER_SIZES.map(s => ({ ...s }));
}
