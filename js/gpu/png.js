/**
 * PNG encoder using the platform CompressionStream API (no external
 * dependency). Produces a valid PNG from RGBA8 pixel data.
 *
 * PNG chunk layout:
 *   signature | IHDR | IDAT (compressed scanlines, filter type 0) | IEND
 */

/** PNG signature. */
const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Adler-32 checksum of a byte buffer. */
function adler32(buf) {
  let a = 1, b = 0;
  const MOD = 65521;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % MOD;
    b = (b + a) % MOD;
  }
  return (b << 16) | a;
}

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
/**
 * Deflate-compress bytes into a zlib stream using CompressionStream when
 * available, falling back to stored (uncompressed) deflate blocks otherwise.
 * Output is a valid zlib stream: 2-byte header, compressed/stored blocks,
 * then Adler-32 of the uncompressed input (big-endian).
 */
async function compressDeflate(input) {
  if (typeof CompressionStream !== 'undefined') {
    try {
      const stream = new CompressionStream('deflate');
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
  // Stored (uncompressed) deflate blocks wrapped in a zlib stream.
  // Zlib header (0x78 0x01), then stored blocks, then Adler-32 trailer.
  const zlibHeader = new Uint8Array([0x78, 0x01]);
  const blocks = [];
  let pos = 0;
  const len = input.length;
  while (pos < len) {
    const blockLen = Math.min(65535, len - pos);
    const finalBlock = pos + blockLen >= len;
    // Every block: 1-byte header (BFINAL in bit 0, BTYPE=00) + LEN + NLEN + data.
    const headerByte = finalBlock ? 0x01 : 0x00;
    const chunk = new Uint8Array(1 + 4 + blockLen);
    chunk[0] = headerByte;
    chunk[1] = blockLen & 0xff;
    chunk[2] = (blockLen >>> 8) & 0xff;
    chunk[3] = (~blockLen) & 0xff;
    chunk[4] = (~blockLen >>> 8) & 0xff;
    chunk.set(input.subarray(pos, pos + blockLen), 5);
    blocks.push(chunk);
    pos += blockLen;
  }
  let total = zlibHeader.length;
  for (const b of blocks) total += b.length;
  const adler = adler32(input);
  total += 4; // adler-32 trailer
  const out = new Uint8Array(total);
  let o = 0;
  out.set(zlibHeader, o); o += zlibHeader.length;
  for (const b of blocks) { out.set(b, o); o += b.length; }
  out[o++] = (adler >>> 24) & 0xff;
  out[o++] = (adler >>> 16) & 0xff;
  out[o++] = (adler >>> 8) & 0xff;
  out[o++] = adler & 0xff;
  return out;
}
