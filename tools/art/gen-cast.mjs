/* tools/art/gen-cast.mjs — 像素角色精灵（16×24，4 向 × 4 帧）。
   帧序：列 = down,left,right,up；行 = idle,walk1,idle,walk2（共 16 帧）。
   索引色、无抗锯齿、外轮廓 1px 冷灰蓝描边（ART-SPEC §0/§1）。用法：node tools/art/gen-cast.mjs [--only pc_observer]

   剪影契约（ART-SPEC §1）：任意两人同帧剪影 IoU ≤0.90。因此每个角色都带一套自己的
   LAYOUT 几何（头宽/躯干长/下摆/腿位/手臂摆幅/外伸道具），配色只负责辨识，不负责区分剪影。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pix } from './raster.mjs';
import { encodeIndexed, encodeRGBA } from './png.mjs';
import { hexToRgb, masterPalette } from './palette.mjs';
import { OUTLINE_RGB, OUTLINE_HEX, DARK_BASES, contrastRatio } from './tokens.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'web/game/assets/pixel');
fs.mkdirSync(OUT, { recursive: true });
const ARGV = process.argv.slice(2);
const ONLY = ARGV.includes('--only') ? ARGV[ARGV.indexOf('--only') + 1] : null;

const FW = 16, FH = 24, COLS = 4, ROWS = 4;
const DIRS = ['down', 'left', 'right', 'up'];
const STEP = ['idle', 'walk1', 'idle', 'walk2'];
const CX = 8;

/* 角色表：配色按社区通行印象收敛（不做厂商 logo/吉祥物临摹），几何由 LAYOUT 决定。
   汐 DeepSeek 鲸鱼娘：蓝发 + 鳍状鲸耳 + 女仆围裙 + 保温盖扣碗。
   瑾 Qwen 文昭：墨蓝垂辫 + 汉襦裙 + 折扇，整体明度更低。
   绢 Kimi：银白长发 + 星夜长裙 + 怀抱短琴（第二道具，拉开剪影）。
   幕 Seedance：胶片青短外套 + 腰后场记板 + 取景框。
   楷 Claude：暖橙长发 + 暖棕外套 + 常驻书本。 */
const CAST = {
  /* 观测者：无性别，深灰蓝旧外套 + 空白铭牌，右眼下浅疤。 */
  pc_observer: {
    look: {
      body: '#2B3A55', bodyDark: '#1A2436', bodyLight: '#3D5075',
      skin: '#E9D6C4', skinDark: '#CBAE96', hair: '#1C2333', hairLight: '#39445C',
      accent: '#8FA6C4', paper: '#F4F5F7', scar: '#B99E8C'
    },
    layout: {
      headX0: 4, headX1: 11, headTop: 6, headBottom: 10,
      hairStyle: 'short', hairTop: 3,
      torsoX0: 3, torsoX1: 12, torsoY0: 11, torsoY1: 17,
      legs: [[4, 5], [9, 10]], legY0: 18,
      armL: 1, armR: 13, armY0: 11, armY1: 16,
      props: [{ x: 5, y: 13, w: 2, h: 2, c: 'paper' }],   // 空白铭牌
      details: ['collar', 'badge', 'scar']
    }
  },
  /* 汐：连帽外套 + 鳍状鲸耳（探出头部 2px）+ 荷叶边围裙 + 手捧扣盖碗。 */
  npc_xi: {
    look: {
      body: '#2E6FA8', bodyDark: '#173B5C', bodyLight: '#5E9ACB',
      skin: '#F0DCC8', skinDark: '#D2B49B', hair: '#3A5A8C', hairLight: '#648CC8',
      accent: '#C9D6E2', paper: '#F4F5F7', fin: '#A8D8F0'
    },
    layout: {
      headX0: 4, headX1: 11, headTop: 6, headBottom: 10,
      hairStyle: 'bob', hairTop: 3,
      hood: { x0: 3, x1: 12, y0: 4, y1: 7 },
      fins: true,
      torsoX0: 3, torsoX1: 12, torsoY0: 11, torsoY1: 16,
      skirtX0: 2, skirtX1: 13, skirtY0: 15, skirtY1: 19, skirtShape: 'bell',
      ruffle: true,
      legs: [[5, 6], [9, 10]], legY0: 18,
      armL: 2, armR: 13, armY0: 11, armY1: 16,
      props: [{ x: 5, y: 16, w: 6, h: 2, c: 'paper' }],   // 扣盖碗（16×24 上缩到 6×2 省边界）
      details: ['holdBowl']
    }
  },
  /* 瑾：墨蓝垂辫 + 窄肩 + 长垂袖 + 长裙 + 折扇（外伸 2px）。 */
  npc_jin: {
    look: {
      body: '#3C3A6E', bodyDark: '#22204A', bodyLight: '#5E5A96',
      skin: '#F3E2D2', skinDark: '#D6BBA4', hair: '#2A2852', hairLight: '#4C4A84',
      accent: '#EFE6D8', paper: '#E7E3DA', gold: '#B68314'
    },
    layout: {
      headX0: 5, headX1: 10, headTop: 6, headBottom: 10,
      hairStyle: 'braid', hairTop: 2, bunX0: 6, bunX1: 9, bunY0: 2, bunY1: 3,
      torsoX0: 4, torsoX1: 11, torsoY0: 11, torsoY1: 16,
      skirtX0: 3, skirtX1: 12, skirtY0: 15, skirtY1: 21, skirtShape: 'straight',
      legs: [[6, 7], [8, 9]], legY0: 19,
      armL: 2, armR: 12, armY0: 12, armY1: 18, longSleeve: true,
      props: [{ x: 13, y: 12, w: 2, h: 4, c: 'paper' }],  // 折扇（合扇，walk 不变）
      details: ['fan', 'braid']
    }
  },
  /* 绢：银白长发垂到腰 + 星夜长裙（下摆最宽）+ 怀抱短琴（外伸 3px）。 */
  npc_juan: {
    look: {
      body: '#8A7EB0', bodyDark: '#4E4670', bodyLight: '#B3A8D6',
      skin: '#EFE2EA', skinDark: '#CDBECB', hair: '#CFC6E4', hairLight: '#EDE8F6',
      accent: '#181848', paper: '#E7E3F2', ink: '#13161D', star: '#9090C0'
    },
    layout: {
      headX0: 4, headX1: 11, headTop: 6, headBottom: 10,
      hairStyle: 'longhair', hairTop: 3, hairLenY: 16,
      torsoX0: 3, torsoX1: 12, torsoY0: 11, torsoY1: 15,
      skirtX0: 1, skirtX1: 14, skirtY0: 14, skirtY1: 22, skirtShape: 'flare',
      legs: [[6, 7], [8, 9]], legY0: 22,
      armL: 2, armR: 12, armY0: 11, armY1: 15, armSwing: 'lateral',
      props: [{ x: 13, y: 13, w: 3, h: 3, c: 'accent' }, { x: 13, y: 12, w: 1, h: 1, c: 'star' }], // 短琴
      details: ['stars']
    }
  },
  /* 幕：胶片青短外套 + 腰后场记板（外伸 3px）+ 左眼取景框（外伸 2px）。 */
  npc_mu: {
    look: {
      body: '#2E8B84', bodyDark: '#17544F', bodyLight: '#5CB3AB',
      skin: '#EED9C6', skinDark: '#CFB29B', hair: '#183A38', hairLight: '#2F615C',
      accent: '#191F2B', paper: '#F4F5F7', red: '#C5282F'
    },
    layout: {
      headX0: 4, headX1: 11, headTop: 6, headBottom: 10,
      hairStyle: 'shorthair', hairTop: 4,
      torsoX0: 3, torsoX1: 12, torsoY0: 11, torsoY1: 16,
      legs: [[3, 4], [10, 11]], legY0: 17, legSplit: true,
      armL: 2, armR: 12, armY0: 11, armY1: 15,
      props: [
        { x: 1, y: 13, w: 3, h: 2, c: 'ink' },            // 场记板（左侧外伸）
        { x: 1, y: 13, w: 3, h: 1, c: 'paper' },
        { x: 12, y: 7, w: 2, h: 3, c: 'ink' }             // 取景框（右侧外伸）
      ],
      details: ['viewfinder', 'clapper']
    }
  },
  /* 楷：暖橙长发 + 暖棕外套 + 常驻书本（左侧外伸 2px）。 */
  npc_kai: {
    look: {
      body: '#907860', bodyDark: '#5E4A38', bodyLight: '#B79B7E',
      skin: '#F2DFC8', skinDark: '#D4B79C', hair: '#C4663A', hairLight: '#E08B57',
      accent: '#191F2B', paper: '#F4F5F7', rust: '#B4643C'
    },
    layout: {
      headX0: 4, headX1: 11, headTop: 6, headBottom: 10,
      hairStyle: 'swept', hairTop: 2, hairX1: 12,
      torsoX0: 4, torsoX1: 11, torsoY0: 11, torsoY1: 17,
      legs: [[4, 5], [9, 10]], legY0: 18,
      armL: 2, armR: 12, armY0: 12, armY1: 17,
      props: [{ x: 1, y: 12, w: 2, h: 4, c: 'paper' }],  // 书本（左侧外伸，整块纸白）
      details: ['collar', 'book', 'seal']
    }
  },
  /* 磐：围裙 + 螺丝刀，只做下/左两向（其余两向镜像或复用）。 */
  npc_pan: {
    look: {
      body: '#6B5B4A', bodyDark: '#3C3228', bodyLight: '#8E7A64',
      skin: '#E3C9AC', skinDark: '#C4A483', hair: '#2B2F3A', hairLight: '#4A5160',
      accent: '#C9B48A', paper: '#F4F5F7', moss: '#4E6B4A'
    },
    layout: {
      headX0: 4, headX1: 11, headTop: 6, headBottom: 10,
      hairStyle: 'buzz', hairTop: 4,
      torsoX0: 2, torsoX1: 13, torsoY0: 11, torsoY1: 17,
      legs: [[3, 4], [10, 11]], legY0: 18, legSplit: true,
      armL: 1, armR: 13, armY0: 11, armY1: 16, thickArm: true,
      props: [{ x: 6, y: 12, w: 4, h: 5, c: 'accent' }],  // 围裙
      details: ['apron', 'tool']
    }
  },
  /* 笺：抱册子，只做下/左两向。 */
  npc_jian: {
    look: {
      body: '#8A8F99', bodyDark: '#5E636C', bodyLight: '#B4B9C2',
      skin: '#F0DDC9', skinDark: '#D2B49A', hair: '#22262F', hairLight: '#3F4652',
      accent: '#2B5B8A', paper: '#E7E3DA', blue: '#2B5B8A'
    },
    layout: {
      headX0: 4, headX1: 11, headTop: 6, headBottom: 10,
      hairStyle: 'bun', hairTop: 4, bunX0: 6, bunX1: 9, bunY0: 3, bunY1: 4,
      torsoX0: 3, torsoX1: 12, torsoY0: 11, torsoY1: 17,
      legs: [[4, 5], [9, 10]], legY0: 18,
      armL: 1, armR: 13, armY0: 11, armY1: 16,
      props: [{ x: 3, y: 12, w: 10, h: 5, c: 'paper' }],  // 抱着的册子
      details: ['holdsBook']
    }
  }
};
const TWO_WAY = ['npc_pan', 'npc_jian'];

const hex = hexToRgb;
const MASTER_RGB = masterPalette();

/* 有阈值的最近色：加权 RGB 距离（人眼对绿最敏感），超阈值才吸附，并记录被替换的颜色。 */
const REPLACED = [];
function nearestMaster(rgb, weighted = true) {
  let bi = 1, bd = Infinity;
  for (let i = 1; i < MASTER_RGB.length; i++) {
    const m = MASTER_RGB[i];
    const dr = m[0] - rgb[0], dg = m[1] - rgb[1], db = m[2] - rgb[2];
    const d = weighted ? 2 * dr * dr + 4 * dg * dg + 3 * db * db : dr * dr + dg * dg + db * db;
    if (d < bd) { bd = d; bi = i; }
  }
  return { idx: bi, dist: Math.sqrt(bd) };
}

function frame(C, sheet, ox, oy) {
  const p = {
    px: (x, y, ci) => sheet.px(ox + x, oy + y, ci),
    rect: (x, y, w, h, ci) => sheet.rect(ox + x, oy + y, w, h, ci),
    hline: (x0, x1, y, ci) => sheet.hline(ox + x0, ox + x1, oy + y, ci),
    vline: (x, y0, y1, ci) => sheet.vline(ox + x, oy + y0, oy + y1, ci),
    get: (x, y) => sheet.get(ox + x, oy + y)
  };
  // 每张图集 ≤24 色（ART-SPEC §0）。母版缺肤色，允许专色占上限内空位；
  // 超出 24 色后按阈值吸附到最近母版色，并把被替换的色记进 REPLACED。
  const reg = (h) => {
    const rgb = hex(h);
    const used = sheet.palette.findIndex((c, i) => i > 0 && c[0] === rgb[0] && c[1] === rgb[1] && c[2] === rgb[2]);
    if (used > 0) return used;
    if (sheet.palette.length < 24) return sheet.color(rgb);
    const n = nearestMaster(rgb);
    REPLACED.push({ from: h, to: '#' + MASTER_RGB[n.idx].map((v) => v.toString(16).padStart(2, '0')).join(''), dist: +n.dist.toFixed(1) });
    return n.idx;
  };
  const K = {};
  for (const [k, v] of Object.entries(C.look)) K[k] = reg(v);
  K.ink = reg('#191F2B');
  K.outline = reg(OUTLINE_HEX);
  return { p, K };
}

/** 阴影/亮部：同一基色压暗或提亮一档，用母版里已有的冷色混合，避免灰阶噪点。 */
function shade(sheet, base, t, toward) {
  const b = sheet.palette[base];
  const m = sheet.palette[toward];
  return sheet.color([Math.round(b[0] + (m[0] - b[0]) * t), Math.round(b[1] + (m[1] - b[1]) * t), Math.round(b[2] + (m[2] - b[2]) * t)]);
}

/**
 * 按 LAYOUT 画一帧。所有几何来自角色自己的 layout，配色只上色，不决定外形。
 * 锚点＝脚底中心 x=8，脚在第 23 行。
 */
function drawFrame(p, K, sheet, L, C, dir, step) {
  const walk = step === 'walk1' || step === 'walk2';
  const ph = step === 'walk1' ? 1 : step === 'walk2' ? -1 : 0;
  const side = dir === 'left' || dir === 'right';
  const back = dir === 'up';
  const shift = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
  const skinBase = dir === 'up' ? K.hair : K.skin;

  /* ---- 后发：长发/垂辫先铺在身后，画在躯干之前，否则会盖住手臂 ---- */
  drawBackHair(p, K, L, dir);

  /* ---- 下摆（裙/长外套）：先画，被腿压住一部分 ---- */
  if (L.skirtX0 !== undefined) {
    for (let y = L.skirtY0; y <= L.skirtY1; y++) {
      const x0 = L.skirtX0, x1 = L.skirtX1;
      p.hline(x0, x1, y, K.body);
    }
    if (L.ruffle) {
      // 荷叶边只做剪影起伏（同色），不做色块——内部换色每帧多吃一圈异色对
      for (let x = L.skirtX0; x <= L.skirtX1; x += 3) p.px(x, L.skirtY1 + 1, K.body);
    }
  }

  /* ---- 腿与鞋 ---- */
  const legs = L.legs || [[5, 6], [9, 10]];
  const legY0 = L.legY0 || 18;
  const footY = 23;
  const liftA = walk ? (ph > 0 ? 1 : 0) : 0;
  const liftB = walk ? (ph > 0 ? 0 : 1) : 0;
  const drawLeg = (x0, x1, lift, darkFront) => {
    const top = legY0;
    const bottom = footY - lift;
    // 腿整条单色：前后腿靠位置与长度差区分，不再整条压暗（省一整条竖边界）
    for (let y = top; y < bottom; y++) {
      for (let x = x0; x <= x1 + 1; x++) p.px(x, y, K.body);
    }
    for (let x = x0; x <= x1 + 1; x++) p.px(x, bottom, K.ink);
    for (let x = x0; x <= x1 + (side ? 1 : 0); x++) p.px(x, footY - lift, K.ink);
  };
  if (side) {
    drawLeg(legs[0][0] + shift, legs[0][1] + shift, 0, false);
    drawLeg(legs[0][0] + shift + 1, legs[0][1] + shift + 1, liftA, false);
  } else {
    // 双腿并成一块：中间用 2px 暗缝分开，避免两条腿各带一圈描边
    const lx0 = legs[0][0], lx1 = legs[1][1];
    drawLeg(lx0, lx1 - 2, liftA, false);
    // 腿间缝隙交给鞋色断开，不再画整条暗缝
  }

  /* ---- 躯干：明暗按 ≥2px 色带排布（真块要求：同色相邻 ≥70%，单块 ≥2px） ---- */
  // 躯干整块单色：真块指标要求同色相邻 ≥70%，明暗只保留在配件与远侧肢体上
  p.rect(L.torsoX0, L.torsoY0, L.torsoX1 - L.torsoX0 + 1, L.torsoY1 - L.torsoY0 + 1, K.body);

  /* ---- 手臂：walk 摆臂 = 端点纵向 ±1px + 长度 ±1px + 横向 ±1px。
     三个分量都落在手臂带（y 7..15, x≤4 / x≥11）内，验收脚本能单独量到，不与腿部混淆。 */
  const armH = L.armY1 - L.armY0 + 1;
  const thick = L.thickArm ? 1 : 0;
  const drawArm = (x, y0, len, c) => {
    for (let y = y0; y < y0 + len; y++) {
      for (let i = 0; i <= thick + 1; i++) p.px(x + i, y, c);
    }
    // 袖口即手：17px 高度上再塞 skin 小块会白吃一圈边界对
  };
  if (side) {
    // 侧向：离镜头近的手臂在前，另一条只露袖口，靠明暗与长度区分前后
    drawArm(L.armL + shift, L.armY0, armH, K.body);
    drawArm(L.armR + shift, L.armY0 + 1, armH - 1, K.body);
  } else if (walk) {
    // 前摆：肩不动、腕抬高 1px 且外扩 1px，臂短 1px；后摆：腕下沉 1px，臂长 1px
    const fwdL = ph > 0;
    // 摆臂默认只走纵向：横向 ±1 会在侧腹挖出一格空位，凭空造出 4 对异色邻接。
    // 短袖角色（绢）纵向幅度不够 8px 验收线，才退回横向摆臂。
    const lat = L.armSwing === 'lateral' ? 1 : 0;
    drawArm(L.armL - (fwdL ? lat : 0), L.armY0 + (fwdL ? 1 : 0), armH - (fwdL ? 2 : 0), K.body);
    drawArm(L.armR + (fwdL ? 0 : lat), L.armY0 + (fwdL ? 1 : 0), armH + (fwdL ? 0 : 2), K.body);
  } else {
    drawArm(L.armL, L.armY0, armH, K.body);
    drawArm(L.armR, L.armY0, armH, K.body);
  }

  /* ---- 颈 ---- */
  const neckX = Math.round((L.headX0 + L.headX1) / 2) - 1;
  p.rect(neckX, L.headBottom + 1, 2, Math.max(0, L.torsoY0 - L.headBottom - 1), K.skin);

  /* ---- 头 ---- */
  for (let y = L.headTop; y <= L.headBottom; y++) p.hline(L.headX0, L.headX1, y, skinBase);


  /* ---- 五官 ---- */
  const eyeY = L.headTop + 2;
  if (!side && !back) {
    p.px(L.headX0 + 2, eyeY, K.ink);
    p.px(L.headX1 - 1, eyeY, K.ink);
    if (C.layout.details && C.layout.details.includes('scar')) p.px(L.headX1 - 1, eyeY + 1, K.scar || K.skinDark);
  } else if (side) {
    p.px(dir === 'left' ? L.headX0 + 2 : L.headX1 - 2, eyeY, K.ink);
  }

  drawHair(p, K, L, dir, walk, ph);
  drawDetails(p, K, L, C, dir, walk, ph);

  /* ---- 外伸道具（剪影主力） ---- */
  for (const pr of L.props || []) {
    p.rect(pr.x, pr.y, pr.w, pr.h, K[pr.c] !== undefined ? K[pr.c] : K.paper);
  }
}

/** 身后长发/垂辫：必须在躯干之前画，才不会盖掉手臂与腰带。 */
function drawBackHair(p, K, L, dir) {
  const back = dir === 'up';
  const style = L.hairStyle || 'short';
  const x0 = L.headX0, x1 = L.headX1;
  if (style === 'longhair') {
    const len = L.hairLenY || L.headTop + 8;
    p.rect(x0 - 1, L.headTop, 2, len - L.headTop, K.hair);
    p.rect(x1, L.headTop, 2, len - L.headTop, K.hair);
    p.vline(x0 - 1, L.headTop, len, K.hairLight);
    if (back) p.rect(x0, L.headTop, x1 - x0 + 1, len - L.headTop, K.hair);
  } else if (style === 'braid') {
    // 垂辫：一条 2px 宽的长辫垂到腰侧
    const len = L.hairLenY || L.headTop + 10;
    if (!back) {
      p.rect(x0 - 1, L.headTop, 2, len - L.headTop, K.hair);
      p.px(x0, L.headTop + 3, K.hairLight);
      p.px(x0 - 1, L.headTop + 6, K.hairLight);
    }
  }
}

function drawHair(p, K, L, dir, walk, ph) {
  const back = dir === 'up';
  const top = L.hairTop === undefined ? L.headTop - 2 : L.hairTop;
  const x0 = L.headX0, x1 = L.headX1;
  const style = L.hairStyle || 'short';
  p.rect(x0, top, x1 - x0 + 1, L.headTop - top + 1, K.hair);
  // 高光贴在发顶轮廓内侧（不与身体色相邻，只与描边相邻，零额外异色对）
  p.hline(x0 + 1, x0 + 2, top, K.hairLight);
  p.hline(x1 - 2, x1 - 1, top, K.hairLight);
  if (style === 'bob') {
    p.vline(x0 - 1, L.headTop, L.headTop + 4, K.hair);
    p.vline(x1 + 1, L.headTop, L.headTop + 4, K.hair);
  } else if (style === 'braid') {
    p.vline(x0 - 1, L.headTop, L.headTop + 2, K.hair);
    p.vline(x1 + 1, L.headTop, L.headTop + 2, K.hair);
    if (!back) { p.rect(x1 - 1, L.headTop + 3, 2, 6, K.hair); p.px(x1, L.headTop + 5, K.hairLight); }
  } else if (style === 'longhair') {
    // 长发主体在 drawBackHair 里已铺好，这里只补额前两缕
    p.px(x0, L.headTop, K.hairLight);
    p.px(x1, L.headTop, K.hairLight);
  } else if (style === 'swept') {
    p.px(x1 + 1, top, K.hair); p.px(x1 + 1, top + 1, K.hairLight);
    p.vline(x0 - 1, L.headTop, L.headTop + 3, K.hair);
    p.vline(x1 + 1, L.headTop, L.headTop + 3, K.hair);
  } else if (style === 'bun') {
    const bx0 = L.bunX0 ?? x0 + 2, bx1 = L.bunX1 ?? x1 - 1;
    const by0 = L.bunY0 ?? top - 1, by1 = L.bunY1 ?? top;
    for (let y = by0; y <= by1; y++) p.hline(bx0, bx1, y, K.hair);
    p.px(bx0 + 1, by0, K.hairLight);
  } else if (style === 'buzz') {
    // 短到只盖住头顶两行
  } else if (style === 'shorthair') {
    p.px(x0 - 1, L.headTop + 1, K.hair);
    p.px(x1 + 1, L.headTop + 1, K.hair);
  }
}

function drawDetails(p, K, L, C, dir, walk, ph) {
  const d = L.details || [];
  const side = dir === 'left' || dir === 'right';
  const back = dir === 'up';
  /* 连帽（汐）+ 鳍状鲸耳：侧向时向后探出 2px，正面左右各探出 2px */
  if (L.hood) {
    const hd = L.hood;
    // 兜帽整块单色：内侧不再勾亮边/暗边，明暗交给与描边的接触面
    p.rect(hd.x0, hd.y0, hd.x1 - hd.x0 + 1, hd.y1 - hd.y0 + 1, K.body);
  }
  if (L.fins && !back) {
    // 鲸耳：鲸类鳍状耳（不是猫耳）——横向探出头部轮廓 2px，2×2 块
    p.rect(L.headX0 - 2, L.headTop + 2, 2, 2, K.fin);
    p.rect(L.headX1 + 1, L.headTop + 2, 2, 2, K.fin);
  }
  /* 立领 */
  if (d.includes('collar')) {
    const cm = Math.round((L.headX0 + L.headX1) / 2);
    p.hline(cm - 2, cm + 1, L.headBottom + 1, K.bodyDark);
  }
  /* 荷叶边围裙（汐） */

  /* 折扇（瑾）：开合状态由差分决定，walk 全程保持合扇 */
  if (d.includes('fan')) {
    p.rect(13, 12, 2, 5, K.paper);   // 合扇：整条纸白，不勾扇钉
  }
  /* 火漆（楷） */
  if (d.includes('seal')) {
    p.rect(L.torsoX0 + 2, L.torsoY0 + 2, 2, 2, K.rust || K.bodyDark);
  }
  /* 围裙（磐） */
  if (d.includes('apron')) {
    p.rect(L.torsoX0 + 2, L.torsoY0 + 1, L.torsoX1 - L.torsoX0 - 3, 6, K.accent);
    p.rect(L.torsoX0 + 2, L.torsoY0 + 1, 2, 2, K.moss);
  }
  /* 抱册子（笺） */
  if (d.includes('holdsBook')) {
    p.rect(3, 12, 10, 5, K.paper);
    p.rect(4, 13, 2, 2, K.blue);
  }
}

/** 图集统一外轮廓（冷灰蓝，与深色底对比 ≥2.5:1）：整张画好后一次做，避免帧间互相描边。 */
function outlineSheet(sheet) {
  const ci = sheet.color(OUTLINE_RGB);
  sheet.outline(ci);
  return ci;
}

const out = [];
for (const [id, C] of Object.entries(CAST)) {
  if (ONLY && id !== ONLY) continue;
  // 从空调色板起（只留 0 号透明位），专色最多占到 24 色；满后才按阈值吸附母版色。
  const sheet = new Pix(FW * COLS, FH * ROWS, [[0, 0, 0]]);
  sheet.alpha[0] = 0;
  sheet.color(OUTLINE_RGB); // 0 号之后第一色固定为外轮廓，确保每张图轮廓一致
  const L = C.layout;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const dir = DIRS[c];
      const step = STEP[r];
      const { p, K } = frame(C, sheet, c * FW, r * FH);
      drawFrame(p, K, sheet, L, C, dir, step);
    }
  }
  outlineSheet(sheet);
  const buf = encodeIndexed(sheet.w, sheet.h, sheet.d, sheet.palette, sheet.alpha);
  const file = id + '.png';
  fs.writeFileSync(path.join(OUT, file), buf);
  const dirs = TWO_WAY.includes(id) ? 2 : 4;
  out.push({ id, file, w: sheet.w, h: sheet.h, frames: 16, dirs, colors: sheet.palette.length, bytes: buf.length });
}
console.log(JSON.stringify({ files: out, outline: OUTLINE_HEX, outlineContrast: DARK_BASES.map((b) => ({ base: b.name, ratio: contrastRatio(OUTLINE_RGB, b.rgb) })), replaced: REPLACED }, null, 2));