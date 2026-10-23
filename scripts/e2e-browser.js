// (@regress 없음 — 하네스 보조 · T902 브라우저 고르기 · 제품 무변)
// === scripts/e2e-browser.js — e2e 하네스의 브라우저 고르기 env 하나: `E2E_BROWSER` ===========================================
//
//   기본(env 없음 · `chromium`) = 종전 그대로 — `require('playwright').chromium.launch({ headless, executablePath: chromium.executablePath() })`.
//   `E2E_BROWSER=webkit` = **WebKit 엔진**(재민의 Safari 와 같은 엔진 · T902).
//     · Playwright 의 webkit 빌드가 있으면(`playwright.webkit.executablePath()` 파일이 있음) 그것을 쓴다.
//     · 없으면(이 상자 — `playwright install` 금지) **WebKitGTK MiniBrowser 를 W3C WebDriver(`WebKitWebDriver`)로** 몬다.
//       아래 어댑터는 하네스가 쓰는 Playwright 몫만 같은 이름 · 같은 뜻으로 낸다(단언 무변 · 하네스 몸통 무변):
//       browser.newContext({ viewport, storageState }) · browser.newPage · browser.close · ctx.newPage · ctx.storageState · ctx.close ·
//       page.goto · page.evaluate(fn, arg) · page.$(sel) → { click() } · page.fill · page.waitForFunction · page.screenshot({ path }) ·
//       page.keyboard.down/up/press · page.mouse.move/down/up · page.on('console' | 'pageerror') · page.close.
//       ★WebDriver 는 세션 하나 = 드라이버 하나 · 세션마다 저장소가 비어 있다(Playwright 컨텍스트와 같은 격리 — T902 §1 실측).
//       ★콘솔 · 페이지 오류는 WebDriver 로 못 받는다 — 페이지 안에 갈고리를 심어(evaluate 마다 없으면 심음) 쌓인 것을 evaluate 마다 받아 낸다.
//         갈고리를 심기 **전**(첫 적재 순간)의 오류는 못 본다 — 보고 §1.
//       준비(한 번): apt-get install -y webkit2gtk-driver xvfb xdotool
'use strict';
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');

const WHICH = (process.env.E2E_BROWSER || 'chromium').toLowerCase();
const MB = process.env.E2E_WEBKIT_BIN || '/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

async function launch(opts) {
  opts = opts || {};
  const pw = require('playwright');
  if (WHICH === 'chromium') return pw.chromium.launch({ headless: opts.headless, executablePath: pw.chromium.executablePath() });
  if (WHICH !== 'webkit') throw new Error(`E2E_BROWSER=${WHICH} — chromium | webkit 만 안다`);
  let pwWk = null; try { pwWk = pw.webkit.executablePath(); } catch (e) {}
  if (pwWk && fs.existsSync(pwWk)) return pw.webkit.launch({ headless: opts.headless });
  return launchWebKitGTK();
}

// ── WebKitGTK · WebDriver 어댑터 ────────────────────────────────────────────────
const KEYS = { Enter: '', Escape: '', Shift: '', Control: '', Alt: '', Tab: '', Backspace: '',
  ArrowLeft: '', ArrowUp: '', ArrowRight: '', ArrowDown: '', Space: ' ', Delete: '', Home: '', End: '' };
const keyVal = (k) => (KEYS[k] != null ? KEYS[k] : (k.length === 1 ? k : (/^Key([A-Z])$/.test(k) ? k.slice(3).toLowerCase() : (/^Digit(\d)$/.test(k) ? k.slice(5) : k))));
const XBTN = { left: 1, middle: 2, right: 3 };   // X 단추 번호
// 페이지 안 갈고리 — console · error · unhandledrejection 을 window.__wdLog 에 쌓는다(한 번만)
const HOOK = `if(!window.__wdHook){window.__wdHook=1;window.__wdLog=[];var L=window.__wdLog;
['log','info','warn','error','debug'].forEach(function(t){var o=console[t];console[t]=function(){try{L.push(['console',t==='warn'?'warning':t,Array.prototype.map.call(arguments,function(a){try{return typeof a==='string'?a:(a&&a.stack)||JSON.stringify(a)}catch(e){return String(a)}}).join(' ')]);if(L.length>2000)L.splice(0,1000)}catch(e){}return o.apply(console,arguments)}});
window.addEventListener('error',function(e){L.push(['pageerror',(e.error&&e.error.message)||e.message||String(e)])});
window.addEventListener('unhandledrejection',function(e){var r=e.reason;L.push(['pageerror',(r&&r.message)||String(r)])});}`;

async function launchWebKitGTK() {
  const procs = [];
  process.on('exit', () => { for (const q of procs) { try { q.kill('SIGKILL'); } catch (e) {} } });
  // ★화면(Xvfb)은 **페이지마다 하나** — 마우스는 진짜 X 입력(xdotool)으로 넣는데(아래 mouse), 창이 한 화면에 겹치면 맨 위 창이 받는다.
  let dispN = 60 + (process.pid % 20) * 8;
  const pages = [];
  const newPage = async (ctxOpts, ctx) => {
    const disp = ':' + (dispN++);
    const xv = spawn('Xvfb', [disp, '-screen', '0', '1920x1200x24', '-nolisten', 'tcp'], { stdio: 'ignore' }); procs.push(xv);
    await sleep(800);
    const port = await freePort();
    //   이 상자엔 GPU · dmabuf 가 없다 — 끈 판이 판 간격이 짧았다(보고 §1)
    const drv = spawn('WebKitWebDriver', [`--port=${port}`], { env: Object.assign({ WEBKIT_DISABLE_DMABUF_RENDERER: '1' }, process.env, { DISPLAY: disp }), stdio: 'ignore' });
    procs.push(drv);
    const base = `http://127.0.0.1:${port}`;
    const wd = async (method, p, body, tmo) => {
      const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(tmo || 600000) });
      const j = await r.json(); if (j && j.value && j.value.error) { const e = new Error(`${j.value.error}: ${j.value.message}`); e.wd = j.value.error; throw e; } return j.value;
    };
    let sess = null;
    for (let i = 0; i < 40 && !sess; i++) { try { sess = await wd('POST', '/session', { capabilities: { alwaysMatch: { 'webkitgtk:browserOptions': { binary: MB, args: ['--automation'] } } } }, 60000); } catch (e) { await sleep(250); } }
    if (!sess) throw new Error('WebKitWebDriver 세션을 못 열었다');
    const S = `/session/${sess.sessionId}`;
    await wd('POST', `${S}/timeouts`, { script: 600000, pageLoad: 300000, implicit: 0 });
    const vp = (ctxOpts && ctxOpts.viewport) || { width: 1280, height: 720 };
    const listeners = { console: [], pageerror: [] };
    let closed = false, pendingState = (ctxOpts && ctxOpts.storageState) || null;
    const deliver = (log) => {
      for (const e of log || []) {
        if (e[0] === 'console') { const m = { type: () => e[1], text: () => e[2] }; for (const f of listeners.console) { try { f(m); } catch (x) {} } }
        else { const er = new Error(e[1]); for (const f of listeners.pageerror) { try { f(er); } catch (x) {} } }
      }
    };
    const exec = async (body, args) => {
      const r = await wd('POST', `${S}/execute/async`, { script: `var __cb=arguments[arguments.length-1],__a=Array.prototype.slice.call(arguments,0,arguments.length-1);${HOOK};` +
        `var __J=function(v){return JSON.stringify(v===undefined?{__u:1}:v,function(k,x){return (typeof x==='number'&&!isFinite(x))?{__n:String(x)}:x})};` +
        `try{Promise.resolve((function(){${body}}).apply(null,__a)).then(function(v){var l=(window.__wdLog||[]).splice(0);__cb({j:__J(v),l:l})},function(e){var l=(window.__wdLog||[]).splice(0);__cb({e:String((e&&e.message)||e),l:l})})}catch(e){__cb({e:String((e&&e.message)||e),l:[]})}`, args: args || [] });
      deliver(r && r.l);
      if (r && r.e != null) throw new Error(r.e);
      //   ★값은 페이지 안에서 JSON 글로 만들어 받는다 — WebDriver 의 값 직렬화는 객체 키 차례를 바꾼다(실측 · `e2e-verbs` ⑪ 이 글자 비교라 갈렸다).
      //     Playwright 처럼 키 차례 · NaN · ±Infinity 를 지킨다(undefined 는 맨 위만).
      if (!r || r.j == null) return undefined;
      const v = JSON.parse(r.j, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length === 1 && typeof x.__n === 'string' ? Number(x.__n) : x));
      return (v && v.__u === 1 && Object.keys(v).length === 1) ? undefined : v;
    };
    //   ★창 크기 바꾸기는 비동기다 — 바로 재면 옛 innerWidth 를 읽어 막대 두께를 틀리게 잡는다(실측: 1100×720 을 청했는데 1176×672).
    //     바깥 크기가 청한 값이 될 때까지 기다렸다 재고, 다시 맞춘 뒤 안쪽이 청한 값이 될 때까지 기다린다.
    const fitViewport = async () => {
      const until = async (f) => { for (let i = 0; i < 60; i++) { const r = await exec('return [outerWidth, outerHeight, innerWidth, innerHeight]'); if (f(r)) return r; await sleep(50); } return null; };
      await wd('POST', `${S}/window/rect`, { width: vp.width, height: vp.height });
      const r = await until((q) => q[0] === vp.width && q[1] === vp.height);
      if (!r) return;
      const d = [r[0] - r[2], r[1] - r[3]];
      if (d[0] || d[1]) { await wd('POST', `${S}/window/rect`, { width: vp.width + d[0], height: vp.height + d[1] }); await until((q) => q[2] === vp.width && q[3] === vp.height); }
    };
    let _off = null;   // 창 안 보이는 면의 화면 원점(창 위치 + 위쪽 막대) — 창 크기를 맞춘 뒤 한 번 잰다
    const winOff = async () => { if (!_off) { const r = await exec('return [screenX, screenY, outerHeight - innerHeight]'); _off = [r[0], r[1] + r[2]]; } return _off; };
    const xdo = (args) => new Promise((res, rej) => { const q = spawn('xdotool', args, { env: Object.assign({}, process.env, { DISPLAY: disp }), stdio: 'ignore' }); q.on('exit', (c) => (c === 0 ? res() : rej(new Error('xdotool ' + args.join(' ') + ' → ' + c)))); q.on('error', rej); });
    const keyAct = (acts) => wd('POST', `${S}/actions`, { actions: [{ type: 'key', id: 'kb', actions: acts }] });
    const page = {
      async goto(url) {
        await wd('POST', `${S}/url`, { url });
        if (pendingState) {   // storageState — 그 출처에서 localStorage · 쿠키를 놓고 다시 적재(Playwright 는 적재 전에 넣는다 · 여기선 한 번 더 적재)
          const st = pendingState; pendingState = null;
          const o = new URL(url).origin;
          for (const og of st.origins || []) if (og.origin === o) await exec('var a=arguments[0];for(var i=0;i<a.length;i++)localStorage.setItem(a[i].name,a[i].value);return a.length', [og.localStorage || []]);
          for (const c of st.cookies || []) { try { await wd('POST', `${S}/cookie`, { cookie: { name: c.name, value: c.value, path: c.path || '/' } }); } catch (e) {} }
          await wd('POST', `${S}/url`, { url });
        }
        await exec('return 1');   // 갈고리를 심는다
        return null;
      },
      async evaluate(fn, arg) {
        if (typeof fn === 'function') return exec(`return (${fn.toString()}).apply(null, arguments)`, arg === undefined ? [] : [arg]);
        return exec(`return (${fn})`);
      },
      async $(sel) {
        let el; try { el = await wd('POST', `${S}/element`, { using: 'css selector', value: sel }); } catch (e) { if (e.wd === 'no such element') return null; throw e; }
        const id = Object.values(el)[0];
        return { click: async () => { await wd('POST', `${S}/element/${id}/click`, {}); } };
      },
      async fill(sel, text) {
        const id = Object.values(await wd('POST', `${S}/element`, { using: 'css selector', value: sel }))[0];
        await wd('POST', `${S}/element/${id}/clear`, {});
        if (text) await wd('POST', `${S}/element/${id}/value`, { text: String(text) });
      },
      async click(sel) { const h = await page.$(sel); if (!h) throw new Error(`없음: ${sel}`); await h.click(); },
      async waitForFunction(fn, opts) {
        const t0 = Date.now(), tmo = (opts && opts.timeout) || 30000;
        for (;;) { if (await page.evaluate(fn)) return true; if (Date.now() - t0 > tmo) throw new Error('waitForFunction 시간 초과'); await sleep(100); }
      },
      async screenshot(o) { const b = Buffer.from(await wd('GET', `${S}/screenshot`), 'base64'); if (o && o.path) fs.writeFileSync(o.path, b); return b; },
      keyboard: {
        down: (k) => keyAct([{ type: 'keyDown', value: keyVal(k) }]),
        up: (k) => keyAct([{ type: 'keyUp', value: keyVal(k) }]),
        press: (k) => keyAct([{ type: 'keyDown', value: keyVal(k) }, { type: 'keyUp', value: keyVal(k) }]),
      },
      // ★★마우스는 WebDriver 가 아니라 **진짜 X 입력**(xdotool · XTEST)으로 넣는다. WebKitWebDriver 2.52 의 pointerUp(button 2)은
      //   `mouseup(0)` · `click(0)` 을 내고 `pointerup(2)` · `auxclick(2)` 를 안 낸다(실측 · 보고 §1) — 동사 메뉴(46-h-verbs `auxclick`)가 영영 안 뜬다.
      //   같은 창에 xdotool 로 우클릭하면 `pointerdown(2) mousedown(2) contextmenu(2) pointerup(2) mouseup(2) auxclick(2)` — 크롬과 같은 차례다.
      mouse: {
        move: async (x, y) => { const o = await winOff(); await xdo(['mousemove', '--sync', String(Math.round(o[0] + x)), String(Math.round(o[1] + y))]); },
        down: (o) => xdo(['mousedown', String(XBTN[(o && o.button) || 'left'])]),
        up: (o) => xdo(['mouseup', String(XBTN[(o && o.button) || 'left'])]),
        click: async (x, y, o) => { await page.mouse.move(x, y); await page.mouse.down(o); await page.mouse.up(o); },
      },
      on(ev, f) { if (listeners[ev]) listeners[ev].push(f); return page; },
      async close() { if (closed) return; closed = true; try { await wd('DELETE', S, null, 20000); } catch (e) {} try { drv.kill('SIGKILL'); } catch (e) {} try { xv.kill('SIGKILL'); } catch (e) {} },
      isClosed: () => closed,
      context: () => ctx,
      async _storage() {
        const ls = await exec('var o=[];for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);o.push({name:k,value:localStorage.getItem(k)})}return [location.origin,o]');
        let ck = []; try { ck = await wd('GET', `${S}/cookie`); } catch (e) {}
        return { cookies: ck || [], origins: [{ origin: ls[0], localStorage: ls[1] }] };
      },
    };
    await wd('POST', `${S}/url`, { url: 'about:blank' }).catch(() => {});
    await fitViewport();
    pages.push(page);
    return page;
  };
  const newContext = async (ctxOpts) => {
    const mine = [];
    const ctx = {
      async newPage() { if (mine.length) throw new Error('어댑터: 컨텍스트 하나에 페이지 하나'); const p = await newPage(ctxOpts, ctx); mine.push(p); return p; },
      async storageState() { return mine[0] ? mine[0]._storage() : { cookies: [], origins: [] }; },
      async close() { for (const p of mine) await p.close(); },
      pages: () => mine.slice(),
    };
    return ctx;
  };
  return {
    newContext,
    async newPage(o) { return (await newContext(o)).newPage(); },
    async close() { for (const p of pages) await p.close(); for (const q of procs) { try { q.kill('SIGKILL'); } catch (e) {} } },
    version: () => 'WebKitGTK MiniBrowser (WebDriver)',
    _kind: 'webkitgtk-webdriver',
  };
}

module.exports = { launch, which: () => WHICH };
