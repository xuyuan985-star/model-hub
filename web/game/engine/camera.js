/* web/game/engine/camera.js — 画布尺寸与逻辑分辨率：固定 384×224 逻辑像素，按设备像素整数倍放大，最近邻取样。
   适配要点（安卓 WebView 为主目标）：
   1) 整数倍率优先 —— 一个逻辑像素对整数个物理像素，放大不糊、不抖；
   2) 触控区参与布局 —— 竖屏按键在画布下方要扣高度，横屏按键浮在左右两侧要扣宽度，画布永远不会被按键压住；
   3) 屏幕安全区 —— 刘海/圆角/手势条用 env(safe-area-inset-*) 让开，HUD 与对话框不会被挡；
   4) 旋转不闪 —— 旋转时先按旧尺寸撑住，等下一帧再重算，避免白闪一帧。ES2019。 */
(function (w) {
  'use strict';
  var G = w.GameEngine = w.GameEngine || {};
  var VW = 384, VH = 224;

  /** 读元素的实际内容区（去掉 padding/border），横屏左右触控条、竖屏底部按键都靠它算。 */
  function innerSize(el) {
    if (!el) return { w: 0, h: 0 };
    var r = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 0, height: 0 };
    var cs = w.getComputedStyle ? w.getComputedStyle(el) : null;
    var px = cs ? (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) : 0;
    var py = cs ? (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) : 0;
    return { w: Math.max(0, r.width - px), h: Math.max(0, r.height - py) };
  }

  function create() {
    var cam = { vw: VW, vh: VH, scale: 1, dpr: 1, x: 0, y: 0, canvas: null, ctx: null, layout: null };

    /**
     * 计算可用区域：
     * - 竖屏：#pad 在文档流里（flex 下方），高度直接扣掉；
     * - 横屏：#pad 是 position:fixed 的左右两列，画布居中，所以两侧都要各让出「较宽那坨 + 间距」。
     */
    function measure() {
      var pad = document.getElementById('pad');
      var stage = document.getElementById('stage');
      var dw = document.documentElement.clientWidth || w.innerWidth || VW;
      var dh = document.documentElement.clientHeight || w.innerHeight || VH;
      var padH = 0, padW = 0;
      if (pad && w.getComputedStyle) {
        var cs = w.getComputedStyle(pad);
        if (cs.position === 'fixed') {
          // 横屏：画布水平居中，左右两侧各让出「较宽那坨触控区 + 间距」
          var dpad = pad.querySelector('.dpad'), acts = pad.querySelector('.acts');
          var l = innerSize(dpad), r = innerSize(acts);
          padW = 2 * (Math.max(l.w, r.w) + 10);
        } else {
          padH = pad.offsetHeight || 0;
        }
      }
      // 舞台自身的 padding 也要扣（横屏给刘海让位时用 padding-left/right 实现）
      var sp = stage ? innerSize(stage) : { w: dw, h: dh };
      return { dw: dw, dh: dh, padH: padH, padW: padW, stageW: sp.w || dw, stageH: sp.h || dh };
    }

    cam.fit = function (canvas, host) {
      cam.canvas = canvas;
      var dpr = w.devicePixelRatio || 1;
      var m = measure();
      var availW = Math.max(64, m.stageW - m.padW);
      var availH = Math.max(64, m.stageH - m.padH);

      // 设备像素下的最大整数倍率：宁可少一点也要保证 1 个逻辑像素 = 整数个物理像素
      var maxScale = Math.floor(Math.min(availW * dpr / VW, availH * dpr / VH));
      var scale = Math.max(1, maxScale);
      // 极小屏（连 1 倍都放不下）退回连续倍率，宁可有插值也不能把画面裁掉
      var crisp = maxScale >= 1;
      if (!crisp) scale = Math.min(availW * dpr / VW, availH * dpr / VH);

      var bw = Math.round(VW * scale), bh = Math.round(VH * scale);
      cam.dpr = dpr;
      cam.scale = scale;
      cam.layout = { availW: availW, availH: availH, padH: m.padH, padW: m.padW, crisp: crisp };
      canvas.width = bw;
      canvas.height = bh;
      // CSS 尺寸 = 设备像素 / dpr，浏览器按物理像素 1:1 映射，不糊边
      canvas.style.width = (bw / dpr) + 'px';
      canvas.style.height = (bh / dpr) + 'px';
      cam.ctx = canvas.getContext('2d');
      cam.ctx.imageSmoothingEnabled = false;
      if ('imageSmoothingQuality' in cam.ctx) cam.ctx.imageSmoothingQuality = 'low';
      return cam;
    };

    /** 每帧起点：复位变换后缩放到逻辑坐标系，之后所有绘制都按 384×224 写。 */
    cam.begin = function () {
      var ctx = cam.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cam.canvas.width, cam.canvas.height);
      ctx.setTransform(cam.scale, 0, 0, cam.scale, 0, 0);
      ctx.imageSmoothingEnabled = false;
      return ctx;
    };

    /** 镜头跟随：场景小于视口时归零，大于视口时夹在边界内。 */
    cam.follow = function (mapId, px, py) {
      var mw = (G.Map ? G.Map.cols(mapId) : 24) * 16;
      var mh = (G.Map ? G.Map.rows(mapId) : 14) * 16;
      cam.x = Math.max(0, Math.min(Math.max(0, mw - VW), px * 16 + 8 - VW / 2));
      cam.y = Math.max(0, Math.min(Math.max(0, mh - VH), py * 16 + 12 - VH / 2));
    };

    return cam;
  }

  G.Camera = { create: create, VW: VW, VH: VH };
})(window);
