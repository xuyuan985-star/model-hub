#!/usr/bin/env node
/* tools/battle-check.mjs — 战斗层纯逻辑自检：回合流程、技能结算、配额、情报槽、首领三阶段、抽卡保底继承、打卡周期。
   只读：仅加载数据与 battle 模块求值，不写文件、不联网。用法：node tools/battle-check.mjs [--verbose] */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'web/game/data');
const BATTLE = path.join(ROOT, 'web/game/battle');
const VERBOSE = process.argv.includes('--verbose');

const errors = [];
const warns = [];
const notes = [];
const fail = (m) => errors.push(m);
const warn = (m) => warns.push(m);
const note = (m) => { notes.push(m); if (VERBOSE) console.log('  · ' + m); };

function evalFile(file, win) {
  const src = fs.readFileSync(file, 'utf8');
  if (/^\s*(import|export)\s/m.test(src)) fail(path.basename(file) + ': 不得使用 import/export');
  if (/\.\?\./.test(src)) warn(path.basename(file) + ': 出现可选链，与 ES2019 风格不一致');
  new Function('window', src)(win);
}

const win = {};
for (const f of ['roster-source.js', 'world.js', 'characters.js', 'dialog.js', 'quests.js', 'progress.js']) {
  evalFile(path.join(DATA, f), win);
}
for (const f of ['core.js', 'skills.js', 'enemies.js', 'battle.js', 'gacha.js', 'checkin.js']) {
  const file = path.join(BATTLE, f);
  if (!fs.existsSync(file)) { fail('缺少战斗文件 web/game/battle/' + f); continue; }
  try { evalFile(file, win); } catch (e) { fail(f + ': 求值失败 ' + e.message); }
}
const GD = win.GameData || {};
const B = win.GameBattle || {};

// ---------- 0. 模块契约 ----------
if (!B.CFG) fail('core.js 未挂载 GameBattle.CFG');
if (!B.Battle || typeof B.Battle.start !== 'function') fail('battle.js 未导出 Battle.start');
if (!B.gachaPull) fail('gacha.js 未导出 gachaPull');
if (!B.checkinClaim) fail('checkin.js 未导出 checkinClaim');
if (B.version !== 'battle/1') warn('battle version 不是 battle/1');

// ---------- 1. 确定性随机 ----------
{
  const a = B.rng(42), b = B.rng(42);
  for (let i = 0; i < 50; i++) if (a() !== b()) { fail('rng 不确定：同 seed 结果不同'); break; }
  const seq = []; const c = B.rng(7);
  for (let i = 0; i < 5; i++) seq.push(c().toFixed(6));
  if (new Set(seq).size < 3) fail('rng 输出退化：' + seq.join(','));
  note('rng(7) 前 5 位 ' + seq.join(' '));
}

// ---------- 2. 技能费用纪律与效果可结算 ----------
{
  const cast = Object.keys(GD.cast || {});
  Object.entries(GD.skills || {}).forEach(([sid, sk]) => {
    const owner = cast.find((id) => (GD.cast[id].skills || []).includes(sid));
    if (!owner) { warn('技能 ' + sid + ' 没有角色持有'); return; }
    const q = GD.cast[owner].stats.quota;
    if (sk.cost > q / 2) fail('技能 ' + sid + ' cost ' + sk.cost + ' 超过 ' + owner + ' 配额一半 ' + q / 2);
    if (!B.effects || !B.effects[sk.effect]) fail('技能 ' + sid + ' 的 effect ' + sk.effect + ' 未实现');
  });
  note('12 个技能效果均已实现且费用 ≤ quota/2');
}

// ---------- 3. 一场普通战：回合流程、配额回复、情报槽 ----------
function makeParty(ids, hpRatio = 1) {
  return ids.map((id) => {
    const s = GD.cast[id].stats;
    return { id, hp: Math.max(1, Math.round(s.hp * hpRatio)), quota: s.quota, slots: s.slots };
  });
}

{
  const battle = B.Battle.start({ encounterId: 'colonnade', party: makeParty(['observer', 'xi', 'jin']), seed: 20260101 });
  const st = battle.state;
  if (st.turn !== 1) fail('初始回合应为 1，实际 ' + st.turn);
  const q0 = st.party[1].quota;
  B.step(st, []);
  if (st.party[1].quota > GD.cast.xi.stats.quota) fail('配额超过上限');
  if (st.turn !== 2) fail('一回合后 turn 应为 2，实际 ' + st.turn);
  note('普通战首回合后 quota ' + q0 + ' → ' + st.party[1].quota + '（上限 ' + GD.cast.xi.stats.quota + '）');
}

// ---------- 4. 观测 → 情报槽 → 伤害口径 ----------
{
  const st = B.create({ encounterId: 'colonnade', party: makeParty(['observer', 'xi', 'jin']), seed: 11 });
  const enemy = st.enemies[0];
  const dmgBefore = B.damage(st, st.party[2], enemy, null, { power: 100 }).amount;
  const r = B.act(st, 'p:observer', 'observe', enemy.uid);
  if (!r.ok) fail('观测失败：' + JSON.stringify(r));
  if (!st.intel[enemy.uid]) fail('观测后未写入情报表');
  if (!st.party[0].slots.some((s) => s.type === 'intel')) fail('观测后未占用情报槽');
  st.party[0].acted = false; st.party[2].acted = false;
  const dmgAfter = B.damage(st, st.party[2], enemy, null, { power: 100 }).amount;
  if (!(dmgAfter > dmgBefore)) fail('观测后伤害未提高：' + dmgBefore + ' → ' + dmgAfter);
  note('观测前后同角色伤害 ' + dmgBefore + ' → ' + dmgAfter);
}

// ---------- 5. 槽位满额遗忘与回响 ----------
{
  const st = B.create({ encounterId: 'colonnade', party: makeParty(['observer']), seed: 5 });
  const obs = st.party[0];
  obs.slotCap = 2;
  st.enemies.forEach((e) => B.writeIntel(st, obs, e, ['text'], 'intel'));
  B.pushSlot(st, obs, { type: 'skill', id: 'recall', forms: ['text'] });
  B.pushSlot(st, obs, { type: 'skill', id: 'observe', forms: ['text'] });
  if (obs.slots.length > 2) fail('槽位超过上限：' + obs.slots.length);
  if (!obs.forgotten.length) fail('满槽未产生 forgotten 记录');
  const back = B.effects.restore_forgotten(st, obs);
  if (!back.ok) fail('回响未能取回遗忘项：' + JSON.stringify(back));
  note('满槽遗忘 ' + obs.forgotten.length + ' 项，回响取回 1 项');
}

// ---------- 6. 汐：续杯与代付不改上限 ----------
{
  const st = B.create({ encounterId: 'colonnade', party: makeParty(['xi', 'kai']), seed: 3 });
  const xi = st.party[0], kai = st.party[1];
  xi.quota = 10; kai.quota = 0;
  const r1 = B.useSkill(st, xi, 'budget_gift', kai.uid, { amount: 6 });
  if (!r1.ok) fail('代付失败：' + JSON.stringify(r1));
  if (kai.quota !== 6) fail('代付后队友配额应为 6，实际 ' + kai.quota);
  if (kai.quota > kai.quotaMax) fail('代付超过了队友配额上限');
  xi.quota = 8;
  xi.quotaMax = 26;
  const before = xi.quota;
  const r2 = B.useSkill(st, xi, 'refill');
  if (!r2.ok) fail('续杯失败：' + JSON.stringify(r2));
  if (xi.quota <= before - 0 && r2.gained <= 0) fail('续杯没有回复配额');
  note('代付 6 点后队友 quota=' + kai.quota + '；续杯回复 ' + r2.gained + ' 点');
}

// ---------- 7. 瑾：断列拆增益与护页 ----------
{
  const st = B.create({ encounterId: 'devourer', party: makeParty(['jin']), seed: 9 });
  const boss = st.enemies[0];
  boss.shields = 3;
  boss.buffs.push({ id: 'compliance', name: '合规', turns: 2, defUp: 4 });
  const r = B.useSkill(st, st.party[0], 'cut_rank', boss.uid);
  if (!r.ok) fail('断列失败：' + JSON.stringify(r));
  if (boss.shields >= 3) fail('断列未削减护页');
  if (boss.buffs.length) fail('断列未拆掉增益');
  note('断列后护页 ' + boss.shields + '、增益 ' + boss.buffs.length);
}

// ---------- 8. 绢：分身合并为 1 格 ----------
{
  const st = B.create({ encounterId: 'greenhouse', party: makeParty(['juan']), seed: 21 });
  const juan = st.party[0];
  const before = juan.slots.length;
  const r = B.useSkill(st, juan, 'swarm', null, { targets: st.enemies.map((e) => e.uid) });
  if (!r.ok) fail('分身失败：' + JSON.stringify(r));
  const intelSlots = juan.slots.filter((s) => s.type === 'intel').length;
  if (intelSlots > 1) fail('分身按子体数叠加占槽：' + intelSlots + ' 格');
  if (juan.slots.length - before > 1) fail('分身占用超过 1 格');
  note('分身观测 2 目标，情报槽占 ' + intelSlots + ' 格');
}

// ---------- 9. 幕：分镜只改顺序，长镜断场清零 ----------
{
  const st = B.create({ encounterId: 'devourer', party: makeParty(['mu', 'xi']), seed: 33 });
  const mu = st.party[0];
  mu.quota = 8;
  const r = B.useSkill(st, mu, 'storyboard');
  if (!r.ok) fail('分镜失败：' + JSON.stringify(r));
  if (!st.orderLock) fail('分镜未锁定顺序');
  const order = B.turnOrder(st).map((u) => u.side);
  if (order[0] !== 'party') fail('分镜后我方未先手');
  B.useSkill(st, mu, 'longtake');
  if (st.longtake < 1) fail('长镜未叠层');
  B.endLongtake(st, 'battle_end');
  if (st.longtake !== 0) fail('长镜跨战斗未清零：' + st.longtake);
  note('分镜锁定顺序、长镜 1 层后断场归零');
}

// ---------- 10. 楷：长考清空配额，低于下限不可用 ----------
{
  const st = B.create({ encounterId: 'devourer', party: makeParty(['kai']), seed: 44 });
  const kai = st.party[0];
  kai.quota = 2;
  const r0 = B.useSkill(st, kai, 'longthink', st.enemies[0].uid);
  if (r0.ok) fail('配额低于下限时长考仍然可用');
  st.enemies[0].shields = 0; // 护页还在时任何正面伤害只削护页，先拆光再看真伤口径
  kai.quota = 10;
  const r1 = B.useSkill(st, kai, 'longthink', st.enemies[0].uid);
  if (!r1.ok) fail('长考失败：' + JSON.stringify(r1));
  if (kai.quota !== 0) fail('长考未清空配额，剩 ' + kai.quota);
  if (!(r1.damage > 0)) fail('长考没有造成伤害');
  note('长考清空 10 点配额，真实伤害 ' + r1.damage);
}

// ---------- 11. 首领三阶段 ----------
{
  const st = B.create({ encounterId: 'devourer', party: makeParty(['observer', 'xi', 'jin', 'juan', 'mu', 'kai']), seed: 2026 });
  const boss = st.enemies[0];
  if (boss.shields <= 0) fail('首领开局没有护页');
  const seen = [];
  for (let i = 0; i < 30 && !st.ended; i++) {
    B.step(st, null);
    const p = B.phaseFor(boss);
    if (p && !seen.includes(p.name)) { seen.push(p.name); }
  }
  if (seen.length < 2) fail('首领阶段未推进：' + seen.join('/'));
  note('首领阶段推进 ' + seen.join(' → ') + '；结果 ' + st.result + '；回合 ' + st.turn);
}

// ---------- 12. 自动结算与手动等价（同 seed） ----------
{
  const p = makeParty(['observer', 'xi', 'jin']);
  const a = B.create({ encounterId: 'colonnade', party: p, seed: 777 });
  const b = B.create({ encounterId: 'colonnade', party: p, seed: 777 });
  const ra = B.runAuto(a, 20);
  for (let i = 0; i < 20 && !b.ended; i++) B.step(b, null);
  const rb = B.finish(b);
  if (ra.result !== rb.result) fail('自动与手动结果不一致：' + ra.result + ' vs ' + rb.result);
  if (JSON.stringify(ra.partyHp) !== JSON.stringify(rb.partyHp)) fail('自动与手动生命不一致');
  note('同 seed 自动/手动一致：' + ra.result + '，生命 ' + JSON.stringify(ra.partyHp));
}

// ---------- 13. 自动结算准入 ----------
{
  const st = B.create({ encounterId: 'colonnade', party: makeParty(['xi']), seed: 1 });
  st.boss = true;
  if (B.autoEligible(st)) fail('首领战不应允许一键结算');
  st.boss = false;
  st.party[0].hp = Math.floor(st.party[0].maxHp * 0.5);
  if (B.autoEligible(st)) fail('生命低于 70% 不应允许一键结算');
}

// ---------- 14. 抽卡：保底、UP 继承、重复转化、十连 ----------
{
  const stateless = JSON.parse(JSON.stringify(B.gachaState()));
  const pull = B.gachaPull({ poolId: 'pool_kai', count: 10, state: stateless, owned: {}, seed: 12345 });
  if (!pull.ok) fail('十连失败：' + JSON.stringify(pull));
  if (pull.results.length !== 10) fail('十连应出 10 个结果，实际 ' + pull.results.length);
  if (!pull.results.some((r) => r.rarity >= 4)) fail('十连没有 4★ 及以上（含保底）');
  if (!stateless.pity || stateless.pity.pool_kai !== 0) fail('抽卡不应修改传入的 state');

  // 硬保底：把 pity 推到 89，下一抽必 5★
  const hard = { pity: { pool_kai: 89, pool_standard: 0 }, upGuaranteed: { pool_kai: false, pool_standard: false }, log: [] };
  const p2 = B.gachaPull({ poolId: 'pool_kai', count: 1, state: hard, owned: {}, seed: 5 });
  if (p2.results[0].rarity !== 5) fail('第 90 抽未出 5★，实际 ' + p2.results[0].rarity);

  // UP 必中：已歪一次后下一只 5★ 必为 UP
  const g2 = { pity: { pool_kai: 89, pool_standard: 0 }, upGuaranteed: { pool_kai: true, pool_standard: false }, log: [] };
  const p3 = B.gachaPull({ poolId: 'pool_kai', count: 1, state: g2, owned: {}, seed: 9 });
  if (!p3.results[0].up) fail('UP 必中未生效：' + JSON.stringify(p3.results[0]));

  // 抽数不跨池：常设池计数器独立
  const mixed = B.gachaPull({ poolId: 'pool_standard', count: 1, state: g2, owned: {}, seed: 9 });
  if (mixed.state.pity.pool_kai !== 89) fail('常设池抽取影响到了限定池计数器');
  if (mixed.state.pity.pool_standard !== 1) fail('常设池计数器未推进');

  // 重复转化：已满命五星转回响
  const owned = { kai: 6 };
  const cap = B.resolveDuplicate(owned, { rarity: 5, kind: 'character', id: 'kai' });
  if (cap.echo !== 25) fail('满命重复转化应为 25 回响，实际 ' + cap.echo);
  const notFull = B.resolveDuplicate({ kai: 1 }, { rarity: 5, kind: 'character', id: 'kai' });
  if (notFull.constellation.kai !== 1 || notFull.echo !== 10) fail('未满命转化数值不对：' + JSON.stringify(notFull));

  // 兑换：160 回响 1 页签
  const ex = B.exchangeEcho({ echo: 400, page: 0, times: 2 });
  if (!ex.ok || ex.pages !== 2 || ex.echo !== 80) fail('兑换计算错误：' + JSON.stringify(ex));
  const exShort = B.exchangeEcho({ echo: 100, page: 0, times: 1 });
  if (exShort.ok) fail('回响不足时仍兑换成功');
  note('十连 ' + pull.results.map((r) => r.rarity).join('') + '；硬保底/UP 必中/跨池独立/满命转化均通过');
}

// ---------- 15. 打卡：幂等、周期、补签 ----------
{
  const s0 = B.checkinState(null);
  const c1 = B.checkinClaim(s0, '2026-11-23');
  if (!c1.ok || c1.dayIndex !== 1) fail('第 1 天领取失败：' + JSON.stringify(c1));
  const c1b = B.checkinClaim(c1.state, '2026-11-23');
  if (c1b.ok || c1b.reason !== 'alreadyClaimed') fail('同日重复领取未返回 alreadyClaimed');
  const c3 = B.checkinClaim(c1.state, '2026-11-25');
  if (!c3.ok || c3.dayIndex !== 3) fail('第 3 天 dayIndex 应为 3，实际 ' + (c3 && c3.dayIndex));
  const mk = B.checkinMakeup(c3.state, '2026-11-25', 2, 100);
  if (!mk.ok || mk.cost !== 20) fail('补签失败：' + JSON.stringify(mk));
  const mkAgain = B.checkinMakeup(mk.state, '2026-11-25', 2, 100);
  if (mkAgain.ok) fail('同一格重复补签');
  const mkFuture = B.checkinMakeup(mk.state, '2026-11-25', 5, 100);
  if (mkFuture.ok) fail('补签补了未来的格子');
  const expired = B.checkinClaim(c3.state, '2026-12-05');
  if (!expired.ok || expired.dayIndex !== 1) fail('周期结束后首次领取未开启新周期：' + JSON.stringify(expired));
  const st2 = B.checkinStatus(expired.state, '2026-12-05');
  if (st2.days.length !== 7) fail('打卡格子应为 7 格，实际 ' + st2.days.length);
  note('打卡：幂等返回 alreadyClaimed、补签扣 20 回响、禁未来、跨周期重新计 1');
}

// ---------- 16. 存档形态入参 + 对外接口回调 ----------
{
  const saveShaped = [
    { id: 'xi', hp: 40, quota: 12, slots: { cap: 5, used: [{ type: 'skill', id: 'refill', forms: ['text'] }], forgotten: [{ type: 'intel', id: 'e:page_mite:1' }] } },
    { id: 'kai', hp: 80, quota: 10, slots: ['skill:longthink', 'intel:e:page_mite:1'] }
  ];
  const st = B.create({ encounterId: 'colonnade', party: saveShaped, seed: 4 });
  if (st.party[0].slots.length !== 1) fail('存档形态 used 未正确还原');
  if (st.party[0].forgotten.length !== 1) fail('存档形态 forgotten 未正确还原');
  if (st.party[1].slots[0].type !== 'skill' || st.party[1].slots[0].id !== 'longthink') fail('短写槽位未规范化');

  let reported = null;
  const battle = B.Battle.start({
    encounterId: 'colonnade',
    party: makeParty(['xi', 'jin']),
    seed: 8,
    onBattleEnd: (r) => { reported = r; }
  });
  battle.auto();
  if (!reported) fail('onBattleEnd 未被调用');
  else {
    ['result', 'flags', 'drops', 'partyHp', 'partyQuota'].forEach((k) => {
      if (!(k in reported)) fail('战报缺少字段 ' + k);
    });
    if (!['win', 'lose', 'flee'].includes(reported.result)) fail('战报 result 非法：' + reported.result);
  }
  note('存档形态入参与 onBattleEnd 战报字段齐备（result=' + (reported && reported.result) + '）');
}

// ---------- 17. 撤退与回调只触发一次 ----------
{
  let calls = 0, last = null;
  const battle = B.Battle.start({
    encounterId: 'colonnade', party: makeParty(['xi']), seed: 12,
    onBattleEnd: (r) => { calls += 1; last = r; }
  });
  const rep = battle.flee();
  if (!rep || rep.result !== 'flee') fail('撤退结果应为 flee');
  battle.end();
  battle.flee();
  if (calls !== 1) fail('onBattleEnd 触发了 ' + calls + ' 次，应为 1 次');
  if (!last || last.result !== 'flee') fail('撤退战报 result 不对');

  let c2 = 0;
  const b2 = B.Battle.start({ encounterId: 'colonnade', party: makeParty(['xi', 'jin']), seed: 3, onBattleEnd: () => { c2 += 1; } });
  b2.auto();
  b2.auto();
  b2.end();
  if (c2 !== 1) fail('自动结算 + 收尾重复回调 ' + c2 + ' 次');
  note('撤退与自动结算各只回传一次战报');
}

// ---------- 18. 成长（命座）：0 命与原数值逐位相同，加成只落在技能上 ----------
{
  const base = B.create({ encounterId: 'colonnade', party: makeParty(['xi', 'jin', 'kai']), seed: 21 });
  const grown = B.create({ encounterId: 'colonnade', party: makeParty(['xi', 'jin', 'kai']), seed: 21, owned: { jin: 6, xi: 3 } });
  if (grown.party[0].constellation !== 3) fail('owned 未写进队伍：' + grown.party[0].constellation);
  if (grown.party[1].constellation !== B.GROWTH.cap) fail('命座未按上限截断');
  if (grown.party[2].constellation !== 0) fail('未拥有角色的命座应为 0');
  if (grown.party[1].slotCap !== base.party[1].slotCap) fail('命座改了槽位上限（不允许）');
  if (grown.party[1].quotaMax !== base.party[1].quotaMax) fail('命座改了配额上限（不允许）');
  const e0 = base.enemies[0], e1 = grown.enemies[0];
  B.writeIntel(base, base.party[1], e0, ['text'], 'intel');
  B.writeIntel(grown, grown.party[1], e1, ['text'], 'intel');
  const d0 = B.damage(base, base.party[1], e0, null, { power: 100, kind: 'basic' }).amount;
  const d1 = B.damage(grown, grown.party[1], e1, null, { power: 100, kind: 'basic' }).amount;
  if (d0 !== d1) fail('普通出手吃到了成长加成：' + d0 + ' vs ' + d1);
  const g0 = B.growthOf(base.party[1]);
  if (g0.skillPower !== 1 || g0.intelBonus !== 0 || g0.strip !== 0) fail('0 命加成不为零：' + JSON.stringify(g0));
  const g6 = B.growthOf(grown.party[1]);
  if (!(g6.skillPower > 1) || g6.strip < 1) fail('满命加成缺失：' + JSON.stringify(g6));
  const xi3 = B.growthOf(grown.party[0]);
  if (xi3.refill < 1) fail('汐 3 命的续杯加成缺失');
  const st = B.create({ encounterId: 'colonnade', party: makeParty(['jin']), seed: 22, owned: { jin: 6 } });
  const boss = B.create({ encounterId: 'devourer', party: makeParty(['jin']), seed: 22, owned: { jin: 6 } });
  const shieldsBefore = boss.enemies[0].shields;
  B.useSkill(boss, boss.party[0], 'cut_rank', boss.enemies[0].uid);
  if (!(boss.enemies[0].shields < shieldsBefore - B.CFG.shieldStripPerCut)) fail('满命断列未多拆护页');
  const rep = B.finish(st);
  if (!rep.partyGrowth || rep.partyGrowth.jin !== 6) fail('战报缺 partyGrowth 或数值不对');
  note('成长：0 命与原数值逐位相同，满命只加技能侧（普通出手不变），战报回传 partyGrowth');
}

// ---------- 19. perSkill 循环账与战斗层实现核对 ----------
{
  const perSkill = (GD.skillBudget && GD.skillBudget.perSkill) || [];
  const winTurns = GD.balance.windows;
  const castCount = (cadence, turns) => {
    if (/每场|斩杀回合|只开 1 次/.test(cadence)) return 1;
    if (/每回合 1 次/.test(cadence)) return turns;
    if (/2 回合 1 次|每 2 回合|两回合/.test(cadence)) return Math.ceil(turns / 2);
    if (/约 3 次/.test(cadence)) return 3;
    return Math.ceil(turns / 2);
  };
  if (perSkill.length !== Object.keys(GD.skills).length) fail('perSkill 条数与技能数不符');
  const seen = new Set();
  const owned = {};
  perSkill.forEach((p) => {
    seen.add(p.id);
    const sk = GD.skills[p.id];
    if (!sk) { fail('perSkill 的 ' + p.id + ' 不是真实技能'); return; }
    if (p.cost !== sk.cost) fail(p.id + ' 的 cost ' + p.cost + ' 与 GD.skills 的 ' + sk.cost + ' 不一致');
    const card = GD.cast[p.owner];
    if (!card) { fail(p.id + ' 的 owner ' + p.owner + ' 不在 cast'); return; }
    if (!(card.skills || []).includes(p.id)) fail(p.id + ' 不在 ' + p.owner + ' 的技能表里');
    if (!p.cadence) fail(p.id + ' 缺 cadence');
    [['normal', winTurns.normal.turns], ['boss', winTurns.boss.turns]].forEach(([window, turns]) => {
      const total = card.stats.quota + card.stats.quotaRegen * (turns - 1);
      const n = castCount(p.cadence, turns);
      owned[p.owner] = owned[p.owner] || {};
      owned[p.owner][window] = (owned[p.owner][window] || 0) + n * p.cost;
      if (total < p.cost) fail(p.id + ' 的窗口总配额 ' + total + ' 付不起一次 ' + p.cost);
      if (total < n * p.cost) {
        const msg = p.id + ' 按 cadence「' + p.cadence + '」在' + window + '窗口需 ' + n * p.cost + ' 点，账面只有 ' + total + ' 点';
        if (window === 'normal') fail(msg); else warn(msg);
      }
    });
  });
  Object.keys(GD.skills).forEach((id) => { if (!seen.has(id)) fail('技能 ' + id + ' 未写进 perSkill'); });
  Object.keys(owned).forEach((owner) => {
    const card = GD.cast[owner];
    [['normal', winTurns.normal.turns], ['boss', winTurns.boss.turns]].forEach(([window, turns]) => {
      const total = card.stats.quota + card.stats.quotaRegen * (turns - 1);
      if (owned[owner][window] > total) {
        const msg = owner + '在' + window + '窗口的技能合计 ' + owned[owner][window] + ' 点超出账面 ' + total + ' 点';
        if (window === 'normal') fail(msg); else warn(msg);
      }
    });
  });
  // 战斗层自身不得偷偷改价：12 个技能结算后的配额扣减必须等于 GD.skills 的 cost
  const st2 = B.create({ encounterId: 'colonnade', party: makeParty(['observer', 'xi', 'jin', 'juan', 'mu', 'kai']), seed: 31 });
  st2.party.forEach((u) => { u.quota = u.quotaMax; u.acted = false; });
  let checked = 0;
  Object.keys(GD.skills).forEach((sid) => {
    const sk = GD.skills[sid];
    const u = st2.party.find((p) => ((GD.cast[p.id].skills) || []).includes(sid));
    if (!u) return;
    u.quota = u.quotaMax; u.acted = false;
    const before = u.quota;
    const target = st2.enemies[0];
    const res = B.useSkill(st2, u, sid, target.uid, { amount: 3, targets: st2.enemies.map((e) => e.uid) });
    if (!res.ok && res.reason !== 'quota_short') return;
    // 代付是把自身配额转出去，额外转出量不算涨价；长考按设计清空全部剩余，另行核对
    const extra = sid === 'budget_gift' ? (res.given || 0) : 0;
    if (res.ok && before - u.quota !== sk.cost + extra && sid !== 'longthink') {
      fail(sid + ' 实际扣了 ' + (before - u.quota) + ' 点，应为 ' + (sk.cost + extra));
    }
    checked += 1;
  });
  note('perSkill 12 条与技能表逐条对齐，扣费与 GD.skills 一致（核对 ' + checked + ' 条）；窗口账见 summary');
}

// ---------- 20. 抽卡产出 → 成长：owned 表直接就是战斗入参 ----------
{
  const owned = {};
  let pool = B.poolById('pool_kai');
  let st = B.gachaState();
  let last = null;
  for (let i = 0; i < 30; i++) {
    const r = B.gachaPull({ poolId: 'pool_kai', count: 10, state: st, owned, seed: 100 + i });
    st = r.state; last = r;
    Object.keys(r.owned).forEach((k) => { owned[k] = r.owned[k]; });
  }
  if (!Object.keys(owned).length) fail('30 次十连未获得任何角色，成长无来源');
  const anyConst = Object.keys(owned).some((k) => owned[k] > 0);
  if (!anyConst) fail('重复转化未产生命座：' + JSON.stringify(owned));
  const partyIds = Object.keys(owned).filter((id) => GD.cast[id]).slice(0, 3);
  const battleParty = partyIds.length ? partyIds : ['xi'];
  const b = B.create({
    encounterId: 'colonnade',
    party: battleParty.map((id) => ({ id, hp: GD.cast[id].stats.hp, quota: GD.cast[id].stats.quota, slots: GD.cast[id].stats.slots })),
    seed: 77,
    owned
  });
  b.party.forEach((u) => {
    const want = Math.min(B.GROWTH.cap, owned[u.id] || 0);
    if (u.constellation !== want) fail('抽卡 owned 未落到战斗单位 ' + u.id + '：' + u.constellation + ' ≠ ' + want);
  });
  // 超出上限的 owned 表不会把单位顶破
  const over = B.create({ encounterId: 'colonnade', party: [{ id: 'xi', hp: 77, quota: 26, slots: 5 }], seed: 78, owned: { xi: 99 } });
  if (over.party[0].constellation !== B.GROWTH.cap) fail('owned 超上限未截断');
  note('抽卡 30×10 得 owned ' + JSON.stringify(owned) + '，直接作为 Battle.start 的 owned 入参生效；超上限自动截断');
}

// ---------- 汇总 ----------
const summary = {
  battleVersion: B.version,
  skills: Object.keys(GD.skills || {}).length,
  encounters: Object.keys(B.encounters || {}).length,
  tables: Object.keys(B.tables || {}).length,
  errors: errors.length,
  warns: warns.length
};
if (errors.length) {
  console.error('✗ battle-check 失败 ' + errors.length + ' 项');
  errors.forEach((e) => console.error('  - ' + e));
  if (warns.length) warns.forEach((x) => console.error('  ! ' + x));
  process.exit(1);
}
warns.forEach((x) => console.log('  ! ' + x));
console.log('✓ battle-check 通过：' + JSON.stringify(summary));
process.exit(0);
