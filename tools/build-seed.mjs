// 生成随 App 打包的数据快照（首次打开/断网时秒出内容）。用法：node tools/build-seed.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const seedDir = path.join(root, 'web', 'seed');
fs.mkdirSync(seedDir, { recursive: true });
const require = createRequire(import.meta.url);
const AAParse = require(path.join(root, 'web', 'js', 'aa-parse.js'));
const { trimModelsDev } = require(path.join(root, 'web', 'js', 'norm.js'));

const UA = 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36';
const get = async (url, headers = {}) => {
  const r = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(url + ' -> ' + r.status);
  return r;
};

const t0 = Date.now();
const aaText = await (await get(AAParse.SOURCES.leaderboard.url, AAParse.SOURCES.leaderboard.headers)).text();
const aa = AAParse.parseAA(aaText);
if (!aa.ok) throw new Error('AA 解析失败: ' + aa.errorMessage);
const aaOut = { fetchedAt: Date.now(), data: { models: aa.models, evals: aa.evals, meta: aa.meta } };
fs.writeFileSync(path.join(seedDir, 'aa.json'), JSON.stringify(aaOut));

const md = await (await get('https://models.dev/api.json')).json();
const prices = trimModelsDev(md);
fs.writeFileSync(path.join(seedDir, 'prices.json'), JSON.stringify({ fetchedAt: Date.now(), data: prices }));

const fx = await (await get('https://open.er-api.com/v6/latest/USD')).json();
fs.writeFileSync(path.join(seedDir, 'fx.json'), JSON.stringify({ fetchedAt: Date.now(), data: { CNY: fx.rates.CNY, date: fx.time_last_update_utc } }));

for (const f of ['aa', 'prices', 'fx']) console.log(f, (fs.statSync(path.join(seedDir, f + '.json')).size / 1024).toFixed(0) + ' KB');
console.log('models', aa.models.length, 'providers', Object.keys(prices.providers).length, 'price models', Object.values(prices.providers).reduce((a, p) => a + p.models.length, 0), 'ms', Date.now() - t0);
