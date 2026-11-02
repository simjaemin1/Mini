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
//   ⑤ 페이지 오류 0
// ★자명 통과 금지: ① 목표는 클라가 쓰는 함수가 아니라 서버 /startinfo 로 따로 세운다 · ② 는 인사 한 통이 **온 뒤**에만 판정한다.
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
  console.log('\n=== 「지금 할 일」 칸 — 새 게스트의 첫 걸음 (실클라 하나 · T1064) ===');
  const cen = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = FB.waitUp(cen, /central server up on/, { name: 'central' });
  const zon = boot('zone', 'zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0' });
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
    return { next: R('onbNext'), minimap: R('minimap'), notice: R('notice'), hud: R('hud'), vw: innerWidth, vh: innerHeight,
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

  ok(errs.length === 0, '페이지 오류 0', JSON.stringify(errs.slice(0, 3)));
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  await browser.close(); shutdown(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  ✗ 하네스 예외: ' + (e && e.stack || e)); console.log(`\n=== ${pass + fail + 1}건 중 PASS ${pass} · FAIL ${fail + 1} ===`); shutdown(); process.exit(1); });
