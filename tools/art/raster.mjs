/* tools/art/raster.mjs — 美术光栅工具：《残响协议》像素图用索引色 Pix，高清立绘用 2× 超采样 Img。无依赖。 */

/* ---------------- 索引色像素画布 ---------------- */

export class Pix {
  constructor(w, h, palette) {
    this.w = w; this.h = h;
    this.palette = palette || [[0, 0, 0]];
    this.alpha = this.palette.map(() => 255);
    this.d = new Uint8Array(w * h); // 索引 0 视为透明
  }
  /** 登记颜色，返回索引；同色复用，避免调色板膨胀。 */
  color(rgb, alpha) {
    const a = alpha === undefined ? 255 : alpha;
    for (let i = 1; i < this.palette.length; i++) {
      const p = this.palette[i], q = rgb;
      if (p[0] === q[0] && p[1] === q[1] && p[2] === q[2] && this.alpha[i] === a) return i;
    }
    this.palette.push([rgb[0], rgb[1], rgb[2]]);
    this.alpha.push(a);
    return this.palette.length - 1;
  }
  px(x, y, ci) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d[y * this.w + x] = ci;
  }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.d[y * this.w + x];
  }
  rect(x, y, w, h, ci) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, ci);
  }
  hline(x0, x1, y, ci) { for (let x = x0; x <= x1; x++) this.px(x, y, ci); }
  vline(x, y0, y1, ci) { for (let y = y0; y <= y1; y++) this.px(x, y, ci); }
  line(x0, y0, x1, y1, ci) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      this.px(x0, y0, ci);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }
  ellipse(cx, cy, rx, ry, ci, fill) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x - cx) / rx, ny = (y - cy) / ry;
        const d = nx * nx + ny * ny;
        if (d <= 1) {
          if (fill === false) {
            const ox = (x + 1 - cx) / rx, oy = (y + 0.5 - cy) / ry;
            const d2 = ((x - 1 - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
            const d3 = ((x - cx) / rx) ** 2 + ((y - 1 - cy) / ry) ** 2;
            const d4 = ((x - cx) / rx) ** 2 + ((y + 1 - cy) / ry) ** 2;
            if (Math.max(d2, d3, d4) > 1) this.px(x, y, ci);
          } else this.px(x, y, ci);
        }
      }
    }
  }
  /** 用一张字符模板把像素贴上去：'.' 跳过，其他字符查 map。 */
  stamp(rows, x0, y0, map, flipX) {
    const hh = rows.length;
    for (let j = 0; j < hh; j++) {
      const r = rows[j];
      for (let i = 0; i < r.length; i++) {
        const ch = r[i];
        if (ch === '.' || ch === ' ') continue;
        const ci = map[ch];
        if (!ci) continue;
        this.px(x0 + (flipX ? r.length - 1 - i : i), y0 + j, ci);
      }
    }
  }
  blit(src, dx, dy, flipX) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const ci = src.d[y * src.w + x];
        if (!ci) continue;
        this.px(dx + (flipX ? src.w - 1 - x : x), dy + y, ci);
      }
    }
  }
  /** 只保留描边：用于统一加深外轮廓，避免模板逐格手写。 */
  outline(ci, test) {
    const w = this.w, h = this.h, copy = this.d.slice();
    const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && copy[y * w + x] !== 0 && (!test || test(copy[y * w + x]));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (copy[y * w + x] !== 0) continue;
        if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) this.d[y * w + x] = ci;
      }
    }
  }
}

/** 确定性伪随机：美术生成必须可复现，禁止 Math.random。 */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17; s >>>= 0;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function mix(a, b, t) {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
}
export function darken(c, t) { return mix(c, [0, 0, 0], t); }
export function lighten(c, t) { return mix(c, [255, 255, 255], t); }

/* ---------------- 高清画布（超采样：先硬边光栅化，再降采样出抗锯齿） ---------------- */

export class Img {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.d = new Float32Array(w * h * 4); // 直通 alpha，0..1
  }
  idx(x, y) { return (y * this.w + x) * 4; }
  getA(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.d[(y * this.w + x) * 4 + 3];
  }
  blend(x, y, c, a) {
    if (a <= 0) return;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4, d = this.d;
    const da = d[i + 3];
    const oa = a + da * (1 - a);
    if (oa <= 0) return;
    d[i] = (c[0] * a + d[i] * da * (1 - a)) / oa;
    d[i + 1] = (c[1] * a + d[i + 1] * da * (1 - a)) / oa;
    d[i + 2] = (c[2] * a + d[i + 2] * da * (1 - a)) / oa;
    d[i + 3] = oa;
  }
  fillRect(x, y, w, h, c, a) {
    for (let j = Math.floor(y); j < y + h; j++) for (let i = Math.floor(x); i < x + w; i++) this.blend(i, j, c, a === undefined ? 1 : a);
  }
  clearRect(x, y, w, h) {
    for (let j = Math.floor(y); j < y + h; j++) for (let i = Math.floor(x); i < x + w; i++) {
      if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
      const k = (j * this.w + i) * 4;
      this.d[k] = this.d[k + 1] = this.d[k + 2] = this.d[k + 3] = 0;
    }
  }
  /** 扫描线多边形填充（偶奇规则），pts 为 [x,y] 数组。 */
  fillPoly(pts, c, a) {
    a = a === undefined ? 1 : a;
    if (pts.length < 3) return;
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
    const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(this.h - 1, Math.ceil(maxY));
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5;
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        if ((p[1] <= yc && q[1] > yc) || (q[1] <= yc && p[1] > yc)) {
          xs.push(p[0] + ((yc - p[1]) / (q[1] - p[1])) * (q[0] - p[0]));
        }
      }
      xs.sort((m, n) => m - n);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const xa = Math.max(0, Math.ceil(xs[i] - 0.5)), xb = Math.min(this.w - 1, Math.floor(xs[i + 1] - 0.5));
        for (let x = xa; x <= xb; x++) this.blend(x, y, c, a);
      }
    }
  }
  fillEllipse(cx, cy, rx, ry, c, a) {
    a = a === undefined ? 1 : a;
    const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(this.h - 1, Math.ceil(cy + ry));
    for (let y = y0; y <= y1; y++) {
      const t = (y + 0.5 - cy) / ry;
      if (Math.abs(t) > 1) continue;
      const half = rx * Math.sqrt(1 - t * t);
      const xa = Math.max(0, Math.ceil(cx - half - 0.5)), xb = Math.min(this.w - 1, Math.floor(cx + half - 0.5));
      for (let x = xa; x <= xb; x++) this.blend(x, y, c, a);
    }
  }
  /** 折线描边，round cap；用于发丝、轮廓线。 */
  stroke(pts, width, c, a) {
    a = a === undefined ? 1 : a;
    const r = width / 2;
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i], q = pts[i + 1];
      const dx = q[0] - p[0], dy = q[1] - p[1];
      const len = Math.hypot(dx, dy) || 1;
      const steps = Math.ceil(len);
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = p[0] + dx * t, y = p[1] + dy * t;
        if (width <= 1.2) this.fillRect(x - 0.5, y - 0.5, 1, 1, c, a);
        else this.fillEllipse(x, y, r, r, c, a);
      }
    }
  }
  /** 由 alpha 生成描边遮罩。 */
  silhouette() {
    const m = new Uint8Array(this.w * this.h);
    for (let i = 0; i < m.length; i++) m[i] = this.d[i * 4 + 3] > 0.35 ? 1 : 0;
    return m;
  }
  /** 沿轮廓向内收的硬描边（立绘用：贴一层比本体略大的深色剪影再做遮罩）。 */
  strokeSilhouette(width, c, a, onlyOutside) {
    const m = this.silhouette();
    const w = this.w, h = this.h;
    const out = [];
    const r = Math.ceil(width);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (m[y * w + x]) continue;
        let hit = false;
        for (let dy = -r; dy <= r && !hit; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const d2 = dx * dx + dy * dy;
            if (d2 > width * width) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            if (m[ny * w + nx]) { hit = true; break; }
          }
        }
        if (hit) out.push([x, y]);
      }
    }
    for (const [x, y] of out) if (!onlyOutside || !m[y * w + x]) this.blend(x, y, c, a);
  }
  /** 把剪影整体平移后画在下方，做投影/背光。 */
  shift(dx, dy) {
    const o = new Img(this.w, this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const s = ((y - dy) * this.w + (x - dx)) * 4;
        if (s < 0 || s + 3 >= this.d.length) continue;
        const t = (y * this.w + x) * 4;
        o.d[t] = this.d[s]; o.d[t + 1] = this.d[s + 1]; o.d[t + 2] = this.d[s + 2]; o.d[t + 3] = this.d[s + 3];
      }
    }
    return o;
  }
  /** base=dst, top=src；按 src alpha 覆盖。 */
  composite(top, gx, gy, mode) {
    for (let y = 0; y < top.h; y++) {
      for (let x = 0; x < top.w; x++) {
        const i = (y * top.w + x) * 4;
        const a = top.d[i + 3];
        if (a <= 0.001) continue;
        const tx = gx + x, ty = gy + y;
        if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) continue;
        if (mode === 'clip') {
          if (this.getA(tx, ty) < 0.5) continue;
        }
        this.blend(tx, ty, [top.d[i], top.d[i + 1], top.d[i + 2]], a);
      }
    }
  }
  /** 只在已有像素内画（裁剪到剪影），用于阴影与高光。 */
  paintMasked(fn) { fn(this); }
}

/** 盒式降采样：supersample 画布 → 目标尺寸，顺带得到抗锯齿边缘。 */
export function downsample(img, s, cw, ch) {
  const o = new Img(cw, ch);
  const inv = 1 / (s * s);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < s; j++) {
        for (let i = 0; i < s; i++) {
          const sx = x * s + i, sy = y * s + j;
          if (sx >= img.w || sy >= img.h) continue;
          const k = (sy * img.w + sx) * 4;
          const pa = img.d[k + 3];
          r += img.d[k] * pa; g += img.d[k + 1] * pa; b += img.d[k + 2] * pa; a += pa;
        }
      }
      const k = (y * cw + x) * 4;
      if (a > 0) { o.d[k] = r / a; o.d[k + 1] = g / a; o.d[k + 2] = b / a; }
      o.d[k + 3] = a * inv;
    }
  }
  return o;
}

export function toRGBA(img) {
  const out = new Uint8Array(img.w * img.h * 4);
  for (let i = 0; i < img.w * img.h; i++) {
    out[i * 4] = Math.max(0, Math.min(255, Math.round(img.d[i * 4])));
    out[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(img.d[i * 4 + 1])));
    out[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(img.d[i * 4 + 2])));
    out[i * 4 + 3] = Math.max(0, Math.min(255, Math.round(img.d[i * 4 + 3] * 255)));
  }
  return out;
}

/** 把多张图横向拼接（预览用）。 */
export function hstack(imgs, pad, bg) {
  const w = imgs.reduce((a, m) => a + m.w + pad, 0) - pad;
  const h = Math.max(...imgs.map((m) => m.h));
  const o = new Img(w, h);
  if (bg) o.fillRect(0, 0, w, h, bg, 1);
  let x = 0;
  for (const m of imgs) { o.composite(m, x, 0); x += m.w + pad; }
  return o;
}
