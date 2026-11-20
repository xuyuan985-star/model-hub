#!/usr/bin/env node
/*
 * dev-cdp.cjs — 真机 WebView 调试驱动（走 Chrome DevTools Protocol）
 *
 * 前置：
 *   1) 打包可调试版本：  DEBUG=1 bash tools/build-apk.sh
 *   2) 安装后启动 App，找到 webview_devtools_remote_<pid> 套接字：
 *        adb shell cat /proc/net/unix | grep webview_devtools
 *   3) 转发端口：
 *        adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
 *
 * 用法：
 *   node tools/dev-cdp.cjs list                     列出页面目标
 *   node tools/dev-cdp.cjs eval "表达式"             在页面里求值，结果 JSON 输出
 *   node tools/dev-cdp.cjs evalfile path/to.js      执行脚本文件（支持 await，整体 return）
 *   node tools/dev-cdp.cjs shot out/dir [前缀]       逐 tab 截图（rank/price/value/usage/more）
 *   node tools/dev-cdp.cjs shot1 out.png            当前页截一张
 *   node tools/dev-cdp.cjs log 20                   抓最近的控制台/异常（需先 enable）
 *
 * 环境变量：CDP_PORT（默认 9222）
 */
const fs = require('fs');
const http = require('http');
const path = require('path');

const PORT = process.env.CDP_PORT || 9222;

function getJson(url) {
  return new Promise((res, rej) => {
    http.get(url, r => {
      let b = '';
      r.setEncoding('utf8');
      r.on('data', c => (b += c));
      r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function connect() {
  const list = await getJson('http://127.0.0.1:' + PORT + '/json');
  const page = list.find(t => t.type === 'page') || list[0];
  if (!page) throw new Error('没有可调试的页面，App 起了吗？');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('WebSocket 连接失败')); });
  let id = 0;
  const waiters = new Map();
  const logs = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && waiters.has(m.id)) {
      const w = waiters.get(m.id); waiters.delete(m.id);
      m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result);
    } else if (m.method === 'Runtime.consoleAPICalled') {
      logs.push('[' + m.params.type + '] ' + m.params.args.map(a => (a.value !== undefined ? a.value : a.description || '')).join(' ').slice(0, 300));
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      logs.push('[exception] ' + String((d.exception && d.exception.description) || d.text).slice(0, 400));
    }
  };
  const send = (method, params) => {
    const i = ++id;
    return new Promise((res, rej) => { waiters.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  };
  const evaluate = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
    if (r.exceptionDetails) {
      const e = r.exceptionDetails;
      throw new Error(String((e.exception && e.exception.description) || e.text));
    }
    return r.result.value;
  };
  return { ws, send, evaluate, logs, page };
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd) { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); return; }
  const c = await connect();
  try {
    if (cmd === 'list') {
      const l = await getJson('http://127.0.0.1:' + PORT + '/json');
      console.log(JSON.stringify(l.map(t => ({ type: t.type, url: t.url, title: t.title })), null, 1));
    } else if (cmd === 'eval') {
      console.log(JSON.stringify(await c.evaluate(args.join(' ')), null, 1));
    } else if (cmd === 'evalfile') {
      console.log(JSON.stringify(await c.evaluate(fs.readFileSync(args[0], 'utf8')), null, 1));
    } else if (cmd === 'shot1') {
      const r = await c.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(args[0], Buffer.from(r.data, 'base64'));
      console.log('saved ' + args[0]);
    } else if (cmd === 'shot') {
      const dir = args[0] || 'shots';
      const prefix = args[1] || '';
      fs.mkdirSync(dir, { recursive: true });
      for (const t of ['rank', 'price', 'value', 'usage', 'more']) {
        await c.evaluate('(function(){var b=document.querySelector(\'#tabs button[data-tab="' + t + '"]\');if(b)b.click();return 1})()');
        await sleep(900);
        const r = await c.send('Page.captureScreenshot', { format: 'png' });
        const f = path.join(dir, prefix + t + '.png');
        fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
        console.log('saved ' + f);
      }
    } else if (cmd === 'log') {
      await c.send('Runtime.enable');
      await sleep(Number(args[0] || 5) * 1000);
      console.log(c.logs.slice(-60).join('\n') || '(没有控制台输出)');
    } else {
      console.log('未知命令：' + cmd);
    }
  } finally {
    try { c.ws.close(); } catch (e) {}
  }
}

main().catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });
