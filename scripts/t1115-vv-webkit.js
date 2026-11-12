#!/usr/bin/env node
// === scripts/t1115-vv-webkit.js — 마을 화면 · WebKit 실기 + 열기 비용 자 (T1115) ======================================
//
// ⚠계측기다(러너 밖 · `@regress` 없음). 제품 무변 — 레포 서버 · 클라를 그대로 띄운다(e2e-village-view 와 같은 기동 · 서버 자료).
// 브라우저 둘을 **같은 쪽 안 측정 함수**(`PAGE_PROBE` — 문자열 하나를 두 브라우저에 그대로 넣는다)로 잰다:
//   · chromium — Playwright(이 상자 정본)
//   · webkit   — Playwright WebKit 이 있으면 그것, 없으면 **WebKitGTK MiniBrowser + WebKitWebDriver**(W3C WebDriver · Safari 와 같은 WebKit 엔진 · GTK 포트)
//     WebKitGTK 길: `apt-get install webkit2gtk-driver xvfb` · `Xvfb :99` · `DISPLAY=:99 WebKitWebDriver --port=4444` 를 이 자가 띄운다.
// 화면 크기 둘(1440×900 · 1280×720) × 탭 넷 사진 + 값:
//   · 판 열 때 — Shift+G 가 부르는 함수(`openVillageView`)부터 서버 자료가 와 다 그린 뒤 첫 프레임까지(ms) · 그중 입히기(`vvSkinMs`) · 입히기 갈래별(판 글자 · 막대 · 선 · 테두리 · 버튼 · 판)
//   · 닫았다 다시 열 때(같은 마을 — 서버가 통째를 다시 보낸다) · 탭 처음 볼 때 · 다시 볼 때
//   · 열린 동안 — 3초 rAF 간격 p50 · p95 · max ↔ 같은 자리 닫힘
//   · 판 글자 대비 — 사진에서 판 중앙 밝기 ↔ 글자 밝은 끝(99.5%) WCAG 비(T1083 과 같은 잼)
// 실행: node scripts/t1115-vv-webkit.js [--browser chromium|webkit] [--out <dir>] [--sizes 1440x900,1280x720]
//   사진 → <out>/<browser>-<W>x<H>-<tab>.png · 값 → <out>/<browser>-values.json(기본 out = /tmp/t1115)
'use strict';
if (require.main === module) require('./lib-port').hold(3010, 3020);   // [T1288] 제품 고정 포트(존 설정 · central 기본) — 띄우는 동안 이 기계에서 혼자 쥔다(나란히 돌면 줄 선다 · `lib-port.hold`)
const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const BR = arg('--browser', 'chromium'), OUT = arg('--out', '/tmp/t1115');
const SIZES = arg('--sizes', '1440x900,1280x720').split(',').map((s) => s.split('x').map(Number));
fs.mkdirSync(OUT, { recursive: true });
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/t1115-c-${process.pid}.db`, ZDB = `/tmp/t1115-z-${process.pid}.db`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(cmd, args, env, quiet) { const p = spawn(cmd, args, { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] }); if (quiet !== false) { p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); } procs.push(p); return p; }
const shutdown = () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } };
process.on('exit', shutdown);
const q = (a, f) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(f * s.length))].toFixed(2) : null; };

// ── 쪽 안 측정 함수(두 브라우저가 같은 글자를 받는다) ────────────────────────────────────────────
//   입히기 갈래별 시간 — `Oseok` 의 문(글자 · 막대 · 선 · 테두리 · 버튼 · 판)을 감싸 누계를 잰다(제품 함수는 그대로 부른다)
//   자료 받기(`villageViewOnMessage` — 30-n-net 이 이름으로 부른다)도 감싸 받은 때 · 받아 그린 몫을 잰다
const PAGE_WRAP = `(() => { if (window.__osProf) return true; const P = window.__osProf = { text: 0, bar: 0, rule: 0, frame: 0, button: 0, plate: 0, n: {}, msg: 0, msgAt: 0, msgN: 0 };
  for (const k of ['text', 'bar', 'rule', 'frame', 'button', 'plate']) { const f = Oseok[k]; Oseok[k] = function () { const t0 = performance.now(); try { return f.apply(this, arguments); } finally { P[k] += performance.now() - t0; P.n[k] = (P.n[k] || 0) + 1; } }; }
  const g = window.villageViewOnMessage; window.villageViewOnMessage = function (m) { const t0 = performance.now(); if (!P.msgAt) P.msgAt = t0; try { return g(m); } finally { P.msg += performance.now() - t0; P.msgN++; } };
  return true; })()`;
const PAGE_OPEN = `(async () => {
  const P = window.__osProf; for (const k of ['text', 'bar', 'rule', 'frame', 'button', 'plate']) P[k] = 0; P.n = {}; P.msg = 0; P.msgAt = 0; P.msgN = 0;
  const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const t0 = performance.now();
  openVillageView(window.__evNearVid);
  const tOpen = performance.now() - t0;
  //   서버 통째가 와서 받아 그릴 때까지(다시 열기는 앞 자료가 남아 있다 — 받은 통의 수로 기다린다)
  for (let i = 0; i < 3000 && !P.msgN; i++) await new Promise((r) => setTimeout(r, 2));
  await raf2();
  const prof = {}; for (const k of ['text', 'bar', 'rule', 'frame', 'button', 'plate']) prof[k] = +P[k].toFixed(1);
  // 버튼은 안에서 테두리 · 글자를 부른다 — 갈래 합에서 겹치지 않게 버튼 몫은 따로 본다
  return { total: +(performance.now() - t0).toFixed(1), openCall: +tOpen.toFixed(1), wait: +(P.msgAt - t0).toFixed(1), render: +P.msg.toFixed(1), skin: +vvSkinMs.toFixed(1), prof, n: P.n, texts: document.querySelectorAll('#vvPane .vv-t').length };
})()`;
const PAGE_TAB = (k) => `(async () => { const P = window.__osProf; for (const x of ['text', 'bar', 'rule', 'frame', 'button', 'plate']) P[x] = 0;
  const t0 = performance.now(); document.querySelector('.vv-tab[data-k="${k}"]').click();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return { tab: '${k}', total: +(performance.now() - t0).toFixed(1), skin: +vvSkinMs.toFixed(1), text: +P.text.toFixed(1) }; })()`;
const PAGE_RAF = `new Promise((res) => { const d = []; let last = performance.now(); const t0 = last; const f = (t) => { d.push(t - last); last = t; if (t - t0 < 3000) requestAnimationFrame(f); else res(d); }; requestAnimationFrame(f); })`;
const PAGE_ERRS = `(() => { if (!window.__t1115Err) { window.__t1115Err = []; window.addEventListener('error', (e) => window.__t1115Err.push(String(e.message).slice(0, 160))); } return window.__t1115Err.slice(); })()`;
// 사진 대비 — 판(`.vv-plate`) 가운데 띠의 밝기 가운데값 ↔ 판 글자 캔버스 자리의 밝은 끝(99.5%) · WCAG 상대 휘도 비
const PAGE_RECTS = `(() => { const pr = (e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; };
  const plates = [...document.querySelectorAll('#vvBody .vv-plate')].filter((e) => e.offsetParent !== null).map(pr);
  const texts = [...document.querySelectorAll('#vvBody .vv-t canvas')].filter((e) => e.offsetParent !== null).map(pr);
  return { plates, texts, dpr: devicePixelRatio }; })()`;

// ── 두 브라우저 손잡이 · 사진 대비 — `scripts/browser-driver.js`(★[T1124] 떼어 냄 · 사본 0) ─────────────────────
const BD = require('./browser-driver');
const contrastOf = BD.contrastOf;

(async () => {
  const c = boot(process.execPath, [path.join(ROOT, 'server', 'central.js')], { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = FB.waitUp(c, /central server up on/, { name: 'central' });
  const z = boot(process.execPath, [path.join(ROOT, 'server', 'zone.js')], { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`, VILLAGE_MAX: '2', VILLAGE_DAY_MS: '500', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', E2E_GIVE: '1' });
  const zu = FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 });
  if (!(await cu).ok || !(await zu).ok) { console.log('기동 실패'); process.exit(1); }
  const { DatabaseSync } = require('node:sqlite');
  let rows = []; for (let i = 0; i < 60 && !rows.length; i++) { try { rows = new DatabaseSync(ZDB).prepare('SELECT id, cx, cy FROM villages WHERE zone = ?').all('hanbando'); } catch (e) {} if (!rows.length) await sleep(1000); }
  const V = rows[0];
  let D;
  D = await BD.open(BR, boot);
  const out = { browser: BR, driver: null, version: null, sizes: [] };
  for (const [W, H] of SIZES) {
    const pg = await D.page(W, H);
    out.version = D.version; out.driver = D.name === 'webkit' && !D.version.startsWith('WebKitGTK') ? 'playwright' : (BR === 'webkit' ? 'WebKitGTK MiniBrowser + WebKitWebDriver' : 'playwright');
    await pg.goto(`http://localhost:${CPORT}/?T1070_VILLAGE_VIEW=1`);
    await pg.ev(PAGE_ERRS);
    for (let i = 0; i < 120 && !(await pg.ev(`(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); })()`)); i++) await sleep(500);
    await pg.ev(`(() => { document.getElementById('enter').click(); return 1; })()`);
    for (let i = 0; i < 120 && !(await pg.ev('!!(window.__getMyAbs && window.__getMyAbs())')); i++) await sleep(500);
    let near = null;
    for (let t = 0; t < 30 && near !== V.id; t++) { await pg.ev(`(() => { window.__sendPrimary({ type: 'teleport_debug', x: ${V.cx * 32 + 16}, y: ${V.cy * 32 + 16} }); return 1; })()`); await sleep(1200); near = await pg.ev('window.__evNearVid'); }
    await pg.ev(`(() => { window.__sendPrimary({ type: '__e2e_day_freeze', on: true }); window.__sendPrimary({ type: '__e2e_give', items: { wood: 6, stone: 4 } }); return 1; })()`);
    await pg.ev('(typeof Oseok !== "undefined" ? Oseok.ready().then(() => 1) : 0)');
    await sleep(1500);
    await pg.ev(PAGE_WRAP);
    const closed = await pg.ev(PAGE_RAF);
    await pg.ev(`(() => { vvNum = 'wood'; return 1; })()`);   // 시세 기준 = 나무(열 때 그 기준으로 요청 — 창고 사진에 시세가 서게)
    const open1 = await pg.ev(PAGE_OPEN);
    await sleep(800);
    const tabs = [];
    for (const k of ['dash', 'proj', 'mem', 'store']) { tabs.push(await pg.ev(PAGE_TAB(k))); await sleep(500); }
    const tabs2 = [];
    for (const k of ['dash', 'proj', 'mem', 'store']) tabs2.push(await pg.ev(PAGE_TAB(k)));
    // 사진 · 대비(탭마다) — 지어 둔 판을 보이고 찍는다
    const shots = [];
    for (const k of ['dash', 'proj', 'mem', 'store']) {
      await pg.ev(PAGE_TAB(k)); await sleep(400);
      const f = path.join(OUT, `${BR}-${W}x${H}-${k}.png`); await pg.shot(f);
      shots.push({ tab: k, contrast: contrastOf(f, await pg.ev(PAGE_RECTS)) });
    }
    await pg.ev(PAGE_TAB('dash'));
    await sleep(300);
    const opened = await pg.ev(PAGE_RAF);
    await pg.ev('(() => { closeVillageView(); return 1; })()');
    await sleep(600);
    const open2 = await pg.ev(PAGE_OPEN);   // 닫았다 다시 열기(같은 마을 · 서버 통째 다시)
    await pg.ev('(() => { closeVillageView(); return 1; })()');
    const errs = await pg.ev(PAGE_ERRS);
    const S = (d) => ({ n: d.length, p50: q(d, 0.5), p95: q(d, 0.95), max: +Math.max(...d).toFixed(2) });
    const row = { W, H, near: near === V.id, open: open1, reopen: open2, tabs, tabs2, shots, rafOpen: S(opened), rafClosed: S(closed), pageErrors: errs };
    out.sizes.push(row);
    console.log(`${BR}(${out.version}) ${W}x${H} · 열기 ${open1.total}ms(부름 ${open1.openCall} · 서버 기다림 ${open1.wait} · 받아 그림 ${open1.render} · 입히기 ${open1.skin} · 글자 ${open1.prof.text} · 버튼 ${open1.prof.button} · 막대 ${open1.prof.bar} · 선 ${open1.prof.rule} · 테두리 ${open1.prof.frame}) · 다시 열기 ${open2.total}ms(서버 기다림 ${open2.wait} · 받아 그림 ${open2.render} · 글자 ${open2.prof.text}) · 탭 ${tabs.map((t) => `${t.tab} ${t.total}/${t.skin}`).join(' · ')} · 둘째 ${tabs2.map((t) => `${t.tab} ${t.total}/${t.skin}`).join(' · ')} · 대비 ${shots.map((s) => s.contrast).join('/')} · rAF 열림 ${S(opened).p50}/${S(opened).p95}/${S(opened).max} ↔ 닫힘 ${S(closed).p50}/${S(closed).p95}/${S(closed).max} · 오류 ${errs.length}`);
    await pg.close();
  }
  fs.writeFileSync(path.join(OUT, `${BR}-values.json`), JSON.stringify(out, null, 1));
  await D.close(); shutdown(); process.exit(0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
