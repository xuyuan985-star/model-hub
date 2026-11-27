/* tools/art/gen-enemy.mjs — 普通敌人像素图：32×32 单帧（不透明索引色 PNG-8）。
   现有 5 个敌人只有 boss 有图，其它全在战斗界面显示成字母占位块；
   这里补齐 4 个杂兵，每张 16 色以内、硬边、1px 墨色描边，与 boss/角色同一套规范。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pix } from './raster.mjs';
import { encodeIndexed } from './png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'web/game/assets/pixel');

const W = 32, H = 32;
const INK = [25, 31, 43];

/** 每个敌人一套 8–10 色：0 透明 / 1 描边 / 其余本体。 */
const ENEMIES = {
  page_mite: {
    palette() {
      return [[0, 0, 0], INK,
        [231, 227, 218],   // paper
        [196, 190, 178],   // paper dim
        [148, 143, 133],   // paper shadow
        [197, 40, 47],     // red (眼)
        [182, 131, 20]];   // gold (牙)
    },
    draw(p, C) {
      // 一叠被啃掉边角的纸页：下宽上窄的梯形，右侧参差
      for (let y = 8; y < 30; y++) {
        const t = (y - 8) / 22;
        const left = 9 + Math.round(t * 4);
        const right = 23 - Math.round(t * 2);
        for (let x = left; x <= right; x++) {
          let ci = C.paper;
          if (y > 26 || (x > right - 3 && y > 18)) ci = C.paperDim;
          if (y > 28) ci = C.paperShade;
          if ((x * 7 + y * 13) % 23 === 0) ci = C.paperDim;   // 纸纤维
          p.px(x, y, ci);
        }
      }
      // 锯齿状的下缘（被啃过）
      for (let x = 13; x < 22; x += 2) p.px(x, 30, C.paperShade);
      // 右上一小块翘起的页角
      for (let i = 0; i < 5; i++) for (let j = 0; j <= i; j++) p.px(24 + j, 10 + i, C.paperDim);
      // 两只眼
      p.px(14, 15, C.red); p.px(15, 15, C.red);
      p.px(20, 15, C.red); p.px(21, 15, C.red);
      p.px(14, 14, C.paperShade); p.px(20, 14, C.paperShade);
      // 一排小金牙
      for (let x = 15; x <= 20; x += 2) p.px(x, 19, C.gold);
      // 两侧翻卷的页边
      for (let y = 12; y < 24; y += 3) { p.px(7, y, C.paperDim); p.px(8, y + 1, C.paperDim); }
    }
  },

  faded_photo: {
    palette() {
      return [[0, 0, 0], INK,
        [186, 196, 210],   // 淡蓝纸
        [143, 154, 171],   // 暗
        [215, 222, 232],   // 亮
        [90, 100, 118]];   // 最暗
    },
    draw(p, C) {
      // 一张被雨淋淡的旧快照：正方形，四边有白色相纸边，中间人脸已经糊掉
      for (let y = 6; y < 28; y++) {
        for (let x = 7; x < 26; x++) {
          const edge = (x < 9 || x > 23 || y < 8 || y > 25);
          if (edge) { p.px(x, y, C.light); continue; }
          const n = ((x * 31 + y * 17) % 11);
          p.px(x, y, n < 4 ? C.mid : (n < 8 ? C.dark : C.darkest));
        }
      }
      // 中央一个已经看不清的人影
      for (let y = 11; y < 22; y++) {
        const r = 4 - Math.abs(y - 16) / 3;
        for (let x = Math.round(16 - r); x <= Math.round(16 + r); x++) p.px(x, y, C.darkest);
      }
      // 左下角一处水渍
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) p.px(9 + i, 22 + j, C.light);
      // 右上角缺了一角
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4 - i; j++) p.px(23 + i, 6 + j, 0);
    }
  },

  cache_moth: {
    palette() {
      return [[0, 0, 0], INK,
        [102, 94, 120],    // 灰紫翅
        [70, 63, 86],      // 翅暗
        [139, 129, 158],   // 翅亮
        [231, 227, 218],   // 纸白
        [197, 40, 47]];    // 红眼点
    },
    draw(p, C) {
      // 上翅一对（三角）+ 下翅一对（小三角），中间一截纸筒身体——飞蛾的剪影要"两头宽中间细"
      var cx = 16;
      // 上翅
      for (let y = 7; y < 17; y++) {
        const span = 3 + Math.round((y - 7) * 0.85);
        for (let x = cx - span; x < cx - 1; x++) {
          const far = x < cx - span + 3;
          p.px(x, y, far ? C.wingDark : (y % 4 === 0 ? C.wingLight : C.wing));
        }
        for (let x = cx + 2; x <= cx + span; x++) {
          const far = x > cx + span - 3;
          p.px(x, y, far ? C.wingDark : (y % 4 === 0 ? C.wingLight : C.wing));
        }
      }
      // 下翅（更短，向后收）
      for (let y = 17; y < 24; y++) {
        const span = 7 - Math.round((y - 17) * 0.6);
        for (let x = cx - span; x < cx - 1; x++) p.px(x, y, x < cx - span + 2 ? C.wingDark : C.wing);
        for (let x = cx + 2; x <= cx + span; x++) p.px(x, y, x > cx + span - 2 ? C.wingDark : C.wing);
      }
      // 纸筒身体：竖条，顶端稍宽
      for (let y = 11; y < 26; y++) { p.px(cx - 1, y, C.paper); p.px(cx, y, C.paper); p.px(cx + 1, y, C.paperDim || C.paper); }
      p.rect(cx - 2, 10, 5, 3, C.paper);
      // 翅上的纸屑斑（2×2 块，读起来是"贴了纸屑"）
      [[9, 12], [21, 12], [10, 19], [20, 19]].forEach(function (q) {
        p.rect(q[0], q[1], 2, 2, C.paper);
      });
      // 触角：两根分叉
      p.px(cx - 2, 9, INK); p.px(cx - 3, 8, INK); p.px(cx - 4, 7, INK);
      p.px(cx + 2, 9, INK); p.px(cx + 3, 8, INK); p.px(cx + 4, 7, INK);
      // 一对红眼
      p.px(cx - 2, 11, C.red); p.px(cx + 2, 11, C.red);
    }
  },

  rank_auditor: {
    palette() {
      return [[0, 0, 0], INK,
        [58, 66, 82],      // 深蓝灰袍
        [38, 44, 57],      // 袍暗
        [96, 106, 126],    // 袍亮
        [231, 227, 218],   // 纸
        [182, 131, 20],    // 金
        [197, 40, 47]];    // 朱
    },
    draw(p, C) {
      // 一个没有脸的审计员：兜帽罩住头、长袍下摆张开、左手抱册子、右手举一枚朱印
      var cx = 16;
      // 长袍：从肩到下摆逐渐张开，右半边压暗做出体积
      for (let y = 10; y < 30; y++) {
        const t = (y - 10) / 20;
        const half = 5 + Math.round(t * 6);
        for (let x = cx - half; x <= cx + half; x++) {
          let ci = C.robe;
          if (x > cx + half - 3) ci = C.robeDark;
          else if (x < cx - half + 2) ci = C.robeLight;
          p.px(x, y, ci);
        }
      }
      // 下摆一条更暗的边
      for (let x = cx - 11; x <= cx + 11; x++) p.px(x, 30, C.robeDark);
      // 兜帽：盖住整个头，只留一片空白纸面当脸
      for (let y = 4; y < 14; y++) {
        const half = y < 6 ? 3 : (y < 12 ? 5 : 6);
        for (let x = cx - half; x <= cx + half; x++) p.px(x, y, y < 6 ? C.robeDark : C.robe);
      }
      for (let y = 7; y < 13; y++) { p.px(cx - 1, y, C.paper); p.px(cx, y, C.paper); p.px(cx + 1, y, C.paper); }
      // 肩线
      for (let x = cx - 6; x <= cx + 6; x++) p.px(x, 14, C.robeDark);
      // 左手抱的册子（纸面 + 金边）
      for (let y = 17; y < 25; y++) for (let x = cx - 8; x <= cx - 3; x++) p.px(x, y, C.paper);
      for (let y = 17; y < 25; y++) p.px(cx - 8, y, C.gold);
      // 右手举起的朱印：印身纸白、印面朱红
      p.rect(cx + 6, 15, 5, 5, C.paper);
      p.rect(cx + 7, 20, 3, 2, C.seal);
      for (let y = 21; y < 27; y++) p.px(cx + 9, y, C.robeLight);
    }
  }
};

const C_KEYS = {
  page_mite: { paper: 2, paperDim: 3, paperShade: 4, red: 5, gold: 6 },
  faded_photo: { light: 4, mid: 2, dark: 3, darkest: 5 },
  cache_moth: { wing: 2, wingDark: 3, wingLight: 4, paper: 5, paperDim: 5, red: 6 },
  rank_auditor: { robe: 2, robeDark: 3, robeLight: 4, paper: 5, gold: 6, seal: 7 }
};

for (const [key, def] of Object.entries(ENEMIES)) {
  const pal = def.palette();
  const p = new Pix(W, H, pal);
  p.alpha = pal.map(() => 255);
  p.alpha[0] = 0;
  def.draw(p, C_KEYS[key]);
  p.outline(1);
  const buf = encodeIndexed(W, H, p.d, pal, p.alpha);
  const file = path.join(OUT, key + '.png');
  fs.writeFileSync(file, buf);
  console.log(key + '.png', buf.length + 'B', 'colors=' + pal.length);
}
