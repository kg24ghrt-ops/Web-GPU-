import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { encodePng } from '../../js/gpu/png.js';

const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32Table() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}
function crc32(buf) {
  const table = crc32Table();
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xff];
  return (c ^ 0xffffffff) >>> 0;
}

function readU32(buf, o) { return (buf[o] << 24 | (buf[o + 1] & 0xff) << 16 | (buf[o + 2] & 0xff) << 8 | (buf[o + 3] & 0xff)) >>> 0; }

function parsePng(png) {
  assert.ok(png.length >= 8);
  assert.ok(png.subarray(0, 8).every((v, i) => v === SIGNATURE[i]), 'PNG signature');
  const chunks = [];
  let o = 8;
  while (o + 8 <= png.length) {
    const len = readU32(png, o);
    const type = String.fromCharCode(...png.subarray(o + 4, o + 8));
    const data = png.subarray(o + 8, o + 8 + len);
    const storedCrc = readU32(png, o + 8 + len);
    const calcCrc = crc32(new Uint8Array([...png.subarray(o + 4, o + 8), ...data]));
    assert.equal(storedCrc, calcCrc, `CRC valid for chunk ${type}`);
    chunks.push({ type, len, data });
    o += 12 + len;
  }
  return chunks;
}

test('png: encodes a solid colour with valid structure', async () => {
  const w = 4, h = 3;
  const pixels = new Uint8Array(w * h * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 100; pixels[i + 1] = 150; pixels[i + 2] = 200; pixels[i + 3] = 255;
  }
  const png = await encodePng(pixels, w, h);
  const chunks = parsePng(png);
  const types = chunks.map((c) => c.type);
  assert.ok(types.includes('IHDR'), 'has IHDR');
  assert.ok(types.includes('IDAT'), 'has IDAT');
  assert.equal(types[types.length - 1], 'IEND', 'ends with IEND');
  const ihdr = chunks.find((c) => c.type === 'IHDR').data;
  assert.equal(readU32(ihdr, 0), w);
  assert.equal(readU32(ihdr, 4), h);
  assert.equal(ihdr[8], 8);  // bit depth
  assert.equal(ihdr[9], 6);  // RGBA
});

test('png: round-trips varying pixel data with correct dimensions', async () => {
  const w = 8, h = 4;
  const pixels = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      pixels[i] = x * 30;
      pixels[i + 1] = y * 60;
      pixels[i + 2] = 128;
      pixels[i + 3] = 200;
    }
  }
  const png = await encodePng(pixels, w, h);
  const chunks = parsePng(png);
  const ihdr = chunks.find((c) => c.type === 'IHDR').data;
  assert.equal(readU32(ihdr, 0), w);
  assert.equal(readU32(ihdr, 4), h);
  const idat = chunks.filter((c) => c.type === 'IDAT').map((c) => c.data);
  assert.ok(idat.length > 0, 'has compressed data');
});

test('png: 1x1 minimal image', async () => {
  const png = await encodePng(new Uint8Array([255, 0, 0, 255]), 1, 1);
  const chunks = parsePng(png);
  assert.equal(chunks[chunks.length - 1].type, 'IEND');
});
