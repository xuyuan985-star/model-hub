#!/usr/bin/env node
/**
 * tools/build-cn-bench.mjs — 抓取「非线智能 ReLE 中文大模型评测榜」（MIT 风格公开数据），
 * 从仓库 leaderboard/*.md 的 Markdown 表格解析成结构化 JSON，供 App 内置展示。
 *
 * 数据来源：https://github.com/jeinlee1991/chinese-llm-benchmark
 * 输出：web/seed/cn_bench.json
 *
 * 只做解析与规整，不改写任何评测分数的语义；解析失败时保留旧快照。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'web', 'seed', 'cn_bench.json');
const REPO = 'jeinlee1991/chinese-llm-benchmark';
const RAW = 'https://raw.githubusercontent.com/' + REPO + '/main/';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';

// 维度键 -> [中文名, 表头匹配关键词]（表头形如「医疗与心理健康」，用短词匹配避开连接词差异）
const DIMS = [
  ['edu', '教育', '教育'],
  ['medical', '医疗心理', '医疗'],
  ['finance', '金融', '金融'],
  ['legal', '法律公务', '法律'],
  ['reason', '推理数学', '推理'],
  ['instruct', '语言指令', '语言'],
  ['agent', 'Agent 工具', 'agent'],
  ['coding', '编程', 'coding']
];

async function fetchText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(url + ' -> ' + r.status);
  return r.text();
}

/** 把 markdown 表格切成二维数组；跳过对齐行和全空列。 */
function parseTable(md) {
  const rows = md.split(/\r?\n/).filter(l => l.trim().startsWith('|'));
  if (!rows.length) return { head: [], body: [] };
  const cells = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(s => s.trim());
  const head = cells(rows[0]);
  const body = rows.slice(1)
    .filter(l => !/^\s*\|?[\s:|-]+\|?\s*$/.test(l))
    .map(cells)
    .filter(c => c.some(x => x));
  return { head, body };
}

/** "80.8%" -> 80.8；"140.0元" -> 140；"/" 或空 -> null */
function num(s) {
  if (s == null) return null;
  const t = String(s).replace(/,/g, '').trim();
  if (!t || t === '/' || t === '-' || t === '—' || /TODO/i.test(t)) return null;
  const m = t.match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/** 模型名里带 (new) 之类的标记单独拆出来，方便按基础名去重与匹配。 */
function splitName(raw) {
  const name = String(raw || '').trim();
  const m = name.match(/^(.*?)\(([^()]+)\)$/);
  return { name: (m ? m[1] : name).trim(), tag: m ? m[2].trim() : '' };
}

/** 机构英文名 -> 展示名（只改常见几家，其余原样） */
const ORG = {
  'anthropic': 'Anthropic', 'openai': 'OpenAI', 'google': 'Google', 'meta': 'Meta', 'xai': 'xAI',
  'deepseek': 'DeepSeek', 'alibaba': '阿里', 'qwen': '阿里', 'baidu': '百度', 'tencent': '腾讯',
  'bytedance': '字节', 'zhipu': '智谱', 'moonshot': '月之暗面', 'kimi': '月之暗面', 'minimax': 'MiniMax',
  'stepfun': '阶跃', 'sensetime': '商汤', 'xiaomi': '小米', '01ai': '零一', 'lingyi': '零一',
  'mistral': 'Mistral', 'nvidia': 'NVIDIA', 'microsoft': '微软', 'iflytek': '讯飞'
};
function orgName(s) {
  const k = String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return ORG[k] || String(s || '').trim();
}

/** 从 alldata.md 解析主榜。列：排名|大模型|机构|输出价格|总分|(空)|7 个维度 ... */
function parseMain(md) {
  const { head, body } = parseTable(md);
  // 按表头定位列，避免列顺序变化导致错位
  const find = (kw) => head.findIndex(h => h.indexOf(kw) >= 0);
  const iRank = find('排名'), iModel = find('大模型'), iOrg = find('机构'), iPrice = find('价格'), iTotal = find('总分');
  const iDims = DIMS.map(d => head.findIndex(h => h.toLowerCase().indexOf(d[2].toLowerCase()) >= 0));

  const out = [];
  body.forEach(c => {
    const rawName = c[iModel];
    if (!rawName) return;
    const total = num(c[iTotal]);
    if (total == null) return;
    const sp = splitName(rawName);
    const rec = {
      rank: num(c[iRank]) || out.length + 1,
      name: sp.name,
      tag: sp.tag,
      org: orgName(c[iOrg]),
      priceYuan: num(c[iPrice]),
      total
    };
    DIMS.forEach((d, k) => { const v = iDims[k] >= 0 ? num(c[iDims[k]]) : null; if (v != null) rec[d[0]] = v; });
    out.push(rec);
  });
  out.sort((a, b) => b.total - a.total);
  out.forEach((r, i) => { r.rank = i + 1; });
  return out;
}

async function main() {
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;

  let md;
  try {
    md = await fetchText(RAW + 'leaderboard/alldata.md');
  } catch (e) {
    console.error('[cn-bench] 抓取失败，保留旧快照：', e.message);
    process.exit(prev ? 0 : 1);
  }

  const rows = parseMain(md);
  const dims = DIMS.map(d => ({ key: d[0], name: d[1], count: rows.filter(r => r[d[0]] != null).length }))
    .filter(d => d.count > 0);
  if (rows.length < 20) {
    console.error('[cn-bench] 解析出的模型只有 ' + rows.length + ' 个，疑似格式变化，保留旧快照');
    process.exit(prev ? 0 : 1);
  }

  const out = {
    fetchedAt: Date.now(),
    data: {
      rows,
      dims,
      meta: {
        source: '非线智能 ReLE 中文评测',
        url: 'https://github.com/' + REPO,
        count: rows.length,
        updatedAt: new Date().toISOString()
      }
    }
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`cn_bench.json: ${rows.length} 个模型, ${dims.length} 个维度, ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB`);
}

main().catch(e => { console.error(e); process.exit(1); });
