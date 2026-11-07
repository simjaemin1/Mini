#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @nightly A   ← 야간 세 밤 분할(T238) · 넣을 때 A 22 · B 23 · C 26 — 적은 쪽(실서버 판 하나 · 실클라 하나 · 판당 2 ~ 3분)
// === scripts/e2e-next-step.js — T1064 「지금 할 일」 칸 — 실클라 하나로 새 게스트의 첫 걸음을 따라간다 ====================
//
// ★왜 [재민 11-01 · 카드 T1064] "마을 앞에 스폰되면 제대로 보여 주는 게 없다."
//   단위 하네스(`test-t1064-next-step`)는 고르기 · 그리기를 제품 글자로 잰다. 이 하네스는 **진짜 서버 · 진짜 로비 · 진짜 화면**에서
//   서버가 보낸 대본(`onboarding_state` · 촌장 첫 인사)이 그 칸에 **그대로** 서는가를 잰다(보이는 것 = 일어난 것).
//
// ★재는 것(새 게스트 한 명 · 로비 「아무 곳이나(추천)」 원클릭):
//   ① 도착 — welcome 손잡이(`uiCfg.nextStep`) · 칸이 선다 · "마을로 들어가기" · 자리 = 고른 마을 이름 ·
//      목표 = **시작 화면이 준 마을 중심**(/startinfo 의 cx · cy + 존 오프셋 — 클라 계산과 따로 잰다) · 화살이 보이고 그 돌림 = 화면에서 목표 쪽 ·
//      칸이 화면 안 · 지도 판 · 알림 판 · 왼쪽 HUD 와 안 겹친다 · 글자 크기
//   ② 마을 안 — 그 마을 게이트에 들면 촌장 첫 인사(서버 한 통)가 오고 칸이 **그 한 통대로** 넘어간다(의뢰가 있으면 의뢰 · 없으면 쉼터) ·
//      화살이 숨는다 · 자리 = "마을 안" · 의뢰면 품목 이름이 촌장 말에 있는 그 이름
//   ③ 다시 어귀 — 도착 지점으로 돌아오면 자리 = 나루터/어귀 · 의뢰면 화살이 다시 마을 쪽
//   ④ 손잡이 — 클라 `uiCfg.nextStep` 을 걷으면(= `T1064_NEXT_STEP=0` welcome) 칸이 숨고, 되돌리면 선다
//   ── ★[T1086 2026-11-02 · 넓힘] 첫 의뢰 뒤 바로 — 마을 가입 · 사유지 터 잡기(★재민 11-01 "강하게 유도") ──
//   ⑤ 첫 의뢰 — 시작 마을 게시판 의뢰 하나를 **진짜 Shift N** 으로 다 채우면 빈터 권리 · 권함이 그 자리에서 선다(종전 3 · 12) ·
//      촌장 한 통에 권함 · 빈터 줄(하게체 · 서버 정본 문장)
//   ⑥ 마을 가입 — 칸이 "마을 가입" + 단추 · 단추를 **진짜로 눌러** 마을 사람이 된다(받아들인 말 "오늘부터 …") · 칸이 "사유지 터 잡기"로 ·
//      목표 = 시작 화면이 준 도착 지점(서버 빈터 중심 · 따로 셈)
//   ⑦ 사유지 터 잡기 — 빈터 안 · 재료 모자람이면 단추 없음 · 무엇이 몇 개 · 재료가 되면 "터 잡기" 단추 · 눌러 터가 선다(서버 claim_added) ·
//      칸이 "내 집 짓기"로
//   ⑧ 누른 수 — 첫 의뢰부터 가입 · 터까지 누른 곳 수를 한 줄로(보고 ② 걸음 수 표의 '고친 뒤' 판 · `T1086_STEPS`)
//   ⑨ 페이지 오류 0
// ★자명 통과 금지: ① 목표는 클라가 쓰는 함수가 아니라 서버 /startinfo 로 따로 세운다 · ② 는 인사 한 통이 **온 뒤**에만 판정한다 ·
//   ⑤ 는 의뢰 전에 빈터 · 권함이 없음을 먼저 잰다 · ⑥ ⑦ 은 단추를 실제로 누르고 서버가 돌려준 것(소속 말 · 사유지)으로만 판정한다.
//
// 실행: node scripts/e2e-next-step.js [--headed]   (E2E_BROWSER=webkit 이면 WebKit)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');            // ★T349 기동 기다리기 정본

const ROOT = path.join(__dirname, '..');
const SHOTS = '/tmp/e2e-next-step-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const HEADED = process.argv.includes('--headed');
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/e2e-next-step-central-${process.pid}.db`, ZDB = `/tmp/e2e-next-step-zone-${process.pid}.db`;
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
const overlap = (a, b) => !!(a && b && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0);

(async () => {
  console.log('\n=== 「지금 할 일」 칸 — 새 게스트의 첫 걸음 · 첫 의뢰 뒤 가입 · 터 잡기 (실클라 하나 · T1064 · T1086) ===');
  const cen = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = FB.waitUp(cen, /central server up on/, { name: 'central' });
  const zon = boot('zone', 'zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
    // ★[T1086] 첫 의뢰를 실제로 채운다 — 의뢰를 세우는 픽스처(`E2E_GIVE` · `e2e-onboarding` 과 같은 꼴) · 마을 4곳 · 하루 0.5초(의뢰가 빨리 선다)
    VILLAGE_MAX: '4', VILLAGE_DAY_MS: '500', E2E_GIVE: '1',
    // ★[T1204] 이 하네스는 화살 판(종전 · `T1204_NOW_WORDS=0`)을 잰다 — 켬 기본(글로 방위 · 걸음)은 `e2e-t1204-now-words` 가 잰다(단언 무변)
    T1204_NOW_WORDS: '0' });
  const zu = FB.waitUp(zon, /zone server up on/, { name: 'zone', capMs: 300000 });
  const c0 = await cu; ok(c0.ok, 'central 기동', c0.ok ? `${c0.ms}ms` : c0.why);
  const z0 = await zu; ok(z0.ok, 'zone 기동');
  await sleep(6000);
  const browser = await require('./e2e-browser').launch({ headless: !HEADED });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e && e.message || e).slice(0, 160)));
  const snap = async (n) => { try { await page.screenshot({ path: path.join(SHOTS, n + '.png') }); } catch (e) {} };
  const nx = () => page.evaluate(() => (window.__t1064Next ? window.__t1064Next() : null));
  const box = () => page.evaluate(() => {
    const R = (id) => { const el = document.getElementById(id); if (!el) return null; const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height }; };
    const it = document.getElementById('onbNextItem'), ar = document.getElementById('onbNextArrow');
    return { next: R('onbNext'), minimap: R('minimap'), notice: R('notice'), hud: R('hud'), btn: R('onbNextBtn'), vw: innerWidth, vh: innerHeight,
      itemFs: it ? parseFloat(getComputedStyle(it).fontSize) : null, guideFs: (() => { const g = document.getElementById('onbNextGuide'); return g ? parseFloat(getComputedStyle(g).fontSize) : null; })(),
      arrowShown: !!(ar && !ar.classList.contains('hidden') && ar.firstChild), arrowXf: ar ? ar.style.transform : '',
      text: (document.getElementById('onbNext') || {}).textContent || '' };
  });
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  let info = null;
  for (let i = 0; i < 80 && !info; i++) { info = await page.evaluate(() => (window.__onbInfo ? window.__onbInfo() : null)); if (!info) await sleep(700); }
  pre(!!(info && info.villages && info.villages.length && info.recommend != null), '시작 화면이 마을 목록 · 추천을 받았다', info ? `${info.villages.length}곳 · 추천 ${info.recommend}` : '없음');
  const V = info ? info.villages.find((v) => v.vid === info.recommend) : null;
  await page.evaluate(() => window.__onbAny());
  let inWorld = false;
  for (let i = 0; i < 240 && !inWorld; i++) { inWorld = await page.evaluate(() => !!(window.__getSrvAbs && window.__getSrvAbs())); if (!inWorld) await sleep(500); }
  ok(inWorld, '존 입장(서버 권위 좌표)');
  const OFF = await page.evaluate(() => { const c = conns.get(primaryZoneId); return { x: (c && c.meta && c.meta.worldOffsetX) || 0, y: (c && c.meta && c.meta.worldOffsetY) || 0 }; });

  // ── ① 도착 ─────────────────────────────────────────────────────────────────────
  console.log('\n① 도착 — 마을 앞');
  let n1 = null;
  for (let i = 0; i < 40 && !(n1 && n1.stage); i++) { n1 = await nx(); if (!(n1 && n1.stage)) await sleep(400); }
  const knob = await page.evaluate(() => (typeof uiCfg !== 'undefined' && uiCfg) ? uiCfg.nextStep : undefined);
  ok(knob === true, '★welcome 손잡이 — `uiCfg.nextStep` 이 켜져 왔다(T1064_NEXT_STEP 켬 기본 후보)', String(knob));
  ok(!!n1 && n1.stage === 'enter' && n1.item === '마을로 들어가기', '★칸이 선다 — "마을로 들어가기"', JSON.stringify(n1 && [n1.stage, n1.item]));
  ok(!!(n1 && V && n1.place.indexOf(V.name) === 0), `자리 — 고른 마을 이름(${V && V.name})`, n1 && n1.place);
  const want = V ? { x: OFF.x + V.cx * 32 + 16, y: OFF.y + V.cy * 32 + 16 } : null;   // ★서버 /startinfo 의 마을 칸 → 절대(셀 32 · 칸 가운데) — 클라 함수와 따로 세운다
  ok(!!(n1 && n1.target && want && Math.abs(n1.target.x - want.x) <= 1 && Math.abs(n1.target.y - want.y) <= 1), '★목표 = 시작 화면이 준 그 마을의 중심(서버 값 · 따로 셈)', JSON.stringify([n1 && n1.target, want]));
  const b1 = await box();
  const ang = await page.evaluate((t) => { const me = myAbsPredicted, a = window.__w2s(t.x, t.y), b = window.__w2s(me.x, me.y); return Math.atan2(a.py - b.py, a.px - b.px); }, want || { x: 0, y: 0 });
  const xf = /rotate\((-?[\d.]+)rad\)/.exec(b1.arrowXf || '');
  ok(b1.arrowShown && xf && Math.abs(+xf[1] - ang) < 0.05, '★화살이 보이고 돌림 = 화면에서 그 마을 쪽', `${xf ? xf[1] : '-'} vs ${ang.toFixed(3)}`);
  ok(!!b1.next && b1.next.left >= 0 && b1.next.top >= 0 && b1.next.right <= b1.vw && b1.next.bottom <= b1.vh, '칸이 화면 안에 있다', JSON.stringify(b1.next));
  ok(!!b1.next && !overlap(b1.next, b1.minimap) && !overlap(b1.next, b1.hud) && !overlap(b1.next, b1.notice), '칸이 지도 판 · 왼쪽 HUD · 알림 판과 안 겹친다',
    JSON.stringify({ n: b1.next && [Math.round(b1.next.left), Math.round(b1.next.top), Math.round(b1.next.right), Math.round(b1.next.bottom)], m: b1.minimap && Math.round(b1.minimap.bottom) }));
  ok(b1.itemFs >= 13 && b1.guideFs >= 12, '글자 크기 — 할 일 13px 이상 · 설명 12px 이상', `${b1.itemFs} · ${b1.guideFs}`);
  await snap('next-01-arrive');

  // ── ② 마을 안 ─────────────────────────────────────────────────────────────────
  console.log('\n② 마을 안 — 게이트에 들면 촌장 첫 인사가 오고 칸이 넘어간다');
  if (V) await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [V.cx * 32 + 16, V.cy * 32 + 16]);
  let g = null, near = null;
  for (let i = 0; i < 60 && !(g && g.kind === 'greet'); i++) {
    await sleep(500);
    g = await page.evaluate(() => window.__onbGreet || null);
    near = await page.evaluate(() => window.__evNearVid);
  }
  pre(!!(g && g.kind === 'greet') && V && near === V.vid, '그 마을 게이트 안 · 촌장 첫 인사 한 통이 왔다(서버)', JSON.stringify(g && g.lines && g.lines.slice(0, 2)));
  await sleep(600);
  const n2 = await nx();
  const q = await page.evaluate(() => (window.__onbGet ? window.__onbGet().quest : null));
  const hasQ = !!(g && g.lines && g.lines.length >= 3 && q);
  ok(!!n2 && n2.stage === (hasQ ? 'quest' : 'rest'), `★칸이 인사 한 통대로 넘어갔다 — ${hasQ ? '의뢰' : '빈 판(쉼터)'}`, JSON.stringify(n2 && [n2.stage, n2.item]));
  ok(!!n2 && !n2.target && !(await box()).arrowShown, '게이트 안 — 화살이 숨는다(닿았다)');
  ok(!!(n2 && V) && n2.place === `${V.name} 마을 안`, '자리 — "마을 안"', n2 && n2.place);
  if (hasQ) {
    const name = n2.item.replace(/ \d+개 구해 오기$/, '');
    ok(n2.item.endsWith(`${q.remain}개 구해 오기`) && g.lines[1].indexOf(name) >= 0, '의뢰 — 남은 양(서버 remain) · 품목 이름이 촌장 말 속 그 이름', `${n2.item} · ${g.lines[1]}`);
  } else {
    ok(!!n2 && n2.item === '쉬어 가기' && !!g.lines[1] && n2.guide.indexOf(g.lines[1]) >= 0, '빈 판 — 촌장이 한 말(둘째 줄)이 칸에 그대로', n2 && n2.guide.slice(0, 60));
  }
  await snap('next-02-village');

  // ── ③ 다시 어귀 ───────────────────────────────────────────────────────────────
  console.log('\n③ 다시 어귀 — 도착 지점으로');
  if (V && V.arrive) await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [V.arrive.x, V.arrive.y]);
  let n3 = null;
  for (let i = 0; i < 30; i++) { await sleep(500); n3 = await nx(); if (n3 && n3.place && !/마을 안$/.test(n3.place)) break; }
  ok(!!(n3 && V) && (n3.place === `${V.name} 나루터` || n3.place === `${V.name} 어귀`), '자리 — 도착 둘레(서버 빈터 반경)면 나루터 · 어귀', n3 && n3.place);
  if (hasQ) ok(!!(n3 && n3.target) && (await box()).arrowShown && Math.abs(n3.target.x - want.x) <= 1, '의뢰 — 마을 밖이면 화살이 다시 그 마을(납품할 곳) 쪽', JSON.stringify(n3 && n3.target));
  else ok(!!n3 && n3.stage === 'rest' && !n3.target, '빈 판 — 화살 없음(쉼터 자리는 클라가 모른다 — 새 값 0)', n3 && n3.stage);

  // ── ④ 손잡이 ──────────────────────────────────────────────────────────────────
  console.log('\n④ 손잡이 — 걷으면 숨고 되돌리면 선다');
  await page.evaluate(() => { uiCfg.nextStep = false; });
  await sleep(500);
  const hid = await page.evaluate(() => { const el = document.getElementById('onbNext'); return !el || el.classList.contains('hidden'); });
  await page.evaluate(() => { uiCfg.nextStep = true; });
  await sleep(500);
  const back = await page.evaluate(() => { const el = document.getElementById('onbNext'); return !!el && !el.classList.contains('hidden'); });
  ok(hid && back, '★`uiCfg.nextStep` 을 걷으면(옛 welcome) 칸이 숨고 · 되돌리면 다시 선다', JSON.stringify([hid, back]));


  // ══ ★[T1086] 첫 의뢰 뒤 바로 — 마을 가입 · 사유지 터 잡기 ═══════════════════════════════════════════════
  const OnbSrv = require(path.join(ROOT, 'server', 'onboarding'));   // 촌장 말 두 줄 — 서버 정본 문장(하네스가 다시 적지 않는다)
  const JOIN_LINE = OnbSrv.T1086_JOIN_LINE, LOT_LINE = OnbSrv.T1086_LOT_LINE;
  const tp = (x, y) => page.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [x, y]);
  const onbS = () => page.evaluate(() => window.__onbState || null);
  const waitNext = async (pred, ms) => { let n = null; for (let i = 0; i < (ms || 15000) / 300; i++) { n = await nx(); if (n && pred(n)) return n; await sleep(300); } return n; };
  const presses = [];   // 누른 곳(⑧ 표) — 실제로 누른 것만 적는다
  //   의뢰를 세운다 — `e2e-onboarding` 의 그 꼴(픽스처 부족 · 날 흐름 · 한 품목에 매달리면 다음 품목)
  async function ensureBoard(vid, tries) {
    const skip = []; let lastItem = null, same = 0;
    for (let i = 0; i < (tries || 25); i++) {
      await page.evaluate((v) => window.__sendPrimary({ type: 'village_board', vid: v }), vid);
      await sleep(400);
      const b0 = await page.evaluate(() => window.__evLastBoard || null);
      if (b0 && b0.rows && b0.rows.length) return b0;
      await page.evaluate(([v, sk]) => window.__sendPrimary({ type: '__e2e_village_short', vid: v, skip: sk }), [vid, skip.slice()]);
      await sleep(900);
      const nl = await page.evaluate(() => (window.__notices || []).filter((t) => /\(문턱 /.test(t)).slice(-1)[0] || '');
      const m = /\s(\S+) [-\d.]+→[-\d.]+ \(문턱/.exec(nl);
      const it = m ? m[1] : null;
      if (it && it === lastItem) same++; else { lastItem = it; same = 1; }
      if (it && same >= 2 && !skip.includes(it)) { skip.push(it); lastItem = null; same = 0; }
    }
    return await page.evaluate(() => window.__evLastBoard || null);
  }

  // ── ⑤ 첫 의뢰 ─────────────────────────────────────────────────────────────────
  console.log('\n⑤ 첫 의뢰 — 시작 마을 의뢰 하나를 다 채우면 빈터 + 마을 사람 권함(T1086)');
  const FJ = await page.evaluate(() => (typeof uiCfg !== 'undefined' && uiCfg && uiCfg.firstJoin) || null);
  ok(!!(FJ && FJ.cost && FJ.cost.wood > 0), '★welcome 손잡이 — `uiCfg.firstJoin`(T1086_FIRST_JOIN 켬 기본 후보) · 터 값은 서버가 실었다', JSON.stringify(FJ));
  const s0 = await onbS();
  pre(!!s0 && !s0.lotOk && !s0.firstDone && (s0.contrib | 0) === 0, '의뢰 전 — 빈터 권리 없음 · 첫 납품 없음(아래가 자명 통과가 아니다)', JSON.stringify(s0 && [s0.lotOk, s0.contrib]));
  if (V) { await tp(V.cx * 32 + 16, V.cy * 32 + 16); for (let i = 0; i < 20 && (await page.evaluate(() => window.__evNearVid)) !== V.vid; i++) await sleep(500); }
  let st5 = s0, viaKey = 0, viaMsg = 0;
  for (let round = 0; round < 5 && !(st5 && st5.firstDone); round++) {
    await page.evaluate(() => window.__sendPrimary({ type: '__e2e_day_freeze', on: false }));
    await sleep(300);
    await ensureBoard(V.vid, 25);
    await page.evaluate(() => window.__sendPrimary({ type: '__e2e_day_freeze', on: true }));
    await sleep(500);
    const b5 = await ensureBoard(V.vid, 2);
    const row = b5 && b5.rows && b5.rows[0];
    const give = row && (row.give || [])[0];
    if (!give) continue;
    await page.evaluate(([it, n]) => window.__sendPrimary({ type: '__e2e_give', items: { [it]: n } }), [give, Math.max(1, Math.ceil(row.remain)) + 3]);
    await sleep(900);
    const c0 = ((await onbS()) || {}).contrib | 0;
    //   ★진짜 키 — Shift 를 누른 채 N(클라가 서버에 고르게 한다 · 품목을 안 보낸다)
    await page.keyboard.down('Shift'); await page.keyboard.press('KeyN'); await page.keyboard.up('Shift');
    presses.push('Shift N');
    for (let i = 0; i < 12; i++) { await sleep(300); st5 = await onbS(); if (st5 && (st5.contrib | 0) > c0) break; }
    if (st5 && (st5.contrib | 0) > c0) viaKey++;
    else {   // 키가 안 닿는 판(브라우저 어댑터)이면 같은 메시지를 직접 — 판정은 서버가 돌려준 것으로만
      await page.evaluate((v) => window.__sendPrimary({ type: 'village_deliver', vid: v }), V.vid);
      viaMsg++;
      for (let i = 0; i < 12; i++) { await sleep(300); st5 = await onbS(); if (st5 && (st5.contrib | 0) > c0) break; }
    }
  }
  pre(!!st5 && st5.firstDone && (st5.contrib | 0) >= 1, '시작 마을 의뢰 하나를 다 채웠다(서버 계량기)', JSON.stringify(st5 && { contrib: st5.contrib, key: viaKey, msg: viaMsg }));
  ok(!!st5 && st5.lotOk === true && (st5.contrib | 0) === 1, '★빈터 권리가 첫 의뢰에 섰다(종전 의뢰 3건)', JSON.stringify(st5 && [st5.lotOk, st5.contrib, st5.need]));
  const g5 = await page.evaluate(() => window.__onbGreet || null);
  ok(!!g5 && (g5.kind === 'hook' || g5.kind === 'offer') && g5.lines.indexOf(JOIN_LINE) >= 0 && g5.lines.indexOf(LOT_LINE) >= 0,
    '★촌장 한 통 — 권함 · 빈터 줄(하게체 · 서버 정본 문장 그대로)', JSON.stringify(g5 && [g5.kind, g5.lines]));
  ok(!!g5 && (g5.kind !== 'hook' || g5.lines[0] === '잘했네. 오늘은 밥이라도 들게.'), '훅이면 첫 줄은 종전 그대로(밥)', g5 && g5.lines[0]);

  // ── ⑥ 마을 가입 ───────────────────────────────────────────────────────────────
  console.log('\n⑥ 마을 가입 — 칸의 단추를 실제로 누른다');
  const n6 = await waitNext((n) => n.stage === 'join');
  ok(!!n6 && n6.stage === 'join' && n6.item === '마을 가입' && n6.btn === 'join' && !n6.target, '★칸이 "마을 가입" · 단추 · 화살 없음', JSON.stringify(n6 && [n6.stage, n6.item, n6.btn]));
  const b6 = await box();
  ok(!!b6.btn && b6.btn.left >= 0 && b6.btn.right <= b6.vw && b6.btn.bottom <= b6.vh && !overlap(b6.btn, b6.minimap) && /마을 가입/.test(b6.text),
    '단추가 화면 안 · 지도 판과 안 겹친다 · 이름 "마을 가입"', JSON.stringify(b6.btn && [Math.round(b6.btn.left), Math.round(b6.btn.top), Math.round(b6.btn.w), Math.round(b6.btn.h)]));
  await snap('next-05-join');
  await page.evaluate(() => { window.__notices = []; });
  await page.click('#onbNextBtn');
  presses.push('단추 마을 가입');
  let j6 = null;
  for (let i = 0; i < 30; i++) { await sleep(300); j6 = await page.evaluate(() => window.__onbGreet || null); if (j6 && j6.kind === 'joined') break; }
  const nt6 = await page.evaluate(() => (window.__notices || []).slice());
  ok(!!j6 && j6.kind === 'joined' && j6.lines[0] === '오늘부터 자네는 우리 마을 사람일세.' && j6.lines.indexOf(LOT_LINE) === 1 && nt6.some((t) => /오늘부터 자네는 우리 마을 사람일세/.test(t)),
    '★단추 한 번에 마을 사람 — 받아들인 말(종전 수락 말 그 문장) + 빈터 줄 · 알림', JSON.stringify(j6 && j6.lines));
  //   서버 소속 문으로 따로 잰다 — 마을 사람이면 `/소속` 이 형편을 되읊는다("… 사람이 된 지 …" · 옛 "… 사람 — N일째")
  await page.evaluate(() => { window.__notices = []; window.__sendPrimary({ type: 'chat', text: '/소속' }); });
  let mline = '';
  for (let i = 0; i < 15 && !mline; i++) { await sleep(300); mline = (await page.evaluate(() => (window.__notices || []).slice())).find((t) => /사람 —|사람이 된 지/.test(t)) || ''; }
  ok(!!V && mline.indexOf(V.name) >= 0, '서버 소속 문 — 그 마을 사람이다(형편 되읊기)', mline.slice(0, 60));
  const n7 = await waitNext((n) => n.stage === 'claim');
  const lotAbs = V && V.arrive ? { x: OFF.x + V.arrive.x, y: OFF.y + V.arrive.y } : null;   // ★빈터 중심 = 시작 화면이 준 도착 지점(서버 `vacantZoneOf` · 따로 셈)
  ok(!!n7 && n7.stage === 'claim' && n7.item === '사유지 터 잡기' && !!n7.target && !!lotAbs && Math.abs(n7.target.x - lotAbs.x) <= 1 && Math.abs(n7.target.y - lotAbs.y) <= 1,
    '★칸이 "사유지 터 잡기" · 목표 = 도착 지점(빈터 중심 · 서버 값 따로 셈)', JSON.stringify([n7 && n7.target, lotAbs]));
  ok((await box()).arrowShown, '빈터 밖 — 화살이 그 쪽을 가리킨다');
  await snap('next-06-claim-far');

  // ── ⑦ 사유지 터 잡기 ───────────────────────────────────────────────────────────
  console.log('\n⑦ 사유지 터 잡기 — 빈터 안 · 재료 · 단추');
  if (V && V.arrive) await tp(V.arrive.x, V.arrive.y);
  const n8 = await waitNext((n) => n.stage === 'claim' && !n.target);
  const inv8 = await page.evaluate(() => (window.__getInv && window.__getInv()) || {});
  const lack = (inv8.wood | 0) < FJ.cost.wood || (inv8.stone | 0) < FJ.cost.stone;
  pre(lack, '재료가 모자란다(첫 도착은 빈손 · 의뢰에 낸 나머지뿐)', JSON.stringify({ wood: inv8.wood | 0, stone: inv8.stone | 0 }));
  ok(!!n8 && !n8.target && !n8.btn && n8.guide.indexOf(`나무 ${FJ.cost.wood}개와 돌 ${FJ.cost.stone}개가 있어야 합니다`) >= 0 && n8.guide.indexOf(`지금 나무 ${inv8.wood | 0}개와 돌 ${inv8.stone | 0}개`) >= 0,
    '★빈터 안 · 재료 모자람 — 단추 없음 · 무엇이 몇 개(서버 터 값) · 지금 몇 개(짐)', n8 && n8.guide);
  ok(!(await box()).btn, '단추가 화면에 없다(누를 수 없는 단추 0)');
  await snap('next-07-claim-lack');
  await page.evaluate((c) => window.__sendPrimary({ type: '__e2e_give', items: { wood: c.wood, stone: c.stone } }), FJ.cost);
  const n9 = await waitNext((n) => n.btn === 'claim');
  ok(!!n9 && n9.stage === 'claim' && n9.btn === 'claim' && n9.guide.indexOf('[C] 키로 선 자리에 터를 잡으십시오') >= 0, '★재료가 되면 "터 잡기" 단추 · C 키', n9 && n9.guide);
  await snap('next-08-claim-ready');
  const myC = () => page.evaluate(() => { const c = conns.get(primaryZoneId); const me = myPlayerId || myUsername; let n = 0; if (c && c.claims) for (const cl of c.claims.values()) if (cl.ownerPid === me && cl.kind === 'personal') n++; return n; });
  const k0 = await myC();
  await page.click('#onbNextBtn');
  presses.push('단추 터 잡기');
  let k1 = k0;
  for (let i = 0; i < 20 && k1 === k0; i++) { await sleep(300); k1 = await myC(); }
  ok(k1 === k0 + 1, '★단추 한 번에 터가 선다(서버 claim_added — 내 개인 사유지 하나)', `${k0} → ${k1}`);
  const n10 = await waitNext((n) => n.stage === 'build');
  ok(!!n10 && n10.stage === 'build' && n10.item === '내 집 짓기' && !n10.target && !n10.btn && n10.guide.indexOf('[Shift B] 에서 움집 터파기를 고르십시오') >= 0,
    '★칸이 "내 집 짓기" — 제 터 안 · 화살 없음 · 건축 판 키', n10 && n10.guide);
  await snap('next-09-build');

  // ── ⑧ 누른 수 ─────────────────────────────────────────────────────────────────
  console.log('\n⑧ 누른 수 — 첫 의뢰부터 가입 · 터까지');
  const iJ = presses.indexOf('단추 마을 가입'), iC = presses.indexOf('단추 터 잡기');
  ok(iJ >= 1 && iC === iJ + 1 && presses.slice(0, iJ).every((x) => x === 'Shift N'), '누른 곳 — 납품(Shift N) 뒤 가입 단추 한 번 · 터 단추 한 번', presses.join(' → '));
  console.log('  T1086_STEPS ' + JSON.stringify({ browser: process.env.E2E_BROWSER || 'chromium', presses, deliverKey: viaKey, deliverMsg: viaMsg }));

  console.log('\n⑨ 페이지 오류');
  ok(errs.length === 0, '페이지 오류 0', JSON.stringify(errs.slice(0, 3)));
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  await browser.close(); shutdown(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  ✗ 하네스 예외: ' + (e && e.stack || e)); console.log(`\n=== ${pass + fail + 1}건 중 PASS ${pass} · FAIL ${fail + 1} ===`); shutdown(); process.exit(1); });
