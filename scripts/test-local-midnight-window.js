#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-local-midnight-window.js — 경도 하루 2단계 켬 판의 **창 꼴 계약** (T744 · T731 켬 준비) ==================
//
// ★재민 10-13: 마을 정산 = 그 마을 현지 00:00 · 동쪽 먼저. T731 이 하루 경계 하나를 **창** 하나로 바꿨다(손잡이 `T731_LOCAL_MIDNIGHT` · 기본 끔).
//   끔 판 계약(`test-tick-slicer` — 한 프레임 · 단계 순서 · 마을 수)은 창 꼴과 안 맞는다. 이 하네스가 켬 판의 계약이다.
//
// ★계약(창 하나마다 · 존 증인 `[T731] 증인` 한 줄을 그대로 읽는다 — 제품 무변 · 사본 0):
//   ① 꼴 = 머리(H) → 마을(V) → 꼬리(T) 한 번씩(`seq` = "HVT").
//   ② 머리는 **아무 마을도 정산 전**(머리 첫 조각에서 정산한 마을 0) · 꼬리는 **다 정산한 뒤**(꼬리 첫 조각에서 정산한 마을 = 창 마을 수 = 존 마을 수).
//   ③ 마을 조각 = 존 마을 수 · λ 내림차순(동 → 서) · 돈 차례 = λ 차례 · 저마다 **제 자정 뒤**(얼림 몰아 닫기가 없으면).
//   ④ 마을 ↔ 마을 흐름(교역 · 캐러밴 · econ 꼬리 · 사건 장부 · 존 경계 · 저장)은 머리 · 꼬리 조각에서만 — 마을 조각엔 0 · 마을 조각은 제 일(econ 마을 · 인구 · 생활층)만.
//   ⑤ **섞인 날 자리는 이름으로 못 박는다**(늘면 빨강): 창 밖에서 econ 날이 바뀌는 순간에 도는 하루(마을 밖 모듈) = 도적 하루(`bandits.js`) 하나 ·
//      사람 장부 요청 = 존 `VILLAGE_BOOK_MSG` 문(마감 중만 줄 세운다) · 존 경계 = 머리 `_xzDayIn` · 꼬리 `_xzDayOut` 둘뿐.
//   ⑥ 자명 통과 금지 — 계약 함수에 꼴을 깬 증인(꼬리 뒤 마을 · 덜 정산한 꼬리 · 서 → 동 · 제 자정 전 · 마을 조각의 교역)을 넣으면 빨강이다.
//
// 실행: node scripts/test-local-midnight-window.js   (존 하나를 띄운다 · 포트 3171/3172 · 씨앗 DB = `slicer-seed.js` 정본 · 하루 60초 · 창 둘 ≈ 4분)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const FB = require('./fixture-boot');
const codeOnly = require('./code-only.js');
const { ensureSeed } = require('./slicer-seed.js');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? `  ${x}` : '')); };
const say = (m) => console.log(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CPORT = 3171, ZPORT = 3172, DAY_MS = 60000, WINDOWS = 2;

// ── 계약(순수) — 창 증인 하나 → 어긴 것 목록 ─────────────────────────────────────
const H_OK = new Set(['xzone', 'econ', 'econ:head', 'life', 'bandit', 'roads']);   // ★[PM 10-30 · T986 켬 기본(T990) · T990_ECON_DAY 켬 기본(T1001) — 길의 하루 'roads' 도 같은 자리] 도적 하루는 설계대로 '날을 올린 econ 머리 바로 뒤'(머리 조각 · 마을 정산 앞) — 계약 ②(머리 = 정산 0)는 그대로 문다
const V_OK = new Set(['econ:vil', 'pop', 'life', 'life:쉼표']);
const FLOW = ['econ:trade', 'econ:caravan', 'econ:tail', 'caravan', 'caravan_body', 'caravan_fish', 'caravan_sync', 'events', 'xzone', 'save'];   // ★[T828] 캐러밴 조각 속 이름 셋 = 종전 `caravan`(창 증인은 속 이름을 적는다)
function windowContract(R) {
  const bad = [];
  if (R.seq !== 'HVT') bad.push(`꼴 ${R.seq}`);
  const S = R.settled || {};
  if (S.H !== 0) bad.push(`머리에 정산한 마을 ${S.H}`);
  if (!(S.T === R.n && R.n === R.all)) bad.push(`꼬리 정산 ${S.T} · 조각 ${R.n} · 존 ${R.all}`);
  const w = R.wit || [];
  for (let i = 1; i < w.length; i++) {
    if (w[i][1] > w[i - 1][1]) { bad.push(`서 → 동 ${w[i - 1][0]} → ${w[i][0]}`); break; }
    if (w[i][3] < w[i - 1][3]) { bad.push(`돈 차례 ${w[i - 1][0]} → ${w[i][0]}`); break; }
  }
  if (!R.flushN) { const early = w.filter((x) => x[3] < x[2]); if (early.length) bad.push(`제 자정 전 ${early.length}(${early[0][0]})`); }
  const st = R.stages || { H: [], V: [], T: [] };
  for (const s of st.H) if (!H_OK.has(s)) bad.push(`머리에 낯선 조각 ${s}`);
  for (const s of st.V) if (!V_OK.has(s)) bad.push(`마을 조각에 ${s}`);
  for (const f of FLOW) if (st.V.includes(f)) bad.push(`마을 조각의 흐름 ${f}`);
  for (const f of ['econ:trade', 'econ:caravan', 'econ:tail', 'events', 'save']) if (!st.T.includes(f)) bad.push(`꼬리에 ${f} 없음`);
  if (!st.H.includes('econ:head')) bad.push('머리에 econ:head 없음');
  return bad;
}

(async () => {
  say('\n=== 경도 하루 2단계 켬 — 창 꼴 계약 (T744) ===');

  say('\n⑤ 섞인 날 자리 — 이름으로 못 박는다(소스)');
  { const dir = path.join(ROOT, 'server');
    const listeners = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'villages.js').filter((f) => {
      const c = codeOnly(fs.readFileSync(path.join(dir, f), 'utf8'));
      return /world\.day/.test(c) && /(?:===|!==)\s*S\.lastDay/.test(c);   // econ 날이 바뀌는 순간에 도는 하루(마을 밖)
    });
    ok(listeners.length === 1 && listeners[0] === 'bandits.js', '★econ 날 바뀜에 붙은 마을 밖 하루 = 도적 하루(`bandits.js`) 하나 — 늘면 빨강', JSON.stringify(listeners));
    const Z = codeOnly(fs.readFileSync(path.join(dir, 'zone.js'), 'utf8'));
    ok(/VILLAGE_BOOK_MSG\.has\(msg\.type\) && SimVillages\.villagesBusy && SimVillages\.villagesBusy\(\)/.test(Z), '사람 장부 요청 — 마감 중(`villagesBusy`)만 줄 세운다(창 사이 미니 마감 밖은 바로 돈다 = 섞인 날 자리 하나)');
    const V = codeOnly(fs.readFileSync(path.join(dir, 'villages.js'), 'utf8'));
    const J = (V.match(/function _t731Jobs\(now, T\) \{[\s\S]*?\n\}/) || [''])[0];
    const iV = J.indexOf('for (const vil of T.vils) {'), iT = J.indexOf('if (T.tail) {');
    const headB = J.slice(0, iV), vilB = J.slice(iV, iT), tailB = J.slice(iT);
    ok(J && iV > 0 && iT > iV, '[전제] 창 조각 함수 `_t731Jobs` — 머리 · 마을 · 꼬리 세 덩이를 찾았다', `${iV} < ${iT}`);
    const xin = (J.match(/_xzDayIn\(/g) || []).length, xout = (J.match(/_xzDayOut\(/g) || []).length;
    ok(xin === 1 && xout === 1 && headB.includes('_xzDayIn(') && tailB.includes('_xzDayOut('), '존 경계 — 들임은 머리 · 냄은 꼬리 한 자리씩(섞인 날 자리 하나)', `들임 ${xin} · 냄 ${xout}`);
    const FLOWRE = /W\.P\.(?:trade|tradeSteps|caravans|tail)\(|_caravanSync(?:One|Sweep)\(|_scanEvents(?:Daily|Steps)\(|_xzDay(?:In|Out)\(|_econDayWar\(|_t681Day\(|settleMarkets/;
    ok(!FLOWRE.test(vilB) && /W\.P\.village\(vil\.econ\)/.test(vilB), '★마을 덩이엔 마을 ↔ 마을 흐름 0 · 그 마을 econ 결산만');
    ok(/W\.P\.trade\(|W\.P\.tradeSteps\(/.test(tailB) && /W\.P\.caravans\(/.test(tailB) && /_scanEvents/.test(tailB) && /W\.P\.head\(\)/.test(headB), '흐름 자리 — 교역 · 캐러밴 · 사건 장부는 꼬리 · econ 머리(장마당 정산)는 머리'); }

  say('\n⑥ 자명 통과 금지 — 꼴을 깬 증인은 빨강');
  { const good = { seq: 'HVT', settled: { H: 0, V: 0, T: 3 }, n: 3, all: 3, flushN: 0, wit: [['a', 0.28, 0, 2], ['b', 0.2, 100, 101], ['c', 0.18, 200, 210]],
      stages: { H: ['econ:head', 'life'], V: ['econ:vil', 'pop', 'life:쉼표'], T: ['econ:trade', 'econ:caravan', 'econ:tail', 'events', 'save'] } };
    const mut = (f) => { const r = JSON.parse(JSON.stringify(good)); f(r); return windowContract(r).length > 0; };
    ok(windowContract(good).length === 0, '[전제] 바른 꼴은 통과', JSON.stringify(windowContract(good)));
    ok(mut((r) => { r.seq = 'HVTV'; }) && mut((r) => { r.settled.T = 2; }) && mut((r) => { r.settled.H = 1; }) && mut((r) => { r.wit.reverse(); }) && mut((r) => { r.wit[1][3] = 50; })
      && mut((r) => { r.stages.V.push('econ:trade'); }) && mut((r) => { r.stages.T = r.stages.T.filter((x) => x !== 'econ:trade'); }), '★미끼 일곱(꼬리 뒤 마을 · 덜 정산한 꼬리 · 머리 정산 · 서 → 동 · 제 자정 전 · 마을 조각 교역 · 꼬리 교역 빠짐) 모두 빨강'); }

  say('\n①~④ 켬 판 존 — 창 둘');
  const seed = await ensureSeed({ log: (s) => console.log(s) });
  if (!seed.ok) { ok(false, '[전제] 씨앗 DB', seed.why); return done(); }
  const CDB = '/tmp/t744w-c.db', ZDB = '/tmp/t744w-z.db';
  const cp = (src, dst) => { for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(src + s, dst + s); } catch (e) { try { fs.unlinkSync(dst + s); } catch (e2) {} } } };
  cp(seed.c, CDB); cp(seed.z, ZDB);
  const procs = [];
  const boot = (file, env) => { const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] }); procs.push(p); return p; };
  const killAll = () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } procs.length = 0; };
  process.on('exit', killAll);
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' });
  if (!cu.ok) { ok(false, '[전제] central 기동', cu.why); killAll(); return done(); }
  const z = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`, VILLAGE_DAY_MS: String(DAY_MS),
    ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', VILLAGE_ROUTE_WARM: '0', T731_LOCAL_MIDNIGHT: '1', T731_WIT: '1' });
  const wins = []; let bootLine = null, buf = '';
  z.stdout.on('data', (d) => { buf += d.toString(); let i; while ((i = buf.indexOf('\n')) >= 0) { const ln = buf.slice(0, i); buf = buf.slice(i + 1);
    if (/\[T731\] 증인 /.test(ln)) { try { wins.push(JSON.parse(ln.slice(ln.indexOf('증인 ') + 3))); } catch (e) {} }
    else if (/\[T731\] 현지 자정 정산 — 부팅/.test(ln)) bootLine = ln; } });
  z.stderr.on('data', () => {});
  const zu = await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 });
  if (!zu.ok) { ok(false, '[전제] 존 기동', zu.why); killAll(); return done(); }
  const t0 = Date.now();
  while (wins.length < WINDOWS && Date.now() - t0 < DAY_MS * (WINDOWS + 2)) await sleep(500);
  killAll();
  ok(!!bootLine, '[전제] 켬 판 부팅 증인(마을 날을 시계에서)', bootLine ? bootLine.slice(bootLine.indexOf('[T731]'), bootLine.indexOf('[T731]') + 80) : '없음');   // ★[T760] 자르는 표식 = 고정 글자 `[T731]`(제품 로그의 🕛 는 그대로 · 판정 자리 이모지 0)
  ok(wins.length >= WINDOWS, `[전제] 창 증인 ${WINDOWS}개`, wins.length);
  for (const R of wins.slice(0, WINDOWS)) {
    const bad = windowContract(R);
    ok(bad.length === 0, `★창 ${R.D}(econ 날 ${R.econDay}) — 꼴 ${R.seq} · 머리 정산 ${R.settled && R.settled.H} · 꼬리 정산 ${R.settled && R.settled.T}/${R.all} · 마을 ${R.n} · 동→서 · 제 자정 뒤 · 흐름은 머리 · 꼬리`, bad.length ? JSON.stringify(bad) : `미니 마감 ${R.opens} · 늦음 ${R.lateMs.min}~${R.lateMs.max}ms`);
  }
  for (const f of [CDB, ZDB]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} }
  done();
})().catch((e) => { ok(false, '예외', e && e.message); done(); });

function done() { say(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`); process.exit(fail ? 1 : 0); }
