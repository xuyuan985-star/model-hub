/* tools/art/gen-portrait.mjs — 高清立绘（非像素）：1024×1536，2× 超采样后降采样抗锯齿。
   只服务剧情对话与绝招演出，绝不进地图渲染路径（ART-SPEC §4）。
   构图公约：透明背景、人物占画布高 78%–86%、上边距 ≥8%、同角色差分头部像素级对齐。
   画法公约：所有角色共用一套骨架（AREA 常量），只换发式、外套、道具与配色；
   差分只改表情、道具状态与取景，所以同角色差分天然对齐。
   用法：node tools/art/gen-portrait.mjs [--only pt_xi] */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Img, mix } from './raster.mjs';
import { encodeIndexed, quantize as quantizeImpl } from './png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'web/game/assets/portrait');
const SHOTS = path.join(ROOT, 'docs/shots');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

const W = 1024, H = 1536, SS = 2;
const ARGV = process.argv.slice(2);
const ONLY = ARGV.includes('--only') ? ARGV[ARGV.indexOf('--only') + 1] : null;

/* 固定构图锚点：所有角色与差分共用（人物占高 82%、上边距 8.5%） */
export const ANCHOR = {
  headCx: 512, headTop: 124, headH: 392, eyeY: 372, chin: 516,
  shoulderY: 700, waistY: 1060, bustBottom: 1440
};
const A = ANCHOR;

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/* ---------------- 造型积木 ---------------- */

function bez(p0, p1, p2, p3, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
    ]);
  }
  return out;
}

function quadBez(p0, p1, p2, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
  }
  return out;
}

/** 只在已有像素内绘制（阴影、腮红、亮面），避免色块溢出剪影。 */
const clip = (img, shape) => {
  const tmp = new Img(img.w, img.h);
  shape(tmp);
  img.composite(tmp, 0, 0, 'clip');
};

/* ---------------- 角色配方 ---------------- */

const RECIPES = {
  /* 观测者：无性别，深灰蓝旧外套 + 立领 + 空白铭牌；右眼下折痕状浅疤。 */
  pt_observer: {
    kind: 'human',
    look: {
      coat: '#2B3A55', coatD: '#1A2436', coatL: '#3D5075', shirt: '#8FA6C4',
      skin: '#E9D6C4', skinD: '#CBAE96', skinL: '#F6E7D8',
      hair: '#1C2333', hairL: '#39445C', paper: '#F4F5F7', red: '#C5282F', gold: '#B68314'
    },
    hair: 'short', collar: 'high', badge: true, scar: true, rim: '#8FA6C4',
    build: { shoulder: 1.0, waist: 1.0, hem: 1.0, head: 1.0, neckY: 700, arms: 'down' },
    diffs: { default: {}, profile: { turn: 0.35, glance: 'down' } }
  },

  /* 汐（DeepSeek）：深蓝连帽外套，帽檐鲸尾，手捧扣盖的半碗白饭。 */
  pt_xi: {
    kind: 'human',
    look: {
      coat: '#2E6FA8', coatD: '#12324F', coatL: '#5E9ACB', shirt: '#C9D6E2',
      skin: '#F3E1CE', skinD: '#D2B49B', skinL: '#FBEEE2',
      hair: '#1E2A3C', hairL: '#3E5570', paper: '#F4F5F7', red: '#C5282F', gold: '#B68314',
      accent: '#C9D6E2'
    },
    hair: 'bob', hood: true, whaleTail: true, bowl: true, rim: '#5E9ACB', round: true,
    build: { shoulder: 1.04, waist: 1.10, hem: 1.12, head: 1.07, neckY: 742, arms: 'clasp' },
    diffs: { default: {}, frown: { brow: 'down', mouth: 'tight' } }
  },

  /* 瑾（Qwen）：蓝紫长发麻花辫，素面折扇，汉洋折衷长裙外罩短披。 */
  pt_jin: {
    kind: 'human',
    look: {
      coat: '#4E4E9E', coatD: '#2C2C62', coatL: '#7A7AC4', shirt: '#EFE6D8',
      skin: '#F3E2D2', skinD: '#D6BBA4', skinL: '#FBEDE1',
      hair: '#3A3480', hairL: '#6E66B8', paper: '#F4F5F7', red: '#C5282F', gold: '#B68314',
      accent: '#EFE6D8'
    },
    hair: 'braid', cloak: true, longSkirt: true, fan: true, rim: '#7A7AC4',
    build: { shoulder: 0.97, waist: 0.92, hem: 1.20, head: 0.98, neckY: 700, arms: 'fan' },
    diffs: { default: {}, fold: { fan: 'closed', mouth: 'tight' } }
  },

  /* 绢（Kimi）：银紫短发，肩上长绢，绢上墨点即分出去的子体。 */
  pt_juan: {
    kind: 'human',
    look: {
      coat: '#8A7EB0', coatD: '#5E5480', coatL: '#B3A8D6', shirt: '#E7E3F2',
      skin: '#EFE2EA', skinD: '#CDBECB', skinL: '#F9F1F7',
      hair: '#CFC6E4', hairL: '#EDE8F6', paper: '#E7E3F2', red: '#C5282F', gold: '#B68314',
      ink: '#13161D'
    },
    hair: 'shorthair', scroll: true, rim: '#B3A8D6',
    build: { shoulder: 0.99, waist: 0.95, hem: 0.99, head: 1.0, neckY: 700, arms: 'scroll' },
    diffs: { default: {}, unroll: { scroll: 'unroll' } }
  },

  /* 幕（Seedance）：胶片青短外套，腰后场记板，左眼取景框里永远是三秒后的画面。 */
  pt_mu: {
    kind: 'human',
    look: {
      coat: '#2E8B84', coatD: '#17544F', coatL: '#5CB3AB', shirt: '#191F2B',
      skin: '#EED9C6', skinD: '#CFB29B', skinL: '#FAEBDD',
      hair: '#183A38', hairL: '#2F615C', paper: '#F4F5F7', red: '#C5282F', gold: '#B68314',
      ink: '#191F2B'
    },
    hair: 'shorthair', clapper: true, rim: '#5CB3AB',
    build: { shoulder: 1.02, waist: 1.0, hem: 1.04, head: 1.0, neckY: 700, arms: 'hip' },
    diffs: { default: {}, frame: { viewfinder: true, turn: 0.12 } }
  },

  /* 楷（Claude）：暖橙短发，纸白立领外套，胸口花形火漆，每说一句就薄一层。 */
  pt_kai: {
    kind: 'human',
    look: {
      coat: '#E7E3DA', coatD: '#B9B3A6', coatL: '#F7F6F2', shirt: '#F4F5F7',
      skin: '#F2DFC8', skinD: '#D4B79C', skinL: '#FBEFE0',
      hair: '#C4663A', hairL: '#E08B57', paper: '#F4F5F7', red: '#C5282F', gold: '#B68314',
      rust: '#C4663A', ink: '#191F2B'
    },
    hair: 'swept', collar: 'high', seal: true, rim: '#F7F6F2',
    build: { shoulder: 1.07, waist: 0.99, hem: 1.03, head: 1.0, neckY: 700, arms: 'chest' },
    diffs: { default: {}, thin: { seal: 'thin' } }
  },

  /* 磐：围裙 + 七支螺丝刀，回放匠。 */
  pt_pan: {
    kind: 'human',
    look: {
      coat: '#6B5B4A', coatD: '#3C3228', coatL: '#8E7A64', shirt: '#C9B48A',
      skin: '#E3C9AC', skinD: '#C4A483', skinL: '#F2E0CB',
      hair: '#2B2F3A', hairL: '#4A5160', paper: '#F4F5F7', red: '#C5282F', gold: '#B68314',
      moss: '#4E6B4A', stone: '#8A8F99'
    },
    hair: 'buzz', apron: true, tools: true, rim: '#8E7A64', stout: true,
    build: { shoulder: 1.15, waist: 1.14, hem: 1.16, head: 1.05, neckY: 706, arms: 'tool' },
    diffs: { default: {}, stop: { mouth: 'tight', hand: 'stop' } }
  },

  /* 笺：抱册子的档案司。 */
  pt_jian: {
    kind: 'human',
    look: {
      coat: '#8A8F99', coatD: '#5E636C', coatL: '#B4B9C2', shirt: '#E7E3DA',
      skin: '#F0DDC9', skinD: '#D2B49A', skinL: '#FAEDE0',
      hair: '#22262F', hairL: '#3F4652', paper: '#E7E3DA', red: '#C5282F', gold: '#B68314',
      blue: '#2B5B8A'
    },
    hair: 'bun', book: true, rim: '#B4B9C2',
    build: { shoulder: 0.96, waist: 0.97, hem: 1.01, head: 1.0, neckY: 700, arms: 'book' },
    diffs: { default: {}, cover: { book: 'cover' } }
  },

  /* 吞页兽：横向构图的半身，三阶段各一张。 */
  pt_devourer: {
    kind: 'devourer',
    look: {
      ink: '#191F2B', plum: '#3A2E45', plumD: '#281F31', plumL: '#544065',
      paper: '#E7E3DA', paperD: '#C4BEB2', red: '#C5282F', redD: '#8E1D22',
      gold: '#B68314', glow: '#46C296'
    },
    diffs: { p1: { phase: 1 }, p2: { phase: 2 }, p3: { phase: 3 } }
  }
};

/* ---------------- 人形立绘 ---------------- */

/** 手臂姿态：袖形与手的位置按角色区分，是轮廓层面的差异。 */
function drawArms(img, P, R, px, s, sh, B) {
  const mode = B.arms || 'down';
  const coat = P.coat, coatL = P.coatL, coatD = P.coatD;
  const skin = P.skin, skinD = P.skinD;
  // 上臂：从肩点出发的两片袖子，所有姿态共用起点，末梢随姿态变
  const shoulderL = [sh(300), A.shoulderY + 40];
  const shoulderR = [sh(724), A.shoulderY + 40];
  const sleeve = (from, to, w, c) => {
    const pts = [];
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const tt = i / n;
      const x = from[0] + (to[0] - from[0]) * tt;
      const y = from[1] + (to[1] - from[1]) * tt;
      const r = (w / 2) * (1 + tt * 0.35);
      pts.push(px(x + r, y));
    }
    for (let i = n; i >= 0; i--) {
      const tt = i / n;
      const x = from[0] + (to[0] - from[0]) * tt;
      const y = from[1] + (to[1] - from[1]) * tt;
      const r = (w / 2) * (1 + tt * 0.35);
      pts.push(px(x - r, y));
    }
    img.fillPoly(pts, c, 1);
  };

  if (mode === 'clasp') {
    // 汐：两臂在身前捧碗（碗在 drawFigure 里画，这里只出手腕）
    sleeve(shoulderL, [400, 1090], 92, coat);
    sleeve(shoulderR, [624, 1090], 92, coat);
    img.fillEllipse(px(408, 1148)[0], px(408, 1148)[1], s(40), s(34), skin, 1);
    img.fillEllipse(px(616, 1148)[0], px(616, 1148)[1], s(40), s(34), skinD, 1);
  } else if (mode === 'fan') {
    // 瑾：左手抬到胸前持扇，右袖垂而宽
    sleeve(shoulderL, [430, 980], 84, coatL);
    sleeve(shoulderR, [712, 1160], 116, coatD);
    img.fillEllipse(px(438, 980)[0], px(438, 980)[1], s(34), s(30), skin, 1);
  } else if (mode === 'scroll') {
    // 绢：右手绕到肩后扶绢轴，左袖自然垂
    sleeve(shoulderL, [372, 1150], 88, coatL);
    sleeve(shoulderR, [706, 700], 84, coatD);
    img.fillEllipse(px(706, 690)[0], px(706, 690)[1], s(30), s(28), skinD, 1);
  } else if (mode === 'hip') {
    // 幕：左手按腰后场记板，右袖短而利落
    sleeve(shoulderL, [320, 1010], 82, coat);
    sleeve(shoulderR, [724, 1080], 88, coatD);
    img.fillEllipse(px(318, 1004)[0], px(318, 1004)[1], s(34), s(30), skin, 1);
  } else if (mode === 'chest') {
    // 楷：左手压在胸口火漆旁，右臂垂得笔直
    sleeve(shoulderL, [452, 860], 86, coatL);
    sleeve(shoulderR, [742, 1200], 92, coatD);
    img.fillEllipse(px(456, 852)[0], px(456, 852)[1], s(34), s(30), skin, 1);
  } else if (mode === 'tool') {
    // 磐：两臂都粗，右手插在围裙口袋
    sleeve(shoulderL, [286, 1120], 118, coat);
    sleeve(shoulderR, [748, 1120], 118, coatD);
    img.fillEllipse(px(292, 1112)[0], px(292, 1112)[1], s(42), s(36), skin, 1);
    img.fillEllipse(px(742, 1112)[0], px(742, 1112)[1], s(42), s(36), skinD, 1);
  } else if (mode === 'book') {
    // 笺：双臂在身前托册
    sleeve(shoulderL, [402, 1010], 84, coat);
    sleeve(shoulderR, [622, 1010], 84, coatD);
    img.fillEllipse(px(392, 1018)[0], px(392, 1018)[1], s(32), s(28), skin, 1);
    img.fillEllipse(px(632, 1018)[0], px(632, 1018)[1], s(32), s(28), skinD, 1);
  } else {
    // 观测者：双臂自然下垂，袖口略收
    sleeve(shoulderL, [268, 1230], 88, coatL);
    sleeve(shoulderR, [756, 1230], 88, coatD);
    img.fillEllipse(px(272, 1258)[0], px(272, 1258)[1], s(30), s(34), skin, 1);
    img.fillEllipse(px(752, 1258)[0], px(752, 1258)[1], s(30), s(34), skinD, 1);
  }
}


function drawFigure(R, diff, S) {
  const L = R.look;
  const P = {};
  for (const k of Object.keys(L)) P[k] = hex(L[k]);
  if (R.rim) P.rim = hex(R.rim);
  const img = new Img(W * S, H * S);
  const s = (v) => v * S;
  // 镜头倍率由配方决定（半身 key 用 cam），差分只改表情/道具，所以同 key 内头部必然对位。
  const z = R.cam || 1;
  const turn = diff.turn || 0;
  // 缩放锚点 = 头顶中心 (headCx, headTop)：头顶与中线在缩放前后不动，脸随 z 向下扩展。
  // 仅用 eyeY 作锚点会让头顶随 z 上移（z=1.2 时 140→74.4），不满足 ART-SPEC 的头部对齐要求。
  const T = (x, y) => [s(A.headCx + (x - A.headCx) * z), s(A.headTop + (y - A.headTop) * z)];
  const px = (x, y) => T(x, y);
  const halfW = (v) => s(v * z);


  /* 背部长发（先画，被身体压住） */
  if (R.hair === 'braid') {
    img.fillPoly([...bez(px(348, 320), px(290, 700), px(300, 1150), px(360, 1420), 30), ...bez(px(360, 1420), px(560, 1480), px(700, 1440), px(700, 1160), 30), ...bez(px(700, 1160), px(700, 700), px(660, 400), px(660, 320), 30)], P.hair, 1);
  }

  /* 躯干：梯形外套。宽度由 build 决定（肩/腰/摆三段），角色轮廓因此不同而不只是换色。 */
  const B = R.build || { shoulder: 1, waist: 1, hem: 1, head: 1, neckY: A.shoulderY };
  const bw = (v) => v;
  const sh = (v) => A.headCx + (v - A.headCx) * B.shoulder;
  const wa = (v) => A.headCx + (v - A.headCx) * B.waist;
  const hm = (v) => A.headCx + (v - A.headCx) * B.hem;

  /* 背景冷光：贴人物的一圈，不构成背景图 */
  img.fillEllipse(s(A.headCx), s(820), halfW(430), halfW(580), P.coatL, 0.09);
  const bodyPts = [
    ...bez(px(sh(300), A.shoulderY), px(wa(252), 900), px(wa(216), 1180), px(hm(200), A.bustBottom), 40),
    ...bez(px(hm(200), A.bustBottom), px(hm(420), 1476), px(hm(604), 1476), px(hm(824), A.bustBottom), 40),
    ...bez(px(hm(824), A.bustBottom), px(wa(808), 1180), px(wa(772), 900), px(sh(724), A.shoulderY), 40)
  ];
  img.fillPoly(bodyPts, P.coat, 1);

  /* 手臂：四套姿态（下垂/捧碗/持扇/按腰/护胸/持卷/托册），左右袖子轮廓随之不同。 */
  drawArms(img, P, R, px, s, sh, B);

  /* 长裙：下摆再加宽 */
  if (R.longSkirt) {
    img.fillPoly([...quadBez(px(bw(210), 1120), px(bw(150), 1330), px(bw(120), 1500), 30), ...quadBez(px(bw(120), 1500), px(bw(512), 1540), px(bw(904), 1500), 30), ...quadBez(px(bw(904), 1500), px(bw(874), 1330), px(bw(814), 1120), 30)], P.coatD, 1);
    img.stroke([px(bw(120), 1470), px(bw(512), 1508), px(bw(904), 1470)], s(6), P.gold, 0.5);
  }

  /* 衬衣 / 内衬 */
  img.fillPoly([
    ...quadBez(px(452, 690), px(512, 764), px(572, 690), 24),
    ...quadBez(px(572, 690), px(600, 900), px(590, 1050), 24),
    ...quadBez(px(590, 1050), px(512, 1092), px(434, 1050), 24),
    ...quadBez(px(434, 1050), px(424, 900), px(452, 690), 24)
  ], P.shirt, 1);

  /* 翻领 */
  img.fillPoly([...quadBez(px(452, 690), px(420, 820), px(470, 980), 16), ...quadBez(px(470, 980), px(500, 860), px(512, 764), 16), ...quadBez(px(512, 764), px(480, 720), px(452, 690), 16)], P.coatL, 1);
  img.fillPoly([...quadBez(px(572, 690), px(604, 820), px(554, 980), 16), ...quadBez(px(554, 980), px(524, 860), px(512, 764), 16), ...quadBez(px(512, 764), px(544, 720), px(572, 690), 16)], P.coatD, 1);

  /* 短披（瑾）：两片从肩垂下的外罩 */
  if (R.cloak) {
    img.fillPoly([px(bw(300), 690), px(bw(430), 700), px(bw(392), 1000), px(bw(236), 940)], P.coatD, 1);
    img.fillPoly([px(bw(724), 690), px(bw(594), 700), px(bw(632), 1000), px(bw(788), 940)], P.coatD, 1);
    img.stroke([px(bw(300), 694), px(bw(236), 936)], s(5), P.gold, 0.45);
    img.stroke([px(bw(724), 694), px(bw(788), 936)], s(5), P.gold, 0.45);
  }

  /* 围裙（磐） */
  if (R.apron) {
    img.fillPoly([px(bw(400), 880), px(bw(624), 880), px(bw(646), 1300), px(bw(378), 1300)], P.shirt, 1);
    img.stroke([px(bw(400), 884), px(bw(394), 1300)], s(6), P.moss, 0.6);
    img.stroke([px(bw(624), 884), px(bw(630), 1300)], s(6), P.moss, 0.6);
    img.stroke([px(bw(400), 1300), px(bw(646), 1300)], s(6), P.moss, 0.6);
    // 螺丝刀：围裙口袋里露出的几支
    for (let i = 0; i < 5; i++) {
      const x0 = 420 + i * 42;
      img.stroke([px(bw(x0), 902), px(bw(x0 + 6), 820)], s(11), P.stone, 1);
      img.stroke([px(bw(x0 + 6), 820), px(bw(x0 + 9), 800)], s(11), i % 2 ? P.gold : P.rust || P.gold, 1);
    }
  }

  /* 立领 / 领口 */
  if (R.collar === 'high') {
    img.fillPoly([...quadBez(px(424, 690), px(430, 590), px(470, 540), 20), ...quadBez(px(470, 540), px(512, 528), px(554, 540), 20), ...quadBez(px(554, 540), px(594, 590), px(600, 690), 20), ...quadBez(px(600, 690), px(512, 702), px(424, 690), 20)], P.coatD, 1);
    img.fillPoly([...quadBez(px(440, 686), px(444, 604), px(478, 556), 18), ...quadBez(px(478, 556), px(512, 546), px(546, 556), 18), ...quadBez(px(546, 556), px(580, 604), px(584, 686), 18), ...quadBez(px(584, 686), px(512, 694), px(440, 686), 18)], P.ink || P.coatD, 1);
  }

  /* 颈：高度由 build.neckY 决定（不同角色颈长不同，直接改变头部以下的衔接） */
  const neckY = B.neckY || 640;
  img.fillPoly([px(470, 470), px(554, 470), px(560, neckY), px(464, neckY)], P.skinD, 1);

  /* 头 */
  const headRx = (R.round ? 164 : 158) * (B.head || 1);
  const headRy = 196 * (B.head || 1);
  img.fillEllipse(px(512, 320)[0], px(512, 320)[1], halfW(headRx), halfW(headRy), P.skin, 1);
  img.fillPoly([px(374, 380), px(650, 380), px(620, 470), px(512, 514), px(404, 470)], P.skin, 1);
  img.fillEllipse(px(352, 356)[0], px(352, 356)[1], halfW(20), halfW(34), P.skinD, 1);
  img.fillEllipse(px(672, 356)[0], px(672, 356)[1], halfW(20), halfW(34), P.skinD, 1);
  clip(img, (t) => {
    t.fillPoly([px(512, 140), px(760, 240), px(700, 520), px(512, 540)], P.skinD, 0.3);
    t.fillEllipse(px(440, 330)[0], px(440, 330)[1], halfW(120), halfW(150), P.skinL, 0.22);
  });

  /* 五官：turn 直接改五官横向位置（转头），不再是被读取后丢弃的参数 */
  const eyeY = 372;
  const gaze = diff.gaze || 0;
  const turnPx = (diff.turn || 0) * 46;
  const TF = (x, y) => T(x + turnPx, y);
  drawFace(img, P, R, diff, TF, halfW, s, eyeY, gaze);

  /* 疤（观测者独有，两笔折痕） */
  if (R.scar) {
    img.stroke([px(586, 408), px(600, 424)], s(5), mix(P.skinD, P.ink || [25, 31, 43], 0.35), 0.75);
    img.stroke([px(602, 428), px(594, 442)], s(4), mix(P.skinD, P.ink || [25, 31, 43], 0.25), 0.6);
  }

  /* 头发（前层） */
  drawHair(img, P, R, T, s, halfW, z);

  /* 连帽（汐）：罩在头后的兜帽 + 帽檐鲸尾 */
  if (R.hood) {
    img.fillPoly([...bez(px(320, 360), px(300, 150), px(450, 96), px(512, 96), 26), ...bez(px(512, 96), px(580, 96), px(724, 150), px(704, 360), 26), ...bez(px(704, 360), px(700, 470), px(640, 520), px(600, 520), 20), ...bez(px(600, 520), px(636, 420), px(620, 300), px(560, 250), 20), ...bez(px(560, 250), px(520, 220), px(500, 220), px(464, 250), 20), ...bez(px(464, 250), px(404, 300), px(390, 420), px(424, 520), 20), ...bez(px(424, 520), px(384, 520), px(324, 470), px(320, 360), 20)], P.coat, 1);
    img.stroke([px(330, 380), px(360, 200), px(512, 130)], s(9), P.coatL, 0.7);
  }
  if (R.whaleTail) {
    // 帽檐右侧缝的鲸尾：两片尾鳍，自造轮廓
    img.fillPoly([px(690, 250), px(790, 168), px(806, 214), px(740, 292)], P.accent || P.paper, 1);
    img.fillPoly([px(690, 250), px(772, 322), px(812, 300), px(742, 236)], P.accent || P.paper, 1);
    img.stroke([px(700, 256), px(744, 240)], s(7), mix(P.accent || P.paper, P.coatD, 0.4), 0.8);
  }

  /* 扣盖的保温碗（汐）：碗身 + 盖扣，不露饭粒——文案是"用保温盖扣着" */
  if (R.bowl) {
    // 碗身（倒梯形）
    img.fillPoly([...quadBez(px(384, 1184), px(512, 1300), px(640, 1184), 24), px(646, 1176), px(378, 1176)], P.paper, 1);
    img.stroke([px(384, 1184), px(512, 1296), px(640, 1184)], s(6), mix(P.paper, P.coatD, 0.45), 0.9);
    // 扣盖：一个扁圆盘压在碗口，中央有提钮
    img.fillEllipse(px(512, 1170)[0], px(512, 1170)[1], halfW(150), halfW(38), P.accent || P.paper, 1);
    img.stroke([px(362, 1170), px(512, 1150), px(662, 1170)], s(7), mix(P.accent || P.paper, P.coatD, 0.55), 0.9);
    img.fillEllipse(px(512, 1136)[0], px(512, 1136)[1], halfW(26), halfW(16), mix(P.accent || P.paper, P.coatD, 0.25), 1);
    // 盖沿一圈细光
    img.stroke([px(372, 1178), px(512, 1204), px(652, 1178)], s(5), P.paper, 0.7);
  }

  /* 肩上长绢（绢）：越拉越长，墨点即子体 */
  if (R.scroll) {
    const long = diff.scroll === 'unroll';
    img.fillPoly([...bez(px(660, 640), px(740, 820), px(700, 1100), px(760, long ? 1500 : 1180), 26), ...bez(px(760, long ? 1500 : 1180), px(840, long ? 1520 : 1240), px(880, long ? 1460 : 1120), px(820, 980), 26), ...bez(px(820, 980), px(800, 800), px(740, 700), px(700, 640), 26)], P.paper, 1);
    img.stroke([px(700, 660), px(806, 1000)], s(5), mix(P.paper, P.plumD || P.hair, 0.35), 0.55);
    const dots = long ? 7 : 3;
    for (let i = 0; i < dots; i++) {
      const y = 760 + i * 96, x = 740 + (i % 2) * 40;
      img.fillEllipse(px(x, y)[0], px(x, y)[1], halfW(13), halfW(13), P.ink || [19, 22, 27], 1);
    }
  }

  /* 腰后场记板（幕） + 左眼取景框 */
  if (R.clapper) {
    img.fillPoly([px(bw(214), 940), px(bw(320), 928), px(bw(330), 1180), px(bw(224), 1192)], P.ink || [25, 31, 43], 1);
    img.fillPoly([px(bw(214), 940), px(bw(320), 928), px(bw(322), 966), px(bw(216), 978)], P.paper, 1);
    for (let i = 0; i < 4; i++) {
      img.stroke([px(bw(222 + i * 26), 946), px(bw(222 + i * 26), 972)], s(7), P.red, 0.9);
    }
    img.stroke([px(bw(222), 1000), px(bw(326), 990)], s(5), P.paper, 0.5);
  }
  if (diff.viewfinder) {
    img.stroke([px(560, 330), px(646, 330), px(646, 416), px(560, 416), px(560, 330)], s(9), P.ink || [25, 31, 43], 0.95);
    img.fillRect(px(560, 330)[0], px(560, 330)[1], halfW(86), halfW(86), P.coatL, 0.22);
    img.stroke([px(586, 352), px(620, 352), px(620, 394), px(586, 394), px(586, 352)], s(5), P.paper, 0.8);
  }

  /* 花形火漆（楷）：五瓣，差分里变薄 */
  if (R.seal) {
    const thin = diff.seal === 'thin';
    const r = thin ? 30 : 46;
    const cxS = 470, cyS = 900;
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 - Math.PI / 2;
      img.fillEllipse(px(cxS + Math.cos(ang) * r * 0.9, cyS + Math.sin(ang) * r * 0.9)[0], px(cxS + Math.cos(ang) * r * 0.9, cyS + Math.sin(ang) * r * 0.9)[1], halfW(r * 0.62), halfW(r * 0.62), P.rust || P.red, thin ? 0.72 : 1);
    }
    img.fillEllipse(px(cxS, cyS)[0], px(cxS, cyS)[1], halfW(r * 0.5), halfW(r * 0.5), mix(P.rust || P.red, [0, 0, 0], thin ? 0.45 : 0.25), 0.85);
  }

  /* 折扇（瑾）：合扇竖持 / 展开半遮 */
  if (R.fan) {
    const open = diff.fan === 'open';
    if (open) {
      for (let i = 0; i < 9; i++) {
        const ang = -0.9 + i * 0.22;
        img.stroke([px(660, 1080), px(660 + Math.cos(ang) * 300, 1080 + Math.sin(ang) * 300 - 60)], s(15), P.accent || P.paper, 1);
      }
      img.fillPoly([...quadBez(px(660, 1080), px(660, 800), px(920, 860), 26), ...quadBez(px(920, 860), px(880, 940), px(660, 1080), 26)], P.accent || P.paper, 0.92);
      img.stroke([px(660, 1080), px(880, 900)], s(9), P.gold, 0.9);
    } else {
      img.stroke([px(640, 1140), px(700, 900)], s(16), P.accent || P.paper, 1);
      img.stroke([px(676, 1030), px(702, 908)], s(7), P.gold, 0.9);
      img.fillEllipse(px(636, 1152)[0], px(636, 1152)[1], halfW(26), halfW(20), P.gold, 1);
    }
  }

  /* 抱册子（笺）：差分里抬起来遮口 */
  if (R.book) {
    const cover = diff.book === 'cover';
    const y0 = cover ? 620 : 900;
    img.fillPoly([px(300, y0 + 340), px(bw(724), y0 + 320), px(bw(730), y0 + 520), px(306, y0 + 540)], P.blue || P.paper, 1);
    img.fillPoly([px(300, y0 + 340), px(bw(724), y0 + 320), px(bw(724), y0 + 366), px(300, y0 + 386)], P.paper, 1);
    img.stroke([px(512, y0 + 330), px(514, y0 + 530)], s(7), P.paper, 0.9);
  }

  /* 左缘冷光（P.rim 由配方给出，未给则退回外套亮面）+ 右侧压深，把人物从透明底上托起来 */
  const rimMask = new Img(img.w, img.h);
  rimMask.composite(img, 0, 0);
  const rimC = P.rim || P.coatL;
  const rimLayer = new Img(img.w, img.h);
  rimLayer.composite(rimMask.shift(-s(7), -s(2)), 0, 0);
  rimLayer.paintMasked((m) => { /* 仅上色，几何来自剪影位移 */ });
  for (let i = 0; i < rimLayer.d.length; i += 4) {
    if (rimLayer.d[i + 3] > 0) { rimLayer.d[i] = rimC[0]; rimLayer.d[i + 1] = rimC[1]; rimLayer.d[i + 2] = rimC[2]; }
  }
  img.composite(rimLayer, 0, 0, 'clip');
  img.strokeSilhouette(s(5), P.ink || [25, 31, 43], 0.55);

  return img;
}

/** 五官：表情只动眉、眼睑、嘴，不移动头部。 */
function drawFace(img, P, R, diff, T, halfW, s, eyeY, gaze) {
  const ink = P.ink || [25, 31, 43];
  const browDown = diff.brow === 'down';
  const mouth = diff.mouth || 'neutral';
  const px = (x, y) => T(x, y);

  // 眉
  const by = browDown ? 330 : 316;
  img.stroke([px(430, by), px(470, by - 14), px(500, by - 6)], s(9), P.hair, 0.85);
  img.stroke([px(524, by - 6), px(556, by - 14), px(596, by)], s(9), P.hair, 0.85);

  const eye = (cx, w, lid) => {
    img.fillPoly([...quadBez(px(cx - w, eyeY), px(cx, eyeY - 26 + lid), px(cx + w, eyeY), 14), ...quadBez(px(cx + w, eyeY), px(cx, eyeY + 16), px(cx - w, eyeY), 14)], ink, 0.92);
    img.fillEllipse(px(cx + gaze, eyeY + 2)[0], px(cx + gaze, eyeY + 2)[1], halfW(16), halfW(20), P.hair, 1);
    img.fillEllipse(px(cx + 6 + gaze, eyeY - 4)[0], px(cx + 6 + gaze, eyeY - 4)[1], halfW(6), halfW(6), P.paper, 0.95);
    img.stroke([px(cx - w - 6, eyeY + 12), px(cx, eyeY + 22), px(cx + w + 6, eyeY + 12)], s(5), P.skinD, 0.7);
  };
  eye(462, 44, mouth === 'tight' ? 4 : 0);
  eye(566, 44, mouth === 'tight' ? 4 : 0);

  // 鼻
  img.stroke([px(508, 420), px(500, 452), px(516, 458)], s(6), P.skinD, 0.75);

  // 唇
  if (mouth === 'tight') {
    img.stroke([px(482, 492), px(512, 486), px(544, 492)], s(7), mix(P.skinD, P.red, 0.5), 0.9);
  } else {
    img.stroke([px(478, 486), px(512, 496), px(546, 486)], s(8), mix(P.skinD, P.red, 0.45), 0.85);
    img.fillEllipse(px(512, 486)[0], px(512, 486)[1], halfW(42), halfW(7), mix(P.skinD, P.red, 0.3), 0.32);
  }
}

/** 发式：六种，只改轮廓与分区，不改骨骼位置。 */
function drawHair(img, P, R, T, s, halfW, z) {
  const px = (x, y) => T(x, y);
  const style = R.hair;
  if (style === 'short') {
    img.fillPoly([
      ...bez(px(348, 300), px(330, 150), px(470, 108), px(512, 108), 30),
      ...bez(px(512, 108), px(600, 108), px(700, 160), px(676, 300), 30),
      ...quadBez(px(676, 300), px(668, 380), px(650, 420), 12),
      ...quadBez(px(650, 420), px(640, 330), px(600, 300), 12),
      ...quadBez(px(600, 300), px(570, 340), px(512, 336), 12),
      ...quadBez(px(512, 336), px(452, 342), px(420, 300), 12),
      ...quadBez(px(420, 300), px(382, 340), px(374, 420), 12),
      ...quadBez(px(374, 420), px(352, 380), px(348, 300), 12)
    ], P.hair, 1);
    strands(img, P, px, s, [400, 440, 480, 520, 560], 150, 290);
    img.fillPoly([px(352, 300), px(390, 300), px(396, 430), px(360, 410)], P.hair, 1);
    img.fillPoly([px(634, 300), px(672, 300), px(664, 410), px(628, 430)], P.hair, 1);
  } else if (style === 'bob') {
    img.fillPoly([...bez(px(352, 330), px(330, 140), px(470, 104), px(512, 104), 30), ...bez(px(512, 104), px(620, 104), px(704, 170), px(676, 340), 30), ...quadBez(px(676, 340), px(690, 470), px(650, 500), 16), ...quadBez(px(650, 500), px(628, 420), px(596, 360), 16), ...quadBez(px(596, 360), px(560, 330), px(512, 326), 16), ...quadBez(px(512, 326), px(452, 330), px(424, 366), 16), ...quadBez(px(424, 366), px(390, 424), px(372, 500), 16), ...quadBez(px(372, 500), px(336, 470), px(352, 330), 16)], P.hair, 1);
    strands(img, P, px, s, [396, 436, 476, 516, 556, 596], 140, 300);
  } else if (style === 'braid') {
    img.fillPoly([...bez(px(346, 320), px(324, 140), px(470, 100), px(512, 100), 30), ...bez(px(512, 100), px(610, 100), px(702, 160), px(680, 320), 30), ...quadBez(px(680, 320), px(676, 420), px(650, 470), 14), ...quadBez(px(650, 470), px(626, 380), px(596, 330), 14), ...quadBez(px(596, 330), px(556, 300), px(512, 296), 14), ...quadBez(px(512, 296), px(452, 300), px(420, 336), 14), ...quadBez(px(420, 336), px(384, 386), px(366, 470), 14), ...quadBez(px(366, 470), px(338, 420), px(346, 320), 14)], P.hair, 1);
    strands(img, P, px, s, [390, 430, 470, 510, 550, 590], 130, 300);
    // 右侧垂下的麻花辫（三段压叠）
    for (let i = 0; i < 4; i++) {
      const y = 460 + i * 96, x = 660 + (i % 2 ? 8 : -4);
      img.fillEllipse(px(x, y)[0], px(x, y)[1], halfW(44), halfW(40), P.hair, 1);
      img.stroke([px(x - 26, y - 12), px(x + 22, y - 22)], s(6), P.hairL, 0.6);
    }
    img.fillEllipse(px(668, 850)[0], px(668, 850)[1], halfW(30), halfW(22), P.gold, 1);
  } else if (style === 'shorthair') {
    img.fillPoly([...bez(px(352, 316), px(336, 150), px(470, 112), px(512, 112), 26), ...bez(px(512, 112), px(600, 112), px(696, 168), px(676, 316), 26), ...quadBez(px(676, 316), px(668, 390), px(648, 420), 12), ...quadBez(px(648, 420), px(628, 340), px(590, 306), 12), ...quadBez(px(590, 306), px(552, 276), px(512, 286), 12), ...quadBez(px(512, 286), px(462, 276), px(430, 306), 12), ...quadBez(px(430, 306), px(392, 346), px(374, 420), 12), ...quadBez(px(374, 420), px(354, 390), px(352, 316), 12)], P.hair, 1);
    strands(img, P, px, s, [404, 452, 500, 548, 596], 160, 292);
    img.fillPoly([px(356, 300), px(392, 306), px(398, 400), px(366, 386)], P.hair, 1);
  } else if (style === 'swept') {
    img.fillPoly([...bez(px(348, 300), px(330, 140), px(470, 100), px(512, 104), 28), ...bez(px(512, 104), px(626, 108), px(712, 150), px(690, 280), 28), ...quadBez(px(690, 280), px(672, 236), px(636, 214), 14), ...quadBez(px(636, 214), px(600, 262), px(540, 274), 14), ...quadBez(px(540, 274), px(500, 268), px(452, 290), 14), ...quadBez(px(452, 290), px(392, 320), px(372, 420), 14), ...quadBez(px(372, 420), px(350, 380), px(348, 300), 14)], P.hair, 1);
    strands(img, P, px, s, [392, 432, 472, 512, 552], 130, 280);
    // 翘起的一撮
    img.fillPoly([px(668, 214), px(724, 168), px(716, 214), px(686, 246)], P.hair, 1);
  } else if (style === 'buzz') {
    img.fillPoly([...bez(px(354, 320), px(342, 170), px(470, 128), px(512, 128), 24), ...bez(px(512, 128), px(594, 128), px(684, 176), px(672, 320), 24), ...quadBez(px(672, 320), px(640, 306), px(606, 300), 12), ...quadBez(px(606, 300), px(560, 292), px(512, 292), 12), ...quadBez(px(512, 292), px(462, 292), px(420, 300), 12), ...quadBez(px(420, 300), px(384, 308), px(354, 320), 12)], P.hair, 1);
  } else if (style === 'bun') {
    img.fillEllipse(px(512, 168)[0], px(512, 168)[1], halfW(74), halfW(62), P.hair, 1);
    img.stroke([px(470, 150), px(540, 138)], s(6), P.hairL, 0.6);
    img.fillPoly([...bez(px(356, 320), px(340, 170), px(470, 150), px(512, 150), 24), ...bez(px(512, 150), px(590, 150), px(682, 180), px(668, 320), 24), ...quadBez(px(668, 320), px(640, 306), px(600, 296), 12), ...quadBez(px(600, 296), px(556, 288), px(512, 288), 12), ...quadBez(px(512, 288), px(460, 288), px(420, 296), 12), ...quadBez(px(420, 296), px(380, 306), px(356, 320), 12)], P.hair, 1);
  }
}

/** 发丝：几束窄面，不做渐变（立绘也保留硬光习惯）。 */
function strands(img, P, px, s, xs, y0, y1) {
  for (const x0 of xs) {
    img.fillPoly([
      ...quadBez(px(x0, y0), px(x0 + 18, y0 + 40), px(x0 + 10, y1), 10),
      ...quadBez(px(x0 + 10, y1), px(x0 + 26, y0 + 50), px(x0 + 22, y0), 10)
    ], P.hairL, 0.5);
  }
}

/* ---------------- 吞页兽立绘 ---------------- */

function drawDevourer(R, diff, S) {
  const L = R.look;
  const P = {};
  for (const k of Object.keys(L)) P[k] = hex(L[k]);
  const img = new Img(W * S, H * S);
  const s = (v) => v * S;
  const phase = diff.phase || 1;
  const cx = 512, cy = 760;
  const hash = (x, y, k) => {
    let h = (x * 374761393 + y * 668265263 + k * 2147483647) >>> 0;
    h = (h ^ (h >>> 13)) * 1274126177 >>> 0;
    return (h >>> 8) / 16777216;
  };
  const R0 = 330, R1 = 250;
  for (let a = 0; a < 360; a += 1.2) {
    const rad = (a * Math.PI) / 180;
    const jag = (hash(Math.round(a * 3), phase, 11) - 0.5) * 46;
    const rx = R0 + jag, ry = R1 + jag * 0.7;
    for (let t = 0; t < 1; t += 0.01) {
      const x = cx + Math.cos(rad) * rx * t, y = cy + Math.sin(rad) * ry * t;
      let col;
      if (t > 0.9) col = phase === 3 ? P.glow : P.paperD;
      else if (t > 0.6) col = hash(Math.round(x / 8), Math.round(y / 8), phase) < 0.35 ? P.paper : P.plum;
      else col = hash(Math.round(x / 12), Math.round(y / 12), phase + 3) < 0.2 ? P.plumL : P.plumD;
      if (phase === 3 && t > 0.55 && hash(Math.round(x / 10), Math.round(y / 10), 5) < 0.3) col = P.glow;
      img.blend(s(x), s(y), col, 1);
    }
  }
  for (let i = 0; i < 9; i++) {
    const a0 = hash(i, phase, 21) * 360;
    const x0 = cx + Math.cos((a0 * Math.PI) / 180) * R0 * 0.75;
    const y0 = cy + Math.sin((a0 * Math.PI) / 180) * R1 * 0.75;
    img.stroke([[s(x0), s(y0)], [s(x0 + 60), s(y0 + 30)], [s(x0 + 110), s(y0 + 6)]], s(6), P.paperD, 0.5);
  }
  if (phase < 3) {
    img.fillEllipse(s(cx), s(cy + 80), s(150), s(90), P.ink, 1);
    img.fillEllipse(s(cx), s(cy + 60), s(118), s(62), P.redD, 1);
    img.fillEllipse(s(cx), s(cy + 50), s(96), s(44), [10, 8, 12], 1);
    for (let i = -5; i <= 5; i++) {
      const x = cx + i * 26;
      img.fillPoly([[s(x - 12), s(cy - 4)], [s(x), s(cy + 34)], [s(x + 12), s(cy - 4)]], P.paper, 1);
    }
    if (phase === 2) {
      for (let i = 0; i < 8; i++) {
        const x = cx - 220 + hash(i, 3, 33) * 440, y = cy + 240 + hash(i, 4, 34) * 120;
        img.fillPoly([[s(x), s(y)], [s(x + 46), s(y + 10)], [s(x + 38), s(y + 52)], [s(x - 6), s(y + 40)]], i % 2 ? P.paper : P.paperD, 1);
      }
    }
  } else {
    img.fillEllipse(s(cx), s(cy + 80), s(150), s(90), P.ink, 1);
    img.fillEllipse(s(cx), s(cy + 80), s(120), s(66), P.glow, 0.35);
  }
  img.fillEllipse(s(cx - 120), s(cy - 120), s(26), s(18), P.ink, 1);
  img.fillEllipse(s(cx + 120), s(cy - 120), s(26), s(18), P.ink, 1);
  img.fillEllipse(s(cx - 116), s(cy - 118), s(12), s(8), phase === 3 ? P.glow : P.red, 1);
  img.fillEllipse(s(cx + 124), s(cy - 118), s(12), s(8), phase === 3 ? P.glow : P.red, 1);
  if (phase < 3) {
    const rings = phase === 1 ? 2 : 1;
    for (let k = 0; k < rings; k++) {
      const rr = 0.78 - k * 0.12;
      for (let a = 0; a < 360; a += 2) {
        const rad = (a * Math.PI) / 180;
        img.fillEllipse(s(cx + Math.cos(rad) * R0 * rr), s(cy + Math.sin(rad) * R1 * rr), s(9), s(7), k === 0 ? P.paper : P.gold, 0.9);
      }
    }
  }
  img.strokeSilhouette(s(8), P.ink, 0.6);
  return img;
}

/* ---------------- 构图归一（ART-SPEC §4 立绘公约） ---------------- */

function bbox(img) {
  let top = img.h, bottom = -1, left = img.w, right = -1;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      // 阈值与验收脚本一致（alpha<32 视为透明）
      if (img.d[(y * img.w + x) * 4 + 3] > 0.125) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  return { top, bottom, left, right, h: bottom - top, w: right - left };
}

/** 半身特写（_bust）：只保证头顶留白一致，允许下半身出画；不做占高归一。 */
function fitBust(base, S, zoom) {
  const b = bbox(base);
  const k = (H * S * 0.82) / b.h * zoom;
  const dx = W * S / 2 - ((b.left + b.right) / 2) * k;
  const dy = H * S * 0.085 - b.top * k;
  return { k, dx, dy };
}

/** 以默认差分为基准算统一变换：占高 82%、上边距 8.5%、水平居中、最宽 92%。 */
function fitTransform(base, S) {
  const b = bbox(base);
  const targetH = H * S * 0.82;
  let k = targetH / b.h;
  const maxW = W * S * 0.92;
  if (b.w * k > maxW) k = maxW / b.w;
  const dx = W * S / 2 - ((b.left + b.right) / 2) * k;
  const dy = H * S * 0.085 - b.top * k;
  return { k, dx, dy };
}

function resample(img, f) {
  const o = new Img(img.w, img.h);
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const sx = (x - f.dx) / f.k, sy = (y - f.dy) / f.k;
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      if (x0 < 0 || y0 < 0 || x0 >= img.w - 1 || y0 >= img.h - 1) continue;
      const fx = sx - x0, fy = sy - y0;
      const ks = [(y0 * img.w + x0) * 4, (y0 * img.w + x0 + 1) * 4, ((y0 + 1) * img.w + x0) * 4, ((y0 + 1) * img.w + x0 + 1) * 4];
      const wa = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
      let r = 0, g = 0, b = 0, al = 0;
      for (let i = 0; i < 4; i++) {
        const pa = img.d[ks[i] + 3] * wa[i];
        r += img.d[ks[i]] * pa; g += img.d[ks[i] + 1] * pa; b += img.d[ks[i] + 2] * pa; al += pa;
      }
      const ko = (y * img.w + x) * 4;
      if (al > 1e-6) { o.d[ko] = r / al; o.d[ko + 1] = g / al; o.d[ko + 2] = b / al; }
      o.d[ko + 3] = al;
    }
  }
  return o;
}

function scaleAbout(img, px, py, k) {
  return resample(img, { k, dx: px - px / k, dy: py - py / k });
}

function shiftDown(img, dy) {
  const o = new Img(img.w, img.h);
  const rowLen = img.w * 4;
  for (let y = img.h - 1; y >= 0; y--) {
    const sy = y - dy;
    if (sy < 0) continue;
    o.d.set(img.d.subarray(sy * rowLen, sy * rowLen + rowLen), y * rowLen);
  }
  return o;
}

/** 兜住广场公约：上边距 ≥8%、人物占高 ≤86%（下界 78% 由 fitTransform 保证）。 */
function fitToSpec(img, S) {
  let cur = img;
  for (let i = 0; i < 4; i++) {
    const b = bbox(cur);
    const minTop = H * S * 0.08, maxBottom = H * S * 0.985, maxH = H * S * 0.86;
    if (b.h > maxH) { cur = scaleAbout(cur, (b.left + b.right) / 2, b.top, maxH / b.h); continue; }
    if (b.top < minTop) { cur = shiftDown(cur, Math.round(minTop - b.top)); continue; }
    if (b.bottom > maxBottom) { cur = scaleAbout(cur, (b.left + b.right) / 2, b.top, maxBottom / b.bottom); continue; }
    break;
  }
  return cur;
}

/* ---------------- 输出 ---------------- */

function draw(R, diff, S) {
  return R.kind === 'devourer' ? drawDevourer(R, diff, S) : drawFigure(R, diff, S);
}

function downsampleTo(img, w, h, S) {
  const o = new Img(w, h);
  const inv = 1 / (S * S);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < S; j++) {
        for (let i = 0; i < S; i++) {
          const k = ((y * S + j) * img.w + (x * S + i)) * 4;
          const pa = img.d[k + 3];
          r += img.d[k] * pa; g += img.d[k + 1] * pa; b += img.d[k + 2] * pa; a += pa;
        }
      }
      const k = (y * w + x) * 4;
      if (a > 0) { o.d[k] = r / a; o.d[k + 1] = g / a; o.d[k + 2] = b / a; }
      o.d[k + 3] = a * inv;
    }
  }
  return o;
}

function emit(key, R, diffId, diff, fit, bust) {
  const S = SS;
  const raw = draw(R, diff, S);
  const img = bust ? resample(raw, fit) : (fit ? fitToSpec(resample(raw, fit), S) : raw);
  const small = downsampleTo(img, W, H, S);
  const n = small.w * small.h;
  const px = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    px[i * 4] = small.d[i * 4]; px[i * 4 + 1] = small.d[i * 4 + 1]; px[i * 4 + 2] = small.d[i * 4 + 2];
    px[i * 4 + 3] = Math.round(small.d[i * 4 + 3] * 255);
  }
  // 立绘允许远比像素图宽的色域：256 色 + 8 档 alpha，柔和过渡不出现色带。
  const { indices, palette, alpha } = quantizeImpl(px, small.w, small.h, 256, 8);
  const file = key + (diffId === 'default' ? '' : '_' + diffId) + '.png';
  const buf = encodeIndexed(W, H, indices, palette, alpha);
  fs.writeFileSync(path.join(OUT, file), buf);
  const b = bbox(img);
  return {
    file, bytes: buf.length, colors: palette.length,
    topPct: +((b.top / (H * S)) * 100).toFixed(1),
    heightPct: +((b.h / (H * S)) * 100).toFixed(1)
  };
}

const out = [];
for (const [key, R] of Object.entries(RECIPES)) {
  if (ONLY && key !== ONLY) continue;
  const baseId = R.diffs.default ? 'default' : Object.keys(R.diffs)[0];
  const rawBase = draw(R, R.diffs[baseId], SS);
  const fit = R.kind === 'devourer' ? null : fitTransform(rawBase, SS);
  console.error(key + (fit ? ' fit k=' + fit.k.toFixed(4) : ' fit=none'));
  for (const [diffId, diff] of Object.entries(R.diffs)) {
    out.push({ key, diff: diffId, ...emit(key, R, diffId, diff, fit, false) });
  }
  // 半身特写：独立 key（<key>_bust），语义是"选项页/绝招特写用的另一张构图"，
  // 不替代默认立绘；只对齐头顶留白，允许下半身出画。
  if (R.kind === 'human') {
    const bustFit = fitBust(rawBase, SS, 1.42);
    out.push({ key: key + '_bust', diff: 'default', ...emit(key + '_bust', R, 'default', {}, bustFit, true) });
  }
}
console.log(JSON.stringify(out, null, 1));