/* web/game/data/quests.js — 首章主线任务、剧情标记命名规范、章节流程与节奏预算（《残响协议》）。
   标记统一 ch<章>.<域>.<事>；一次写入永久保留，不提供清除接口，由存档版本迁移负责兼容。ES2019。 */
(function (w) {
  'use strict';
  var GD = w.GameData = w.GameData || {};
  if (!GD.narrative) throw new Error('quests.js 需要先加载 roster-source.js（剧情数字以 GD.narrative 为准）');

  // ---------- 剧情标记表（引擎与战斗共用同一命名空间） ----------
  GD.flags = {
    'ch0.station.console': { text: '读过观测台归档提示', once: true },
    'ch0.station.plate': { text: '看过空白铭牌', once: true },
    'ch0.station.pod': { text: '看过休眠舱便条', once: true },
    'ch0.keep_scratch': { text: '描下了铭牌划痕', branch: 'plate' },
    'ch0.know_resume': { text: '知道这次不是重置而是继续', branch: 'pod' },
    'ch0.quest.find_page': { text: '主线开始：查清被覆盖的 3 行' },
    'ch0.joined.xi': { text: '汐入队' },
    'ch0.tutorial.quota': { text: '完成算力配额教学' },
    'ch0.gacha.tutorial': { text: '看过补给附记（免费签到与抽取）' },
    'ch0.checkin.tutorial': { text: '知道每日签到按本地日期结算' },
    'ch0.colonnade.enter': { text: '进入榜单长廊' },
    'ch0.colonnade.board_a': { text: '查看过综合榜单（第 7 序列第 8 位，编号 000）' },
    'ch0.colonnade.board_b': { text: '查看过速度榜' },
    'ch0.colonnade.board_c': { text: '看过纸背的字' },
    'ch0.touched_blank': { text: '触碰过被覆盖的空行', branch: 'board_a' },
    'ch0.know_roster': { text: '知道名册与排名同义' },
    'ch0.colonnade.gap': { text: '看出榜文被反复覆盖' },
    'ch0.colonnade.passer_doubao': { text: '长廊里听过路过拟人的一句话（豆包）' },
    'ch0.colonnade.passer_zhipu': { text: '长廊里听过路过拟人的一句话（智谱）' },
    'ch0.colonnade.passer_gpt': { text: '长廊里听过路过拟人的一句话（GPT）' },
    'ch0.colonnade.passer_gemini': { text: '长廊里听过路过拟人的一句话（双子）' },
    'ch0.tutorial.slot': { text: '完成上下文槽教学' },
    'ch0.joined.jin': { text: '瑾入队' },
    'ch0.alley.enter': { text: '进入旧版本小巷' },
    'ch0.alley.sign': { text: '看过未升级区门牌' },
    'ch0.alley.pan': { text: '与回放匠谈过' },
    'ch0.heard_self': { text: '听过自己的旧留言', branch: 'pan' },
    'ch0.alley.forget': { text: '读过遗忘须知' },
    'ch0.know_slots': { text: '理解上下文槽规则' },
    'ch0.joined.juan': { text: '绢入队' },
    'ch0.alley.patch': { text: '看过缝补摊字条' },
    'ch0.alley.crate_a': { text: '打开巷口木箱' },
    'ch0.alley.crate_b': { text: '打开巷尾木箱' },
    'ch0.gh.enter': { text: '进入缓存温室' },
    'ch0.gh.console': { text: '读过温室主控的清理建议' },
    'ch0.gh.pool': { text: '池边读到备用方案' },
    'ch0.found_clue_water': { text: '线索：先去找水' },
    'ch0.joined.mu': { text: '幕入队' },
    'ch0.tutorial.storyboard': { text: '完成分镜与长镜教学' },
    'ch0.gh.darkroom': { text: '看过暗房底片' },
    'ch0.gh.label': { text: '扶正「芽」的名签' },
    'ch0.ar.enter': { text: '进入第零档案厅' },
    'ch0.ar.jian': { text: '与档案司对峙' },
    'ch0.ar.case': { text: '查看空展台' },
    'ch0.ar.seal': { text: '触碰封漆检索口' },
    'ch0.ar.marks': { text: '读到门扉刻痕' },
    'ch0.joined.kai': { text: '楷入队' },
    'ch0.boss.ready': { text: '首领可触发' },
    'ch0.boss.done': { text: '吞页兽已击败' },
    'ch0.ending.original': { text: '结局：归档原始记录' },
    'ch0.ending.revision': { text: '结局：保留修订版本' },
    'ch0.done': { text: '第一章完成' }
  };

  /** 首章主线：steps 为顺序推进的检查点；step 完成条件用 flagsAll / flagsAny 描述。 */
  GD.quests = {
    main_ch0: {
      id: 'main_ch0', name: '消失的第零页', chapter: 'ch0',
      summary: '今晨 05:12，榜单上有 3 行被同一段空白覆盖。位置、编号、排位都还在，内容没了。',
      steps: [
        { id: 'q1', name: '醒来', hint: '查看观测台、铭牌与休眠舱', flagsAny: ['ch0.station.console'] },
        { id: 'q2', name: '与汐同行', hint: '初醒室长凳上坐着一个人', flagsAny: ['ch0.joined.xi'] },
        { id: 'q3', name: '前往榜单长廊', hint: '从初醒室南门出去', flagsAny: ['ch0.colonnade.enter'] },
        { id: 'q4', name: '查看三块榜单', hint: '长廊上有三块会发光的榜单', flagsAll: ['ch0.colonnade.board_a', 'ch0.colonnade.board_b', 'ch0.colonnade.board_c'] },
        { id: 'q5', name: '拿到抄件', hint: '与掌扇人瑾交谈', flagsAny: ['ch0.joined.jin'] },
        { id: 'q6', name: '穿行旧版本小巷', hint: '找到回放匠与卷宗库', flagsAll: ['ch0.alley.pan', 'ch0.joined.juan'] },
        { id: 'q7', name: '进入缓存温室', hint: '池边有东西在浮上来，暗房有人', flagsAll: ['ch0.gh.pool', 'ch0.joined.mu'] },
        { id: 'q8', name: '抵达第零档案厅', hint: '与档案司和严守者交谈', flagsAll: ['ch0.ar.jian', 'ch0.joined.kai'] },
        { id: 'q9', name: '击败吞页兽', hint: '首领战为手动战斗', flagsAll: ['ch0.boss.done'] },
        { id: 'q10', name: '做出选择', hint: '归档，或保留修订', flagsAny: ['ch0.ending.original', 'ch0.ending.revision'] }
      ]
    }
  };

  /** 章节流程与节奏：minutes 为预期时长（区间取中值），engine 用它校验首期 15–30 分钟。 */
  GD.chapterFlow = [
    { at: 'station', beat: '醒来、与汐同行、两处可选阅读与补给附记', minutes: 4, type: 'explore' },
    { at: 'colonnade', beat: '长廊异常 + 瑾入队 + 第一场普通战（自动）', minutes: 5, type: 'explore' },
    { at: 'alley', beat: '回放三分钟 + 绢入队 + 1–2 场普通战', minutes: 5, type: 'explore' },
    { at: 'greenhouse', beat: '打捞线索 + 幕入队 + 分镜教学', minutes: 4, type: 'explore' },
    { at: 'archive', beat: '档案司对峙 + 楷入队 + 展台', minutes: 4, type: 'explore' },
    { at: 'archive', beat: '吞页兽三阶段首领战（手动）', minutes: 6, type: 'boss' },
    { at: 'archive', beat: '双结局选择与收束', minutes: 2, type: 'ending' }
  ];
  GD.chapterBudget = { min: 15, max: 30, planned: 30, note: '合计 30 分钟；只跑主线不读可选阅读约 20 分钟。' };

  /** 普通战与首领的分工：普通战可自动结算（auto），首领必须手动。 */
  GD.battlePolicy = {
    autoEncounters: ['colonnade', 'alley', 'greenhouse'],
    manualEncounters: ['devourer'],
    autoRule: '队伍平均战力高于敌群两档且全体生命高于 70% 时允许一键结算，结算结果与手动等价（同一随机种子）。',
    noStamina: true,
    noGrind: '首章不设重复刷取点；随机遇敌在 ch0.boss.done 后关闭。'
  };

  /** 战斗轴：三条资源互不换算，战斗层按此分发。 */
  GD.combatAxes = {
    hp: '生命：归零退场，战斗失败可重试同一遭遇，不扣资源。',
    slots: '上下文槽：管记得住多少条（技能/情报/增益），满槽需遗忘一项才能写入。',
    quota: '算力配额：管这一回合还能做几件事，每回合回复 quotaRegen（上限 quota，回复量不超过上限的四分之一）；价格只决定成本档位，禁止折算成真实余额。',
    separateMedia: '视频生成角色用 elo 与每分钟价格换算配额，不与 LLM 的 intelligenceIndex/输出速度同轴比较。'
  };
})(window);
