#!/usr/bin/env node
/* tools/cast-check.mjs — 《残响协议》「角色接入管线」校验器（只读，不写任何文件、不联网）。
   用途：
     node tools/cast-check.mjs                  校验工程里现有全部角色（回归守卫）
     node tools/cast-check.mjs --id <id>        只校验一个角色
     node tools/cast-check.mjs --dir <目录>     校验别人交来的素材包目录（不进游戏、只查合规）
     node tools/cast-check.mjs --scaffold <id>  打印角色卡模板 + 需要交付的文件清单
     node tools/cast-check.mjs --verbose        打印每条检查明细
   可选：--root <目录> 指定工程根（默认本脚本的上一级，仅供验收演练）。

   口径与 tools/art-check.mjs 一致：像素图必须是 PNG-8 调色板（colorType 3）、位深 8、无隔行、
   每张 ≤24 色；立绘 1024×1536、≤220 KB、colorType 3 或 2。角色数值必须能由 GD.derive 复算。
   缺对话头像（face_<id>.png）只记 warn，不阻断接入（当前 6 名主角有、磐/笺等还没有）。
   正常信息一律 console.log（stderr 会被统计退出码的脚本当成失败）；有 error 时 exit 1。 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

// ---------- 0. 参数与路径 ----------
const SELF = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const hasFlag = (k) => argv.includes(k);
function argOf(k) {
  const i = argv.indexOf(k);
  if (i < 0) return null;
  const v = argv[i + 1];
  if (typeof v !== 'string' || v.slice(0, 2) === '--') return null;
  return v;
}
const VERBOSE = hasFlag('--verbose');
const ID_ARG = argOf('--id');
const DIR_ARG = argOf('--dir');
const SCAFFOLD_ARG = argOf('--scaffold');
const ROOT = path.resolve(argOf('--root') || path.join(SELF, '..'));
const ASSETS = path.join(ROOT, 'web/game/assets');
const PIXEL = path.join(ASSETS, 'pixel');
const PORTRAIT = path.join(ASSETS, 'portrait');
const DATA = path.join(ROOT, 'web/game/data');
const MANIFEST = path.join(ASSETS, 'manifest.json');

const USAGE = [
  '用法：',
  '  node tools/cast-check.mjs                 校验工程里现有全部角色（回归守卫）',
  '  node tools/cast-check.mjs --id <id>       只校验一个角色',
  '  node tools/cast-check.mjs --dir <目录>    校验别人交来的素材包目录（不进游戏、只查合规）',
  '  node tools/cast-check.mjs --scaffold <id> 打印角色卡模板 + 需要交付的文件清单',
  '  node tools/cast-check.mjs --verbose       打印每条检查明细',
  '可选：--root <目录> 指定工程根（默认本脚本的上一级）。',
  '退出码：0 = 通过（含只有警告），1 = 有错误。'
].join('\n');

// ---------- 1. PNG 解码：原样复制自 tools/art/verify-assets.mjs 的 decodePNG（含位深检查） ----------
function decodePNG(file){
  const buf = fs.readFileSync(file);
  let p = 8, w=0,h=0,bd=0,ct=0,idat=[], plte=null, trns=null;
  while(p < buf.length){
    const len = buf.readUInt32BE(p); const type = buf.toString('ascii', p+4, p+8);
    const data = buf.subarray(p+8, p+8+len);
    if(type==='IHDR'){ w=data.readUInt32BE(0); h=data.readUInt32BE(4); bd=data[8]; ct=data[9]; }
    else if(type==='PLTE'){ plte=data; }
    else if(type==='tRNS'){ trns=data; }
    else if(type==='IDAT'){ idat.push(data); }
    else if(type==='IEND') break;
    p += 12+len;
  }
  if(bd!==8) throw new Error('unsupported bitDepth '+bd+' in '+file);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = ct===6?4: ct===2?3: ct===4?2: ct===0?1: 1;
  const stride = w*ch;
  const out = Buffer.alloc(w*h*4);
  let prev = Buffer.alloc(stride);
  let off = 0;
  for(let y=0;y<h;y++){
    const ft = raw[off++];
    const line = Buffer.from(raw.subarray(off, off+stride)); off += stride;
    for(let x=0;x<stride;x++){
      const a = x>=ch ? line[x-ch] : 0;
      const b = prev[x];
      const c = x>=ch ? prev[x-ch] : 0;
      let v = line[x];
      if(ft===1) v = (v+a)&255;
      else if(ft===2) v = (v+b)&255;
      else if(ft===3) v = (v + ((a+b)>>1))&255;
      else if(ft===4){ const pp=a+b-c; const pa=Math.abs(pp-a), pb=Math.abs(pp-b), pc=Math.abs(pp-c); v=(v + (pa<=pb&&pa<=pc?a:pb<=pc?b:c))&255; }
      line[x]=v;
    }
    for(let x=0;x<w;x++){
      const o=(y*w+x)*4;
      if(ct===6){ out[o]=line[x*4]; out[o+1]=line[x*4+1]; out[o+2]=line[x*4+2]; out[o+3]=line[x*4+3]; }
      else if(ct===2){ out[o]=line[x*3]; out[o+1]=line[x*3+1]; out[o+2]=line[x*3+2]; out[o+3]=255; }
      else if(ct===3){ const i=line[x]; const alpha = trns && i<trns.length ? trns[i] : 255; out[o]=plte[i*3]; out[o+1]=plte[i*3+1]; out[o+2]=plte[i*3+2]; out[o+3]=alpha; }
      else if(ct===0){ out[o]=out[o+1]=out[o+2]=line[x]; out[o+3]=255; }
      else if(ct===4){ out[o]=out[o+1]=out[o+2]=line[x*2]; out[o+3]=line[x*2+1]; }
    }
    prev = line;
  }
  return { w, h, data: out };
}

// ---------- 2. PNG 头：尺寸 / 位深 / 色彩类型 / 调色板色数 / 隔行（口径同 tools/art-check.mjs 的 readPng） ----------
function pngHeader(file) {
  const b = fs.readFileSync(file);
  if (b.length < 33 || b.readUInt32BE(0) !== 0x89504e47 || b.toString('ascii', 12, 16) !== 'IHDR') return null;
  const w = b.readUInt32BE(16);
  const h = b.readUInt32BE(20);
  const bitDepth = b[24];
  const colorType = b[25];
  const interlace = b[28];
  let off = 8;
  let colors = 0;
  let trns = false;
  while (off + 8 <= b.length) {
    const len = b.readUInt32BE(off);
    const type = b.toString('ascii', off + 4, off + 8);
    if (type === 'PLTE') colors = len / 3;
    if (type === 'tRNS') trns = true;
    if (type === 'IEND') break;
    off += 12 + len;
  }
  return { w, h, bitDepth, colorType, interlace, colors, trns, bytes: b.length };
}

// ---------- 3. 规范表（与 tools/art-check.mjs 的 KIND 表口径一致） ----------
const SPEC = {
  sprite: { dir: 'pixel', w: 64, h: 96, cell: [16, 24], cols: 4, rows: 4, maxBytes: 40 * 1024 },
  boss: { dir: 'pixel', w: 128, h: 96, cell: [32, 32], cols: 4, rows: 3, maxBytes: 30 * 1024 },
  face: { dir: 'pixel', w: 48, h: 60, cell: [48, 60], cols: 1, rows: 1, maxBytes: 8 * 1024 },
  portrait: { dir: 'portrait', w: 1024, h: 1536, cell: [1024, 1536], cols: 1, rows: 1, maxBytes: 220 * 1024 }
};
const PALETTE_MAX = 24;
const NAME_RE = {
  sprite: /^(pc|npc)_[a-z0-9]+$/,
  boss: /^boss_[a-z0-9]+$/,
  face: /^face_[a-z0-9]+$/,
  portrait: /^pt_[a-z0-9_]+$/
};
const NAME_HINT = {
  sprite: '普通角色用 npc_<id>、玩家角色用 pc_<id>，全小写字母/数字',
  boss: '首领图集用 boss_<id>',
  face: '对话头像用 face_<id>，全小写字母/数字，id 与角色 id 一致',
  portrait: '立绘用 pt_<id>，可带 _half/_bust 等差分后缀'
};
const FIELD_OF = { sprite: 'sprite', boss: 'sprite', face: 'face', portrait: 'portrait' };
const DIR_NAME = ['下(down)', '左(left)', '右(right)', '上(up)'];
const STAT_DIMS = ['hp', 'atk', 'def', 'spd', 'slots', 'quota', 'quotaRegen'];
const REQUIRED_CAST_FIELDS = ['id', 'name', 'role', 'voice', 'look', 'sprite', 'skills', 'bio'];
const REQUIRED_FIELD_FIX = {
  id: '卡内 id 要与键名一致，例如 xi: { id: "xi", … }。',
  name: '写角色显示名（如「汐」）。',
  role: '写角色定位（如「开场同伴 · 续战力」）。',
  voice: '用一句中文写说话风格：自称、口癖、怎么称呼玩家角色。',
  look: '用一两句写外形与随身道具，供美术照画；不要写厂商 Logo 或官方立绘描述。',
  sprite: '写像素图集键 npc_<id>，并把 64×96 的 PNG-8 放到 web/game/assets/pixel/。',
  skills: '写技能 id 数组（至少 1 个），技能必须先在 GD.skills 里定义。',
  bio: '写两三句角色小传，语气与世界观一致。'
};
const DELIVERY_BAD = /\.(jpe?g|webp|gif|bmp|tga|tiff?|psd|ai|svg|zip|rar|7z)$/i;
const TWO_DIR_NPC = new Set(['npc_pan', 'npc_jian']); // 只做两向、由引擎镜像（ART-SPEC §1）
const CT_NAME = { 0: '灰度', 2: '真彩 RGB', 3: '调色板', 4: '灰度+透明', 6: '真彩 RGBA' };
const RANK = { '—': 0, OK: 1, WARN: 2, FAIL: 3 };

// ---------- 4. 问题记录 ----------
const problems = []; // { level:'error'|'warn', scope, msg, fix }
const errors = () => problems.filter((p) => p.level === 'error');
const warns = () => problems.filter((p) => p.level === 'warn');
function fail(scope, msg, fix) { problems.push({ level: 'error', scope: scope, msg: msg, fix: fix || '' }); }
function warn(scope, msg, fix) { problems.push({ level: 'warn', scope: scope, msg: msg, fix: fix || '' }); }

/** 一个待校验对象（角色卡 / 素材包里的单个文件）。cols 是状态表的 4 列。 */
function newRec(group, id) {
  return {
    group: group, id: id, scope: group + '.' + id,
    cols: { sprite: 'OK', face: 'OK', portrait: 'OK', stats: '—' },
    err: 0, warn: 0, notes: []
  };
}
function setCol(rec, col, level) {
  if (col && (RANK[level] || 0) > (RANK[rec.cols[col]] || 0)) rec.cols[col] = level;
}
/** 记录一条问题；level 为 'FAIL'（error）或 'WARN'。 */
function note(rec, col, level, msg, fix) {
  if (level === 'FAIL') { rec.err++; fail(rec.scope, msg, fix); }
  else { rec.warn++; warn(rec.scope, msg, fix); }
  setCol(rec, col, level);
}
function verdictOf(rec) { return rec.err ? 'FAIL' : (rec.warn ? 'WARN' : 'OK'); }

// ---------- 5. 体积统计（只统计被角色卡引用到的文件，避免把背景/UI 也算进来） ----------
const counted = new Set();
const byteTotal = { pixel: 0, portrait: 0 };
function countBytes(kind, file, n) {
  if (counted.has(file)) return;
  counted.add(file);
  if (kind === 'portrait') byteTotal.portrait += n;
  else byteTotal.pixel += n;
}

// ---------- 6. 数据载入（只读求值，与 tools/game-check.mjs 同一套做法） ----------
function loadGD() {
  const win = {};
  // 只加载角色卡必需的两份：characters.js 依赖 roster-source.js 的 GD.derive
  for (const f of ['roster-source.js', 'characters.js']) {
    const file = path.join(DATA, f);
    if (!fs.existsSync(file)) {
      fail('web/game/data/' + f, '缺少数据文件', '确认仓库完整：roster-source.js 与 characters.js 都在 web/game/data/ 下。');
      continue;
    }
    try {
      new Function('window', fs.readFileSync(file, 'utf8'))(win);
    } catch (e) {
      fail('web/game/data/' + f, '求值失败：' + e.message, '先跑 node tools/game-check.mjs 定位数据文件本身的报错；本校验器只读，不修数据。');
    }
  }
  return win.GameData || {};
}

// ---------- 7. manifest 登记表（只认脚本派生结果，不手改） ----------
let manifestItems = null;
let manifestLoaded = false;
let faceClassSeen = false;
function loadManifest() {
  if (manifestLoaded) return manifestItems;
  manifestLoaded = true;
  if (!fs.existsSync(MANIFEST)) {
    fail('web/game/assets/manifest.json', '缺少 manifest.json（每张图都要登记）', '跑 node tools/art-check.mjs --write-manifest 生成；manifest 是脚本派生物，不要手写。');
    return null;
  }
  let doc = null;
  try {
    doc = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  } catch (e) {
    fail('web/game/assets/manifest.json', '解析失败：' + e.message, 'manifest 由 tools/art-check.mjs 派生，不要手改；重跑 node tools/art-check.mjs --write-manifest。');
    return null;
  }
  manifestItems = (doc && doc.items) || {};
  faceClassSeen = Object.keys(manifestItems).some((k) => manifestItems[k] && manifestItems[k].kind === 'face');
  return manifestItems;
}

/** 登记对账：键要存在、kind 要同类、尺寸要与实测一致。face 类尚未登记时降级为 warn。 */
function checkManifest(rec, col, key, expectedKind, hdr) {
  const items = loadManifest();
  if (!items) return;
  const it = items[key];
  if (!it) {
    if (expectedKind === 'face' && !faceClassSeen) {
      note(rec, col, 'WARN', 'manifest.json 还没登记 ' + key + '（整张 manifest 里还没有 kind:"face" 这一类）',
        '素材本身没问题；等 node tools/art-check.mjs --write-manifest 跑过就会自动登记成 kind:"face"。');
    } else {
      note(rec, col, 'FAIL', key + ' 未在 manifest.json 登记',
        '跑 node tools/art-check.mjs --write-manifest 重新生成登记表；manifest.json / manifest.js 都由脚本派生，不要手改。');
    }
    return;
  }
  if (it.kind !== expectedKind) {
    note(rec, col, 'FAIL', key + ' 在 manifest 里的 kind 是 "' + it.kind + '"，应为 "' + expectedKind + '"',
      '检查命名与目录：精灵放 pixel/ 且以 pc_/npc_ 开头，头像以 face_ 开头，立绘放 portrait/ 且以 pt_ 开头；改好后重跑 --write-manifest。');
  }
  if (hdr && (it.w !== hdr.w || it.h !== hdr.h)) {
    note(rec, col, 'WARN', 'manifest 登记 ' + key + ' 的尺寸是 ' + it.w + '×' + it.h + '，实测 ' + hdr.w + '×' + hdr.h,
      '美术迭代后重跑 node tools/art-check.mjs --write-manifest 同步登记表。');
  }
}

// ---------- 8. 单项素材校验 ----------
function geometryFix(kind, spec) {
  if (kind === 'sprite') return '把画布设成 64×96：4 列 × 4 行、每格 16×24（下/左/右/上 4 个方向 × idle/walk1/idle/walk2），不要缩放单帧尺寸。';
  if (kind === 'boss') return '首领图集是 128×96：4 列 × 3 行、每格 32×32（3 个阶段各 4 帧呼吸循环）。';
  if (kind === 'face') return '对话头像画布是 48×60、单帧：把画布裁成 48×60，不要把整张 1024×1536 立绘缩进去，那样脸会小到看不清。';
  return '立绘是 1024×1536 单张：按 1024 宽 × 1536 高导出，人物占画布高度 78%–86%，上边缘留白 ≥8%。';
}

/**
 * 校验一张 PNG：存在 → 合法 PNG → 隔行/位深/色彩类型/色数 → 尺寸 → 体积 → 半透明边缘。
 * file 是绝对路径，rel 是给作者看的相对路径。返回 { hdr, img }（img 只对像素类解码）。
 */
function checkPng(rec, col, key, kind, file, rel) {
  const spec = SPEC[kind];
  const base = path.basename(rel);
  if (!fs.existsSync(file)) {
    note(rec, col, 'FAIL', rel + ' 不存在',
      '把文件放到 web/game/assets/' + spec.dir + '/ 下，文件名与角色卡里的 ' + FIELD_OF[kind] + ' 完全一致（全小写、下划线分隔）。');
    return null;
  }
  let hdr = null;
  try {
    hdr = pngHeader(file);
  } catch (e) {
    note(rec, col, 'FAIL', rel + ' 读取失败：' + e.message, '确认文件没被别的程序占用、路径没写错。');
    return null;
  }
  if (!hdr) {
    note(rec, col, 'FAIL', rel + ' 不是合法 PNG（PNG 文件头不对）',
      '用 Aseprite / Photoshop / pngquant 重新导出；不要直接把 .jpg/.webp 改名成 .png 来交。');
    return null;
  }
  countBytes(kind, file, hdr.bytes);
  const isPixel = kind !== 'portrait';

  if (hdr.interlace !== 0) {
    note(rec, col, 'FAIL', base + ' 用了隔行扫描（interlace=1）',
      '导出时关掉 Interlaced / 交错：Chrome 解码慢，而且像素图会被插值糊掉。');
  }
  if (hdr.bitDepth !== 8) {
    note(rec, col, 'FAIL', base + ' 位深是 ' + hdr.bitDepth + '，应为 8',
      '按 8 位/通道导出：Aseprite 的 Indexed/RGB 8-bit，Photoshop 的 PNG-8。');
  }
  if (isPixel) {
    if (hdr.colorType !== 3) {
      note(rec, col, 'FAIL', base + ' 不是调色板 PNG（colorType=' + hdr.colorType + ' ' + (CT_NAME[hdr.colorType] || '未知') + '，应为 3 调色板）',
        '导出 PNG-8 调色板图：Aseprite → File → Export → 8-bit PNG；Photoshop → 存储为 Web 所用格式 → PNG-8。像素图要硬边，不要真彩/带 alpha 的真彩。');
    } else if (hdr.colors > PALETTE_MAX) {
      note(rec, col, 'FAIL', base + ' 用了 ' + hdr.colors + ' 色，超过每张 ≤' + PALETTE_MAX + ' 色',
        '把调色板压到 24 色以内：合并相近色、去掉渐变与孤立色。pngquant 的 256 色不满足本项目规范。');
    }
  } else if (hdr.colorType !== 3 && hdr.colorType !== 2) {
    note(rec, col, 'FAIL', base + ' 色彩类型是 ' + hdr.colorType + '（' + (CT_NAME[hdr.colorType] || '未知') + '），立绘应为调色板(3)或真彩(2)',
      '导出 PNG-8 或 PNG-24；透明背景请用调色板 + tRNS，不要交 RGBA 真彩（type 6）。');
  }
  if (hdr.w !== spec.w || hdr.h !== spec.h) {
    note(rec, col, 'FAIL', base + ' 尺寸 ' + hdr.w + '×' + hdr.h + '，应为 ' + spec.w + '×' + spec.h,
      geometryFix(kind, spec));
  }
  if (hdr.bytes > spec.maxBytes) {
    note(rec, col, 'FAIL', base + ' ' + hdr.bytes + ' 字节，超过该类预算 ' + spec.maxBytes + ' 字节',
      '压体积：减少色数、pngquant 量化、去掉整片透明边；尺寸和体积是两个独立约束，缩尺寸不算达标。');
  }

  let img = null;
  if (isPixel) {
    try {
      img = decodePNG(file);
    } catch (e) {
      note(rec, col, 'FAIL', base + ' 解码失败：' + e.message,
        'PNG 可能被截断或用了不支持的位深；用画图工具重新导出一次，不要手工拼文件。');
    }
    if (img) {
      let partial = 0;
      for (let i = 3; i < img.data.length; i += 4) {
        const a = img.data[i];
        if (a !== 0 && a !== 255) partial++;
      }
      if (partial) {
        note(rec, col, 'WARN', base + ' 有 ' + partial + ' 个半透明像素（抗锯齿/羽化边缘）',
          '关掉抗锯齿与羽化，透明只保留 0/255 两档；像素图边缘必须是硬边。');
      }
    }
  }
  rec.notes.push(rel + ' → ' + hdr.w + '×' + hdr.h + '，' +
    (hdr.colorType === 3 ? hdr.colors + ' 色' : 'colorType ' + hdr.colorType) + '，' + hdr.bytes + ' B');
  return { hdr: hdr, img: img };
}

/** 帧内不透明像素数（alpha > 8 视为有内容）。 */
function countOpaque(img, ox, oy, w, h) {
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (img.data[((oy + y) * img.w + (ox + x)) * 4 + 3] > 8) n++;
    }
  }
  return n;
}
/** 帧内不透明像素的最低行（帧内坐标 0..h-1），全透明返回 -1。 */
function bboxBottom(img, ox, oy, w, h) {
  for (let y = h - 1; y >= 0; y--) {
    for (let x = 0; x < w; x++) {
      if (img.data[((oy + y) * img.w + (ox + x)) * 4 + 3] > 8) return y;
    }
  }
  return -1;
}

/** 精灵图集逐帧检查：4 个方向各至少 1 帧有内容；不要留空帧；脚底要贴住帧底。 */
function checkSpriteFrames(rec, col, key, img, dirs, spec) {
  const FW = spec.cell[0];
  const FH = spec.cell[1];
  const cols = spec.cols;
  const rows = spec.rows;
  for (let c = 0; c < Math.min(dirs, cols); c++) {
    let filled = 0;
    const emptyRows = [];
    for (let r = 0; r < rows; r++) {
      if (countOpaque(img, c * FW, r * FH, FW, FH) > 0) filled++;
      else emptyRows.push(r + 1);
    }
    if (!filled) {
      note(rec, col, 'FAIL', key + '.png 第 ' + (c + 1) + ' 列（' + DIR_NAME[c] + '方向）' + rows + ' 帧全透明',
        '列顺序固定为 下/左/右/上，每列 ' + rows + ' 行（idle/walk1/idle/walk2）都要画出该方向的帧，不能只画一个方向。');
    } else if (emptyRows.length) {
      note(rec, col, 'WARN', key + '.png ' + DIR_NAME[c] + '方向第 ' + emptyRows.join('、') + ' 行帧全透明',
        rows + ' 帧不要留空帧，否则走路循环会闪一下；按 idle/walk1/idle/walk2 补齐这几帧。');
    }
  }
  const floating = [];
  for (let c = 0; c < Math.min(dirs, cols); c++) {
    let bottom = -1;
    for (let r = 0; r < rows; r++) {
      const b = bboxBottom(img, c * FW, r * FH, FW, FH);
      if (b > bottom) bottom = b;
    }
    if (bottom >= 0 && bottom <= 20) floating.push(DIR_NAME[c] + '最高只到帧内 y=' + bottom);
  }
  if (floating.length) {
    note(rec, col, 'WARN', key + '.png ' + floating.join('、') + '（要求贴到 22–23）',
      '精灵锚点是脚底中心 (8,24)：把脚部对齐到每格底部（第 23 行），否则引擎会画成浮空或陷地。');
  }
}

/** 首领图集：4 列呼吸帧 × 3 行阶段（单朝向），只查有没有空帧、帧底是否贴地。 */
function checkBossFrames(rec, col, key, img) {
  const FW = SPEC.boss.cell[0];
  const FH = SPEC.boss.cell[1];
  const cols = SPEC.boss.cols;
  const rows = SPEC.boss.rows;
  const empty = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!countOpaque(img, c * FW, r * FH, FW, FH)) empty.push('p' + (r + 1) + ' 第 ' + (c + 1) + ' 帧');
    }
  }
  if (empty.length) {
    note(rec, col, 'WARN', key + '.png 有空帧：' + empty.join('、'),
      '首领是 4 列呼吸帧 × 3 行阶段（phase1/2/3），12 格都要有内容；空帧会让呼吸循环闪一下。');
  }
  rec.notes.push(key + '.png 首领图集：' + cols + ' 列呼吸帧 × ' + rows + ' 行阶段');
}

/** 对话头像包围盒检查：顶部 y 在 0..6、底部 y ≥ 54。 */
function checkFaceBox(rec, col, key, img) {
  let minX = 1e9;
  let minY = 1e9;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (img.data[(y * img.w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxY < 0) {
    note(rec, col, 'FAIL', key + '.png 全透明（没有任何不透明像素）',
      '把人物画进 48×60 的画布：头+肩占满画面，透明只留在轮廓外。');
    return;
  }
  if (minY > 6) {
    note(rec, col, 'FAIL', key + '.png 不透明区域顶部在 y=' + minY + '（要求 0..6）',
      '头发/头顶要贴近画布上沿：把人物整体上移，顶部留白不要超过 6px，否则对话框头像顶部会空一块。');
  }
  if (maxY < 54) {
    note(rec, col, 'FAIL', key + '.png 不透明区域底部在 y=' + maxY + '（要求 ≥54）',
      '只画头+肩并占满画布：把肩线画到 y≥54；不要把整张立绘缩小塞进 48×60，那样脸会太小。');
  }
  rec.notes.push(key + '.png 不透明 bbox=[' + minX + ',' + minY + ',' + maxX + ',' + maxY + ']');
}

// ---------- 9. 角色卡检查 ----------
function checkSkillField(rec, card, GD) {
  if (!Array.isArray(card.skills)) return; // 缺失/类型错误已在必填字段里报
  const skills = GD.skills || {};
  card.skills.forEach((s) => {
    if (!skills[s]) {
      note(rec, null, 'FAIL', '技能 "' + s + '" 不在 GD.skills 里',
        '先在 characters.js 的 GD.skills 里定义该技能（id/name/slot/cost/scope/text/effect），再在角色卡 skills 里引用。');
    }
  });
}

function checkPaletteField(rec, card) {
  if (card.palette === undefined || card.palette === null) return;
  if (!Array.isArray(card.palette)) {
    note(rec, null, 'WARN', 'palette 应为颜色数组（如 ["#2E6FA8", …]）',
      'palette 是给美术对照的建议色板，写 3–6 个 #RRGGBB 即可；不参与战斗数值。');
    return;
  }
  if (card.palette.length < 3 || card.palette.length > 6) {
    note(rec, null, 'FAIL', 'palette 有 ' + card.palette.length + ' 个颜色（要求 3–6 个）',
      '挑 3–6 个主色写进 palette，并与 sprite/face 的实际用色一致。');
  }
  card.palette.forEach((c) => {
    if (!/^#[0-9A-Fa-f]{6}$/.test(String(c))) {
      note(rec, null, 'FAIL', 'palette 里有非法颜色 "' + c + '"（要求 #RRGGBB）',
        '写成 6 位十六进制，如 #2E6FA8；不要用 #FFF 缩写或 rgb() 写法。');
    }
  });
}

/** 数值不许手写：除 observer 外必须有 source，且 stats 与 GD.derive.pick(source) 逐项相等。 */
function checkStats(rec, card, GD) {
  if (rec.id === 'observer') {
    rec.cols.stats = 'OK';
    const st = card.stats || {};
    rec.notes.push('数值：玩家角色不映射榜单，stats 为叙事基线（' +
      STAT_DIMS.map((k) => k + ' ' + st[k]).join(' ') + '），derived.note 已注明');
    return;
  }
  const src = card.source;
  if (!src) {
    note(rec, 'stats', 'FAIL', '缺少 source（榜单来源），数值必须由 GD.derive 换算',
      '在角色卡写 source: <GD.modelPicks 的键>，并用 withStats(card, source) 生成 stats；除观测者外不许手写数值。');
    return;
  }
  const picks = GD.modelPicks || {};
  const derive = GD.derive || {};
  const d = typeof derive.pick === 'function' ? derive.pick(src) : null;
  if (!d) {
    note(rec, 'stats', 'FAIL', 'source "' + src + '" 在 GD.modelPicks 里不存在',
      '可用 source：' + (Object.keys(picks).join(' / ') || '（GD.modelPicks 为空）') +
      '；要加新模型，先在 roster-source.js 的 GD.modelPicks 登记 bench，再让映射算出来。');
    return;
  }
  const stats = card.stats || {};
  const drift = [];
  STAT_DIMS.forEach((k) => {
    if (typeof stats[k] !== 'number') drift.push(k + ' 缺失');
    else if (stats[k] !== d[k]) drift.push(k + '：卡上 ' + stats[k] + '，复算 ' + d[k]);
  });
  if (drift.length) {
    note(rec, 'stats', 'FAIL', '数值漂移（stats 与 GD.derive.pick("' + src + '") 对不上）：' + drift.join('；'),
      '删掉手写的 stats，改成 withStats(card, "' + src + '") 让它自动生成；数字只从 GD.derive 来，手改一次就和榜单对不上账。');
  } else {
    rec.cols.stats = 'OK';
    rec.notes.push('数值：source=' + src + '，' + STAT_DIMS.map((k) => k + ' ' + d[k]).join(' ') + '，与卡一致');
  }
}

/** 立绘：直接一张 pt_<id>.png，或首领的 _p1/_p2/_p3 三阶段图集。返回 { direct, phases }。 */
function checkPortraitAsset(rec, card) {
  const key = card.portrait;
  if (key === undefined || key === null || key === '') {
    if (rec.group === 'cast') {
      note(rec, 'portrait', 'WARN', '没有立绘（可选字段 portrait 为空）',
        '要剧情立绘就交 pt_<id>.png（1024×1536，≤220KB），并在卡上写 portrait: "pt_<id>"；暂时没有只 warn。');
    } else {
      rec.cols.portrait = '—';
    }
    return { direct: false, phases: false };
  }
  if (typeof key !== 'string') {
    note(rec, 'portrait', 'FAIL', 'portrait 必须是字符串（如 "pt_xi"）或 null，实际是 ' + typeof key,
      '写成 pt_<id> 字符串；没有立绘就写 null。');
    return { direct: false, phases: false };
  }
  if (!NAME_RE.portrait.test(key)) {
    note(rec, 'portrait', 'FAIL', 'portrait "' + key + '" 不符合命名 ' + NAME_RE.portrait,
      NAME_HINT.portrait + '；文件名必须与这个键一致。');
    return { direct: false, phases: false };
  }
  const directFile = path.join(PORTRAIT, key + '.png');
  if (fs.existsSync(directFile)) {
    const got = checkPng(rec, 'portrait', key, 'portrait', directFile, 'web/game/assets/portrait/' + key + '.png');
    if (got && got.hdr) checkManifest(rec, 'portrait', key, 'portrait', got.hdr);
    return { direct: true, phases: false };
  }
  const phaseKeys = [1, 2, 3].map((n) => key + '_p' + n);
  const allPhases = phaseKeys.every((k) => fs.existsSync(path.join(PORTRAIT, k + '.png')));
  if (!allPhases) {
    note(rec, 'portrait', 'FAIL', 'web/game/assets/portrait/' + key + '.png 不存在（首领三阶段 ' + key + '_p1..p3 也不全）',
      '交付 1024×1536 的立绘并放到 portrait/，键名与卡上的 portrait 一致；首领按 _p1/_p2/_p3 三阶段交付。');
    return { direct: false, phases: false };
  }
  phaseKeys.forEach((k) => {
    const got = checkPng(rec, 'portrait', k, 'portrait', path.join(PORTRAIT, k + '.png'), 'web/game/assets/portrait/' + k + '.png');
    if (got && got.hdr) checkManifest(rec, 'portrait', k, 'portrait', got.hdr);
  });
  rec.notes.push('立绘按三阶段图集解析：' + phaseKeys.join(' / '));
  return { direct: false, phases: true };
}

function checkFaceAsset(rec, card) {
  const key = card.face;
  if (key === undefined || key === null || key === '') {
    note(rec, 'face', 'WARN', '没有对话头像（可选字段 face 未填）',
      '需要头像就交 face_<id>.png（48×60 PNG-8、≤24 色），并在卡上写 face: "face_<id>"；暂时没有只 warn，不阻断接入。');
    return;
  }
  if (typeof key !== 'string') {
    note(rec, 'face', 'FAIL', 'face 必须是字符串（如 "face_xi"），实际是 ' + typeof key,
      '写成 face_<id> 字符串；没有头像就删掉这个字段或写 null。');
    return;
  }
  if (!NAME_RE.face.test(key)) {
    note(rec, 'face', 'FAIL', 'face "' + key + '" 不符合命名 ' + NAME_RE.face,
      NAME_HINT.face + '；文件名必须与这个键一致。');
    return;
  }
  const file = path.join(PIXEL, key + '.png');
  if (!fs.existsSync(file)) {
    note(rec, 'face', 'WARN', '卡上写了 face: "' + key + '"，但 web/game/assets/pixel/' + key + '.png 还没交付',
      '补一张 48×60 的 PNG-8 头像；短时间内没有就先去掉 face 字段（可选），素材到了再加。');
    return;
  }
  const got = checkPng(rec, 'face', key, 'face', file, 'web/game/assets/pixel/' + key + '.png');
  if (!got) return;
  if (got.hdr && got.hdr.w === 48 && got.hdr.h === 60 && got.img) checkFaceBox(rec, 'face', key, got.img);
  if (got.hdr) checkManifest(rec, 'face', key, 'face', got.hdr);
}

function checkSpriteAsset(rec, card, GD) {
  const key = card.sprite;
  if (key === undefined || key === null || key === '') return; // 必填字段检查已报
  if (typeof key !== 'string') {
    note(rec, 'sprite', 'FAIL', 'sprite 必须是字符串（如 "npc_xi"），实际是 ' + typeof key,
      '写成 npc_<id>（普通角色）或 pc_<id>（玩家角色）。');
    return;
  }
  const isBoss = rec.group === 'npc' && /^boss_/.test(key);
  const kind = isBoss ? 'boss' : 'sprite';
  if (!NAME_RE[kind].test(key)) {
    note(rec, 'sprite', 'FAIL', 'sprite "' + key + '" 不符合命名 ' + NAME_RE[kind],
      NAME_HINT[kind] + '；文件名必须与这个键一致。');
    return;
  }
  const file = path.join(PIXEL, key + '.png');
  const got = checkPng(rec, 'sprite', key, kind, file, 'web/game/assets/pixel/' + key + '.png');
  if (!got) return;
  if (got.hdr && got.img) {
    if (kind === 'sprite' && got.hdr.w === SPEC.sprite.w && got.hdr.h === SPEC.sprite.h) {
      checkSpriteFrames(rec, 'sprite', key, got.img, TWO_DIR_NPC.has(key) ? 2 : 4, SPEC.sprite);
    } else if (kind === 'boss' && got.hdr.w === SPEC.boss.w && got.hdr.h === SPEC.boss.h) {
      // 首领 4 列是呼吸帧、3 行是阶段，没有「四向」，单独检查空帧与帧底
      checkBossFrames(rec, 'sprite', key, got.img);
    }
  }
  if (got.hdr) checkManifest(rec, 'sprite', key, kind, got.hdr);
}

/** 战斗角色：必填字段 + 技能 + 色板 + 数值复算 + 三份素材。 */
function checkCastCard(rec, card, GD) {
  for (const f of REQUIRED_CAST_FIELDS) {
    const v = card[f];
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
    if (empty) note(rec, null, 'FAIL', '缺少必填字段 ' + f, REQUIRED_FIELD_FIX[f] || '按 CONTRACT / 角色卡结构补上该字段。');
  }
  if (card.id !== rec.id) {
    note(rec, null, 'FAIL', '卡内 id 是 "' + card.id + '"，应与键名 "' + rec.id + '" 一致',
      '数据卡写成 ' + rec.id + ': { id: "' + rec.id + '", … }，id 与键名必须相同。');
  }
  checkSkillField(rec, card, GD);
  checkPaletteField(rec, card);
  checkStats(rec, card, GD);
  checkSpriteAsset(rec, card, GD);
  checkPortraitAsset(rec, card);
  checkFaceAsset(rec, card);
}

/** 剧情 NPC：字段更少，没有 stats；sprite/portrait 允许为 null（如没有形体的庭务）。 */
function checkNpcCard(rec, card) {
  rec.cols.stats = '—';
  if (card.id !== rec.id) {
    note(rec, null, 'FAIL', '卡内 id 是 "' + card.id + '"，应与键名 "' + rec.id + '" 一致',
      '数据卡写成 ' + rec.id + ': { id: "' + rec.id + '", … }，id 与键名必须相同。');
  }
  const hasSprite = typeof card.sprite === 'string' && card.sprite;
  if (!hasSprite) {
    if (card.sprite === null || card.sprite === undefined) {
      rec.cols.sprite = '—';
      rec.notes.push('没有精灵（无实体的剧情 NPC 可以不进地图）');
    }
  } else {
    checkSpriteAsset(rec, card, null);
  }
  const portraitResult = checkPortraitAsset(rec, card);
  // 首领三阶段立绘（不是对话立绘）不要求对话头像
  if (portraitResult && portraitResult.phases) {
    rec.cols.face = '—';
    rec.notes.push('首领/三阶段立绘，不要求对话头像');
  } else if (hasSprite || (portraitResult && portraitResult.direct)) {
    checkFaceAsset(rec, card);
  } else {
    rec.cols.face = '—';
  }
}

// ---------- 10. 输出 ----------
function dispWidth(s) {
  let w = 0;
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    const wide = c >= 0x1100 && (
      c <= 0x115f || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) ||
      (c >= 0xff00 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6) ||
      (c >= 0x20000 && c <= 0x3fffd));
    w += wide ? 2 : 1;
  }
  return w;
}
function padTo(s, width) {
  return String(s) + ' '.repeat(Math.max(0, width - dispWidth(s)));
}
function printTable(head, rows) {
  const widths = head.map((h, i) => Math.max(dispWidth(h), ...rows.map((r) => dispWidth(r[i]))));
  console.log(head.map((h, i) => padTo(h, widths[i])).join('  '));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  rows.forEach((r) => console.log(r.map((c, i) => padTo(c, widths[i])).join('  ')));
}
function printProblems() {
  const es = errors();
  const ws = warns();
  console.log('');
  if (!es.length && !ws.length) {
    console.log('问题清单：无');
    return;
  }
  console.log('问题清单：');
  if (es.length) {
    console.log('  错误 ' + es.length + ' 条（必须修，否则不能接入）：');
    es.forEach((p) => {
      console.log('    [错误] ' + p.scope + '：' + p.msg);
      if (p.fix) console.log('           修法：' + p.fix);
    });
  }
  if (ws.length) {
    console.log('  警告 ' + ws.length + ' 条（不阻断接入，建议排期修）：');
    ws.forEach((p) => {
      console.log('    [警告] ' + p.scope + '：' + p.msg);
      if (p.fix) console.log('           修法：' + p.fix);
    });
  }
}
function printDetails(recs) {
  if (!VERBOSE) return;
  console.log('\n明细（--verbose）：');
  recs.forEach((rec) => {
    console.log('  ' + rec.id + '（' + rec.group + '）：' + verdictOf(rec));
    rec.notes.forEach((n) => console.log('    · ' + n));
  });
}
function printVolume() {
  const kb = (n) => (n / 1024).toFixed(1);
  console.log('\n角色素材体积：像素 ' + byteTotal.pixel + ' B（' + kb(byteTotal.pixel) + ' KB）+ 立绘 ' +
    byteTotal.portrait + ' B（' + kb(byteTotal.portrait) + ' KB）= ' +
    (byteTotal.pixel + byteTotal.portrait) + ' B');
}
function printSummary(chars) {
  const es = errors();
  const ws = warns();
  console.log('');
  console.log(JSON.stringify({ chars: chars, errors: es.length, warns: ws.length, bytes: { pixel: byteTotal.pixel, portrait: byteTotal.portrait } }));
  console.log(es.length ? '角色校验未通过' : '角色校验通过');
  process.exitCode = es.length ? 1 : 0;
}

// ---------- 11. 主流程：校验工程里现有角色 ----------
function runMain() {
  const GD = loadGD();
  const cast = GD.cast || {};
  const npc = GD.npc || {};
  const all = [];
  Object.keys(cast).forEach((id) => all.push({ group: 'cast', id: id, card: cast[id] }));
  Object.keys(npc).forEach((id) => all.push({ group: 'npc', id: id, card: npc[id] }));
  if (!all.length) {
    fail('web/game/data/characters.js', 'GD.cast / GD.npc 里没有任何角色，无法校验',
      '确认 characters.js 能正常求值（先跑 node tools/game-check.mjs 看数据文件本身）。');
  }
  let picked = all;
  if (ID_ARG !== null) {
    picked = all.filter((r) => r.id === ID_ARG);
    if (!picked.length) {
      fail('--id', '找不到角色 "' + ID_ARG + '"（GD.cast / GD.npc 里都没有）',
        '现有 id：' + all.map((r) => r.id).join('、') + '；新角色可先跑 node tools/cast-check.mjs --scaffold ' + ID_ARG + ' 拿模板。');
    }
  }
  loadManifest();
  const recs = [];
  picked.forEach((item) => {
    const rec = newRec(item.group, item.id);
    rec.card = item.card;
    rec.GD = GD;
    if (item.group === 'cast') checkCastCard(rec, item.card, GD);
    else checkNpcCard(rec, item.card);
    recs.push(rec);
  });
  if (!recs.length) {
    printProblems();
    printSummary(0, 'main');
    return;
  }
  console.log('角色校验（' + (ID_ARG !== null ? '只查 ' + ID_ARG : '工程内全部 ' + recs.length + ' 个角色') + '）：\n');
  printTable(['id', '精灵', '头像', '立绘', '数值', '结论'],
    recs.map((r) => [r.id, r.cols.sprite, r.cols.face, r.cols.portrait, r.cols.stats, verdictOf(r)]));
  printDetails(recs);
  printProblems();
  printVolume();
  printSummary(recs.length, 'main');
}

// ---------- 12. --dir：校验别人交来的素材包 ----------
function walkFiles(dir) {
  const out = [];
  (function walk(d) {
    fs.readdirSync(d).sort().forEach((name) => {
      const abs = path.join(d, name);
      let st = null;
      try { st = fs.statSync(abs); } catch (e) { return; }
      if (st.isDirectory()) walk(abs);
      else out.push({ abs: abs, rel: path.relative(dir, abs).split(path.sep).join('/'), name: name });
    });
  })(dir);
  return out;
}

function runDir(dirArg) {
  const dir = path.resolve(process.cwd(), dirArg);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    fail('--dir', '目录不存在或不是目录：' + dir,
      '传一个真实存在的素材包目录，例如 --dir web/game/assets/incoming/xi（相对路径按当前工作目录解析）。');
    printProblems();
    printSummary(0, 'dir');
    return;
  }
  const files = walkFiles(dir);
  if (!files.length) {
    fail('--dir', '素材包目录是空的：' + dir,
      '一个角色至少要有 npc_<id>.png（64×96）；按 --scaffold 的清单交付三份 PNG。');
  }
  const recs = [];
  const keySeen = new Map();
  const spriteIds = new Set();
  const faceIds = new Set();
  const portraitIds = new Set();
  let spriteCount = 0;

  files.forEach((f) => {
    const rec = newRec('file', f.rel);
    if (!/\.png$/i.test(f.name)) {
      if (DELIVERY_BAD.test(f.name)) {
        note(rec, null, 'FAIL', f.rel + ' 不是 PNG（素材只收 .png）',
          '用 Aseprite / Photoshop 重新导出：像素图 PNG-8（≤24 色），立绘 PNG-8 或 PNG-24；JPEG/WebP/PSD/GIF 一律不收。');
      } else {
        note(rec, null, 'WARN', f.rel + ' 不是图片文件',
          '素材包里只放三份 PNG；说明文字放包外或仓库文档里，不要混进 assets。');
      }
      recs.push(rec);
      return;
    }
    const base = f.name.slice(0, -4);
    let kind = null;
    if (/^face_/.test(base)) kind = 'face';
    else if (/^pt_/.test(base)) kind = 'portrait';
    else if (/^(pc|npc)_/.test(base)) kind = 'sprite';
    if (!kind) {
      note(rec, null, 'FAIL', f.rel + ' 文件名不符合三类命名',
        '素材只收三种：精灵 npc_<id>.png / pc_<id>.png（64×96），对话头像 face_<id>.png（48×60），立绘 pt_<id>.png（1024×1536）。');
      recs.push(rec);
      return;
    }
    if (!NAME_RE[kind].test(base)) {
      note(rec, null, 'FAIL', f.rel + ' 不符合命名 ' + NAME_RE[kind],
        NAME_HINT[kind] + '；id 与角色卡里的 id 一致。');
      recs.push(rec);
      return;
    }
    if (keySeen.has(base)) {
      note(rec, null, 'FAIL', '同一个键 "' + base + '" 出现多次（' + keySeen.get(base) + ' / ' + f.rel + '）',
        '一个素材包只留一份，删掉重复文件。');
    }
    keySeen.set(base, f.rel);
    const got = checkPng(rec, null, base, kind, f.abs, f.rel);
    if (got && got.hdr) {
      if (kind === 'sprite') {
        spriteCount++;
        spriteIds.add(base.replace(/^(pc|npc)_/, ''));
        if (got.hdr.w === SPEC.sprite.w && got.hdr.h === SPEC.sprite.h && got.img) {
          checkSpriteFrames(rec, null, base, got.img, TWO_DIR_NPC.has(base) ? 2 : 4, SPEC.sprite);
        }
      } else if (kind === 'face') {
        faceIds.add(base.slice(5));
        if (got.hdr.w === SPEC.face.w && got.hdr.h === SPEC.face.h && got.img) checkFaceBox(rec, null, base, got.img);
      } else {
        portraitIds.add(base.slice(3).split('_')[0]);
      }
    }
    rec.kind = kind;
    recs.push(rec);
  });

  if (!spriteCount) {
    fail('素材包', '没有角色精灵图集（npc_<id>.png / pc_<id>.png）',
      '每个角色必须交 64×96 的像素图集；文件名里的 id 要与角色卡一致。');
  }
  if (!faceIds.size) {
    warn('素材包', '没有对话头像 face_<id>.png（可选）',
      '暂时没有只 warn；有头像就交 48×60 的 PNG-8，并在角色卡写 face: "face_<id>"。');
  }
  if (!portraitIds.size) {
    warn('素材包', '没有剧情立绘 pt_<id>.png（可选）',
      '需要立绘就交 1024×1536（≤220KB）单张；没有就只交精灵和头像。');
  }
  spriteIds.forEach((id) => {
    if (!faceIds.has(id)) {
      warn('素材包', '角色 ' + id + ' 没有对话头像 face_' + id + '.png（可选）',
        '补 48×60 的 PNG-8 头像并写 face 字段；没有只 warn。');
    }
    if (!portraitIds.has(id)) {
      warn('素材包', '角色 ' + id + ' 没有立绘 pt_' + id + '.png（可选）',
        '补 1024×1536 的立绘；没有只 warn。');
    }
  });
  faceIds.forEach((id) => {
    if (!spriteIds.has(id)) {
      warn('素材包', '头像 face_' + id + '.png 没有对应的精灵 npc_' + id + '.png',
        '检查 id 是否写错；素材包里的三份文件应当属于同一个角色。');
    }
  });

  console.log('素材包自查（' + dir + '，只检查合规，不进游戏）：\n');
  if (recs.length) {
    printTable(['文件', '类别', '结论'], recs.map((r) => [r.id, r.kind ? { sprite: '精灵', face: '头像', portrait: '立绘' }[r.kind] : '其他', verdictOf(r)]));
  }
  printDetails(recs);
  printProblems();
  printVolume();
  printSummary(spriteIds.size, 'dir');
}

// ---------- 13. --scaffold：打印可直接抄的角色卡模板 + 交付清单 ----------
function runScaffold(id) {
  if (!/^[a-z0-9]+$/.test(id)) {
    console.log('参数错误：--scaffold 的 id 只能用小写字母和数字（例如 xi、yan），不要用大写或下划线。');
    console.log(USAGE);
    process.exitCode = 1;
    return;
  }
  const GD = loadGD();
  const picks = GD.modelPicks || {};
  const sourceKeys = Object.keys(picks);
  const existing = (GD.cast || {})[id] || (GD.npc || {})[id] || null;
  const exampleSource = existing && existing.source ? existing.source : (sourceKeys[0] || 'deepseek');
  const lines = [];
  const push = (s) => lines.push(s === undefined ? '' : s);

  push('角色接入模板：' + id);
  push('='.repeat(60));
  push('');
  if (existing) {
    push('提示：工程里已有角色 "' + id + '"。下面是结构示例；新角色请换一个没被占用的 id，');
    push('      CONTRACT 只允许追加新键，不要覆盖已有角色的字段。');
    push('');
  }
  push('一、需要交付的三份素材（都是一张 PNG，文件名里的 <id> 换成 ' + id + '）');
  push('  必需  web/game/assets/pixel/npc_' + id + '.png       64×96    PNG-8 ≤24 色 透明底');
  push('        4 列 × 4 行，每格 16×24；列序 下/左/右/上，行序 idle/walk1/idle/walk2；≤40 KB');
  push('        帧序固定不能反；锚点是脚底中心 (8,24)，脚要贴到每格底边');
  push('  建议  web/game/assets/pixel/face_' + id + '.png      48×60    PNG-8 ≤24 色 透明底 单帧');
  push('        头顶贴画布上沿（不透明 bbox 顶部 y 在 0..6）、肩线到 y≥54；≤8 KB');
  push('        没有就先不写 face 字段，校验只 warn');
  push('  可选  web/game/assets/portrait/pt_' + id + '.png     1024×1536 PNG-8/PNG-24 透明底 单帧；≤220 KB');
  push('        人物占画布高度 78%–86%，上边缘留白 ≥8%');
  push('');
  push('二、角色卡（二选一，追加到 web/game/data/characters.js；不要改已有键）');
  push('');
  push('  ── 战斗角色：放进 GD.cast，用 withStats 生成数值 ──');
  push('    ' + id + ': withStats({');
  push('      id: ' + JSON.stringify(id) + ',');
  push('      name: \'<中文名>\',');
  push('      alias: \'<称号 · 综合第 ?>\',');
  push('      join: \'ch0.<入队交互点>\',');
  push('      gender: \'<女/男/未设定>\',');
  push('      role: \'<定位，如「开场同伴 · 续战力」>\',');
  push('      source: ' + JSON.stringify(exampleSource) + ',');
  push('      voice: \'<说话风格：自称、口癖、怎么称呼玩家角色>\',');
  push('      look: \'<外形与随身道具，一两句>\',');
  push('      props: [\'<道具1>\', \'<道具2>\'],');
  push('      manners: [\'<行为习惯1>\', \'<行为习惯2>\'],');
  push('      sprite: ' + JSON.stringify('npc_' + id) + ',');
  push('      portrait: ' + JSON.stringify('pt_' + id) + ',');
  push('      face: ' + JSON.stringify('face_' + id) + ',');
  push('      palette: [\'#2E6FA8\', \'#12324F\', \'#F4F5F7\', \'#C9D6E2\'],');
  push('      skills: [\'<技能 id>\', \'<技能 id>\'],');
  push('      bio: \'<两三句角色小传>\',');
  push('      community: \'社区印象（二创）：<社区观察，不是官方人设>\',');
  push('      fact: \'榜上条目 <榜上条目名>：<可查指标>。\'');
  push('    }, ' + JSON.stringify(exampleSource) + '),');
  push('');
  push('  ── 剧情 NPC：放进 GD.npc，没有 stats/derived/skills ──');
  push('    ' + id + ': {');
  push('      id: ' + JSON.stringify(id) + ', name: \'<中文名>\', alias: \'<称号>\', join: null,');
  push('      gender: \'<女/男/未设定>\',');
  push('      look: \'<外形与随身道具，一两句>\',');
  push('      sprite: ' + JSON.stringify('npc_' + id) + ', portrait: ' + JSON.stringify('pt_' + id) + ', face: ' + JSON.stringify('face_' + id) + ',');
  push('      palette: [\'#6B5B4A\', \'#2B2F3A\', \'#C9B48A\', \'#4E6B4A\'],');
  push('      bio: \'<两三句角色小传>\'');
  push('    },');
  push('');
  push('三、数值来源（不许手写）');
  push('  · 卡上不要写 stats：withStats(card, source) 会调用 GD.derive.pick(source) 自动生成，');
  push('    并把来源写进 derived.note，tools/cast-check.mjs 与 tools/game-check.mjs 都会逐项对账。');
  push('  · source 必须是 GD.modelPicks 的键：' + (sourceKeys.join(' / ') || '（GD.modelPicks 为空）'));
  push('  · 按来源复算出来的数值（供核对，不要抄进卡里）：');
  sourceKeys.forEach((k) => {
    const d = GD.derive && typeof GD.derive.pick === 'function' ? GD.derive.pick(k) : null;
    if (d) {
      push('      ' + padTo(k, 10) + ' hp ' + d.hp + '  atk ' + d.atk + '  def ' + d.def + '  spd ' + d.spd +
        '  slots ' + d.slots + '  quota ' + d.quota + '  quotaRegen ' + d.quotaRegen + '  costTier ' + d.costTier);
    }
  });
  push('  · 例外：玩家角色 observer 不映射任何榜单，source 写 null、stats 用叙事基线，');
  push('    并在 derived.note 写明「玩家角色不映射榜单模型，数值为叙事基线」。');
  push('');
  push('四、接入步骤（命令在仓库根目录跑）');
  push('  1) 素材先放 web/game/assets/incoming/' + id + '/，跑');
  push('     node tools/cast-check.mjs --dir web/game/assets/incoming/' + id);
  push('  2) 通过后把 PNG 拷进 pixel/（立绘进 portrait/），并删掉 incoming/' + id + '/');
  push('  3) 把上面的角色卡追加到 web/game/data/characters.js（只追加新键）');
  push('  4) node tools/art-check.mjs --write-manifest     # 重新登记 manifest.json / manifest.js');
  push('  5) node tools/cast-check.mjs --id ' + id + '      # 单角色复核');
  push('  两条命令都必须 exit 0（缺头像只会 warn，不算失败）');
  push('');
  push('五、常见退件原因');
  push('  · 尺寸不对 / 精灵帧顺序反了 / 锚点不在脚底 → 见 web/game/CAST-PIPELINE.md 第 4 节');
  push('  · 带抗锯齿、色数超 24、交 JPEG/WebP 改名 → 重新导出 PNG-8、关抗锯齿、压到 24 色');
  push('  · 数值手写导致漂移 → 删掉 stats，改用 withStats');
  push('  · 忘了跑 --write-manifest → manifest 未登记会判 FAIL');
  console.log(lines.join('\n'));
  if (errors().length) {
    printProblems();
    console.log('');
    console.log('角色校验未通过');
    process.exitCode = 1;
  }
}

// ---------- 14. 入口 ----------
function main() {
  if (hasFlag('--help') || hasFlag('-h')) {
    console.log(USAGE);
    return;
  }
  const needValue = [];
  if (hasFlag('--id') && ID_ARG === null) needValue.push('--id');
  if (hasFlag('--dir') && DIR_ARG === null) needValue.push('--dir');
  if (hasFlag('--scaffold') && SCAFFOLD_ARG === null) needValue.push('--scaffold');
  if (hasFlag('--root') && argOf('--root') === null) needValue.push('--root');
  if (needValue.length) {
    console.log('参数错误：' + needValue.join('、') + ' 后面缺少值。');
    console.log(USAGE);
    process.exitCode = 1;
    return;
  }
  const modeCount = [ID_ARG !== null, DIR_ARG !== null, SCAFFOLD_ARG !== null].filter(Boolean).length;
  if (modeCount > 1) {
    console.log('参数错误：--id / --dir / --scaffold 一次只能用一个。');
    console.log(USAGE);
    process.exitCode = 1;
    return;
  }
  if (SCAFFOLD_ARG !== null) { runScaffold(SCAFFOLD_ARG); return; }
  if (DIR_ARG !== null) { runDir(DIR_ARG); return; }
  runMain();
}
main();
