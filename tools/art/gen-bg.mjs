/* tools/art/gen-bg.mjs — 五张场景底图 bg_<map>.png（384×224，16px 图块，不含角色），首期用于远景/视差。
   直接读 world.js 的 ASCII 与 decor，保证底图与逻辑地图逐格一致；渲染后按场景光调色（不改变图块索引色）。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pix, Img, toRGBA, mix } from './raster.mjs';
import { encodeIndexed, encodeRGBA } from './png.mjs';
import { P, masterPalette } from './palette.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'web/game/assets/pixel');
const SHOTS = path.join(ROOT, 'docs/shots');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

/* ---- 载入 world.js（与 game-check.mjs 同法，只求值不写文件） ---- */
const win = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'web/game/data/world.js'), 'utf8'))(win);
const W = win.GameData.world;
const T = 16, CW = W.cols * T, CH = W.rows * T;

/* ---- 取图块绘制函数：与 gen-tiles.mjs 同源，避免两处各画一套 ---- */
const tilesMod = await import('./gen-tiles-core.mjs');
const tileDraw = tilesMod.default;
const PAL = masterPalette();

const canvas = (w, h) => {
  const p = new Pix(w, h, PAL.map((c) => c.slice()));
  p.alpha = PAL.map((c, i) => (i === 0 ? 0 : 255));
  return p;
};

const CHAR_TILE = {
  '.': 'ground', ',': 'ground_pattern', '#': 'wall', X: 'obstacle', T: 'tree',
  '~': 'water', '=': 'platform', s: 'ground_pattern', c: 'crate', D: 'door'
};
const DECOR_TILE = {
  'archive-cabinet': 'archive_cabinet', terminal: 'terminal', 'pillar-shadow': 'pillar_shadow',
  'dead-tree': 'tree_dead', shelf: 'shelf', 'seal-wax': 'seal_wax'
};
/* 场景光：只做整体色偏，不改图块本身（底图是远景层，不参与交互） */
const LIGHT = {
  dawn: { tint: [232, 226, 214], k: 0.16, vig: 0.10 },
  side: { tint: [214, 222, 236], k: 0.12, vig: 0.14 },
  dusk: { tint: [226, 190, 160], k: 0.18, vig: 0.16 },
  mist: { tint: [206, 226, 220], k: 0.20, vig: 0.10 },
  cold: { tint: [196, 210, 226], k: 0.14, vig: 0.18 }
};

const cache = new Map();
function tileFor(name) {
  if (!cache.has(name)) cache.set(name, tileDraw(name));
  return cache.get(name);
}

function renderMap(mapId, m) {
  const p = canvas(CW, CH);
  const put = (t, cx, cy) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const ci = t.get(x, y);
      if (!ci) continue;
      p.px(cx * T + x, cy * T + y, ci);
    }
  };
  // 底层
  for (let y = 0; y < W.rows; y++) {
    for (let x = 0; x < W.cols; x++) {
      const ch = m.ascii[y][x];
      let name = CHAR_TILE[ch] || 'ground';
      if (ch === '#') {
        const above = y > 0 ? m.ascii[y - 1][x] : '#';
        if (above !== '#') name = 'wall_top';
      }
      if (ch === '~') {
        const above = y > 0 ? m.ascii[y - 1][x] : '~';
        if (above !== '~') name = 'water_edge';
      }
      put(tileFor(name), x, y);
    }
  }
  // 装饰层
  for (const d of m.decor || []) {
    const name = DECOR_TILE[d.tile];
    if (!name) continue;
    put(tileFor(name), d.x, d.y);
  }
  // 交互点：地面已铺纹路地面，这里点一枚 2×2 的朱红提示（仅底图，UI 会另画）
  for (const it of m.interactables || []) {
    const cx = it.x * T, cy = it.y * T;
    p.px(cx + 7, cy + 13, P.red); p.px(cx + 8, cy + 13, P.gold);
  }
  return p;
}

/** 光调：整体混色 + 四角压暗；仍落在母版 24 色内（取最接近的母版色，保持索引色）。 */
function grade(p, light) {
  const cfg = LIGHT[light] || LIGHT.side;
  const w = p.w, h = p.h;
  const nearest = (rgb) => {
    let best = 1, bd = Infinity;
    for (let i = 1; i < p.palette.length; i++) {
      const c = p.palette[i];
      const d = (c[0] - rgb[0]) ** 2 + (c[1] - rgb[1]) ** 2 + (c[2] - rgb[2]) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  const map = new Map();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ci = p.get(x, y);
      if (!ci) continue;
      const c = p.palette[ci];
      const nx = (x / w - 0.5) * 2, ny = (y / h - 0.5) * 2;
      const vig = 1 - cfg.vig * Math.min(1, (nx * nx + ny * ny) * 0.55);
      const rgb = mix(c, cfg.tint, cfg.k);
      const shaded = [rgb[0] * vig, rgb[1] * vig, rgb[2] * vig];
      const key = ci + ':' + Math.round(vig * 20) + ':' + light;
      let ni = map.get(key);
      if (ni === undefined) { ni = nearest(shaded); map.set(key, ni); }
      p.px(x, y, ni);
    }
  }
  return p;
}

const results = [];
const previews = [];
for (const [id, m] of Object.entries(W.maps)) {
  const base = renderMap(id, m);
  const graded = grade(base, m.light);
  const buf = encodeIndexed(graded.w, graded.h, graded.d, graded.palette, graded.alpha);
  fs.writeFileSync(path.join(OUT, 'bg_' + id + '.png'), buf);
  results.push({ map: id, name: m.name, bytes: buf.length, palette: graded.palette.length });
  previews.push({ id, pix: graded });
}

// 预览：五张纵向 1× 拼接（只看构图），写入忽略目录
const pv = new Img(CW, (CH + 6) * previews.length, );
pv.fillRect(0, 0, pv.w, pv.h, [19, 22, 29], 1);
previews.forEach((item, i) => {
  const oy = i * (CH + 6);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const ci = item.pix.get(x, y);
    if (!ci) continue;
    pv.blend(x, oy + y, item.pix.palette[ci], 1);
  }
});
fs.writeFileSync(path.join(SHOTS, 'bg-preview.png'), encodeRGBA(pv.w, pv.h, toRGBA(pv)));

console.log(JSON.stringify(results, null, 2));
