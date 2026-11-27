#!/usr/bin/env node
// === scripts/t1453-load-repro.js — T1453 재현 틀(계측 자 · @regress 없음) ==========================================
//
// ★무엇을 재나 — 카드 T1453 할 일 1 · 2 · 3 · 4:
//   존 DB 에 라이브 크기 길(456,479칸 — `t1453-seed.js`)을 심고 마을을 켠 존(ENABLE_VILLAGES=1 · 몸 청크 끔 = 제품 기본)을 띄운다 — 서버가 실제로 45만 칸을 들고
//   welcome · 청크 몫을 짓는다(T1446 은 welcome 글자에 끼웠다 · 여기선 끼우지 않는다).
//   팔 = 서버 손잡이 `T1453_VIEW_SEND`(vs0 · vs1 — 존을 다시 띄운다) × 클라 손잡이 `T1453_NAT_QUERY`(nat0 · nat1 — 주소 `?T1453_NAT_QUERY=`).
//   판마다(헤드리스 WebKit = Safari 엔진 · 화면 1,580 × 790 × 2 — T1446 과 같은 자):
//     ⓐ 접속: welcome 바이트(소켓 글자) · 접속 → 첫 그림(`__loadReport` 표시) · 접속 뒤 10초 핑 표본(`lastRttMs` 0.1초마다) · 퐁 왕복(프레임 캡처) ·
//        첫 14초 프레임마다 층(시간 줄 — 누가 주 스레드를 몇 ms 막나)
//     ⓑ 걷기: 마을 북쪽 1.3 km 줄을 서 → 동으로 청크 열 개(10,240px · S+D 키 · 걸음 64px/s) — 프레임 캡처(긴 프레임 · 층) · 그 사이 받은 짐(road_cells ·
//        buildings_spawn · buildings_removed 바이트 · 청크마다) · 막혀 멈추면 96px 순간 이동으로 민다(센다)
//     ⓒ 존 CPU — 존 아이 프리로드(`t1453-srv-meter.cjs`): 큰 JSON 글자 짓기 · `clientRoads` · `clientRoadsIn` ms(판 시각으로 가른다)
//   `--mem` — 존 메모리(뜬 뒤 9분 — `--mem-min`): T1445 계측기(`t1445-boot-mem.cjs` — S4 가지 `batch/boot-flood-1122` · **읽기만** — `--mem-pre <파일>`로 그 글자를 준다)를
//     존 아이에 얹고 vs0 · vs1 을 띄워 한 사람이 들어와 1 · 2 · 3분에 다시 붙고(welcome 넷) 머문다 → 5초마다 rss · 힙.
// ⚠헤드리스는 GPU 가 없다(그리기가 소프트웨어 — 프레임 dt 의 "브라우저 몫"이 맥보다 크다). 긴 프레임은 **JS 몫(렌더 + 메시지) > 50ms** 로도 센다.
// 실행: node scripts/t1453-load-repro.js [--arms vs0nat0,vs0nat1,vs1nat1] [--browsers webkit] [--walk-chunks 10] [--out 계측/T1453_<날짜>] [--mem --mem-pre <t1445-boot-mem.cjs>]
'use strict';
if (require.main === module) require('./lib-port').hold(3010, 3020);
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const SY = require('./t1446-synth');
const SEED = require('./t1453-seed');

const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ARMS = arg('--arms', 'vs0nat0,vs0nat1,vs1nat1').split(',').map((a) => ({ tag: a, vs: +a.match(/vs(\d)/)[1], nat: +a.match(/nat(\d)/)[1], rb: /rb(\d)/.test(a) ? +a.match(/rb(\d)/)[1] : -1 }));
//   ★[T1493] 팔에 `rb0` · `rb1` 을 붙이면 길 칸 배열(`T1448_ROAD_GRID=1`) 위에서 `T1493_ROAD_BOX` 끔 · 켬(존을 다시 띄운다) · 없으면 종전 팔 그대로
const armEnv = (arm) => (arm.rb >= 0 ? { T1448_ROAD_GRID: '1', T1493_ROAD_BOX: String(arm.rb) } : {});
const armKey = (arm) => `vs${arm.vs}rb${arm.rb}`;
//   ★[T1493] `--seed-from <world.db 사본>` — 합성 길 대신 라이브 사본의 `roads` 표(칸 행 그대로 · hanbando)를 심는다(제품 모듈이 표를 짓고 ATTACH 로 옮긴다)
const SEED_FROM = arg('--seed-from', '');
const BROWSERS = arg('--browsers', 'webkit').split(',');
const WALK_CH = +arg('--walk-chunks', 10);
const BODY = arg('--body', '0');
const OUT = path.resolve(ROOT, arg('--out', '계측/T1453_' + new Date().toISOString().slice(0, 10)));
const VIEW = { width: +arg('--w', 1580), height: +arg('--h', 790) };
const MEM = process.argv.includes('--mem');
const MEM_PRE = arg('--mem-pre', '');
const MEM_MIN = +arg('--mem-min', 9);   // 뜬 뒤 몇 분까지(T1445 봉우리 — 뜬 뒤 6분 남짓 — 를 지나게)
const METER = path.join(__dirname, 't1453-srv-meter.cjs');
fs.mkdirSync(OUT, { recursive: true });

const say = (s) => { console.log(s); fs.appendFileSync(path.join(OUT, MEM ? 'mem-log.txt' : 'repro-log.txt'), s + '\n'); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) { const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT }); procs.push(p); return p; }
function killAll() { for (const p of procs) { try { p.kill(); } catch (e) {} } procs.length = 0; }

// ── 자리 ───────────────────────────────────────────────────────────────────────────
const V = SY.villageCenters();
const AT = V.vils.find((v) => v.name === '농촌22') || V.vils[0];
//   걷는 줄 — 마을(농촌22) 북쪽 1,312px · 마을 서쪽 5,500px 에서 동으로 청크 열 개(줄 전체가 뭍 — `V.blocked` 로 8px 마다 쟀다 · 마을 청크가 둘레 ±2 에 든다 = 켜짐 · 꺼짐 방송이 걷는 중에 온다)
const WALK = { x0: AT.cx * 32 + 16 - 5500, y: AT.cy * 32 + 16 - 1312 };
WALK.x1 = WALK.x0 + WALK_CH * 1024;

async function bootWorld(vs, extraEnv, ports) {
  killAll(); await sleep(1000);
  const cp = (ports && ports.c) || CPORT, zp = (ports && ports.z) || ZPORT;
  const seedDb = path.join(OUT, '_seed.db');
  if (!fs.existsSync(seedDb)) {
    if (SEED_FROM) {   // ★[T1493] 라이브 사본 길
      const att = 'ATTACH DATABASE ' + "'" + SEED_FROM.replace(/'/g, "''") + "'" + ' AS L', ins = "INSERT INTO roads (zone, cell_key, v, d) SELECT zone, cell_key, v, d FROM L.roads WHERE zone = 'hanbando'";
      const code = `const D = require(${JSON.stringify(path.join(ROOT, 'server', 'zone-local-db.js'))}); const t0 = Date.now();
        D.db.exec(${JSON.stringify(att)}); D.db.exec(${JSON.stringify(ins)}); D.db.exec('DETACH DATABASE L');
        console.log(JSON.stringify({ n: D.db.prepare('SELECT COUNT(*) n FROM roads').get().n, ms: Date.now() - t0 }));`;
      const r = require('child_process').spawnSync(process.execPath, ['-e', code], { env: { ...process.env, DB_PATH: seedDb, ZONE_ID: 'hanbando' }, encoding: 'utf8' });
      say('  길 심기(라이브 사본) ' + String(r.stdout || r.stderr || '').trim().split('\n').pop());
    } else say('  길 심기 ' + JSON.stringify(SEED.seed(seedDb, 'hanbando')));
  }
  const db = `/tmp/t1453-repro-${process.pid}-${vs}-${Object.values(extraEnv || {}).join('').replace(/[^0-9a-z]/gi, '').slice(-8)}.db`;
  for (const s of ['', '-wal', '-shm']) try { fs.unlinkSync(db + s); } catch (e) {}
  fs.copyFileSync(seedDb, db);
  const c = boot(path.join(ROOT, 'server', 'central.js'), { PORT: String(cp), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' }); if (!cu.ok) throw new Error(cu.why);
  const env = { PORT: String(zp), ZONE_ID: 'hanbando', DB_PATH: db, CENTRAL_URL: `http://localhost:${cp}`, ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', T432_BODY_CHUNKS: BODY, T1453_VIEW_SEND: String(vs), ...(extraEnv || {}) };
  const t0 = Date.now();
  const z = boot(path.join(ROOT, 'server', 'zone.js'), env);
  let zlog = ''; z.stdout.on('data', (d) => { if (zlog.length < 4e6) zlog += d; }); z.stderr.on('data', (d) => { if (zlog.length < 4e6) zlog += d; });
  const zu = await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 400000 }); if (!zu.ok) throw new Error(zu.why);
  await sleep(20000);   // 마을 시딩 · 몸 스폰이 가라앉을 때까지
  return { z, t0, log: () => zlog };
}

async function openPage(browser, nat) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  let crashed = false; page.on('crash', () => { crashed = true; });
  //   받은 짐 — 페이지 안에서 센다(존 소켓 `onmessage` 를 감싼다 · 글자 그대로 넘긴다). Playwright 소켓 가로채기는 안 쓴다(WebKit 이 걷는 중 가끔 죽었다 — 판 다시).
  await page.addInitScript((zport) => {
    //   ★소리 끔 — 헤드리스 WebKit(WPE)은 소리 길(GStreamer · 장치 없음)에서 몇 분 안에 죽는다("pure virtual method called" — 첫 몸짓의 BGM 뒤 걷는 중).
    //     Web Audio 가 없는 브라우저 길(48-a-audio `sfxWake` — "조용히 없는 층이 된다")로 띄운다. 소리 예약 몫만 빠진다(재는 층 밖).
    try { window.AudioContext = undefined; window.webkitAudioContext = undefined; } catch (e) {}
    window.__t1453Ping = []; window.__t1453Rx = [];
    const iv = setInterval(() => { try { if (typeof lastRttMs !== 'undefined' && window.__t1453Ping.length < 600) window.__t1453Ping.push([performance.now(), lastRttMs]); } catch (e) {} }, 100);
    setTimeout(() => clearInterval(iv), 120000);
    const D = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
    Object.defineProperty(WebSocket.prototype, 'onmessage', { configurable: true, get() { return D.get.call(this); }, set(fn) {
      const url = this.url || '';
      D.set.call(this, typeof fn !== 'function' || url.indexOf(':' + zport) < 0 ? fn : function (ev) {
        try { const d = ev.data; if (typeof d === 'string' && window.__t1453Rx.length < 200000) { const m = /^\{"type":"([a-z_0-9]+)"/.exec(d.slice(0, 48)); window.__t1453Rx.push([Date.now(), m ? m[1] : '?', d.length]); } } catch (e) {}
        return fn.call(this, ev);
      });
    } });
  }, ZPORT);
  await page.goto(`http://localhost:${CPORT}/?T1453_NAT_QUERY=${nat}`);
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, null, { timeout: 60000 }).catch(() => {});
  await page.waitForFunction(() => { const s = document.getElementById('startZone'); const o = s && [...s.options].find((x) => x.value === 'hanbando' && !x.disabled); if (o) s.value = 'hanbando'; return !!o; }, null, { timeout: 60000, polling: 250 }).catch(() => {});
  const msgs = { pull: async (from) => page.evaluate((i) => window.__t1453Rx.slice(i), from || 0) };
  return { ctx, page, errs, msgs, crashed: () => crashed };
}

//   긴 프레임 한 장의 주인 — 층 몫 중 가장 큰 것(JS 몫만 · 브라우저 몫은 따로)
const L1 = ['tile', 'water', 'mt', 'nat', 'ent', 'hud'], L2 = ['rd', 'bd', 'ls', 'rm', 'so', 'pre', 'fog', 'post', 'strm'];
const NAME = { tile: '지면 타일', water: '물', mt: '산', nat: '자연물(모으기 · 막음)', ent: '몸(개체)', hud: 'HUD', rd: '길 훑기', bd: '건물 훑기', ls: '그 밖 목록', rm: '방·지붕', so: '정렬',
  pre: '그리기 앞', fog: '안개', post: '몸 뒤', strm: '개울', msg: '메시지 처리', rest: '렌더 나머지', browser: '브라우저(그리기 · 합성)' };
function owners(f) {
  const o = {}; for (const k of L1) o[k] = f[k] || 0; for (const k of L2) o[k] = f[k] || 0; o.msg = f.msg || 0;
  const l1 = L1.reduce((a, k) => a + (f[k] || 0), 0), l2 = L2.reduce((a, k) => a + (f[k] || 0), 0);
  o.rest = Math.max(0, (f.render || 0) - l1 - l2);
  return o;
}
function longTable(F) {
  const LF = F.longFrames || [], js = LF.filter((f) => (f.render || 0) + (f.msg || 0) > 50);
  const by = {};
  for (const f of js) { const o = owners(f); const top = Object.entries(o).sort((a, b) => b[1] - a[1])[0]; (by[top[0]] = by[top[0]] || { n: 0, ms: 0, max: 0 }); by[top[0]].n++; by[top[0]].ms += top[1]; by[top[0]].max = Math.max(by[top[0]].max, top[1]); }
  const rank = Object.entries(by).map(([k, v]) => ({ who: NAME[k] || k, k, n: v.n, ms: +v.ms.toFixed(0), max: +v.max.toFixed(0) })).sort((a, b) => b.ms - a.ms);
  const jsMax = js.reduce((a, f) => Math.max(a, (f.render || 0) + (f.msg || 0)), 0);
  return { frames: F.frames.n, p50: F.frames.p50, max: F.frames.max, long50: F.frames.long50, long100: F.frames.long100, js50: js.length, js100: js.filter((f) => (f.render || 0) + (f.msg || 0) > 100).length,
    jsMax: +jsMax.toFixed(0), rank, top: js.slice().sort((a, b) => ((b.render || 0) + (b.msg || 0)) - ((a.render || 0) + (a.msg || 0))).slice(0, 8).map((f) => ({ t: f.t, dt: f.dt, js: +((f.render || 0) + (f.msg || 0)).toFixed(0), msgN: f.msgN,
      who: Object.entries(owners(f)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${NAME[k] || k} ${v.toFixed(0)}`).join(' · ') })) };
}

//   WebKit 헤드리스는 소리 길에서 죽었다(위 소리 끔으로 걷힘 — 200초 걷기 0번). 그래도 걷기를 조각(캡처 60초)으로 나눠 조각마다 적고,
//   죽으면 새 페이지로 다시 들어가 마지막 자리부터 잇는다(다시 들어간 뒤 10초는 안 잰다 · 죽은 조각은 버리고 센다).
const SEG_SEC = 60;
async function enterPage(PW, bn, arm) {
  const browser = await PW[bn].launch();
  const P = await openPage(browser, arm.nat);
  P.browser = browser;
  return P;
}
async function connectPhase(P) {
  const { page, msgs, errs } = P;
  const tArm0 = Date.now();
  // ⓐ 접속 — 누르기 직전에 14초 프레임 캡처를 건다(첫 그림 · 지면 · 자연물 · 색인 세우기가 다 든다)
  await page.evaluate(() => { window.__t1453Fc0 = performance.now(); window.__t1453Fc = window.__frameCapture(14, { save: false }).then((F) => { window.__t1453FcOut = F; }); });
  const tClick = Date.now();
  try { await page.click('#enter'); } catch (e) {}
  const entered = await page.waitForFunction(() => !!(window._shadowMask && window.__getPrimaryZoneId && window.__getPrimaryZoneId() === 'hanbando'), null, { timeout: 120000 }).then(() => true).catch(() => false);
  if (!entered) return { err: '입장 못 함', errs };
  await page.waitForFunction(() => !!window.__t1453FcOut, null, { timeout: 60000, polling: 500 }).catch(() => {});
  const F0 = await page.evaluate(() => window.__t1453FcOut);
  const fc0 = await page.evaluate(() => window.__t1453Fc0);
  const load = await page.evaluate(() => window.__loadReport().then((x) => x && { welcome: x.welcome, total: x.total, settled: x.settled, at: x.at, stages: x.stages, long: x.long }));
  const ping = await page.evaluate(() => window.__t1453Ping.slice());
  const rx0 = await msgs.pull(0);
  const wel = rx0.find((m) => m[1] === 'welcome');
  const st0 = await page.evaluate(() => { const c = conns.get('hanbando'); return { roads: c.roads.size, blds: c.buildings.size, nat: window.__t1453 ? window.__t1453.nat() : null }; });
  //   접속 뒤 6초 — welcome 받은 때(`at.welcomeRx`)부터: 핑 표본 · 퐁 왕복 1초 넘김 · 50ms 넘는 판(층)
  const at = (load && load.at) || {};
  const w0 = at.welcomeRx;
  const pingAfter = w0 != null ? ping.filter((p) => p[0] >= w0 && p[0] <= w0 + 6000) : [];
  const ping1s = pingAfter.filter((p) => p[1] > 1000).length, pingMax = pingAfter.reduce((a, p) => Math.max(a, p[1] || 0), 0);
  return { entered, welcomeBytes: wel ? wel[2] : null, welcomeAt: wel ? wel[0] - tClick : null, st0, load, ping: { n: pingAfter.length, over1s: ping1s, max: pingMax, all: pingAfter },
    pong6: F0 ? { series: (F0.pong && F0.pong.series) || [] } : null, first14: F0 ? { frames: F0.frames, long: F0.longFrames || [], t0abs: fc0 } : null, tArm0, tClick, errs };
}
async function teleportTo(page, x, y) {
  let arrived = false;
  for (let tries = 0; tries < 4 && !arrived; tries++) {
    await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [x, y]);
    arrived = await page.waitForFunction(([x, y]) => { const c = conns.get('hanbando'); const m = window.__getSrvAbs ? window.__getSrvAbs() : null;
      return !!(c && c.meta && m) && Math.abs(m.x - c.meta.worldOffsetX - x) < 64 && Math.abs(m.y - (c.meta.worldOffsetY || 0) - y) < 64; }, [x, y], { timeout: 30000, polling: 250 }).then(() => true).catch(() => false);
  }
  return arrived;
}
const posOf = (page) => page.evaluate(() => { const c = conns.get('hanbando'); const m = window.__getSrvAbs ? window.__getSrvAbs() : null; return m && c && c.meta ? { x: m.x - c.meta.worldOffsetX, y: m.y - (c.meta.worldOffsetY || 0) } : null; });
async function walkSeg(P, st) {   // 조각 하나 — 캡처 SEG_SEC 초 · 그동안 S+D · 1초마다 자리(막히면 96px 민다)
  const { page, msgs } = P;
  const m0 = (await msgs.pull(0)).length, t0 = Date.now();
  await page.evaluate((sec) => { window.__t1453FcW = null; window.__frameCapture(sec, { save: false }).then((F) => { window.__t1453FcW = F; }); }, SEG_SEC);
  await page.keyboard.down('KeyS'); await page.keyboard.down('KeyD');
  let last = null, lastT = Date.now();
  const tEnd = Date.now() + SEG_SEC * 1000 - 800;
  while (Date.now() < tEnd) {
    await sleep(1000);
    const p = await posOf(page);
    if (!p) continue;
    st.x = p.x;
    if (p.x >= WALK.x1) break;
    if (last && Math.abs(p.x - last.x) < 16 && Date.now() - lastT >= 2000) { await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [Math.round(p.x + 96), WALK.y]); st.nudges++; lastT = Date.now(); }
    if (!last || Math.abs(p.x - last.x) >= 16) { last = p; lastT = Date.now(); }
  }
  await page.keyboard.up('KeyS'); await page.keyboard.up('KeyD');
  const t1 = Date.now();
  await page.waitForFunction(() => !!window.__t1453FcW, null, { timeout: SEG_SEC * 1000 + 30000, polling: 500 }).catch(() => {});
  const F = await page.evaluate(() => window.__t1453FcW);
  const L = (await msgs.pull(m0)).filter((m) => m[0] <= t1);
  return { F, L, sec: (t1 - t0) / 1000 };
}
async function runArm(PW, bn, arm, Z) {
  let crashes = 0, lostSec = 0, P = null, con = null;
  for (let k = 0; k < 3 && !con; k++) {   // 접속 판 — 죽으면 다시(세 번까지)
    try { P = await enterPage(PW, bn, arm); con = await connectPhase(P); if (con.err) return con; }
    catch (e) { if (!/crash|closed/i.test(String(e && e.message))) throw e; crashes++; say(`    (${bn} 접속 판에서 죽음 ${crashes} — 다시)`); if (P) await P.browser.close().catch(() => {}); P = null; con = null; }
  }
  if (!con) return { err: '접속 판 세 번 죽음', crashes };
  const st = { x: WALK.x0, nudges: 0 }, segs = [];
  let ready = false;
  for (let guard = 0; st.x < WALK.x1 - 32 && guard < 40; guard++) {
    try {
      if (!P) { P = await enterPage(PW, bn, arm); try { await P.page.click('#enter'); } catch (e) {}
        await P.page.waitForFunction(() => !!(window._shadowMask && window.__getPrimaryZoneId && window.__getPrimaryZoneId() === 'hanbando'), null, { timeout: 120000 }); ready = false; }
      if (!ready) { await teleportTo(P.page, Math.round(st.x), WALK.y); await sleep(10000); ready = true; }
      const tS = Date.now(), x0 = st.x;
      const sg = await walkSeg(P, st);
      segs.push({ x0, x1: st.x, sec: sg.sec, F: sg.F, L: sg.L, t: tS });
    } catch (e) {
      if (!/crash|closed/i.test(String(e && e.message))) throw e;
      crashes++; lostSec += SEG_SEC; say(`    (${bn} 걷다 죽음 ${crashes} · x ${Math.round(st.x)} — 새 페이지로 잇는다)`);
      if (P) await P.browser.close().catch(() => {}); P = null;
      if (crashes > 12) break;
    }
  }
  const stW = P ? await P.page.evaluate(() => { const c = conns.get('hanbando'); return { roads: c.roads.size, blds: c.buildings.size, t1453: window.__t1453 ? window.__t1453.stat() : null }; }).catch(() => null) : null;
  if (P) await P.browser.close().catch(() => {});
  //   조각을 잇는다 — 프레임 수 · 긴 프레임(조각마다 t 는 그 조각 머리부터) · 받은 짐
  const frames = segs.reduce((a, s) => a + (s.F ? s.F.frames.n : 0), 0);
  const longFrames = [].concat(...segs.map((s, i) => (s.F ? s.F.longFrames : []).map((f) => ({ ...f, seg: i }))));
  const dts = []; for (const s of segs) if (s.F) dts.push(s.F.frames.p50);
  const F = { frames: { n: frames, p50: dts.length ? +(dts.reduce((a, b) => a + b, 0) / dts.length).toFixed(1) : null, max: Math.max(0, ...segs.map((s) => s.F ? s.F.frames.max : 0)),
    long50: segs.reduce((a, s) => a + (s.F ? s.F.frames.long50 : 0), 0), long100: segs.reduce((a, s) => a + (s.F ? s.F.frames.long100 : 0), 0) }, longFrames };
  const kinds = {}; for (const s of segs) for (const [, t, n] of s.L) { const e = kinds[t] || (kinds[t] = { n: 0, kb: 0 }); e.n++; e.kb += n / 1024; }
  for (const k in kinds) kinds[k].kb = +kinds[k].kb.toFixed(1);
  const walked = segs.reduce((a, s) => a + Math.max(0, s.x1 - s.x0), 0), chunks = Math.max(1, Math.round(walked / 1024));
  const loadKb = ['road_cells', 'buildings_spawn', 'buildings_removed'].reduce((a, k) => a + (kinds[k] ? kinds[k].kb : 0), 0);
  return { ...con, errs: (con.errs || []).slice(0, 5),
    walk: { done: st.x >= WALK.x1 - 32, x: st.x, nudges: st.nudges, crashes, lostSec, segs: segs.length, sec: +segs.reduce((a, s) => a + s.sec, 0).toFixed(1), walked: Math.round(walked), chunks, kinds,
      perChunkKb: +(loadKb / chunks).toFixed(1), table: longTable(F), frames: F.frames, st: stW, segX: segs.map((s) => [Math.round(s.x0), Math.round(s.x1)]) },
    t: { arm0: con.tArm0, click: con.tClick, w0: segs.length ? segs[0].t : null, w1: Date.now() }, crashes };
}

function meterSlice(file, t0, t1) {   // 존 미터 — 그 판 벽시계 안 기록만
  try {
    const J = JSON.parse(fs.readFileSync(file, 'utf8'));
    const inT = (r) => r.at >= t0 && r.at <= t1;
    const S = (J.stringify || []).filter(inT), RIN = (J.roadsIn || []).filter(inT), RC = (J.roads || []).filter(inT);
    const sum = (a, k) => +a.reduce((x, r) => x + (r[k] || 0), 0).toFixed(1);
    const by = {}; for (const r of S) { const e = by[r.type] || (by[r.type] = { n: 0, ms: 0, mb: 0 }); e.n++; e.ms += r.ms; e.mb += r.len / 1e6; }
    for (const k in by) { by[k].ms = +by[k].ms.toFixed(1); by[k].mb = +by[k].mb.toFixed(2); }
    return { stringify: by, clientRoads: { n: RC.length, ms: sum(RC, 'ms') }, clientRoadsIn: { n: RIN.length, ms: sum(RIN, 'ms'), cells: sum(RIN, 'cells') } };
  } catch (e) { return { err: String(e.message || e) }; }
}

async function memRuns() {
  if (!MEM_PRE || !fs.existsSync(MEM_PRE)) { say('  --mem-pre <t1445-boot-mem.cjs> 가 없다'); return; }
  const PW = require('playwright');
  const res = {};
  for (const vs of [0, 1]) {
    const memOut = path.join(OUT, `mem-vs${vs}-%p.jsonl`);
    const Z = await bootWorld(vs, { NODE_OPTIONS: `--require ${MEM_PRE} --require ${METER}`, T1445_MEM_OUT: memOut, T1453_METER_OUT: path.join(OUT, `meter-mem-vs${vs}.json`) });
    const browser = await PW.chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${CPORT}/`);
    await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, null, { timeout: 60000 }).catch(() => {});
    await page.waitForFunction(() => { const s = document.getElementById('startZone'); const o = s && [...s.options].find((x) => x.value === 'hanbando' && !x.disabled); if (o) s.value = 'hanbando'; return !!o; }, null, { timeout: 60000, polling: 250 }).catch(() => {});
    try { await page.click('#enter'); } catch (e) {}
    await page.waitForFunction(() => !!(window.__getPrimaryZoneId && window.__getPrimaryZoneId()), null, { timeout: 120000 }).catch(() => {});
    //   다시 붙기 셋(welcome 셋 더 — 1분 · 2분 · 3분) — 큰 welcome 글자가 존 힙에 남기는 몫을 본다
    for (let i = 0; i < 3; i++) { await sleep(60000); await page.reload(); await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, null, { timeout: 60000 }).catch(() => {});
      await page.waitForFunction(() => { const s = document.getElementById('startZone'); const o = s && [...s.options].find((x) => x.value === 'hanbando' && !x.disabled); if (o) s.value = 'hanbando'; return !!o; }, null, { timeout: 60000, polling: 250 }).catch(() => {});
      try { await page.click('#enter'); } catch (e) {} }
    const left = MEM_MIN * 60000 - (Date.now() - Z.t0); if (left > 0) await sleep(left);
    await browser.close().catch(() => {});
    killAll(); await sleep(1500);
    const f = fs.readdirSync(OUT).filter((n) => n.startsWith(`mem-vs${vs}-`) && n.endsWith('.jsonl')).map((n) => path.join(OUT, n));
    const rows = f.length ? fs.readFileSync(f[0], 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
    const pk = (k, a, b) => rows.filter((r) => r.t >= a && r.t <= b).reduce((m, r) => Math.max(m, r[k]), 0);
    res['vs' + vs] = { rows: rows.length, rssMax: pk('rss', 0, 1e9), heapMax: pk('heap', 0, 1e9), rss6: pk('rss', 330000, 390000), heap6: pk('heap', 330000, 390000),
      rssLate: pk('rss', 360000, 1e9), heapLate: pk('heap', 360000, 1e9), rssBoot: pk('rss', 0, 120000), heapBoot: pk('heap', 0, 120000), series: rows.map((r) => [r.t, r.rss, r.heap]) };
    say(`  메모리 vs${vs}: 표본 ${rows.length} · rss 최대 ${res['vs' + vs].rssMax} MB · 힙 최대 ${res['vs' + vs].heapMax} MB · 부팅 2분 rss ${res['vs' + vs].rssBoot} · 힙 ${res['vs' + vs].heapBoot} · 6분(5.5 ~ 6.5) rss ${res['vs' + vs].rss6} · 힙 ${res['vs' + vs].heap6} · 6분 뒤 봉우리 rss ${res['vs' + vs].rssLate} · 힙 ${res['vs' + vs].heapLate}`);
  }
  fs.writeFileSync(path.join(OUT, 'mem.json'), JSON.stringify({ at: new Date().toISOString(), body: BODY, res }, null, 1));
}

(async () => {
  if (MEM) { fs.writeFileSync(path.join(OUT, 'mem-log.txt'), ''); say(`=== T1453 존 메모리(뜬 뒤 ${MEM_MIN}분 · T1445 계측기 · 읽기만) — 몸 청크 ${BODY} ===`); await memRuns(); killAll(); say('끝'); process.exit(0); }
  fs.writeFileSync(path.join(OUT, 'repro-log.txt'), '');
  say(`=== T1453 재현 틀 — 존 DB 길 ${SEED_FROM ? '라이브 사본 ' + path.basename(SEED_FROM) : SY.synthRoads({}).flat.length / 3 + '칸'} · 마을 켬 · 몸 청크 ${BODY} · 걷는 줄 (${WALK.x0} → ${WALK.x1}, ${WALK.y}) 청크 ${WALK_CH} · 팔 ${ARMS.map((a) => a.tag).join('·')} · ${BROWSERS.join('·')} · 화면 ${VIEW.width}×${VIEW.height} ×2 ===`);
  const PW = require('playwright');
  const rows = [];
  let curVs = null, Z = null;   // ★[T1493] 띄운 존의 팔 열쇠(vs · rb)
  for (const arm of ARMS) {
    if (armKey(arm) !== curVs) { Z = await bootWorld(arm.vs, { NODE_OPTIONS: `--require ${METER}`, T1453_METER_OUT: path.join(OUT, `meter-${armKey(arm)}.json`), ...armEnv(arm) }); curVs = armKey(arm);
      say(`  존 ${armKey(arm)} 기동 · ` + ((Z.log().match(/답압 길 준비[^\n]*/) || [''])[0]) + ' · ' + ((Z.log().match(/\[T1448\] 칸 행[^\n]*/) || [''])[0])); }
    for (const bn of BROWSERS) {
      const tag = `${bn}-${arm.tag}`;
      let r = null;
      try { r = await runArm(PW, bn, arm, Z); } catch (e) { r = { err: String(e && e.stack || e) }; }
      await sleep(6000);   // 미터가 마지막 판을 적을 틈
      if (r && r.t) r.meter = meterSlice(path.join(OUT, `meter-${armKey(arm)}.json`), r.t.arm0, r.t.w1 + 2000);
      rows.push({ tag, bn, ...arm, ...r });
      fs.writeFileSync(path.join(OUT, 'repro.json'), JSON.stringify({ at: new Date().toISOString(), walk: WALK, view: VIEW, body: BODY, rows }, null, 1));
      if (r.err) { say(`  ✗ ${tag}: ${r.err}`); continue; }
      const T = r.walk.table || {};
      say(`  ${tag}: welcome ${(r.welcomeBytes / 1e6).toFixed(2)} MB(길 ${r.st0.roads} · 건물 ${r.st0.blds}) · 접속→첫 그림 ${r.load && r.load.at ? (r.load.at.frame1 - r.load.at.click).toFixed(0) : '-'} ms · `
        + `6초 핑 1초 넘김 ${r.ping.over1s}/${r.ping.n}(최대 ${r.ping.max}) · 걷기 ${r.walk.sec}초 ${r.walk.chunks}청크(민 ${r.walk.nudges} · 죽음 ${r.walk.crashes} · 조각 ${r.walk.segs}) · 프레임 ${T.frames} p50 ${T.p50} · >50 ${T.long50} · JS>50 ${T.js50} · JS 최대 ${T.jsMax} · `
        + `청크마다 ${r.walk.perChunkKb} kB · 주인 ${(T.rank || []).slice(0, 4).map((x) => `${x.who} ${x.n}판 ${x.ms}ms`).join(' / ')}`);
    }
  }
  killAll();
  say('끝');
  process.exit(0);
})().catch((e) => { say('실패: ' + (e && e.stack)); killAll(); process.exit(1); });
