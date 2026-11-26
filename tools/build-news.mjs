#!/usr/bin/env node
/**
 * tools/build-news.mjs — 自动抓取 AI 快讯、平台动态与置顶速报（GitHub Issues），
 * 支持可选接入 DeepSeek / 任意 OpenAI 兼容 API 批量翻译与提炼中文速报。
 *
 * 环境变量（全部可选）：
 *   LLM_API_KEY   — DeepSeek 或 OpenDesign 等 OpenAI 兼容密钥（不填则跳过润色，直出原文）
 *   LLM_BASE_URL  — 默认 https://api.deepseek.com/v1
 *   LLM_MODEL     — 默认 deepseek-chat
 *   GITHUB_TOKEN  — 读取仓库置顶速报 Issue 用（GitHub Actions 自带）
 *   GITHUB_REPO   — 默认 xuyuan985-star/model-hub
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = path.join(root, 'web', 'seed', 'news.json');
const REPO = process.env.GITHUB_REPO || 'xuyuan985-star/model-hub';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';
const KEEP_DAYS = 14;
const MAX_ITEMS = 80;

const AI_KW = /\b(llm|gpt-?\d?|claude|gemini|deepseek|qwen|glm-?\d?|kimi|minimax|openai|anthropic|grok|llama|mistral|opencode|opendesign|command\s*code|codex|cursor|agent|mcp|benchmark|reasoning|sora|wan\s*\d|flux|seedance|nano\s*banana|chatgpt|copilot)\b|大模型|人工智能|智能体|深度求索|通义|千问|智谱|月之暗面|豆包|开源模型|文生图|文生视频|词元/i;
const NOISE_KW = /智驾|蔚来|小鹏|理想汽车|比亚迪|耳机外观|手机壳|电动车/i;

const FEEDS = [
  { id: 'qbitai', name: '量子位', cat: 'industry', url: 'https://www.qbitai.com/feed', lang: 'zh', limit: 12 },
  { id: 'ithome', name: 'IT之家', cat: 'industry', url: 'https://www.ithome.com/rss/', lang: 'zh', filterAi: true, limit: 12 },
  { id: 'openai', name: 'OpenAI', cat: 'model', url: 'https://openai.com/news/rss.xml', lang: 'en', limit: 8 },
  { id: 'google', name: 'Google AI', cat: 'model', url: 'https://blog.google/technology/ai/rss/', lang: 'en', limit: 8 },
  { id: 'deepmind', name: 'DeepMind', cat: 'model', url: 'https://deepmind.google/blog/rss.xml', lang: 'en', limit: 6 },
  { id: 'hf', name: 'Hugging Face', cat: 'model', url: 'https://huggingface.co/blog/feed.xml', lang: 'en', limit: 6 },
  { id: 'techcrunch', name: 'TechCrunch AI', cat: 'industry', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', lang: 'en', limit: 8 },
  { id: 'simonw', name: 'Simon Willison', cat: 'tool', url: 'https://simonwillison.net/atom/everything/', lang: 'en', filterAi: true, limit: 6 },
  { id: 'opendesign', name: 'OpenDesign', cat: 'tool', url: 'https://github.com/nexu-io/open-design/releases.atom', lang: 'en', limit: 4 },
  { id: 'opencode', name: 'OpenCode', cat: 'tool', url: 'https://github.com/anomalyco/opencode/releases.atom', lang: 'en', limit: 4 }
];

function decodeXml(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function tagText(block, tag) {
  const m = block.match(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + tag + '>', 'i'));
  return m ? decodeXml(m[1]) : '';
}

function entryLink(block) {
  const atom = block.match(/<link[^>]+href=["']([^"']+)["']/i);
  if (atom) return atom[1].replace(/&amp;/g, '&');
  return tagText(block, 'link');
}

function parseFeed(xml, feed) {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/gi) || [];
  const out = [];
  for (const b of blocks) {
    const title = tagText(b, 'title');
    const url = entryLink(b);
    if (!title || !url) continue;
    const rawDesc = tagText(b, 'description') || tagText(b, 'summary') || tagText(b, 'content');
    const summary = rawDesc.slice(0, 220);
    if (feed.filterAi && (!AI_KW.test(title) || NOISE_KW.test(title))) continue;
    const rawDate = tagText(b, 'pubDate') || tagText(b, 'published') || tagText(b, 'updated') || tagText(b, 'dc:date');
    const ts = Date.parse(rawDate) || Date.now();
    out.push({
      id: crypto.createHash('sha1').update(url).digest('hex').slice(0, 12),
      cat: feed.cat,
      src: feed.name,
      lang: feed.lang,
      title: title.slice(0, 140),
      summary,
      url,
      at: ts,
      pin: false
    });
    if (out.length >= (feed.limit || 8)) break;
  }
  return out;
}

async function fetchJson(url, headers = {}) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

async function fetchText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(r.status);
  return r.text();
}

/** 读取 Hacker News 近期高分 AI 讨论 */
async function fetchHN() {
  const since = Math.floor((Date.now() - 7 * 864e5) / 1000);
  const url = 'https://hn.algolia.com/api/v1/search_by_date?query=LLM+OR+Claude+OR+GPT+OR+DeepSeek+OR+Gemini+OR+OpenAI+OR+Anthropic&tags=story&numericFilters=points>80,created_at_i>' + since + '&hitsPerPage=10';
  const j = await fetchJson(url);
  return (j.hits || []).filter(h => h.title && AI_KW.test(h.title)).map(h => {
    const link = h.url || ('https://news.ycombinator.com/item?id=' + h.objectID);
    return {
      id: 'hn_' + h.objectID,
      cat: 'industry',
      src: 'Hacker News',
      lang: 'en',
      title: h.title.slice(0, 140),
      summary: 'HN 热度 ' + (h.points || 0) + ' 赞 · ' + (h.num_comments || 0) + ' 条讨论',
      url: link,
      at: (h.created_at_i || Math.floor(Date.now() / 1000)) * 1000,
      pin: false
    };
  });
}

/** 读取仓库所有者发的、带「快讯 / news / 置顶」标签的开放 Issue 作为置顶速报（忽略陌生人开的 Issue） */
async function fetchPinnedIssues() {
  const headers = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
  const owner = REPO.split('/')[0].toLowerCase();
  const list = await fetchJson(`https://api.github.com/repos/${REPO}/issues?state=open&creator=${encodeURIComponent(owner)}&per_page=20`, headers);
  if (!Array.isArray(list)) return [];
  return list.filter(it => {
    if (it.pull_request) return false;
    if (String(it.user?.login || '').toLowerCase() !== owner) return false;
    const labels = (it.labels || []).map(l => String(l.name || '').toLowerCase());
    return labels.some(l => l === '快讯' || l === 'news' || l === '置顶' || l === 'pin' || l === '速报');
  }).map(it => {
    const labels = (it.labels || []).map(l => String(l.name || '').toLowerCase());
    const body = String(it.body || '').replace(/\r/g, '').trim();
    const lines = body.split('\n').map(s => s.trim()).filter(Boolean);
    const linkMatch = body.match(/https?:\/\/\S+/);
    return {
      id: 'iss_' + it.number,
      cat: 'pin',
      src: '圈内速报',
      lang: 'zh',
      title: String(it.title || '').slice(0, 120),
      summary: lines.join(' ').slice(0, 260),
      url: linkMatch ? linkMatch[0].replace(/[)》」】.,]+$/, '') : it.html_url,
      at: Date.parse(it.updated_at || it.created_at) || Date.now(),
      pin: true,
      aiDone: true, // 作者手发的速报保持原话，不让 AI 改写
      urgent: labels.includes('置顶') || labels.includes('pin')
    };
  });
}

/**
 * 用 DeepSeek（如 OpenDesign 源 DeepSeek V4.1 Flash）或任意 OpenAI 兼容接口
 * 批量将新抓取的英文/冗长快讯提炼为简明中文速报。
 * 安全提示：绝不把 apiKey 打印到 stdout/stderr，也不写入 news.json。
 */
const SYSTEM_PROMPT = [
  '你是「模型行情」App 的 AI 行业快讯主编。读者是关注大模型榜单、API 价格变动、优惠补偿和 AI 编程工具的中文用户。',
  '你的任务：把输入的原始英文/中文快讯数组，整理成克制、客观、信息密度高的简体中文速报。',
  '',
  '【改写规则】',
  '1. title（不超过 32 字）：先给主语和核心动作，禁止震惊体、禁止营销感叹号。模型名、版本号、涨降价幅度、额度数字必须保留原文（如 GPT-6.2 Astra、Claude Fable 5.2、DeepSeek V4.1 Flash、+40%、$10/月）。',
  '2. summary（40~75 字）：1~2 句人话，讲清「发生了什么」和「对开发者/普通用户的实际影响」（比如是否免费、怎么用、价格/速度变化多少）。不要重复标题。',
  '3. cat（三选一）：',
  '   - "model"：新模型发布、评测排名变化、API 涨降价、计费修复或额度补偿',
  '   - "tool"：AI 编程工具、Agent 框架、OpenCode / OpenDesign / Command Code / Cursor / Claude Code 等平台更新',
  '   - "industry"：公司融资、政策、算力芯片、生态合作等行业动态',
  '4. keep（布尔值）：明显与 AI/大模型/开发者无关的杂新闻、纯招聘广告或空洞公关稿设 false；其余设 true。',
  '',
  '【输出示例】',
  '输入：[{"i":0,"src":"OpenAI","title":"Introducing GPT-6.2 Astra with lower latency","summary":"Faster reasoning and new pricing tiers."}]',
  '输出：[{"i":0,"title":"OpenAI 发布 GPT-6.2 Astra，推理延迟降低","summary":"新版本优化了首字响应速度并调整了 API 计费档位，适合高频代码与复杂推理场景。","cat":"model","keep":true}]',
  '',
  '【格式要求】只输出严格合法的 JSON 数组，不要加解释、不要加 Markdown 标题。'
].join('\n');

async function polishWithLLM(items) {
  const apiKey = (process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY || '').trim();
  if (!apiKey || !items.length) return { polished: 0, skipped: !apiKey ? 'no_key' : 'none' };
  const baseUrl = (process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
  const model = process.env.LLM_MODEL || 'deepseek-chat';

  let polished = 0;
  const BATCH = 10;
  for (let i = 0; i < items.length; i += BATCH) {
    const chunk = items.slice(i, i + BATCH);
    const input = chunk.map((x, idx) => ({
      i: idx, src: x.src, title: x.title, summary: (x.summary || '').slice(0, 200)
    }));

    try {
      const r = await fetch(baseUrl + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 2200,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify(input) }
          ]
        }),
        signal: AbortSignal.timeout(50000)
      });
      if (!r.ok) { console.warn('[llm] HTTP', r.status); break; }
      const j = await r.json();
      let raw = String(j.choices?.[0]?.message?.content || '');
      // 兼容推理模型可能夹带的 <think>...</think> 思考块与 Markdown 代码围栏
      raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').trim();
      const m = raw.match(/\[[\s\S]*\]/);
      if (!m) continue;
      const arr = JSON.parse(m[0]);
      for (const row of arr) {
        const target = chunk[row.i];
        if (!target) continue;
        if (row.keep === false) { target._drop = true; continue; }
        if (row.title) target.title = String(row.title).trim().slice(0, 60);
        if (row.summary) target.summary = String(row.summary).trim().slice(0, 140);
        if (['model', 'tool', 'industry'].includes(row.cat)) target.cat = row.cat;
        target.aiDone = true;
        polished++;
      }
    } catch (e) {
      console.warn('[llm] 润色失败，已保留原文:', e.message);
      break;
    }
  }
  return { polished };
}

async function main() {
  const prev = fs.existsSync(OUT_FILE) ? JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')) : { data: { items: [] } };
  const prevById = new Map();
  for (const it of (prev.data?.items || [])) {
    if (it && it.id && !it.pin) prevById.set(it.id, it);
  }

  const fresh = [];
  const results = await Promise.allSettled([
    ...FEEDS.map(async f => parseFeed(await fetchText(f.url), f)),
    fetchHN(),
    fetchPinnedIssues()
  ]);

  let okSources = 0;
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      okSources++;
      fresh.push(...r.value);
    }
  }

  const cutoff = Date.now() - KEEP_DAYS * 864e5;
  const merged = new Map();

  // 先装入历史未过期条目（保留已润色结果，省 token）
  for (const [id, it] of prevById) {
    if (it.at >= cutoff) merged.set(id, it);
  }
  // 再写入新抓条目：如果历史已润色过同一条，沿用历史中文；新条目待润色
  const toPolish = [];
  for (const it of fresh) {
    if (!it.pin && it.at < cutoff) continue;
    const old = merged.get(it.id);
    if (old && old.aiDone && !it.pin) continue;
    merged.set(it.id, it);
    if (!it.aiDone && !it.pin) toPolish.push(it);
  }

  // 英文条目或摘要过长的中文条目才送去润色，最多每轮处理 24 条控成本
  const needPolish = toPolish
    .filter(x => x.lang === 'en' || x.title.length > 42 || !x.summary)
    .sort((a, b) => b.at - a.at)
    .slice(0, 24);
  const llmStat = await polishWithLLM(needPolish);

  const items = [...merged.values()]
    .filter(x => !x._drop)
    .sort((a, b) => (Number(!!b.pin) - Number(!!a.pin)) || (Number(!!b.urgent) - Number(!!a.urgent)) || (b.at - a.at))
    .slice(0, MAX_ITEMS)
    .map(({ _drop, lang, ...rest }) => rest);

  const out = {
    fetchedAt: Date.now(),
    data: {
      items,
      meta: {
        sourcesOk: okSources,
        polished: llmStat.polished || 0,
        updatedAt: new Date().toISOString()
      }
    }
  };
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out));
  console.log(`news.json: ${items.length} items (pinned=${items.filter(x => x.pin).length}, okSources=${okSources}, polished=${llmStat.polished || 0}, size=${(fs.statSync(OUT_FILE).size / 1024).toFixed(1)} KB)`);
}

main().catch(e => { console.error(e); process.exit(1); });
