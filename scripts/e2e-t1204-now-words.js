#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/e2e-t1204-now-words.js — T1204 「지금 할 일」 칸이 화살 대신 글로 방위 · 걸음 — 실서버 · 실클라 [★재민 11-07 문 29 ⓑ] ===
//
// ★재는 것(새 게스트 둘 — 나루터로 도착하는 마을 하나 · 길로 도착하는 마을 하나 · 손잡이 `T1204_NOW_WORDS` 켬 기본):
//   ① welcome `uiCfg.nowWords`(셀 px · 문턱) · 방위말 정본(`DirWord` — `public/dir-word.js`)이 페이지에 실렸다
//   ② 도착 — 칸 글 "○○ 마을은 <방위>으로 <n>걸음입니다." 가 **따로 센** 방위 · 걸음과 맞는다
//      (목표 = 서버 /startinfo 의 마을 칸 · 내 자리 = 서버 권위 좌표 · 방위 = 서버가 쓰는 그 정본 낱말 · 걸음 = 셀 거리)
//   ③ 쉼터 — 서버가 실은 쉼터 자리(온보딩 상태 `shelter`)가 존 DB 의 쉼터 행(문 앞 설 자리)과 같고,
//      빈 판 인사의 칸 글 "쉼터는 <방위>으로 <n>걸음입니다." 가 따로 센 방위 · 걸음과 맞는다
//      (그 마을 첫 인사가 의뢰면 같은 인사 한 통을 빈 판으로 바꿔 제품 고르기 함수에 넣는다 — 입력 나머지는 진짜 그대로)
//   ④ 화살 그림 0 — 칸 안 화살 칸이 비어 있고 숨김 · 칸 어디에도 화살 아이콘 없음 · 화면 글 = 훅 글 · "화살표" 글자 0
//   ⑤ 마을 게이트 안 — 인사 한 통이 오면 칸이 넘어가고 화살은 여전히 0
//   ⑥ 페이지 오류 0
// ★자명 통과 금지: 방위 · 걸음은 클라 함수가 아니라 서버 값(/startinfo · 존 DB · 서버 권위 좌표)과 정본 낱말로 **따로** 센다 ·
//   쉼터 행이 없으면 빨갛다(좌표를 짓지 않는다) · 두 도착 꼴(나루터 · 길)을 다 못 고르면 빨갛다.
// 실행: node scripts/e2e-t1204-now-words.js [--headed]   (E2E_BROWSER=webkit 이면 WebKit)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const DW = require('../public/dir-word.js');

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-t1204-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3011, ZPORT = 3021;
const CDB = `/tmp/e2e-t1204-central-${process.pid}.db`, ZDB = `/tmp/e2e-t1204-zone-${process.pid}.db`;
for (const f of [CDB, ZDB]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} }
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', (b) => { const s = String(b); if (/up on/.test(s)) process.stdout.write(`  [${name}] ${s.trim().slice(0, 100)}\n`); });
  p.stderr.on('data', () => {});
  procs.push(p); return p;
}
function shutdown() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', shutdown);
// 존 DB 의 쉼터 행 — 마을마다 { cx, cy } (실체 [cx-5..cx]×[cy-5..cy-2] · 설 자리 = 문 앞 ((cx-2.5)·32, (cy-0.5)·32) — `shelterOf` 의 주석 그대로)
function shelterRows() {
  const out = new Map();
  try {
    const { DatabaseSync } = require('node:sqlite');
    const d = new DatabaseSync(ZDB, { readOnly: true });
    for (const r of d.prepare("SELECT village_id v, cx, cy FROM village_buildings WHERE type = 'shelter'").all()) if (!out.has(r.v)) out.set(r.v, { cx: r.cx, cy: r.cy });
    d.close();
  } catch (e) { out.err = String(e && e.message || e); }
  return out;
}
const CELL = 32;
const exp = (me, t) => { const dx = t.x - me.x, dy = t.y - me.y; return { dir: DW.dirWord(dx, dy), steps: Math.round(Math.hypot(dx, dy) / CELL) }; };

(async () => {
  console.log('\n=== T1204 「지금 할 일」 칸 — 화살 대신 글로 방위 · 걸음 (실서버 · 실클라 · 나루터 도착 · 길 도착) ===');
  const cen = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = FB.waitUp(cen, /central server up on/, { name: 'central' });
  const zon = boot('zone', 'zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', VILLAGE_MAX: process.env.T1204_VILLAGE_MAX || '12', VILLAGE_DAY_MS: '500',
    SHELTER_BACKFILL_MS: '10000' });   // 쉼터 백필 첫 판을 앞당긴다(종전 하한 10초 → 첫 판 2.5초 뒤 · 값은 기동 문만 · 자리 정본 무변)
  const zu = FB.waitUp(zon, /zone server up on/, { name: 'zone', capMs: 300000 });
  const c0 = await cu; ok(c0.ok, 'central 기동', c0.ok ? `${c0.ms}ms` : c0.why);
  const z0 = await zu; ok(z0.ok, 'zone 기동');
  await sleep(6000);
  const browser = await require('./e2e-browser').launch({ headless: !HEADED });
  let SH = shelterRows();
  for (let i = 0; i < 40 && !SH.err && SH.size === 0; i++) { await sleep(1500); SH = shelterRows(); }   // 백필 한 판이 지날 때까지
  pre(!SH.err && SH.size > 0, '존 DB 에 쉼터 행이 있다(따로 셀 자리)', SH.err || `${SH.size}곳`);
  // 시작 화면 — 도착 꼴 둘(나루터 · 길)을 하나씩 고른다
  let info = null;
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    for (let t = 0; t < 20 && !(info && info.villages && info.villages.length && info.villages.some((v) => v.arrive)); t++) {   // 시작 화면 굽기(마을 · 도착 지점)가 끝날 때까지 다시 연다
      info = null;
      await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
      for (let i = 0; i < 40 && !info; i++) { info = await page.evaluate(() => (window.__onbInfo ? window.__onbInfo() : null)); if (!info) await sleep(700); }
      if (!(info && info.villages && info.villages.length && info.villages.some((v) => v.arrive))) await sleep(5000);
    }
    await ctx.close();
  }
  const VS = (info && info.villages) || [];
  if (process.env.T1204_DEBUG) console.log(JSON.stringify(VS.slice(0, 4)).slice(0, 900), [...SH.keys()]);
  const dock = VS.find((v) => v.arrive && v.arrive.kind === 'dock' && SH.has(v.vid));
  const road = VS.find((v) => v.arrive && v.arrive.kind !== 'dock' && SH.has(v.vid));
  pre(!!dock && !!road, '도착 꼴 둘 — 나루터 마을 하나 · 길 마을 하나(둘 다 쉼터 있음)', `${dock ? dock.name + '(나루터)' : '나루터 없음'} · ${road ? road.name + '(' + road.arrive.kind + ')' : '길 없음'}`);
  const tally = { ok: 0, n: 0, arrowsGone: 0 };
  for (const V of [dock, road].filter(Boolean)) {
    console.log(`\n── ${V.name} (${V.arrive.kind === 'dock' ? '나루터' : '길'} 도착) ──`);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e && e.message || e).slice(0, 160)));
    await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
    let inf = null;
    for (let i = 0; i < 80 && !inf; i++) { inf = await page.evaluate(() => (window.__onbInfo ? window.__onbInfo() : null)); if (!inf) await sleep(700); }
    await page.evaluate((vid) => { window.__onbPick(vid); const b = document.getElementById('enter'); if (b) b.click(); }, V.vid);
    let inWorld = false;
    for (let i = 0; i < 240 && !inWorld; i++) { inWorld = await page.evaluate(() => !!(window.__getSrvAbs && window.__getSrvAbs())); if (!inWorld) await sleep(500); }
    ok(inWorld, '존 입장(서버 권위 좌표)');
    // ① 손잡이 · 정본
    const cfg = await page.evaluate(() => ({ nw: (typeof uiCfg !== 'undefined' && uiCfg) ? uiCfg.nowWords : null, dw: typeof DirWord !== 'undefined' && typeof DirWord.dirWord === 'function' }));
    ok(cfg.nw && cfg.nw.cell === CELL && cfg.nw.near === 10 && cfg.dw, '① welcome `nowWords`(셀 32 · 문턱 10) · 방위말 정본이 페이지에 실렸다', JSON.stringify(cfg));
    const OFF = await page.evaluate(() => { const c = conns.get(primaryZoneId); return { x: (c && c.meta && c.meta.worldOffsetX) || 0, y: (c && c.meta && c.meta.worldOffsetY) || 0 }; });
    // ② 도착 — 마을 쪽
    let n1 = null;
    for (let i = 0; i < 40 && !(n1 && n1.stage && n1.where); i++) { n1 = await page.evaluate(() => (window.__t1064Next ? window.__t1064Next() : null)); if (!(n1 && n1.stage && n1.where)) await sleep(400); }
    const st = await page.evaluate(() => ({ me: { x: myAbsPredicted.x, y: myAbsPredicted.y }, srv: window.__getSrvAbs(), state: (window.__onbGet ? window.__onbGet().state : null) }));
    const home = { x: OFF.x + V.cx * CELL + 16, y: OFF.y + V.cy * CELL + 16 };   // 서버 /startinfo 마을 칸 → 절대(칸 가운데)
    const e1 = exp(st.me, home), e1s = exp(st.srv, home);
    tally.n++;
    const okArr = !!(n1 && n1.stage === 'enter' && n1.where && n1.where.dir === e1.dir && n1.where.steps === e1.steps && Math.abs(n1.where.steps - e1s.steps) <= 1
      && n1.where.text === `${V.name} 마을은 ${e1.dir}으로 ${e1.steps}걸음입니다.`);
    if (okArr) tally.ok++;
    ok(okArr, '★② 도착 — 칸 글 = 따로 센 방위 · 걸음(서버 마을 칸 · 서버 권위 좌표)', `${n1 && n1.where && n1.where.text} ↔ ${e1.dir} ${e1.steps}(서버 좌표 ${e1s.steps})`);
    // ④ 화살 그림 0 · 화면 글 = 훅 글
    const dom = await page.evaluate(() => {
      const el = document.getElementById('onbNext'), ar = document.getElementById('onbNextArrow');
      return { arHtml: ar ? ar.innerHTML : null, arHidden: ar ? ar.classList.contains('hidden') : null, icons: el ? el.querySelectorAll('[data-i="arrowR"]').length : -1,
        guide: (document.getElementById('onbNextGuide') || {}).textContent || '', text: el ? el.textContent : '' };
    });
    const noArrow = dom.arHtml === '' && dom.arHidden === true && dom.icons === 0 && !/화살표/.test(dom.text);
    if (noArrow) tally.arrowsGone++;
    ok(noArrow && n1 && n1.angle === null, '★④ 화살 그림 0 — 화살 칸 비고 숨김 · 화살 아이콘 0 · "화살표" 글자 0 · 각 없음', JSON.stringify({ html: dom.arHtml, hidden: dom.arHidden, icons: dom.icons }));
    ok(!!(n1 && n1.where) && dom.guide.indexOf(n1.where.text) >= 0, '화면 글 = 훅 글(칸에 그대로 보인다)', dom.guide.slice(0, 80));
    try { await page.screenshot({ path: path.join(SHOTS, `t1204-${V.vid}-arrive.png`) }); } catch (e) {}
    // ③ 쉼터 — 서버가 실은 자리 = 존 DB 쉼터 행(문 앞) · 빈 판 인사의 칸 글 = 따로 센 방위 · 걸음
    const row = SH.get(V.vid);
    const want = row ? { x: Math.round((row.cx - 2.5) * CELL), y: Math.round((row.cy - 0.5) * CELL) } : null;
    const got = st.state && st.state.shelter;
    ok(!!(got && want && got.vid === V.vid && got.x === want.x && got.y === want.y), '★③ 서버가 실은 쉼터 자리 = 존 DB 쉼터 행의 문 앞(따로 셈)', JSON.stringify([got, want]));
    const rest = await page.evaluate((vid) => {
      const I = onbNextInputs();
      I.greet = { vid, quest: null, lines: ['낯선 얼굴이군. 어디서 왔나.', '지금은 급한 일이 없네. 마을 쉼터에서 쉬게.'] };   // 빈 판 인사 한 통(입력 나머지는 진짜 그대로)
      I.nearVid = vid;
      const p = onbNextPlan(I);
      return p ? { stage: p.stage, where: p.where ? { text: p.where.text, dir: p.where.dir, steps: p.where.steps } : null, me: I.me } : null;
    }, V.vid);
    const shAbs = want ? { x: want.x + OFF.x, y: want.y + OFF.y } : null;
    const e3 = rest && shAbs ? exp(rest.me, shAbs) : null;
    tally.n++;
    const okSh = !!(rest && rest.stage === 'rest' && rest.where && e3 && rest.where.dir === e3.dir && rest.where.steps === e3.steps && rest.where.text === `쉼터는 ${e3.dir}으로 ${e3.steps}걸음입니다.`);
    if (okSh) tally.ok++;
    ok(okSh, '★③ 빈 판 인사의 칸 글 "쉼터는 …" = 따로 센 방위 · 걸음(존 DB 쉼터 · 내 자리)', `${rest && rest.where && rest.where.text} ↔ ${e3 && e3.dir} ${e3 && e3.steps}`);
    // ⑤ 게이트 안 — 인사가 오면 칸이 넘어가고 화살은 여전히 0(쉼터 앞 10걸음 안이면 "바로 앞")
    await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [V.cx * CELL + 16, V.cy * CELL + 16]);
    let g = null;
    for (let i = 0; i < 60 && !(g && g.kind === 'greet'); i++) { await sleep(500); g = await page.evaluate(() => window.__onbGreet || null); }
    pre(!!(g && g.kind === 'greet'), '게이트 안 · 촌장 첫 인사 한 통이 왔다(서버)', JSON.stringify(g && g.lines && g.lines.slice(0, 2)));
    await sleep(600);
    const n2 = await page.evaluate(() => (window.__t1064Next ? window.__t1064Next() : null));
    const ar2 = await page.evaluate(() => { const ar = document.getElementById('onbNextArrow'); return ar ? ar.innerHTML : null; });
    ok(!!n2 && (n2.stage === 'quest' || n2.stage === 'rest') && ar2 === '', '⑤ 게이트 안 — 칸이 인사대로 넘어가고 화살 그림은 여전히 0', JSON.stringify(n2 && [n2.stage, n2.item, n2.where && n2.where.text]));
    if (n2 && n2.stage === 'rest' && n2.where) {
      const me2 = await page.evaluate(() => ({ x: myAbsPredicted.x, y: myAbsPredicted.y }));
      const e5 = exp(me2, shAbs);
      ok(n2.where.steps === e5.steps && (e5.steps <= 10 ? n2.where.text === '쉼터가 바로 앞입니다.' : n2.where.dir === e5.dir), '⑤ 진짜 빈 판 인사 — 칸 글이 따로 센 쉼터 방위 · 걸음과 맞는다', `${n2.where.text} ↔ ${e5.dir} ${e5.steps}`);
    }
    try { await page.screenshot({ path: path.join(SHOTS, `t1204-${V.vid}-gate.png`) }); } catch (e) {}
    ok(errs.length === 0, '⑥ 페이지 오류 0', errs.slice(0, 2).join(' | '));
    await ctx.close();
  }
  console.log(`\n  [한 줄] 방위 · 거리 맞음 ${tally.ok}/${tally.n}(마을 ${[dock, road].filter(Boolean).length}곳 × 도착 · 쉼터) · 화살 그림 0 ${tally.arrowsGone}/${[dock, road].filter(Boolean).length}`);
  await browser.close();
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  shutdown();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
