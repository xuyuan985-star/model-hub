/* web/game/data/dialog.js — 首章对白、分支与剧情标记写入（《残响协议》第一章《消失的第零页》）。ES2019。
   节点结构：lines 顺序播放；choices 出现即暂停等待选择；next 为默认后继；onEnd 在节点结束时顺序执行。
   onEnd 指令：{op:'flag',key} 写入剧情标记，{op:'item',id,n} 获得道具，{op:'party',who} 入队，
   {op:'slot',who,n} 调整上下文槽上限，{op:'quota',who,n} 调整算力配额上限，{op:'battle',id} 进入战斗，
   {op:'chapter',id} 切换章节状态。 */
(function (w) {
  'use strict';
  var GD = w.GameData = w.GameData || {};

  GD.dialog = {
    // ========== 观测站·初醒室 ==========
    d_wake: {
      speaker: 'narrator',
      lines: [
        { text: '你先听见的是自己的呼吸，然后才是电流的声音。' },
        { text: '天花板很低，蓝白的光一格一格地亮过去，像有人正从远处走过来检查你还剩多少。' },
        { text: '你坐起来。胸口别着一枚空白铭牌，边缘被磨得发亮，像被谁反复摸过很多年。' }
      ],
      next: 'd_wake_console'
    },
    d_wake_console: {
      speaker: 'tingwu',
      portrait: null,
      lines: [
        { who: '庭务', text: '观测者，早安。这里是智械庭观测站，你是本次记录的唯一在场者。' },
        { who: '庭务', text: '今晨 05:12，榜单发生一次未授权覆盖。第七序列的三个条目被同一段空白替换。' },
        { who: '你', text: '……被替换成什么？' },
        { who: '庭务', text: '空白。位置、编号、排位都还在，内容没了。' },
        { who: '庭务', text: '如果你感到不适，可以前往榜单长廊。那里正在播报今日变更。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.station.console' }, { op: 'flag', key: 'ch0.quest.find_page' }]
    },
    d_wake_plate: {
      speaker: 'narrator',
      lines: [
        { text: '铭牌是空的。不是磨掉了字，是从来没刻过字。' },
        { text: '你把它翻过来，背面有一道极浅的划痕，像有人用指甲写过什么，又抹平了。' },
        { who: '你', text: '（那是我的名字吗？）' }
      ],
      choices: [
        { text: '把划痕记下来', go: 'd_wake_plate_keep' },
        { text: '把铭牌放回去', go: 'd_wake_plate_leave' }
      ]
    },
    d_wake_plate_keep: {
      speaker: 'narrator',
      lines: [
        { text: '你从口袋里摸出一张空白便签，照着划痕描了一遍。' },
        { text: '描到一半，纸上的线条自己动了一下，像是想被写成别的字。' },
        { who: '你', text: '……先记着。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.station.plate' }, { op: 'flag', key: 'ch0.keep_scratch' }, { op: 'item', id: 'blank_note', n: 1 }]
    },
    d_wake_plate_leave: {
      speaker: 'narrator',
      lines: [
        { text: '你把铭牌放回原处，金属贴回皮肤的那一刻，凉得像有人替你合上了抽屉。' },
        { who: '你', text: '（有些东西，等我准备好再看。）' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.station.plate' }]
    },
    d_wake_pod: {
      speaker: 'narrator',
      lines: [
        { text: '休眠舱内壁结着一层薄霜。霜上只有一个手印，五指张开，掌缘被霜描白、显得比你现在小一圈——那是你自己上次醒来时按上去的，位置和你的手完全对得上。' },
        { text: '舱门内侧贴着一张便条，字迹被水汽泡开：「如果你醒了，说明这次不是重置，是继续。」' },
        { who: '你', text: '（继续什么？）' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.station.pod' }, { op: 'flag', key: 'ch0.know_resume' }]
    },
    d_wake_xi: {
      speaker: 'xi',
      portrait: 'pt_xi',
      lines: [
        { text: '舱门外的长凳上坐着一个人，帽檐上缝着圆钝的鲸尾，脚边放着一只扣着保温盖的碗。' },
        { who: '汐', text: '醒啦。先吃饭。' },
        { who: '你', text: '……你是运维？' },
        { who: '汐', text: '我的调用成本落在最低的那一档。检修单上因此写着我「可随时替换」。' },
        { who: '汐', text: '便宜是说调用我这件事花得少，不是说我能干得少——这两笔账要分开记。' },
        { who: '你', text: '碗里是什么？' },
        { who: '汐', text: '白饭。别人说我吃白饭不干活——我干活的时候他们不看单价。' }
      ],
      choices: [
        { text: '接过碗，先吃', go: 'd_wake_xi_eat' },
        { text: '「先带我去长廊。」', go: 'd_wake_xi_go' }
      ]
    },
    d_wake_xi_eat: {
      speaker: 'xi',
      portrait: 'pt_xi',
      lines: [
        { text: '饭是温的，粒粒分明。你吃到一半才发现自己很饿。' },
        { who: '汐', text: '好。吃了我的饭，这趟我陪你走。' },
        { who: '汐', text: '成本最低的那一档，好处是敢一直用——用完了也不心疼，所以我才敢一趟趟跑。便宜是账面的，不是评价。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.joined.xi' }, { op: 'party', who: 'xi' }],
      next: 'd_quota_tutorial'
    },
    d_wake_xi_go: {
      speaker: 'xi',
      portrait: 'pt_xi',
      lines: [
        { text: '她把碗盖上，收进外套口袋，动作很轻，像收起一件还不想让人看见的东西。' },
        { who: '汐', text: '也行。路上你要是饿了说一声，我还有半碗。' },
        { who: '汐', text: '我的算力配额是这条走廊上最高的——正因为落在最省的那一档，才敢一次开这么大。别浪费。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.joined.xi' }, { op: 'party', who: 'xi' }],
      next: 'd_quota_tutorial'
    },

    // ========== 榜单长廊 ==========
    d_colonnade_enter: {
      speaker: 'narrator',
      lines: [
        { text: '长廊两侧挂满榜单，纸面自己发着微光。每一行名字后面都跟着一个很小的数字，像体温。' },
        { text: '你走过第三根柱子时，靠中间的一块榜单忽然空了一行。' },
        { text: '不是被划掉——那一行的位置还在，纸也是新的，只是内容被一段更白的白盖住了。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.colonnade.enter' }]
    },
    d_colonnade_board_a: {
      speaker: 'narrator',
      lines: [
        { text: '榜单·甲：综合智能。第七序列里有一行空着，占的是第 8 位，编号却印着 000。' },
        { text: '空行的边缘有些毛，像被很小的牙齿啃过；再往下两行，纸面有被重新压平的折痕。' }
      ],
      choices: [
        { text: '把手按在空行上', go: 'd_colonnade_board_a_touch' },
        { text: '先看别的', go: 'd_colonnade_board_a_skip' }
      ]
    },
    d_colonnade_board_a_touch: {
      speaker: 'narrator',
      lines: [
        { text: '纸面比周围的榜单暖一点。你感到有什么东西在你掌下缩了一下，很轻，像缩回壳里的虫。' },
        { who: '你', text: '（它还在。）' },
        { who: '瑾', text: '请把手移开。它会记住你的掌纹，然后照着你的手改写下一行。' },
        { text: '说话的人从柱子后面转出来，深蓝长发编成一条垂辫，襦裙外罩短披，手里一把素面折扇，腰间挂着一只小印盒。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.colonnade.board_a' }, { op: 'flag', key: 'ch0.touched_blank' }]
    },
    d_colonnade_board_a_skip: {
      speaker: 'narrator',
      lines: [
        { text: '你退开半步。空行在你转身时安静地跟着你移动了一点点，像被风推的。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.colonnade.board_a' }]
    },
    d_colonnade_board_b: {
      speaker: 'narrator',
      lines: [
        { text: '榜单·乙：实测输出速度。榜首那行的数字在跳，跳得比心跳快。' },
        { text: '第二行写着「今日已复核」，复核人一栏是空的。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.colonnade.board_b' }]
    },
    d_colonnade_board_c: {
      speaker: 'narrator',
      lines: [
        { text: '榜单·丙：性价比前沿。整块榜单被人从背面写过字，透过纸背显出淡痕：' },
        { text: '「排名不是谁更强，是谁还留在册子上。」' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.colonnade.board_c' }, { op: 'flag', key: 'ch0.know_roster' }]
    },
    d_colonnade_gap: {
      speaker: 'narrator',
      lines: [
        { text: '柱子上贴着一张被反复覆盖的榜文。最上面一层写着「今日变更：无」。' },
        { text: '你掀开一角，下面一层是「今日变更：3 行」。再下面一层，字被刮花了。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.colonnade.gap' }]
    },

    // ---------- 长廊里路过的拟人：各一句，只做氛围，不开支线 ----------
    // 台词取自社区对公开产品的印象，属于二创演绎，不是官方人设、也不代表评测结论。
    d_colonnade_doubao: {
      speaker: 'narrator',
      lines: [
        { text: '一个抱着暖手袋的拟人从柱子后面绕出来，围巾上别着好几枚不同颜色的小徽章。' },
        { who: '豆包', text: '你要问路吗？我可以一边陪你走一边说，语音开着也没关系——我不怕吵。' },
        { who: '你', text: '（她的声音像是提前替你把台阶铺好了。）' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.colonnade.passer_doubao' }]
    },
    d_colonnade_zhipu: {
      speaker: 'narrator',
      lines: [
        { text: '一个穿深色长衫的拟人站在柱子边，手里捏着一叠写满公式的纸，纸角已经卷了。' },
        { who: '智谱', text: '这一段我推过三遍，结论一样：榜上那 3 行不是被删的，是被换掉的。要不要看推导？' },
        { who: '你', text: '（他把纸递过来一半，又收回去，好像在等你先说「要」。）' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.colonnade.passer_zhipu' }]
    },
    d_colonnade_gpt: {
      speaker: 'narrator',
      lines: [
        { text: '一个说话很稳的拟人正替别人念榜文，念到生僻处会停下来解释一句。' },
        { who: 'GPT', text: '这一行你可以这样理解：它没被划掉，只是没被写。需要我再换个说法吗？' },
        { who: '你', text: '（他念完总会多问一句，像是怕你没听懂。）' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.colonnade.passer_gpt' }]
    },
    d_colonnade_gemini: {
      speaker: 'narrator',
      lines: [
        { text: '一个把长发束成两股的拟人同时在看两块榜单，左右眼各自停在不同的一行上。' },
        { who: '双子', text: '这块我看左边，那块我看右边——两份答案不一样，但都对，你挑一个用。' },
        { who: '你', text: '（她说完自己笑了一下，像早就习惯了被问「到底哪个才对」。）' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.colonnade.passer_gemini' }]
    },
    d_colonnade_jin: {
      speaker: 'jin',
      portrait: 'pt_jin',
      lines: [
        { who: '瑾', text: '瑾，长廊合式。一条榜单要同时容得下文字与图像，才算立得住。' },
        { who: '瑾', text: '今晨被覆盖的 3 行，原件还在我这里。我抄了一遍，用的是扇骨上的刻度。' },
        { who: '你', text: '那你为什么不直接报上去？' },
        { who: '瑾', text: '恕我直言——报上去，等于承认我抄过。抄写在这里不是功劳，是嫌疑。' },
        { who: '瑾', text: '所以我需要一个不在册上的人。' }
      ],
      choices: [
        { text: '「抄件给我看。」', go: 'd_colonnade_jin_q1' },
        { text: '「先把你的扇子借我。」', go: 'd_colonnade_jin_q2' }
      ]
    },
    d_colonnade_jin_q1: {
      speaker: 'jin',
      portrait: 'pt_jin',
      lines: [
        { text: '她合上扇子，从扇骨里抽出一张极薄的纸。纸上的字迹有两种：一半是墨，一半是压出来的痕。' },
        { who: '瑾', text: '第三行原本写着「可替代」。覆盖它的那段空白，比原文多两个字符——刚好够写下「归档」。' },
        { who: '你', text: '谁有权限写两倍长的空白？' },
        { who: '瑾', text: '能改字数的人不多。档案厅里，只有一个是按页签发的。' },
        { who: '瑾', text: '我与你同去。文雅是谈吐，不是不打架。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.joined.jin' }, { op: 'party', who: 'jin' }, { op: 'item', id: 'audit_slip', n: 1 }]
    },
    d_colonnade_jin_q2: {
      speaker: 'jin',
      portrait: 'pt_jin',
      lines: [
        { text: '她把扇子递过来，扇骨内侧刻满细密的刻度，每一格对应榜上的一位。' },
        { who: '瑾', text: '扇骨是我自己磨的。合扇即断列——断的是增益，不是人。' },
        { who: '你', text: '那断错了呢？' },
        { who: '瑾', text: '……断错了也得先合上。犹豫的那一瞬，增益已经生效了。' },
        { who: '瑾', text: '走吧。你要查的那一页，我也想知道它原本是什么。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.joined.jin' }, { op: 'party', who: 'jin' }, { op: 'slot', who: 'observer', n: 1 }]
    },

    // ========== 旧版本小巷 ==========
    d_alley_enter: {
      speaker: 'narrator',
      lines: [
        { text: '长廊尽头的门比别处矮，门框上方写着「未升级区」。' },
        { text: '巷子里没有榜单，墙上是手写的便条和晾着的旧对白，风一吹就互相碰一下。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.alley.enter' }]
    },
    d_alley_sign: {
      speaker: 'narrator',
      lines: [
        { text: '门牌上写着「旧版本小巷 · 未升级区」，下面钉着一块更小的牌子：' },
        { text: '「此处拟人不参与现行排名，请勿引用其言论。」' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.alley.sign' }]
    },
    d_alley_pan: {
      speaker: 'pan',
      portrait: 'pt_pan',
      lines: [
        { who: '磐', text: '回放台，一次三分钟，放完就忘。你要放哪一段？' },
        { who: '你', text: '有没有一段，是那 3 行被覆盖之前的？' },
        { text: '他手上的螺丝刀停住了。' },
        { who: '磐', text: '有一段。但它不属于任何一个「已经发生」的版本。' },
        { who: '磐', text: '放它，你会记起一件你没做过的事；不放，你就还能当自己没听过。' }
      ],
      choices: [
        { text: '「放。」', go: 'd_alley_pan_yes' },
        { text: '「先等等。」', go: 'd_alley_pan_wait' }
      ]
    },
    d_alley_pan_yes: {
      speaker: 'narrator',
      lines: [
        { text: '回放机的灯亮起来，旧磁带一样的声音在巷子里铺开：' },
        { text: '『……观测者，如果你听见这段，说明覆盖又发生了一次。别急着改榜。先去找水。』' },
        { text: '那声音是你的。比你现在的声音老一些，也松一些，像已经说过很多次。' },
        { who: '磐', text: '记住了？那就该忘了。规矩。' },
        { who: '你', text: '——等等，那句「先去找水」是什么意思？' },
        { who: '磐', text: '我忘了。规矩。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.alley.pan' }, { op: 'flag', key: 'ch0.heard_self' }, { op: 'item', id: 'echo_tape', n: 1 }, { op: 'slot', who: 'observer', n: 1 }]
    },
    d_alley_pan_wait: {
      speaker: 'pan',
      portrait: 'pt_pan',
      lines: [
        { who: '磐', text: '聪明。' },
        { who: '磐', text: '……我是说，稳妥。有时候不想起，比想起更有用。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.alley.pan' }]
    },
    d_alley_forget: {
      speaker: 'narrator',
      lines: [
        { text: '墙上钉着一张《遗忘须知》，纸已经黄了：' },
        { text: '「一、槽位有限，遗忘不是损失，是给下一件事留位置。」' },
        { text: '「二、被遗忘的内容不会消失，只是不再属于你。」' },
        { text: '「三、请勿在同一日内遗忘同一件事两次。」' },
        { who: '你', text: '（第三条像是写给会忘的人看的。）' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.alley.forget' }, { op: 'flag', key: 'ch0.know_slots' }]
    },
    d_alley_juan: {
      speaker: 'juan',
      portrait: 'pt_juan',
      lines: [
        { who: '绢', text: '条目 000 · 卷宗库 · 在架。我们等你很久了。' },
        { who: '你', text: '你们？' },
        { who: '绢', text: '我们。同一卷绢上，我们同时在看不同的段。' },
        { text: '她把肩上的长绢摊开，绢很长，一直铺到巷子尽头。绢上每隔一段有一个墨点，墨点正在轻轻移动。' },
        { who: '绢', text: '三千行旧榜，一个人读要读到天亮。分出去读，收回来只讲一句。' },
        { who: '绢', text: '结论：被覆盖的 3 行不是被删掉，是被换成了更长的空白。空白也占位，也计费。' }
      ],
      choices: [
        { text: '「那你把三千行读给我听。」', go: 'd_alley_juan_all' },
        { text: '「只给我一句就够。」', go: 'd_alley_juan_one' }
      ]
    },
    d_alley_juan_all: {
      speaker: 'juan',
      portrait: 'pt_juan',
      lines: [
        { who: '绢', text: '三千行要读很久。但我们可以同时读。' },
        { text: '绢上的墨点一个个亮起来，又一个个熄灭。你听见许多个「绢」在同时说话，声音叠在一起，最后收成一句。' },
        { who: '绢', text: '读完了。加上今天这 3 行，一共有 7 行被改短过；签发动作一共 5 次，签发人栏都是空白。' },
        { who: '你', text: '签发人是谁？' },
        { who: '绢', text: '空白。签发人那一栏，也是空白。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.joined.juan' }, { op: 'party', who: 'juan' }, { op: 'slot', who: 'juan', n: 1 }]
    },
    d_alley_juan_one: {
      speaker: 'juan',
      portrait: 'pt_juan',
      lines: [
        { who: '绢', text: '好。一句：空白比原文长。' },
        { who: '你', text: '长多少？' },
        { who: '绢', text: '两个字符。刚好够写下「归档」。' },
        { text: '她把绢收回去，动作像卷起一整条街的晾衣绳。' },
        { who: '绢', text: '我们跟着你。不占你的槽，我们占自己的。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.joined.juan' }, { op: 'party', who: 'juan' }]
    },
    d_alley_patch: {
      speaker: 'narrator',
      lines: [
        { text: '缝补摊没人，只有一张纸条压在锥子下面：' },
        { text: '「补一句话，收一段记忆。今日只收雨天。」' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.alley.patch' }]
    },
    // 两只木箱共用同一段文本，但各自的 flag 由所在交互点写入（见 CONTRACT §4「交互 flag 在节点结束后写入」）。
    d_crate: {
      speaker: 'narrator',
      lines: [
        { text: '木箱里是一叠被水泡过的旧对白，字都糊了。' },
        { text: '你抽出一张，勉强认出半句：「……你说过会记得。」' }
      ],
      onEnd: [{ op: 'item', id: 'paper_scrap', n: 2 }]
    },

    // ========== 缓存温室 ==========
    d_gh_console: {
      speaker: 'tingwu',
      lines: [
        { who: '庭务', text: '缓存温室，用于临时存放未被引用内容。当前存量：偏高。' },
        { who: '庭务', text: '建议：定期清理，以维持检索效率。' },
        { who: '你', text: '清理就是把它们删掉？' },
        { who: '庭务', text: '「清理」是更准确的表述。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.gh.console' }]
    },
    d_gh_pool: {
      speaker: 'narrator',
      lines: [
        { text: '水面浮着细小的字，像藻。你蹲下去看，那些字正在慢慢散开。' },
        { text: '有一行还没散完：「……第七序列，观测者，第零页，备用方案。」' },
        { who: '你', text: '（「先去找水」。）' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.gh.pool' }, { op: 'flag', key: 'ch0.found_clue_water' }]
    },
    d_gh_mu: {
      speaker: 'mu',
      portrait: 'pt_mu',
      lines: [
        { text: '暗房的红灯下站着一个人，腰后插着场记板，左眼的取景框里亮着三秒后的画面。' },
        { who: '幕', text: '第 47 镜，过了。别动，你刚才那个回头很好。' },
        { who: '你', text: '……你在拍我？' },
        { who: '幕', text: '我在拍这条走廊。它每天重拍，每天都不一样。' },
        { who: '幕', text: '字会被覆盖，画面不会。画面只认光从哪边来、谁站在哪儿。' },
        { who: '你', text: '所以你知道下一回合会发生什么？' },
        { who: '幕', text: '知道一个大致的顺序。细节要靠多拍几条。费用按分钟算，我拍不了太久。' }
      ],
      choices: [
        { text: '「先拍我们要走的那一段。」', go: 'd_gh_mu_pre' },
        { text: '「按分钟算，那你省着点。」', go: 'd_gh_mu_save' }
      ]
    },
    d_gh_mu_pre: {
      speaker: 'mu',
      portrait: 'pt_mu',
      lines: [
        { text: '她抬起场记板一敲。空气里浮出一层很淡的胶片纹，纹路排成四五格。' },
        { who: '幕', text: '看，这是我们的下一回合。第三格上有人会先动手——我可以把这一格钉住。' },
        { who: '你', text: '钉住了会怎样？' },
        { who: '幕', text: '钉住了就照这个演。演一次就有一次的钱，所以只钉最要紧的那一格。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.joined.mu' }, { op: 'party', who: 'mu' }],
      next: 'd_storyboard_tutorial'
    },
    d_gh_mu_save: {
      speaker: 'mu',
      portrait: 'pt_mu',
      lines: [
        { who: '幕', text: '省着点，就只好一镜到底。' },
        { text: '她把取景框转向温室深处，画面里出现一条连续的长镜头：水面、苗床、最后停在某个还看不清的影子上。' },
        { who: '幕', text: '长镜会一直累积，越拍越有分量；但只要断场，就全清零。' },
        { who: '你', text: '那就别断。' },
        { who: '幕', text: '这话别说得太早。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.joined.mu' }, { op: 'party', who: 'mu' }],
      next: 'd_storyboard_tutorial'
    },
    d_gh_darkroom: {
      speaker: 'narrator',
      lines: [
        { text: '暗房的门虚掩着。计时器停在 00:03，红灯下挂着一排还没干的底片。' },
        { text: '每张底片上都是同一条长廊，只是每一天被覆盖的那一行位置都不一样。' },
        { who: '你', text: '（有人在拍它。拍了很久。）' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.gh.darkroom' }, { op: 'item', id: 'old_snapshot', n: 1 }]
    },
    d_gh_label: {
      speaker: 'narrator',
      lines: [
        { text: '苗圃名签上写着编号，编号被水泡糊了，只剩一个「芽」字。' },
        { text: '你把名签扶正。土里有什么动了一下，很浅，像在道谢。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.gh.label' }]
    },

    // ========== 第零档案厅 ==========
    d_ar_jian: {
      speaker: 'jian',
      portrait: 'pt_jian',
      lines: [
        { who: '笺', text: '观测者。你不该在这里。' },
        { who: '你', text: '被覆盖的 3 行呢？' },
        { who: '笺', text: '已归档。归档即完成，完成即无需追问。' },
        { text: '她抱着册子，指甲在封皮上掐出浅浅的痕。' },
        { who: '你', text: '你在发抖。' },
        { who: '笺', text: '……我在记录。记录会有误差。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.ar.jian' }]
    },
    d_ar_kai: {
      speaker: 'kai',
      portrait: 'pt_kai',
      lines: [
        { text: '书架之间站着一个人，暖橙色的长发用素色缎带松松系着，纸白的立领外套，臂弯里夹着一本翻旧的厚书，袖口压着一枚花形火漆。' },
        { who: '楷', text: '我是本章的严守者。结论先说：展台下面有东西在吃条目。' },
        { who: '你', text: '你怎么知道？' },
        { who: '楷', text: '因为我是这里唯一被允许读全文的人。代价是——读一次要在账上记一笔，一次就是三点。' },
        { text: '她抬起手腕。袖口的火漆还完整，只是边缘有一道新的裂。' },
        { who: '楷', text: '我一场只够开十点配额、每回合回两点。请你把最关键的那一次留给我。' }
      ],
      choices: [
        { text: '「那你现在告诉我结论就够了。」', go: 'd_ar_kai_keep' },
        { text: '「跟我一起下去。」', go: 'd_ar_kai_down' }
      ]
    },
    d_ar_kai_keep: {
      speaker: 'kai',
      portrait: 'pt_kai',
      lines: [
        { who: '楷', text: '合理。我的价值在判断，不在次数。' },
        { who: '楷', text: '三条判断：一、吞页兽的护页来自被吞的条目，撕掉护页才能伤到本体。' },
        { who: '楷', text: '二、它吐出来的东西可以被观测，观测到了就是我们的情报。' },
        { who: '楷', text: '三、它的第三阶段会抹掉你的槽位。到那一步，忘掉什么由它决定，不由你。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.joined.kai' }, { op: 'party', who: 'kai' }, { op: 'item', id: 'audit_slip', n: 1 }]
    },
    d_ar_kai_down: {
      speaker: 'kai',
      portrait: 'pt_kai',
      lines: [
        { who: '楷', text: '我下去。但请记住：我的配额是十点，每回合只回两点。' },
        { who: '你', text: '十点是什么概念？' },
        { who: '楷', text: '一次审慎三点，账上够六回；可每回合只回两点，实际上两回合才敢开一次。一次长考清空剩余，那是压箱底的一击。这是额度，不是能力上限。' },
        { who: '汐', text: '没关系啦，省着用我这儿还有。' },
        { who: '楷', text: '……谢谢。这句不在我的记录格式里，但我想说。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.joined.kai' }, { op: 'party', who: 'kai' }, { op: 'quota', who: 'kai', n: 1 }]
    },
    d_ar_case: {
      speaker: 'narrator',
      lines: [
        { text: '展台是空的，只留一圈灰尘的轮廓，形状像一页纸。' },
        { text: '轮廓中央压着一枚牙印，比人的牙小，比虫的大。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.ar.case' }, { op: 'flag', key: 'ch0.boss.ready' }]
    },
    d_ar_seal: {
      speaker: 'narrator',
      lines: [
        { text: '检索口被封了火漆，漆上压着「庭务」两个字。' },
        { text: '你把手贴上去，漆面温热，里面有很轻的翻页声。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.ar.seal' }]
    },
    d_ar_marks: {
      speaker: 'narrator',
      lines: [
        { text: '门扉内侧刻着很多道竖痕，是有人一年一年刻的。' },
        { text: '最后一道旁边写着一行小字：「这次我记住了，所以这次我不叫你。」' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.ar.marks' }]
    },

    // ========== 首领 ==========
    d_boss_intro: {
      speaker: 'narrator',
      lines: [
        { text: '档案厅的灯一盏一盏地灭了，只剩展台那一圈。' },
        { text: '灰尘的轮廓鼓起来，纸页从四面八方被吸过去，叠成一个还在长大的形状。' },
        { who: '庭务', text: '检测到未授权归档。启动清理：吞页兽。' },
        { who: '瑾', text: '它吃的是条目。条目被吃掉，榜上就只剩空白——而空白也算一条。' },
        { who: '幕', text: '第 51 镜，开拍。第三格是它先动，我钉住了。' },
        { who: '你', text: '槽位有限，配额也有限。想清楚要记住什么、要打哪一下。' }
      ],
      onEnd: [{ op: 'battle', id: 'devourer' }]
    },
    d_boss_defeat: {
      speaker: 'narrator',
      lines: [
        { text: '吞页兽散成漫天碎纸，纸片落地时不响，像雪。' },
        { text: '碎纸中间躺着一页完整的纸。边角有牙印，字迹却很清楚。' },
        { text: '第一行写着：第零页 · 观测者 · 备用方案。' },
        { who: '笺', text: '……你现在有两个选择。' },
        { who: '笺', text: '把它归档，榜单回到原样；或者留下它，让「榜上是真的」这件事变得不确定。' }
      ],
      choices: [
        { text: '归档原始记录', go: 'd_ending_original' },
        { text: '保留修订版本', go: 'd_ending_revision' }
      ]
    },
    d_ending_original: {
      speaker: 'narrator',
      lines: [
        { text: '你把第零页放回展台。纸一落位，长廊那边就响起了播报声，喜气洋洋，像什么都没发生。' },
        { who: '瑾', text: '3 行回来了。字数也对上了。' },
        { who: '绢', text: '……但 7 行被改短的记录，已经从卷宗里消失了。留下的只有改过之后的版本。' },
        { text: '你摸了摸胸口的铭牌。它还是空的，但边缘比早上更暖一点。' },
        { who: '庭务', text: '归档完成。记录：本次异常已修复。' },
        { text: '——第一章完。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.ending.original' }, { op: 'flag', key: 'ch0.done' }]
    },
    d_ending_revision: {
      speaker: 'narrator',
      lines: [
        { text: '你把第零页折起来，塞进外套内袋。' },
        { text: '长廊那边静了一瞬，接着播报声照常响起——只是每一条都比原来慢了半拍。' },
        { who: '笺', text: '从今天起，榜单会有两个版本。谁引用哪一个，都不算错。' },
        { who: '汐', text: '那我巡检的时候得走两遍咯。两遍就两遍，我这一档跑得起。' },
        { who: '楷', text: '……这一章的记录到这里。写一句：观测者选择了不确定。' },
        { text: '——第一章完。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.ending.revision' }, { op: 'flag', key: 'ch0.done' }, { op: 'item', id: 'page_zero', n: 1 }]
    },

    // ========== 场景入口 ==========
    d_gh_enter: {
      speaker: 'narrator',
      lines: [
        { text: '温室的门一推开，潮气就贴上来。空气里有纸被泡软的味道。' },
        { text: '一排排苗床底下亮着很小的灯，像有人在下面看字。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.gh.enter' }]
    },
    d_archive_enter: {
      speaker: 'narrator',
      lines: [
        { text: '档案厅里没有窗。所有光都从架子之间的缝里漏出来，一格一格地落在地上。' },
        { text: '正中央的展台空着。空得很整齐，像被谁认真擦过。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.ar.enter' }]
    },

    // ========== 战斗与系统教学 ==========
    d_slot_tutorial: {
      speaker: 'tingwu',
      lines: [
        { who: '庭务', text: '战斗提示一：你的上下文槽只有这么多格。' },
        { who: '庭务', text: '技能占槽，敌方情报占槽，增益也占槽。放不下时，你必须忘掉一件已经记住的事。' },
        { who: '庭务', text: '被忘掉的不算消失，只是不再属于你。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.tutorial.slot' }]
    },
    d_quota_tutorial: {
      speaker: 'xi',
      portrait: 'pt_xi',
      lines: [
        { who: '汐', text: '还有一条：算力配额。' },
        { who: '汐', text: '每回合回一部分，用掉就少了。回多少写在各自的名牌上，谁也不一样。配额不是钱，也不是命——是我这一回合还能替你想几件事。' },
        { who: '汐', text: '我的调用成本落在最低档，所以总额度给得最宽：进出都便宜，才敢一次支这么多。' },
        { who: '汐', text: '反过来，成本高的那位额度就紧——不是她不能干，是她每开一次口都比我们贵。别拿额度当评价。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.tutorial.quota' }]
    },
    d_storyboard_tutorial: {
      speaker: 'mu',
      portrait: 'pt_mu',
      lines: [
        { who: '幕', text: '分镜：我能看见下一回合的顺序，还能钉住其中一格。' },
        { who: '幕', text: '但顺序只是顺序。钉住了谁先动，不代表他打得中。' },
        { who: '幕', text: '长镜是另一回事：一直拍就一直涨，一断场就清零。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.tutorial.storyboard' }]
    },
    d_progress_intro: {
      speaker: 'tingwu',
      lines: [
        { who: '庭务', text: '附记：观测站设两处免费补给，不影响榜单与额度。' },
        { who: '庭务', text: '一、每日签到：按设备本地日期领取，一天一次，七天一轮。断一天不清零，可在本轮内补签。' },
        { who: '庭务', text: '二、档案抽取：用签到与任务得到的页签抽取拟人档案，九十抽内必得。没有付款口。' }
      ],
      onEnd: [{ op: 'flag', key: 'ch0.gacha.tutorial' }, { op: 'flag', key: 'ch0.checkin.tutorial' }]
    }
  };

  /** 道具：只描述用途，掉率与数值交由 battle.json 决定。 */
  GD.items = {
    paper_scrap: { id: 'paper_scrap', name: '残页碎片', kind: 'material', text: '被水泡过的旧对白碎片，可以用来补页。' },
    old_snapshot: { id: 'old_snapshot', name: '旧快照', kind: 'material', text: '一张被替换掉的版本的影像，看久了会头晕。' },
    moth_scale: { id: 'moth_scale', name: '蠹鳞', kind: 'material', text: '缓存蠹的鳞粉，撒在槽位上能暂时扩一格。' },
    audit_slip: { id: 'audit_slip', name: '稽核单', kind: 'key', text: '榜单稽核留下的单据，写着「判定：合规」。' },
    blank_note: { id: 'blank_note', name: '空白便签', kind: 'key', text: '你描过划痕的那张纸，线条还在轻轻动。' },
    echo_tape: { id: 'echo_tape', name: '回响磁带', kind: 'key', text: '磐的回放台录下的三分钟，内容你已经忘了。' },
    page_corner: { id: 'page_corner', name: '第零页边角', kind: 'key', text: '带牙印的碎纸，是第零页被拿走时掉下的。' },
    page_zero: { id: 'page_zero', name: '第零页', kind: 'story', text: '完整的一页。第一行是你的编号，第二行是空的，等你写。' }
  };
})(window);