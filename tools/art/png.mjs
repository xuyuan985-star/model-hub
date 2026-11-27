/* tools/art/png.mjs — 零依赖 PNG 编码器与索引色量化（《残响协议》美术构建用）。只用 node:zlib，不引入 npm 依赖。 */
import zlib from 'node:zlib';

const CRC_TABLE = (function () {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf, start, end) {
  let c = 0xFFFFFFFF;
  const s = start || 0, e = end === undefined ? buf.length : end;
  for (let i = s; i < e; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out, 4, 8 + data.length), 8 + data.length);
  return out;
}

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** 逐行自适应过滤：在 0/1/2/3/4 里挑绝对值和最小的一种，压缩率比裸码流高不少。 */
function filterRows(raw, w, h, bpp) {
  const stride = w * bpp;
  const out = Buffer.alloc((stride + 1) * h);
  const cand = [Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride)];
  for (let y = 0; y < h; y++) {
    const row = raw.subarray(y * stride, y * stride + stride);
    const prev = y > 0 ? raw.subarray((y - 1) * stride, (y - 1) * stride + stride) : null;
    let best = 0, bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      if (f === 4 && !prev) continue;
      const dst = cand[f];
      let score = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? row[x - bpp] : 0;
        const b = prev ? prev[x] : 0;
        const c = (prev && x >= bpp) ? prev[x - bpp] : 0;
        let v;
        if (f === 0) v = row[x];
        else if (f === 1) v = row[x] - a;
        else if (f === 2) v = row[x] - b;
        else if (f === 3) v = row[x] - ((a + b) >> 1);
        else {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          const pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          v = row[x] - pr;
        }
        v &= 0xFF;
        dst[x] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) { bestScore = score; best = f; }
    }
    out[y * (stride + 1)] = best;
    cand[best].copy(out, y * (stride + 1) + 1);
  }
  return out;
}

function pack(w, h, raw, bpp) {
  return zlib.deflateSync(filterRows(raw, w, h, bpp), { level: 9, memLevel: 9 });
}

/** 索引色 PNG（colorType 3，8 位）。palette: [[r,g,b], ...]；alpha 可选，长度与 palette 一致。 */
export function encodeIndexed(w, h, indices, palette, alpha) {
  const plte = Buffer.alloc(palette.length * 3);
  palette.forEach((c, i) => { plte[i * 3] = c[0]; plte[i * 3 + 1] = c[1]; plte[i * 3 + 2] = c[2]; });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 3; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const parts = [SIG, chunk('IHDR', ihdr), chunk('PLTE', plte)];
  if (alpha && alpha.some((a) => a < 255)) parts.push(chunk('tRNS', Buffer.from(alpha)));
  parts.push(chunk('IDAT', pack(w, h, Buffer.from(indices), 1)), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

/** 全彩 PNG（colorType 6），光影过渡复杂的素材用。 */
export function encodeRGBA(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', pack(w, h, Buffer.from(rgba), 4)), chunk('IEND', Buffer.alloc(0))]);
}

/** 只读解析头信息：校验用，不解 IDAT。 */
export function parsePng(buf) {
  if (buf.length < 8 || buf[0] !== 137 || buf[1] !== 80 || buf[2] !== 78 || buf[3] !== 71) throw new Error('不是 PNG');
  let off = 8, out = { w: 0, h: 0, bitDepth: 0, colorType: -1, paletteSize: 0, hasTrns: false, chunks: [], crcOk: true };
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    // 每个块尾部 4 字节是 CRC(type+data)，逐块校验，坏图当场报出来
    if (off + 12 + len <= buf.length && buf.readUInt32BE(off + 8 + len) !== crc32(buf, off + 4, off + 8 + len)) out.crcOk = false;
    out.chunks.push(type);
    if (type === 'IHDR') {
      out.w = data.readUInt32BE(0); out.h = data.readUInt32BE(4);
      out.bitDepth = data[8]; out.colorType = data[9];
    } else if (type === 'PLTE') out.paletteSize = len / 3;
    else if (type === 'tRNS') out.hasTrns = true;
    off += 12 + len;
  }
  out.bytes = buf.length;
  return out;
}

/** 中位切分量化：把 RGBA 压到 <=maxColors 个索引（含 0 号透明位），alpha 也进调色板。 */
export function quantize(rgba, w, h, maxColors, alphaLevels) {
  const K = Math.max(2, maxColors || 64);
  const LV = Math.max(2, alphaLevels || 4);
  const levels = [];
  for (let i = 0; i < LV; i++) levels.push(Math.round((i * 255) / (LV - 1)));
  const nearestLevel = (a) => {
    let bi = 0, bd = 999;
    for (let i = 0; i < LV; i++) { const d = Math.abs(levels[i] - a); if (d < bd) { bd = d; bi = i; } }
    return bi;
  };
  const hist = new Map();
  const n = w * h;
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3];
    if (a < 20) continue;
    const key = (((rgba[i * 4] << 16) | (rgba[i * 4 + 1] << 8) | rgba[i * 4 + 2]) * 4) + nearestLevel(a);
    hist.set(key, (hist.get(key) || 0) + 1);
  }
  const entries = [];
  hist.forEach((count, key) => {
    const lv = key % 4;
    const rgb = (key - lv) / 4;
    entries.push({ r: (rgb >> 16) & 255, g: (rgb >> 8) & 255, b: rgb & 255, a: levels[lv], w: count });
  });
  entries.sort((p, q) => q.w - p.w);
  const boxOf = (list) => {
    let r0 = 255, r1 = 0, g0 = 255, g1 = 0, b0 = 255, b1 = 0, a0 = 255, a1 = 0;
    for (const e of list) {
      if (e.r < r0) r0 = e.r; if (e.r > r1) r1 = e.r;
      if (e.g < g0) g0 = e.g; if (e.g > g1) g1 = e.g;
      if (e.b < b0) b0 = e.b; if (e.b > b1) b1 = e.b;
      if (e.a < a0) a0 = e.a; if (e.a > a1) a1 = e.a;
    }
    return { list, ranges: [[r0, r1], [g0, g1], [b0, b1], [a0, a1]] };
  };
  let boxes = [boxOf(entries)];
  const target = K - 1;
  while (boxes.length < target) {
    let pick = -1, pickScore = -1;
    boxes.forEach((bx, i) => {
      if (bx.list.length < 2) return;
      let ch = 0, best = 0;
      bx.ranges.forEach((rg, ci) => { const s = (rg[1] - rg[0]) * (ci === 3 ? 1.6 : 1); if (s > best) { best = s; ch = ci; } });
      if (best <= 0) return;
      const score = best * Math.log(2 + bx.list.length);
      if (score > pickScore) { pickScore = score; pick = i; }
    });
    if (pick < 0) break;
    const bx = boxes[pick];
    let ch = 0, best = 0;
    bx.ranges.forEach((rg, ci) => { const s = (rg[1] - rg[0]) * (ci === 3 ? 1.6 : 1); if (s > best) { best = s; ch = ci; } });
    const field = ['r', 'g', 'b', 'a'][ch];
    bx.list.sort((p, q) => p[field] - q[field]);
    let acc = 0; const half = bx.list.reduce((s, e) => s + e.w, 0) / 2;
    let cut = 1;
    for (let i = 0; i < bx.list.length; i++) { acc += bx.list[i].w; if (acc >= half) { cut = Math.min(bx.list.length - 1, Math.max(1, i + 1)); break; } }
    const left = bx.list.slice(0, cut), right = bx.list.slice(cut);
    boxes.splice(pick, 1, boxOf(left), boxOf(right));
  }
  const palette = [[0, 0, 0]];
  const alpha = [0];
  const avgList = [];
  for (const bx of boxes) {
    let r = 0, g = 0, b = 0, a = 0, sw = 0;
    for (const e of bx.list) { r += e.r * e.w; g += e.g * e.w; b += e.b * e.w; a += e.a * e.w; sw += e.w; }
    if (!sw) continue;
    const col = [Math.round(r / sw), Math.round(g / sw), Math.round(b / sw)];
    avgList.push([col, Math.round(a / sw)]);
  }
  const dedup = new Map();
  for (const [col, a] of avgList) {
    const k = col[0] + ',' + col[1] + ',' + col[2] + ',' + a;
    if (dedup.has(k)) continue;
    dedup.set(k, palette.length);
    palette.push(col); alpha.push(a);
  }
  const cache = new Map();
  const indices = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3];
    if (a < 20) { indices[i] = 0; continue; }
    const lv = nearestLevel(a);
    const key = ((rgba[i * 4] >> 2) << 22) | ((rgba[i * 4 + 1] >> 2) << 14) | ((rgba[i * 4 + 2] >> 2) << 6) | (lv << 2);
    let idx = cache.get(key);
    if (idx === undefined) {
      let bd = Infinity;
      for (let p = 1; p < palette.length; p++) {
        const dr = palette[p][0] - rgba[i * 4], dg = palette[p][1] - rgba[i * 4 + 1], db = palette[p][2] - rgba[i * 4 + 2];
        const da = (alpha[p] - a) * 2.2;
        const d = dr * dr * 0.9 + dg * dg * 1.1 + db * db * 0.8 + da * da;
        if (d < bd) { bd = d; idx = p; }
      }
      idx = idx === undefined ? 1 : idx;
      cache.set(key, idx);
    }
    indices[i] = idx;
  }
  return { indices, palette, alpha };
}
