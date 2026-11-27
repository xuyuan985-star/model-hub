/* creatorflag.js — 模型厂商所在国家（总部），用于在模型行的厂商名后显示小国旗。
 * 人工维护：快照里没有国家字段。只收录能确定总部国家的厂商；不确定的不标（不猜）。
 */
(function (w) {
  'use strict';
  var MAP = {
    'OpenAI': 'us', 'Google': 'us', 'Meta': 'us', 'Amazon': 'us', 'NVIDIA': 'us', 'Microsoft': 'us',
    'Anthropic': 'us', 'Liquid AI': 'us', 'Thinking Machines': 'us', 'SpaceXAI': 'us',
    'Allen Institute for AI': 'us', 'Perplexity': 'us', 'ServiceNow': 'us', 'Arcee AI': 'us',
    'Reflection': 'us', 'Prime Intellect': 'us', 'Nous Research': 'us', 'IBM': 'us', 'Inception': 'us', 'Reka AI': 'us',
    'Alibaba': 'cn', 'DeepSeek': 'cn', 'Kimi': 'cn', 'Z AI': 'cn', 'StepFun': 'cn', 'Xiaomi': 'cn',
    'MiniMax': 'cn', 'Baidu': 'cn', 'Tencent': 'cn', 'China Mobile': 'cn', 'ByteDance Seed': 'cn',
    'Upstage': 'kr', 'LG AI Research': 'kr', 'SK Telecom': 'kr', 'Korea Telecom': 'kr', 'Naver': 'kr',
    'Mistral': 'fr', 'Cohere': 'ca', 'Sarvam': 'in', 'TII UAE': 'ae'
  };
  /** 返回国旗图片路径，未收录返回空串。 */
  w.CreatorFlag = {
    src: function (creator) { var c = MAP[creator]; return c ? 'assets/flags/' + c + '.svg' : ''; }
  };
})(window);
