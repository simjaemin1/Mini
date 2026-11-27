#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1494 그림 · 브라우저 판 · 제품 무변 · central + 존을 띄우고 진짜 클라 셋이 논다)
// === scripts/t1494-shots.js — 원한이 보이는 화면 다섯 장(마을 창 촌장 · 묻는 줄 · 휴대폰 폭 구경꾼 · 내 창 · 떠났다는 소문) + 브라우저 판(크롬 · WebKit = Safari 엔진) ==========
//   클라 셋(손님 · 진짜 클라 · 진짜 손):
//     촌장 P1(1440×1080) — A 를 사람이 세운 마을로(`__e2e_chief` — 판 꾸밈) · `/가입` · A 마을 창 구성원 판 → 「토벌」 → 묻는 줄 → 「보냄」(단추가 보내는 그 줄)
//     구경꾼 P2(390×844 — 휴대폰 폭) — B 마을 창 구성원 판(이름 · 단계 말만 · 수 · 단추 0)
//     해치는 사람 P3(1440×1080) — B 땅의 것을 B 사람 앞에서 거둔다 → `/가입`(거절) → 마을 판(내 창 — 나를 미워하는 마을) → A 땅 바로 밖 임시 사유지 → B 에서 소문을 기다린다
//   자리 찾기 · 막힌 칸은 판 꾸밈(ws 손 X — `__e2e_t1494`). 판 하루 5초(떠났다는 소문 → 하루 뒤 쳤다는 소문 사이에 찍을 틈).
//   WebKit 판(WebKitGTK MiniBrowser — WebKitWebDriver 세션이 하나뿐)은 사람을 차례로 띄운다(해치는 사람 → 구경꾼 → 촌장) · 소문 그림(⑤)은 크롬 판만 · 휴대폰 폭은 창 최소 폭 447px.
//   쓰는 법: node scripts/t1494-shots.js --out-dir <그림 폴더> --json <결과> [--browser chromium|webkit]
'use strict';
if (require.main === module) require('./lib-port').hold(3010, 3020);   // [T1288] 제품 고정 포트(로비가 존을 그 포트로 찾는다)
const path = require('path'), fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const A_ = process.argv.slice(2), val = (f, d) => { const i = A_.indexOf(f); return i >= 0 ? A_[i + 1] : d; };
const OUTD = val('--out-dir', '/tmp/t1494-shots'), JSONF = val('--json', null), BR = val('--browser', 'chromium'), PFX = BR === 'webkit' ? 'webkit_' : '';
fs.mkdirSync(OUTD, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CPORT = 3010, ZPORT = 3020, TMPD = process.env.TMPDIR || '/tmp';
const CDB = path.join(TMPD, `t1494sh-c-${process.pid}.db`), ZDB = path.join(TMPD, `t1494sh-z-${process.pid}.db`);
const procs = [];
const rec = { browser: BR, shots: [], checks: {}, notes: {}, err: null };
const save = () => { if (JSONF) try { fs.writeFileSync(JSONF, JSON.stringify(rec, null, 1)); } catch (e) {} };
function boot(cmd, args, env) {
  const isNode = cmd === 'central.js' || cmd === 'zone.js';
  const p = spawn(isNode ? process.execPath : cmd, isNode ? [path.join(ROOT, 'server', cmd)] : (args || []), { cwd: ROOT, env: Object.assign({}, process.env, env || {}), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p;
}
function cleanup() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } for (const f of [CDB, ZDB]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } }
process.on('exit', cleanup);
async function jget(u) { try { const r = await fetch(u, { signal: AbortSignal.timeout(5000) }); return r.ok ? await r.json() : null; } catch (e) { return null; } }
async function until(fn, ms, step) { const t = Date.now(); for (;;) { const r = await fn(); if (r) return r; if (Date.now() - t > ms) return null; await sleep(step || 500); } }
//   ws 손 X — 자리 찾기 · 판 꾸밈 답을 받는다
function wsHand(name) {
  const WebSocket = require('ws');
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${ZPORT}/?${new URLSearchParams({ username: name, password: 'pw-t1494', name, color: '#7a8a9a' })}`);
    const X = { ws, wait: [] };
    ws.on('message', (raw) => { let m = null; try { m = JSON.parse(String(raw)); } catch (e) { return; } if (m.type === 'welcome') resolve(X); if (m.type === '__e2e_t1494') { const i = X.wait.findIndex((w) => w.op === m.op); if (i >= 0) X.wait.splice(i, 1)[0].res(m); } });
    ws.on('error', reject);
    setInterval(() => { try { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping' })); } catch (e) {} }, 2000);
  });
}
const ask = (X, op, o) => new Promise((res) => { const w = { op, res }; X.wait.push(w); X.ws.send(JSON.stringify(Object.assign({ type: '__e2e_t1494', op }, o || {}))); setTimeout(() => { const i = X.wait.indexOf(w); if (i >= 0) { X.wait.splice(i, 1); res(null); } }, 8000); });
const J = (o) => JSON.stringify(o);
async function enter(pg) {
  await pg.goto(`http://localhost:${CPORT}/`);
  await until(() => pg.ev(`(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); })()`), 60000, 700);
  await pg.ev(`(() => { document.getElementById('enter').click(); return true; })()`);
  await until(() => pg.ev(`!!(window.__getMyAbs && window.__getMyAbs())`), 60000, 700);
  await sleep(1500);
}
const send = (pg, m) => pg.ev(`(() => { window.__sendPrimary(${J(m)}); return true; })()`);
const notes = (pg) => pg.ev(`(window.__notices || []).slice()`);
const shot = async (pg, name, what) => { const f = path.join(OUTD, PFX + name); await pg.shot(f); rec.shots.push({ file: f, what }); save(); return f; };

(async () => {
  try {
    const FB = require('./fixture-boot');
    const cen = boot('central.js', null, { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
    const zon = boot('zone.js', null, { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`, ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
      VILLAGE_MAX: '3', VILLAGE_DAY_MS: '5000', VILLAGE_VIEW_MS: '1000', E2E_GIVE: '1', T1447_PERSON_GRUDGE: '1' });
    const a = await FB.waitUp(cen, /central server up on/, { name: 'central' }), b = await FB.waitUp(zon, /zone server up on/, { name: 'zone', capMs: 300000 });
    if (!a.ok || !b.ok) throw new Error('기동 실패');
    let info = null;
    for (let i = 0; i < 120 && !info; i++) { const j = await jget(`http://localhost:${ZPORT}/startinfo`); if (j && j.ok && j.villages && j.villages.length >= 2) info = j; else await sleep(2000); }
    const V = info.villages.map((v) => ({ vid: v.vid, name: v.name, x: v.cx * 32 + 16, y: v.cy * 32 + 16 }));
    const X = await wsHand('tx' + require('crypto').randomBytes(2).toString('hex'));
    let A = null, B = null;
    for (const x of V) { for (const y of V) { if (x === y) continue; const d = await ask(X, 'delay', { a: x.vid, b: y.vid }); if (d && Number.isFinite(d.delay) && d.delay > 0) { A = x; B = y; break; } } if (A) break; }
    rec.pick = { A: A.name, B: B.name };
    const D = await require('./browser-driver').open(BR, (cmd, args, env) => boot(cmd, args, env));
    rec.version = D.version;
    //   WebKitWebDriver(WebKitGTK)는 세션 하나뿐 — 그 판은 사람을 차례로 띄운다(해치는 사람 → 구경꾼 → 촌장 · 소문 그림은 크롬 판만)
    const SEQ = BR === 'webkit' && !!(Object.getOwnPropertyDescriptor(D, 'version') || {}).get;   // WebKitGTK 길 — 판 이름(version)이 세션이 선 뒤에 차는 게터
    rec.seq = SEQ;
    const open = async (W, H) => { const p = await D.page(W, H); await enter(p); return p; };
    let P1 = null, P2 = null, P3 = null;
    const chiefSetup = async (P) => { await send(P, { type: 'teleport_debug', x: A.x, y: A.y }); await sleep(800); await send(P, { type: '__e2e_chief', vid: A.vid }); await sleep(600); await send(P, { type: 'chat', text: '/가입' }); await sleep(1500); };
    const phone = async (P) => {
      await send(P, { type: 'teleport_debug', x: B.x, y: B.y }); await sleep(1500);
      await P.ev(`(() => { openVillageView(${B.vid}); return true; })()`);
      await until(() => P.ev(`!!document.querySelector('.vv-tab[data-k="mem"]')`), 30000, 700);   // 상자가 바쁘면 판이 늦게 선다 — 판이 선 뒤에 누른다
      await P.ev(`(() => { const t = document.querySelector('.vv-tab[data-k="mem"]'); if (t) t.click(); return true; })()`);
      await until(() => P.ev(`!!document.getElementById('vvGrudge')`), 20000, 700); await sleep(1000);
      rec.checks.phone = await P.ev(`(() => { const g = document.getElementById('vvGrudge'); if (g) g.scrollIntoView({ block: 'start' }); const rows = [...document.querySelectorAll('#vvGrudge .vv-grudge')].length; return { plate: !!g, rows, raidBtn: !!document.querySelector('[data-vv="raid"]'), wide: document.documentElement.scrollWidth, vw: innerWidth }; })()`);
      await sleep(800); rec.checks.phoneFit = await P.ev(`(() => { const g = document.getElementById('vvGrudge'); if (g) g.scrollIntoView({ block: 'start' }); const p = document.getElementById('vvPane'); const over = []; if (g) { const R = g.getBoundingClientRect(); for (const e of g.querySelectorAll('*')) { const r = e.getBoundingClientRect(); if (r.width > 0 && r.right > R.right + 0.5) over.push({ tag: e.tagName, cls: String(e.className || '').slice(0, 40), w: Math.round(r.width), out: Math.round(r.right - R.right), t: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30) }); } over.sort((x, y) => y.out - x.out); } return { sw: p ? p.scrollWidth : null, cw: p ? p.clientWidth : null, gw: g ? g.scrollWidth : null, gc: g ? g.clientWidth : null, over: over.slice(0, 6) }; })()`); await sleep(500);   // 판 밖으로 나간 것(오른쪽) — 무엇인지
      await shot(P, '3_휴대폰폭_구경꾼_마을창.png', '구경꾼(휴대폰 폭 390) — B 마을 창 원한 품은 사람(단계 말만 · 수 · 단추 0)');
    };
    if (!SEQ) { P1 = await open(1440, 1080); await chiefSetup(P1); }
    // ── 해치는 사람 P3 — B 사람 앞에서 거둔다 ──
    P3 = await open(1440, 1080); rec.version = D.version;
    await send(P3, { type: 'teleport_debug', x: B.x, y: B.y }); await sleep(1200);
    await send(P3, { type: '__e2e_give', tools: ['pickaxe', 'axe'] }); await sleep(300);   // 판 꾸밈 — 바위 · 나무를 캘 연장
    let shut = false, tries = 0;
    for (let k = 0; k < 40 && !shut; k++) {
      X.ws.send(JSON.stringify({ type: 'teleport_debug', x: B.x, y: B.y })); await sleep(300);
      const sp = await ask(X, 'spot', { vid: B.vid, kind: 'any' }); if (!sp || !sp.tree) { await sleep(1200); continue; }
      await send(P3, { type: 'teleport_debug', x: sp.tree.x + 18, y: sp.tree.y }); await sleep(700);
      if (sp.tree.type === 'rock' || sp.tree.type === 'tree') { await send(P3, { type: 'equip', tool: sp.tree.type === 'rock' ? 'pickaxe' : 'axe' }); await sleep(200); }
      for (let i = 0; i < 8 && !shut; i++) { await send(P3, { type: 'gather', resId: sp.tree.id }); tries++; await sleep(700); const N = await notes(P3); shut = N.some((t) => /거래하지 않고 받아들이지도 않습니다/.test(t)); if (N.slice(-1)[0] && /아무것도 없습니다|너무 멉니다/.test(N.slice(-1)[0])) break; }
    }
    rec.checks.heap = { shut, tries };
    await send(P3, { type: 'teleport_debug', x: B.x, y: B.y }); await sleep(900);
    //   판을 먼저 열고 · 판 날이 막 바뀐 뒤 `/가입` — 거절 줄이 온 그날의 내 창을 찍는다(그날 겪은 일은 그날만 지킨다 · 날이 넘어가면 그 땅에 선 앎(here)이 덮는다 — 판 하루 5초)
    await P3.ev(`(() => { openSide('tribe'); return true; })()`); await sleep(1200);
    const dayNow = async () => { const st = await ask(X, 'state', {}); return st ? st.day : null; };
    const d0 = await dayNow(); await until(async () => { const d = await dayNow(); return d != null && d !== d0; }, 7000, 150);
    await send(P3, { type: 'chat', text: '/가입' });
    rec.checks.joinRow = !!(await until(() => P3.ev(`[...document.querySelectorAll('.grudge-me')].some((e) => /가입을 거절당했습니다/.test(e.textContent))`), 4000, 100));
    await sleep(800);   // 판이 화면에 다시 그려진 뒤(WebKitGTK 는 다시 그리기 전 화면을 찍는다)
    const meRows = () => P3.ev(`(() => { const s = document.getElementById('grudgeMe'); const rows = [...document.querySelectorAll('.grudge-me')].map((e) => e.textContent.replace(/\\s+/g, ' ').trim()); return { sec: !!s, rows }; })()`);
    rec.checks.me = await meRows();
    await shot(P3, '4_내창_나를미워하는마을.png', '해치는 사람의 마을 판 — 나를 미워하는 마을(원수 · 가입을 거절당했습니다 · 푸는 길)');
    rec.checks.meAfterShot = await meRows();
    if (!SEQ) { P2 = await open(390, 844); await phone(P2); }
    // ── 땅 — P3 가 A 땅 바로 밖에 임시 사유지 → 막힌 칸(판 꾸밈) → B 로 ──
    X.ws.send(JSON.stringify({ type: 'teleport_debug', x: A.x, y: A.y })); await sleep(800);
    const spA = await ask(X, 'spot', { vid: A.vid });
    await send(P3, { type: '__e2e_give', items: { wood: 20, stone: 20 } }); await sleep(400);
    await send(P3, { type: 'teleport_debug', x: spA.border.x, y: spA.border.y }); await sleep(1000);
    await send(P3, { type: 'claim', kind: 'temporary' }); await sleep(1500);
    await send(P3, { type: '__e2e_t1494', op: 'block', vid: A.vid, n: 30 }); await sleep(800);
    await send(P3, { type: 'teleport_debug', x: B.x, y: B.y }); await sleep(1500);
    if (SEQ) { rec.notes.P3 = (await notes(P3)).slice(-12); await P3.close(); P3 = null; P2 = await open(390, 844); await phone(P2); await P2.close(); P2 = null; P1 = await open(1440, 1080); await chiefSetup(P1); }
    // ── 촌장 P1 — A 마을 창 구성원 판 → 「토벌」 → 묻는 줄 → 「보냄」 ──
    await P1.ev(`(() => { openVillageView(${A.vid}); return true; })()`);
    await until(() => P1.ev(`!!document.querySelector('.vv-tab[data-k="mem"]')`), 30000, 700);
    await P1.ev(`(() => { const t = document.querySelector('.vv-tab[data-k="mem"]'); if (t) t.click(); return true; })()`);
    const btn = await until(() => P1.ev(`(() => { const b = document.querySelector('#vvGrudge [data-vv="raid"]'); if (b) { document.getElementById('vvGrudge').scrollIntoView({ block: 'start' }); return true; } return false; })()`), 20000, 1000);
    rec.checks.chief = { btn: !!btn, row: await P1.ev(`(() => { const r = document.querySelector('#vvGrudge .vv-grudge'); return r ? [...r.querySelectorAll('.vv-t')].map((e) => (e.getAttribute('aria-label') || e.textContent).trim()).join(' ').slice(0, 300) : null; })()`) };
    await sleep(800);
    await shot(P1, '1_촌장_마을창_토벌단추.png', '촌장 — A 마을 창 원한 품은 사람(단계 · 까닭 · 막힌 칸 n/문턱 · 「토벌」 켜짐)');
    await P1.ev(`(() => { const b = document.querySelector('#vvGrudge [data-vv="raid"]'); if (b) b.click(); return true; })()`); await sleep(1500);
    rec.checks.ask = await P1.ev(`(() => { const a = document.getElementById('vvRaidAsk'); if (a) a.scrollIntoView({ block: 'center' }); return { ask: !!a, go: !!document.getElementById('vvRaidGo'), no: !!document.getElementById('vvRaidNo') }; })()`);
    await sleep(600);
    await shot(P1, '2_촌장_토벌_묻는줄.png', '촌장이 「토벌」을 누른 뒤 — 무엇이 일어나는지 한 줄 묻기(보냄 · 그만둠)');
    //   P3 — 떠났다는 소문이 닿는 순간: 판을 먼저 열어 두고 「보냄」 바로 뒤부터 그 줄을 기다려 오는 즉시 찍는다
    //     (소문은 떠난 날 + 도달 날의 날이 바뀌는 순간 닿는다 — 0 ~ 하루 · 알림 판의 줄은 몇 초 뒤 사라지고, 하루 뒤엔 "쳤다는 소문"이 닿아 내 창의 A 가 지워진다)
    const meNow = () => P3.ev(`[...document.querySelectorAll('.grudge-me')].map((e) => e.textContent.replace(/\\s+/g, ' ').trim())`);
    if (!SEQ) await P3.ev(`(() => { openSide('tribe'); return true; })()`);
    const early = !SEQ && (await notes(P3)).some((t) => /떠났다는 소문이 들립니다/.test(t));
    await P1.ev(`(() => { const b = document.getElementById('vvRaidGo'); if (b) b.click(); return true; })()`);
    if (!SEQ) {   // ── P3 — 떠났다는 소문이 닿는 순간 ──
      let rum = null;
      for (let i = 0; i < 900 && !rum; i++) { const N = await notes(P3); rum = N.find((t) => /떠났다는 소문이 들립니다/.test(t)) || null; if (!rum) await sleep(100); }
      await sleep(150);
      rec.checks.rumor = { line: rum, early, me: await meNow() };
      await shot(P3, '5_떠났다는소문_한줄.png', '해치는 사람 — 토벌대가 떠났다는 소문이 닿은 순간의 한 줄 · 내 창에 A(소문으로 들었습니다)');
      rec.checks.rumor.meAfterShot = await meNow(); rec.checks.rumor.lastNotes = (await notes(P3)).slice(-3);
      rec.notes.P3 = (await notes(P3)).slice(-12);
    }
    await sleep(1500);
    rec.checks.sent = { notes: (await notes(P1)).slice(-3) };
    rec.notes.P1 = (await notes(P1)).slice(-8);
    rec.checks.emoji = await P1.ev(`(() => { const g = document.getElementById('vvGrudge'); return g ? /[\\u{1F300}-\\u{1FAFF}\\u2600-\\u27BF]/u.test(g.textContent) : null; })()`);
    for (const p of [P1, P2, P3]) { if (p) { try { await p.close(); } catch (e) {} } }
    try { await D.close(); } catch (e) {}
  } catch (e) { rec.err = String(e && e.stack || e).slice(0, 900); }
  save();
  console.log(`[t1494 그림 ${BR}] ${rec.err ? '✗ ' + rec.err.slice(0, 200) : '○'} · ${J(rec.checks).slice(0, 600)}`);
  cleanup(); process.exit(rec.err ? 1 : 0);
})();
