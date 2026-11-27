#!/usr/bin/env node
/* tools/art-check.mjs — 《残响协议》美术资源硬校验：manifest 登记、PNG 尺寸/色数、数据引用一致性、
   体积预算与来源合规。缺图、未登记、尺寸不对一律 exit 1（不是 warn）。只读，仅 --write-manifest 写登记表。
   用法：node tools/art-check.mjs [--root DIR] [--verbose] [--write-manifest] */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SELF, '..');
const argv = process.argv.slice(2);
const argOf = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const TARGET = path.resolve(argOf('--root') || ROOT);
const VERBOSE = argv.includes('--verbose');
const WRITE = argv.includes('--write-manifest');

const errors = [];
const warns = [];
const fail = (m) => errors.push(m);
const warn = (m) => warns.push(m);

// 类别 → 帧格尺寸、图集排布、锚点（ART-SPEC §0/§1/§2/§3/§5）
const KIND = {
  sprite: { dir: 'pixel', cell: [16, 24], cols: 4, rows: 4, anchor: [8, 24], maxBytes: 40 * 1024 },
  boss: { dir: 'pixel', cell: [32, 32], cols: 4, rows: 3, anchor: [16, 32], maxBytes: 30 * 1024 },
  tiles: { dir: 'pixel', cell: [16, 16], cols: 6, rows: 4, anchor: [0, 16], maxBytes: 120 * 1024 },
  bg: { dir: 'pixel', cell: [384, 224], cols: 1, rows: 1, anchor: [0, 224], maxBytes: 120 * 1024 },
  fx: { dir: 'pixel', cell: [64, 64], cols: 4, rows: 1, anchor: [32, 64], maxBytes: 64 * 1024 },
  ui: { dir: 'pixel', cell: null, cols: null, rows: null, anchor: null, maxBytes: 120 * 1024 },
  // 对话头像：48×60 单帧，左下角为锚点（对话框里按左下角定位，换行高不跑位）
  face: { dir: 'pixel', cell: [48, 60], cols: 1, rows: 1, anchor: [0, 60], maxBytes: 8 * 1024 },
  // 杂兵：32×32 单帧（只有首领做多阶段图集，小怪一帧够用）
  enemy: { dir: 'pixel', cell: [32, 32], cols: 1, rows: 1, anchor: [16, 32], maxBytes: 8 * 1024 },
  portrait: { dir: 'portrait', cell: [1024, 1536], cols: 1, rows: 1, anchor: [512, 1536], maxBytes: 220 * 1024 }
};
// 单帧杂兵名单：数据里 GD.enemies[*].sprite 指向它们（首领仍走 boss_ 图集）
const ENEMY_SINGLE = new Set(['page_mite', 'faded_photo', 'cache_moth', 'rank_auditor']);
// UI 三张的格宽不同，单独登记
const UI_CELL = {
  ui_slot_frame: { cell: [48, 48], cols: 3, rows: 1, anchor: [0, 48] },
  ui_slot_icons: { cell: [16, 16], cols: 12, rows: 3, anchor: [0, 16] },
  ui_portrait_frame: { cell: [64, 64], cols: 1, rows: 1, anchor: [0, 64] }
};
// 只做两向的 NPC（ART-SPEC §1）
const DIRS2 = new Set(['npc_pan', 'npc_jian']);
// ART-SPEC §4 登记的 33 张立绘，多出来的差分视为未登记
const PORTRAIT_DOC = new Set([
  'pt_observer', 'pt_observer_profile', 'pt_observer_half', 'pt_observer_bust',
  'pt_xi', 'pt_xi_frown', 'pt_xi_half', 'pt_xi_bust',
  'pt_jin', 'pt_jin_fold', 'pt_jin_half', 'pt_jin_bust',
  'pt_juan', 'pt_juan_unroll', 'pt_juan_half', 'pt_juan_bust',
  'pt_mu', 'pt_mu_frame', 'pt_mu_half', 'pt_mu_bust',
  'pt_kai', 'pt_kai_thin', 'pt_kai_half', 'pt_kai_bust',
  'pt_pan', 'pt_pan_stop', 'pt_pan_bust',
  'pt_jian', 'pt_jian_cover', 'pt_jian_bust',
  'pt_devourer_p1', 'pt_devourer_p2', 'pt_devourer_p3'
]);

const ASSETS = path.join(TARGET, 'web/game/assets');
const MANIFEST = path.join(ASSETS, 'manifest.json');
const MANIFEST_JS = path.join(ASSETS, 'manifest.js');

/** 读 PNG 头：尺寸、位深、色彩类型、调色板色数、是否隔行、是否带 tRNS。 */
function readPng(file) {
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

/** 按命名归类。返回 null 表示名字不符合 ART-SPEC §0 的 <类别>_<id> 约定。 */
function kindOf(key, dir) {
  if (dir === 'portrait') return /^pt_[a-z0-9_]+$/.test(key) ? 'portrait' : null;
  if (/^bg_[a-z0-9]+$/.test(key)) return 'bg';
  if (key === 'tiles_world') return 'tiles';
  if (/^boss_[a-z0-9]+$/.test(key)) return 'boss';
  if (/^fx_[a-z0-9_]+$/.test(key)) return 'fx';
  if (/^ui_[a-z0-9_]+$/.test(key)) return 'ui';
  if (/^face_[a-z0-9]+$/.test(key)) return 'face';
  if (ENEMY_SINGLE.has(key)) return 'enemy';
  if (/^(pc|npc)_[a-z0-9]+$/.test(key)) return 'sprite';
  return null;
}

/** 按 PNG 实测数据生成登记条目；内容是推导出来的，不手填。 */
function entryFor(key, dir) {
  const kind = kindOf(key, dir);
  const spec = KIND[kind];
  const png = readPng(path.join(ASSETS, dir, key + '.png'));
  const geo = kind === 'ui' ? UI_CELL[key] : { cell: spec.cell, cols: spec.cols, rows: spec.rows, anchor: spec.anchor };
  const item = {
    key,
    file: 'assets/' + dir + '/' + key + '.png',
    w: png.w,
    h: png.h,
    anchor: geo.anchor,
    frames: geo.cols * geo.rows,
    bytes: png.bytes,
    kind,
    cell: geo.cell,
    cols: geo.cols,
    rows: geo.rows
  };
  if (kind === 'sprite') item.dirs = DIRS2.has(key) ? 2 : 4;
  return item;
}

function scanDisk() {
  const out = [];
  for (const dir of ['pixel', 'portrait']) {
    const abs = path.join(ASSETS, dir);
    if (!fs.existsSync(abs)) { fail('缺少资源目录 web/game/assets/' + dir); continue; }
    for (const f of fs.readdirSync(abs).sort()) {
      if (!f.toLowerCase().endsWith('.png')) {
        fail('web/game/assets/' + dir + '/' + f + ' 不是 PNG，资源目录只收 .png');
        continue;
      }
      out.push({ key: f.slice(0, -4), dir, file: abs + '/' + f });
    }
  }
  return out;
}

const disk = scanDisk();
if (!disk.length) fail('web/game/assets 下没有任何 PNG，无法登记');

// ---------- 先在内存里推导完整登记表 ----------
const derived = {};
for (const f of disk) {
  const kind = kindOf(f.key, f.dir);
  if (!kind) { fail('文件名不符合 ART-SPEC §0 命名：' + f.dir + '/' + f.key + '.png'); continue; }
  if (kind === 'ui' && !UI_CELL[f.key]) { fail('UI 资源 ' + f.key + ' 未在 art-check 登记格尺寸（ART-SPEC §5 未定义该图）'); continue; }
  if (derived[f.key]) { fail('key 重复：' + f.key); continue; }
  derived[f.key] = entryFor(f.key, f.dir);
}

if (WRITE) {
  const items = {};
  for (const k of Object.keys(derived).sort()) items[k] = derived[k];
  const doc = {
    v: 1,
    source: 'tools/art-check.mjs --write-manifest',
    note: '引擎按 key 取图；cell/cols/rows 为图集切分，anchor 相对单帧（精灵为脚底中心，道具为左下）。w/h 为整图尺寸。',
    totalBytes: Object.values(items).reduce((a, i) => a + i.bytes, 0),
    items
  };
  fs.writeFileSync(MANIFEST, JSON.stringify(doc, null, 2) + '\n');
  // file:// 页面不能 fetch/XHR 读 json（WebView 实测 onerror），readAsset 也只放行 web/seed/，
  // 因此同一份数据必须同时产出可被 <script> 加载的 JS 版本；两份都由本脚本派生，不手改。
  const jsBody = JSON.stringify(doc, null, 1).split('\n').join('\n  ');
  fs.writeFileSync(MANIFEST_JS, '/* 由 tools/art-check.mjs --write-manifest 生成，勿手改：数据同 manifest.json。 */\n'
    + "(function (w) {\n  'use strict';\n  w.GameAssets = " + jsBody + ';\n})(window);\n');
  console.log('已写入 web/game/assets/manifest.json + manifest.js：' + Object.keys(items).length + ' 条，' + doc.totalBytes + ' 字节');
  if (!errors.length) process.exit(0);
}

// ---------- A. manifest 本身 ----------
let manifest = null;
if (!fs.existsSync(MANIFEST)) fail('缺少 web/game/assets/manifest.json（ART-SPEC §7 要求每张图登记）');
else {
  try { manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch (e) { fail('manifest.json 解析失败：' + e.message); }
}
const items = (manifest && manifest.items) || {};
if (manifest && manifest.v !== 1) fail('manifest.v 应为 1，实际 ' + manifest.v);
if (manifest && !Object.keys(items).length) fail('manifest.items 为空');

// ---------- B. 逐条对账：磁盘 ↔ 登记表 ↔ PNG 实测 ----------
for (const key of Object.keys(derived)) {
  const want = derived[key];
  const got = items[key];
  if (!got) { fail('图 ' + want.file + ' 未在 manifest.json 登记'); continue; }
  for (const f of ['key', 'file', 'w', 'h', 'anchor', 'frames', 'bytes']) {
    if (!(f in got)) fail('manifest[' + key + '] 缺字段 ' + f);
  }
  if (got.file !== want.file) fail('manifest[' + key + '].file 应为 ' + want.file + '，实际 ' + got.file);
  if (got.w !== want.w || got.h !== want.h) fail('manifest[' + key + '] 尺寸 ' + got.w + '×' + got.h + '，实测 ' + want.w + '×' + want.h);
  // bytes 是派生统计（美术迭代会变），尺寸/通道/帧数才是硬约束；漂移只提示重跑 --write-manifest
  if (got.bytes !== want.bytes) warn('manifest[' + key + '].bytes 与文件实际大小不符（' + got.bytes + ' vs ' + want.bytes + '），请重跑 node tools/art-check.mjs --write-manifest');
  if (got.frames !== want.frames) fail('manifest[' + key + '].frames 应为 ' + want.frames + '，实际 ' + got.frames);
  if (!Array.isArray(got.anchor) || got.anchor.length !== 2) fail('manifest[' + key + '].anchor 必须是 [x,y]');
  if (got.kind && got.kind !== want.kind) fail('manifest[' + key + '].kind 应为 ' + want.kind + '，实际 ' + got.kind);
  for (const f of ['cell', 'cols', 'rows']) {
    if (got[f] === undefined) warn('manifest[' + key + '] 缺可选字段 ' + f + '（引擎按图集切图时需要）');
  }
  if (got.cell) {
    if (got.cell[0] * got.cols !== want.w || got.cell[1] * got.rows !== want.h) {
      fail('manifest[' + key + '] 图集切分不自洽：cell ' + got.cell.join('×') + ' × ' + got.cols + '×' + got.rows + ' ≠ ' + want.w + '×' + want.h);
    }
    const a = got.anchor;
    if (!(a[0] >= 0 && a[0] <= got.cell[0] && a[1] >= 0 && a[1] <= got.cell[1])) {
      fail('manifest[' + key + '].anchor ' + a.join(',') + ' 超出单帧范围 ' + got.cell.join('×'));
    }
  }
}
for (const key of Object.keys(items)) if (!derived[key]) fail('manifest 登记了磁盘上不存在的图：' + items[key].file);
if (!fs.existsSync(MANIFEST_JS)) {
  fail('缺少 web/game/assets/manifest.js（file:// 页面无法 fetch json，引擎只能按脚本加载图集登记表）');
} else {
  const jsSrc = fs.readFileSync(MANIFEST_JS, 'utf8');
  const w = {};
  try { new Function('window', jsSrc)(w); } catch (e) { fail('manifest.js 求值失败：' + e.message); }
  const jsItems = (w.GameAssets && w.GameAssets.items) || {};
  const missing = Object.keys(items).filter((k) => !jsItems[k]);
  if (missing.length) fail('manifest.js 与 manifest.json 不同步（缺 ' + missing.slice(0, 3).join('、') + '），请重跑 --write-manifest');
  for (const k of Object.keys(jsItems)) if (!items[k]) fail('manifest.js 含 manifest.json 没有的条目：' + k);
}
if (manifest && typeof manifest.totalBytes === 'number') {
  const sum = Object.keys(items).reduce((a, k) => a + (items[k].bytes || 0), 0);
  if (manifest.totalBytes !== sum) fail('manifest.totalBytes=' + manifest.totalBytes + ' 与条目合计 ' + sum + ' 不符');
}

// ---------- C. PNG 规范与预算 ----------
const PIXEL_COLOR_MAX = 24;
let pixelBytes = 0;
let portraitBytes = 0;
for (const f of disk) {
  const png = readPng(f.file);
  if (!png) { fail(f.dir + '/' + f.key + '.png 不是合法 PNG'); continue; }
  if (png.interlace !== 0) fail(f.key + '.png 用了隔行扫描，Chrome 解码慢，且像素图会被插值');
  if (png.bitDepth !== 8) fail(f.key + '.png 位深应为 8，实际 ' + png.bitDepth);
  const kind = kindOf(f.key, f.dir);
  if (kind === 'portrait') {
    portraitBytes += png.bytes;
    if (png.colorType !== 3 && png.colorType !== 2) fail(f.key + '.png 色彩类型应为调色板(3)或真彩(2)，实际 ' + png.colorType);
    if (png.w !== 1024 || png.h !== 1536) fail(f.key + '.png 立绘尺寸应为 1024×1536，实际 ' + png.w + '×' + png.h);
    if (png.bytes > KIND.portrait.maxBytes) fail(f.key + '.png ' + png.bytes + ' 字节超过立绘预算 ' + KIND.portrait.maxBytes);
    if (!PORTRAIT_DOC.has(f.key)) warn(f.key + '.png 未在 ART-SPEC §4 登记，建议补登');
  } else {
    pixelBytes += png.bytes;
    if (png.colorType !== 3) fail(f.key + '.png 像素图必须是调色板 PNG-8，实际色彩类型 ' + png.colorType);
    if (png.colors > PIXEL_COLOR_MAX) fail(f.key + '.png 用了 ' + png.colors + ' 色，超过每张 ≤' + PIXEL_COLOR_MAX + ' 色');
    const spec = KIND[kind];
    const geo = kind === 'ui' ? UI_CELL[f.key] : spec;
    const wantW = geo.cell[0] * geo.cols;
    const wantH = geo.cell[1] * geo.rows;
    if (png.w !== wantW || png.h !== wantH) fail(f.key + '.png 图集尺寸应为 ' + wantW + '×' + wantH + '（' + geo.cell.join('×') + ' × ' + geo.cols + '列' + geo.rows + '行），实际 ' + png.w + '×' + png.h);
    if (png.bytes > spec.maxBytes) fail(f.key + '.png ' + png.bytes + ' 字节超过该类预算 ' + spec.maxBytes);
  }
}
const totalBytes = pixelBytes + portraitBytes;
if (totalBytes > 3.2 * 1024 * 1024) fail('美术资源合计 ' + totalBytes + ' 字节，超过 ART-SPEC §6 的 3.2 MB 预算');

// ---------- D. 数据引用一致性 ----------
const DATA = path.join(TARGET, 'web/game/data');
function loadData() {
  const win = {};
  for (const f of ['roster-source.js', 'world.js', 'characters.js', 'dialog.js', 'quests.js', 'progress.js']) {
    const file = path.join(DATA, f);
    if (!fs.existsSync(file)) { fail('缺少 web/game/data/' + f); continue; }
    try { new Function('window', fs.readFileSync(file, 'utf8'))(win); } catch (e) { fail(f + ' 求值失败：' + e.message); }
  }
  return win.GameData || {};
}
const GD = loadData();
const refs = new Map();
const addRef = (key, who) => { if (!key) return; if (!refs.has(key)) refs.set(key, []); refs.get(key).push(who); };
for (const [id, c] of Object.entries(GD.cast || {})) { addRef(c.sprite, 'characters.' + id + '.sprite'); addRef(c.portrait, 'characters.' + id + '.portrait'); addRef(c.face, 'characters.' + id + '.face'); }
for (const [id, n] of Object.entries(GD.npc || {})) { addRef(n.sprite, 'npc.' + id + '.sprite'); addRef(n.portrait, 'npc.' + id + '.portrait'); addRef(n.face, 'npc.' + id + '.face'); }
for (const [id, e] of Object.entries(GD.enemies || {})) {
  if (e.sprite) addRef(e.sprite, 'enemies.' + id + '.sprite');
  if (e.boss) addRef('boss_' + id, 'enemies.' + id + '.boss');
}
for (const [id, node] of Object.entries(GD.dialog || {})) addRef(node.portrait, 'dialog.' + id + '.portrait');
// 首领立绘按阶段出图（ART-SPEC §4：吞页兽只有 _p1/_p2/_p3），数据写基名时按阶段一解析
const PHASE = /^(.+)_p[123]$/;
function resolveRef(key) {
  if (derived[key]) return key;
  const phases = Object.keys(derived).filter((k) => { const m = PHASE.exec(k); return m && m[1] === key; });
  if (phases.length === 3) return key + '_p1';
  return null;
}
for (const [key, who] of refs) {
  const real = resolveRef(key);
  if (!real) { fail('数据引用了不存在的图：' + key + '（' + who.join('、') + '）'); continue; }
  if (real !== key) warn(key + ' 无单张立绘，按三阶段图集解析为 ' + real + '（引擎需实现阶段切换）');
  const target = derived[real];
  const kind = target.kind;
  if (who.some((w) => w.endsWith('.sprite')) && kind !== 'sprite' && kind !== 'boss' && kind !== 'enemy') fail(key + ' 被当作精灵引用，但登记类别是 ' + kind);
  if (who.some((w) => w.endsWith('.portrait')) && kind !== 'portrait') fail(key + ' 被当作立绘引用，但登记类别是 ' + kind);
  if (who.some((w) => w.endsWith('.face')) && kind !== 'face') fail(key + ' 被当作对话头像引用，但登记类别是 ' + kind);
}

// ---------- E. 来源合规与措辞 ----------
const FORBID_SUPER = /最强|最便宜|第一名|第一位|完爆|碾压/;
// 来源标注：社区印象（二创）为主，产品侧（可查）用于非二创的可查能力描述，榜上条目/榜上事实用于纯数值陈述
const SOURCE_TAG = /社区印象|产品侧（可查）|榜上条目|榜上事实/;
const FORBID_FILE = /(参考|参照|图鉴|reference|refo?|shots?|screenshot|过程稿|废稿|草稿)\.(png|jpg|jpeg|webp|gif|psd|md)$/i;
const NON_PNG = /\.(jpg|jpeg|webp|gif|psd|bmp|tif|tiff|zip|rar|7z|pdf|docx?)$/i;
(function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const rel = path.relative(TARGET, abs).split(path.sep).join('/');
    if (fs.statSync(abs).isDirectory()) { walk(abs); continue; }
    if (NON_PNG.test(name)) fail('资源目录出现非交付格式文件：' + rel);
    if (FORBID_FILE.test(name)) fail('资源目录出现参考图/过程稿：' + rel);
  }
})(ASSETS);
function scanText(obj, where) {
  if (!obj || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    const rel = where ? where + '.' + k : k;
    if (typeof v === 'string' && /^(community|fact|impression|line|text)$/.test(k)) {
      if ((k === 'community' || k === 'impression') && v.trim() && !SOURCE_TAG.test(v)) {
        fail(rel + ' 是印象类文案但没有来源标注（社区印象（二创）/产品侧（可查）/榜上条目）：' + v.slice(0, 40) + '…');
      }
      if (FORBID_SUPER.test(v)) fail(rel + ' 出现未标注来源的绝对化评价（' + v.match(FORBID_SUPER)[0] + '）');
    } else if (Array.isArray(v)) v.forEach((it, i) => scanText(it, rel + '[' + i + ']'));
    else if (v && typeof v === 'object') scanText(v, rel);
  }
}
// 全量扫描：cast 的技能/bio、dialog 台词、quests 提示都在其中；跳过 world（ASCII 地图无文案）
for (const [k, v] of Object.entries(GD)) {
  if (k === 'world' || k === 'tileAt' || k === 'walkable') continue;
  scanText(v, k);
}
if (TARGET === ROOT) {
  try {
    const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
    for (const f of tracked) {
      if (/^(docs\/shots|research|references|参考)/i.test(f)) fail('仓库跟踪了参考/截图目录：' + f);
      if (/\.(png|jpe?g|webp|psd)$/i.test(f) && !f.startsWith('web/game/assets/') && !f.startsWith('web/assets/') && !f.startsWith('android/res/')) {
        fail('仓库跟踪了交付范围外的图片：' + f);
      }
    }
  } catch (e) { warn('git ls-files 不可用，跳过版本库来源扫描：' + e.message); }
}

// ---------- 输出 ----------
const summary = {
  pngs: disk.length,
  pixel: disk.filter((f) => f.dir === 'pixel').length,
  portrait: disk.filter((f) => f.dir === 'portrait').length,
  face: disk.filter((f) => (derived[f.key] || {}).kind === 'face').length,
  enemy: disk.filter((f) => (derived[f.key] || {}).kind === 'enemy').length,
  manifest: Object.keys(items).length,
  refs: refs.size,
  pixelBytes,
  portraitBytes,
  totalBytes
};
if (VERBOSE) console.log(JSON.stringify({ summary, warns }, null, 2));
else console.log('汇总 ' + JSON.stringify(summary));
if (warns.length) { console.log('\n警告 ' + warns.length + ' 条：'); warns.forEach((m) => console.log('  ! ' + m)); }
if (errors.length) { console.log('\n错误 ' + errors.length + ' 条：'); errors.forEach((m) => console.log('  x ' + m)); process.exit(1); }
console.log('\n美术资源校验通过：' + (warns.length ? '有警告，无错误' : '零警告零错误'));
