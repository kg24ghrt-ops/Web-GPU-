/**
 * PNG encoder using the platform CompressionStream API (no external
 * dependency). Produces a valid PNG from RGBA8 pixel data.
 *
 * PNG chunk layout:
 *   signature | IHDR | IDAT (compressed scanlines, filter type 0) | IEND
 */

/** PNG signature. */
const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** CRC32 table (lazy built). */
let crcTable = null;
function crc32Table() {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  crcTable = table;
  return crcTable;
}

/** CRC32 of a byte buffer. */
function crc32(buf) {
  const table = crc32Table();
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xff];
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** Write a big-endian uint32 into a DataView at offset. */
function writeU32(view, offset, value) {
  view.setUint32(offset, value, false);
}

/** Build a PNG chunk: length + type + data + CRC. */
function pngChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const len = data.length;
  const total = 4 + 4 + len + 4;
  const buf = new Uint8Array(total);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  writeU32(view, 0, len);
  buf.set(typeBytes, 4);
  buf.set(data, 8);
  const crcInput = new Uint8Array(len + 4);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, 4);
  writeU32(view, 8 + len, crc32(crcInput));
  return buf;
}

/** IHDR chunk: width, height, bit depth 8, color type 6 (RGBA). */
function ihdrChunk(width, height) {
  const buf = new Uint8Array(13);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  writeU32(view, 0, width);
  writeU32(view, 4, height);
  buf[8] = 8;  // bit depth
  buf[9] = 6;  // color type RGBA
  buf[10] = 0; // compression
  buf[11] = 0; // filter
  buf[12] = 0; // interlace
  return pngChunk('IHDR', buf);
}

/** IEND chunk (empty). */
function iendChunk() {
  return pngChunk('IEND', new Uint8Array(0));
}

/**
 * Encode RGBA8 pixels into a PNG byte array.
 *
 * @param {Uint8Array} pixels - RGBA8 data, row-major, width*height*4 bytes
 * @param {number} width - image width in pixels
 * @param {number} height - image height in pixels
 * @returns {Promise<Uint8Array>} PNG-encoded bytes
 */
export async function encodePng(pixels, width, height) {
  const rowBytes = width * 4;
  // Each scanline: filter byte (0 = none) + row data.
  const scanlineBytes = height * (1 + rowBytes);
  const raw = new Uint8Array(scanlineBytes);
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0; // filter type: none
    const src = y * rowBytes;
    raw.set(pixels.subarray(src, src + rowBytes), o);
    o += rowBytes;
  }

  // Compress with the platform CompressionStream (deflate).
  const compressed = await compressDeflate(raw);

  const chunks = [PNG_SIGNATURE, ihdrChunk(width, height), pngChunk('IDAT', compressed), iendChunk()];
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

/**
 * Deflate-compress bytes using CompressionStream when available, falling
 * back to a stored (uncompressed) deflate block when not.
 */
async function compressDeflate(input) {
  if (typeof CompressionStream !== 'undefined') {
    try {
      const stream = new CompressionStream('deflate-raw');
      const writer = stream.writable.getWriter();
      writer.write(input);
      writer.close();
      const reader = stream.readable.getReader();
      const pieces = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        pieces.push(value);
      }
      if (pieces.length === 0) return new Uint8Array(0);
      if (pieces.length === 1) return pieces[0];
      const total = pieces.reduce((s, p) => s + p.length, 0);
      const out = new Uint8Array(total);
      let o = 0;
      for (const p of pieces) { out.set(p, o); o += p.length; }
      return out;
    } catch (err) {
      // fall through to stored fallback
    }
  }
  // Stored (uncompressed) deflate blocks: BFINAL=1, BTYPE=00, then LEN/NLEN + data.
  // Split into 65535-byte blocks.
  const blocks = [];
  let pos = 0;
  const len = input.length;
  while (pos < len) {
    const blockLen = Math.min(65535, len - pos);
    const finalBlock = pos + blockLen >= len;
    const header = new Uint8Array(finalBlock ? 1 : 0);
    if (finalBlock) header[0] = 0x01;
    const chunk = new Uint8Array(header.length + blockLen + (finalBlock ? 0 : 4));
    chunk.set(header, 0);
    let c = header.length;
    if (!finalBlock) {
      // LEN and NLEN (ones complement)
      chunk.set([blockLen & 0xff, blockLen >>> 8, (~blockLen) & 0xff, (~blockLen) >>> 8], c);
      c += 4;
    }
    chunk.set(input.subarray(pos, pos + blockLen), c);
    blocks.push(chunk);
    pos += blockLen;
  }
  let total = 0;
  for (const b of blocks) total += b.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const b of blocks) { out.set(b, o); o += b.length; }
  return out;
}
