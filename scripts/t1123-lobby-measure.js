#!/usr/bin/env node
// === scripts/t1123-lobby-measure.js — 로비 첫 화면 재기(T1123 ④) ===
//
// ★무엇을 재나: 로비(central `/`) 하나를 여는 데 드는 요청 수 · 받은 바이트 · 로비가 뜨는 때.
//   · 첫 방문 = 새 브라우저 문맥(캐시 빔) · 두 번째 방문 = 같은 문맥에서 새 탭으로 다시 연다(캐시 그대로).
//   · 때 셋(페이지 시계 ms): 첫 그림(FCP) · 시작 지역 칸 채워짐(`#startZone` 에 고를 수 있는 옵션) ·
//     오른쪽 판 채워짐(`#onbCards .vil-card` 하나 이상) · 그리고 load 이벤트.
//   · 요청은 Resource Timing 으로 센다(버퍼를 넉넉히 연다 — 기본 250 은 322 개를 못 담는다).
//     "네트 요청" = transferSize > 0(캐시에서 그냥 꺼낸 것은 0 · 304 는 머리만큼).
//   · "로비 몫" = 오른쪽 판이 채워지기 **전에 다 받은** 요청(responseEnd ≤ 그 때 — 로비와 망을 나눠 쓴 몫 · 뒤에 낮은 차례로 받는 게임 그림과 가른다).
//
// ★끔 ↔ 켬: central 둘을 띄운다(3010 = 끔 · 3011 = 켬) · 존 하나(3020)가 둘 다에게 답한다.
//   끔 = `T1123_LOBBY_LAZY=0 T1123_STATIC_CACHE=0`(종전 그대로) · 켬 = 기본.
//
// 실행: node scripts/t1123-lobby-measure.js [--runs 3] [--throttle] [--out 계측/x.json] [--browser chromium|webkit] [--central-only]
//   --throttle = Chromium 망 조임(CDP · 내려받기 10 Mbit/s · 왕복 100ms — 라이브 1 MB 그림 0.8초와 같은 자릿수)
//   --central-only = 존을 안 띄운다(시작 지역 칸 · 오른쪽 판 때는 비고 요청 · 바이트만 잰다 — 맥 VM WebKit 45초 판용)
//   ★[T1131] --off-root <트리> = "끔" central 을 다른 트리(예: main 작업트리)에서 띄운다 — 그때 끔 env 기본은 빈 것(그 트리 기본 그대로)
//            --off-env "K=V,K=V" = "끔" central env(기본 T1123 둘 = 0 · `--off-root` 면 빈 것) · --names 끔,켬 = 줄 이름
//            --server-count = central 둘에 `scripts/t1123-count-hook.js` 를 얹어 **서버가 본** 응답을 방문마다 센다(게임 그림 주소 · 그 밖 × 상태) — WebKit 은 이것이 증인
//            --persistent = 판마다 영속 문맥(빈 임시 폴더) — ⚠Playwright WebKit 은 영속 문맥이 아니면 HTTP 캐시를 안 쓴다(T1123 §1 실측) · webkit 이면 저절로 켠다
//            줄마다 `game` = 게임 그림 주소(나무 · 산 · 자연물 · 지면 · 밭 · 건물 · 다리 · 아이콘 · 그 json · terrain.json) 요청 · 네트 · 304 · png · webp · `?v=` 붙은 것
'use strict';
if (require.main === module) require('./lib-port').hold(3010, 3011, 3020);   // [T1288] 제품 고정 포트(존 설정 · central 기본) — 띄우는 동안 이 기계에서 혼자 쥔다(나란히 돌면 줄 선다 · `lib-port.hold`)
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');

const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const RUNS = +arg('--runs', 3);
const THROTTLE = process.argv.includes('--throttle');
const OUT = arg('--out', null);
const BROWSER = arg('--browser', 'chromium');
const CENTRAL_ONLY = process.argv.includes('--central-only');
const DUMP = arg('--dump', null);   // 요청 목록 원본(파일 머리) — 표 재료 · 레포에 안 적는다
let _lastRaw = null;
const OFF_ROOT = arg('--off-root', null);
const OFF_ENV = (() => { const v = arg('--off-env', OFF_ROOT ? '' : 'T1123_LOBBY_LAZY=0,T1123_STATIC_CACHE=0'); const o = {}; for (const kv of v.split(',').filter(Boolean)) { const i = kv.indexOf('='); o[kv.slice(0, i)] = kv.slice(i + 1); } return o; })();
const NAMES = arg('--names', '끔,켬').split(',');
const SRV_COUNT = process.argv.includes('--server-count');
const CNT = {};   // port → 세는 파일
const GAME = /\/assets\/(trees|nature|buildings|bridge|crops|terrain|icons|mountains)\/|\/assets\/icons\.lock\.json|\/terrain\.json/;   // [T1131] 게임 그림 문을 지나는 주소
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const procs = [];
function boot(file, env, root) {
  root = root || ROOT;
  const pre = [];
  if (SRV_COUNT && file === 'central.js') { const f = `/tmp/t1123-cnt-${process.pid}-${env.PORT}.txt`; fs.writeFileSync(f, ''); CNT[env.PORT] = f; env = Object.assign({}, env, { T1123_COUNT: f }); pre.push('-r', path.join(__dirname, 't1123-count-hook.js')); }
  const p = spawn(process.execPath, [...pre, path.join(root, 'server', file)], {
    cwd: root, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  procs.push(p); return p;
}
FB.reapOnExit(procs);

const INIT = () => {
  try { performance.setResourceTimingBufferSize(5000); } catch (e) {}
  window.__t1123 = { zone: null, cards: null };
  const iv = setInterval(() => {
    const m = window.__t1123;
    if (m.zone == null) { const s = document.getElementById('startZone'); if (s && [...s.options].some((o) => !o.disabled)) m.zone = performance.now(); }
    if (m.cards == null && document.querySelector('#onbCards .vil-card')) m.cards = performance.now();
    if (m.zone != null && m.cards != null) clearInterval(iv);
  }, 20);
};

function srvRead(url) {   // [T1131] 서버가 본 응답(이 방문) — 게임 그림 주소 · 그 밖 × 상태
  const port = (/:(\d+)\//.exec(url) || [])[1], f = CNT[port];
  if (!f || !fs.existsSync(f)) return null;
  const L = fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean);
  const o = { game: {}, other: {}, gameImm: 0 };
  for (const l of L) { const [st, u, cc] = l.split(' '); const g = GAME.test(u) ? 'game' : 'other'; o[g][st] = (o[g][st] || 0) + 1; if (g === 'game' && /immutable/.test(cc || '')) o.gameImm++; }
  return o;
}
function srvReset(url) { const port = (/:(\d+)\//.exec(url) || [])[1]; if (CNT[port]) fs.writeFileSync(CNT[port], ''); }
async function visit(ctx, url, waitReady) {
  srvReset(url);
  const page = await ctx.newPage();
  if (THROTTLE && BROWSER === 'chromium') {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 100, downloadThroughput: 10e6 / 8, uploadThroughput: 5e6 / 8 });
  }
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'commit', timeout: 120000 });
  // 로비가 뜰 때까지(상한 90초 — 표의 수) · 그다음 요청이 3초 동안 안 늘 때까지(상한 90초)
  const cap = Date.now() + 90000;
  while (Date.now() < cap) {
    const m = await page.evaluate(() => Object.assign({ rs: document.readyState }, window.__t1123)).catch(() => null);
    if (m && (CENTRAL_ONLY ? m.rs === 'complete' : (m.zone != null && (!waitReady || m.cards != null)))) break;
    await sleep(100);
  }
  let last = -1, still = 0; const cap2 = Date.now() + 90000;
  while (Date.now() < cap2) {
    const n = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.name.startsWith(location.origin) && !/\/(health|zones)(\?|$)/.test(e.name)).length).catch(() => -1);   // 남의 오리진(존 재시도) · 로비 폴링(/health · /zones)은 안 센다
    if (n === last) { still += 250; if (still >= 3000) break; } else { still = 0; last = n; }
    await sleep(250);
  }
  const r = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const fcp = (performance.getEntriesByType('paint').find((e) => e.name === 'first-contentful-paint') || {}).startTime;
    const m = window.__t1123 || {};
    const res = performance.getEntriesByType('resource').map((e) => ({ n: e.name.replace(location.origin, ''), st: e.startTime, end: e.responseEnd, tx: e.transferSize || 0, enc: e.encodedBodySize || 0, dec: e.decodedBodySize || 0 }));
    return { gimg: window.__gimg ? window.__gimg() : null, fcp: fcp == null ? null : fcp, dcl: nav.domContentLoadedEventStart || null, load: nav.loadEventStart || null,
      navTx: nav.transferSize || 0, navEnc: nav.encodedBodySize || 0, zone: m.zone, cards: m.cards, res };
  });
  r.wallMs = Date.now() - t0;
  await page.close();
  r.srv = srvRead(url);
  return r;
}

function sum(r) {
  const kind = (n) => { const p = n.split('?')[0]; const e = path.extname(p).toLowerCase() || '(없음)'; return e; };
  const net = r.res.filter((e) => e.tx > 0);
  const by = {};
  for (const e of r.res) { const k = kind(e.n); const b = (by[k] = by[k] || { n: 0, net: 0, tx: 0 }); b.n++; if (e.tx > 0) { b.net++; b.tx += e.tx; } }
  const readyAt = r.cards != null ? r.cards : r.zone;
  // 로비 몫 = 오른쪽 판이 채워지기 **전에 다 받은** 것(responseEnd ≤ 그 때) — 로비와 망을 나눠 쓴 바이트
  const before = readyAt != null ? r.res.filter((e) => e.end > 0 && e.end <= readyAt) : r.res;
  return {
    fcp: r.fcp == null ? null : Math.round(r.fcp), dcl: r.dcl == null ? null : Math.round(r.dcl), load: r.load == null ? null : Math.round(r.load),
    zone: r.zone == null ? null : Math.round(r.zone), cards: r.cards == null ? null : Math.round(r.cards),
    req: r.res.length + 1, netReq: net.length + (r.navTx > 0 ? 1 : 0),
    bytes: net.reduce((a, e) => a + e.tx, 0) + r.navTx,
    lobbyReq: before.length + 1, lobbyBytes: before.reduce((a, e) => a + e.tx, 0) + r.navTx,
    304: r.res.filter((e) => e.tx > 0 && e.tx < 1000 && e.enc > 0 && e.tx < e.enc).length,
    game: (() => { const g = r.res.filter((e) => GAME.test(e.n)); const net = g.filter((e) => e.tx > 0);
      return { n: g.length, net: net.length, n304: net.filter((e) => e.tx < 1000 && e.enc > 0 && e.tx < e.enc).length, bytes: net.reduce((a, e) => a + e.tx, 0),
        png: g.filter((e) => /\.png(\?|$)/.test(e.n)).length, webp: g.filter((e) => /\.webp(\?|$)/.test(e.n)).length, pinned: g.filter((e) => /\?v=[0-9a-f]{10,}$/.test(e.n)).length }; })(),
    gimg: r.gimg,
    srv: r.srv || null,
    by,
  };
}

(async () => {
  const ports = CENTRAL_ONLY ? [3010, 3011] : [3010, 3011, 3020];
  FB.mustBeFree(ports, 't1123-lobby-measure');
  const pid = process.pid;
  const dbs = [`/tmp/t1123-c0-${pid}.db`, `/tmp/t1123-c1-${pid}.db`, `/tmp/t1123-z-${pid}.db`];
  const cOff = boot('central.js', Object.assign({ PORT: '3010', DB_PATH: dbs[0], PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' }, OFF_ENV), OFF_ROOT);
  const cOffUp = FB.waitUp(cOff, /central server up on/, { name: 'central 끔' });
  const cOn = boot('central.js', { PORT: '3011', DB_PATH: dbs[1], PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cOnUp = FB.waitUp(cOn, /central server up on/, { name: 'central 켬' });
  let zUp = Promise.resolve({ ok: true });
  if (!CENTRAL_ONLY) {
    const z = boot('zone.js', { PORT: '3020', ZONE_ID: 'hanbando', DB_PATH: dbs[2], CENTRAL_URL: 'http://localhost:3010' });
    zUp = FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 });
  }
  for (const u of [await cOffUp, await cOnUp, await zUp]) if (!u.ok) { console.log('기동 실패', u.why); process.exit(1); }
  console.log(`[t1123] 기동 끝 · 브라우저 ${BROWSER}${THROTTLE ? ' · 망 조임' : ''} · ${RUNS}판 · ${NAMES[0]} = ${OFF_ROOT || '이 트리'} ${JSON.stringify(OFF_ENV)} · ${NAMES[1]} = 이 트리 기본`);
  // 존이 /startinfo 를 낼 때까지(도착 지점 굽기) — 첫 판이 굽기를 기다리느라 늦게 재지 않게 한 번 데운다
  if (!CENTRAL_ONLY) {
    for (let i = 0; i < 120; i++) {
      // 존이 시작 화면을 낼 수 있고(도착 지점 굽기) · central 둘이 존을 산 것으로 볼 때(/zones population — 아니면 지역 칸이 10초 폴링까지 막혀 첫 판이 늦게 잰다)
      try {
        const j = await (await fetch('http://localhost:3020/startinfo')).json();
        const z = await Promise.all([3010, 3011].map(async (p) => ((await (await fetch(`http://localhost:${p}/zones`)).json()).zones || {}).hanbando || {}));
        if (j && j.ok && (j.villages || []).length && z.every((x) => x.population != null)) break;
      } catch (e) {}
      await sleep(1000);
    }
  }
  const pw = require('playwright');
  const PERSIST = process.argv.includes('--persistent') || BROWSER === 'webkit';
  const browser = PERSIST ? null : await pw[BROWSER].launch({ headless: true });
  const os = require('os');
  const out = { at: new Date().toISOString(), browser: BROWSER, throttle: THROTTLE, persistent: PERSIST, runs: RUNS, off: { root: OFF_ROOT, env: OFF_ENV }, names: NAMES, rows: [] };
  for (let i = 0; i < RUNS; i++) {
    for (const [name, port] of [[NAMES[0], 3010], [NAMES[1], 3011]]) {
      const pdir = PERSIST ? fs.mkdtempSync(path.join(os.tmpdir(), 't1123-pctx-')) : null;
      const ctx = PERSIST ? await pw[BROWSER].launchPersistentContext(pdir, { headless: true, viewport: { width: 1280, height: 800 } })
                          : await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await ctx.addInitScript(INIT);
      const url = `http://localhost:${port}/`;
      const ra = await visit(ctx, url, !CENTRAL_ONLY), rb = await visit(ctx, url, !CENTRAL_ONLY);
      _lastRaw = [ra, rb];
      const a = sum(ra), b = sum(rb);
      await ctx.close();
      if (pdir) fs.rmSync(pdir, { recursive: true, force: true });
      out.rows.push({ i: i + 1, knob: name, first: a, second: b });
      if (DUMP) fs.writeFileSync(`${DUMP}-${name}-${i + 1}.json`, JSON.stringify({ first: _lastRaw[0], second: _lastRaw[1] }));
      const f = (s) => `요청 ${s.req}(네트 ${s.netReq} · 304 ${s[304]}) · ${(s.bytes / 1e6).toFixed(2)} MB · 게임 그림 주소 ${s.game.n}(네트 ${s.game.net} · 304 ${s.game.n304} · png ${s.game.png} · webp ${s.game.webp} · ?v= ${s.game.pinned}) ${s.srv ? ` · 서버가 본 게임 ${JSON.stringify(s.srv.game)}(immutable ${s.srv.gameImm}) · 그 밖 ${JSON.stringify(s.srv.other)}` : ''} · 로비 몫(오른쪽 판 전에 다 받음) ${s.lobbyReq}개 ${(s.lobbyBytes / 1e6).toFixed(2)} MB · 그림 문 ${s.gimg ? s.gimg.why + '@' + s.gimg.at : '-'} · FCP ${s.fcp} · 지역 칸 ${s.zone} · 오른쪽 판 ${s.cards} · load ${s.load}`;
      console.log(`${i + 1} ${name} 첫 방문: ${f(a)}`);
      console.log(`${i + 1} ${name} 둘째 방문: ${f(b)}`);
    }
  }
  if (browser) await browser.close();
  if (OUT) { fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(out, null, 1)); console.log('[t1123] 적음', OUT); }
  for (const f of dbs) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} }
  for (const f of Object.values(CNT)) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
