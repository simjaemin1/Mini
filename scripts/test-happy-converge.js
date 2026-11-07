#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-happy-converge.js — T1134: 행복 = 목표로 다가가는 값 · 같은 조건이면 출발과 무관하게 같은 값 ==========
//
// ★[T1134 · ★재민 11-03] "같은 조건이면 30 에서 시작하든 70 이든 100 이든 시간이 지나면 완전히 같은 값으로 수렴" — 이것이 이 모델의 정의다.
//   ① 정의 — 같은 마을 · 같은 조건(좋은 것 G · 인구 N · 겪은 일)으로 출발 h = 0.3 · 0.7 · 1.0 셋 → 반감기 열 배 뒤 셋 차 < 0.001.
//   ② 겪은 일 — 굶어 죽음 한 번을 넣은 판도 같은 끝값으로 돌아온다(목표가 내려갔다가 반감기 30날로 돌아온다) · 넣은 직후엔 내려간다(자명 통과 금지).
//   ③ 목표 식 — h* = 0.5 + G − c · N − E · 0 ~ 1 로 자름 · 인구가 크면 목표가 낮다(c > 0) · c = 0 이면 인구 무관.
//   ④ econ 하루(tickVillage) — 켬 판에서 마을 h 가 0 ~ 1 안 · 목표 칸 · 좋은 것 칸이 선다 · 이탈은 h < 0.25 일 때만 압력.
//   ⑤ 켬 기본(★[T1147]) — 손잡이 없는 판 = `=1` 판(바이트 같음) · `=0` 판은 다르다(되돌림 문이 산다) · c 기본 0.00741.
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

if (process.env.HC_CHILD) {   // ⑤ 의 아이 — 마을 이틀 바이트
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  E.setSeed(5);
  const v = E.createVillage({ name: '시험', initialPop: 12, fertility: 1, water: 0.3, game: 0.6, wood: 1, ore: 0.5, stone: 1 });
  E.setSeed(42); E.tickVillage(v, 1); E.tickVillage(v, 2);
  const o = {}; for (const k of ['storage', 'counts', 'lastStats', '_dPAccum']) o[k] = v[k];
  process.stdout.write(JSON.stringify(o));
  process.exit(0);
}

process.env.T1134_HAPPY_TARGET = '1';
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? '  ' + JSON.stringify(x) : '')); };
const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
const HALF = E.t1134Half();

console.log('① 정의 — 같은 조건이면 같은 값');
const run = (h0, days, G, N, ev) => {
  const v = { _H: h0, _t1134E: 0 };
  const tr = [];
  for (let d = 1; d <= days; d++) {
    if (ev && d === ev.day) v._t1134E += ev.amt;
    tr.push(E.t1134Step(v, G, N, 0).h);
  }
  return { end: v._H, tr, E: v._t1134E };
};
ok(E.T1134_HAPPY_TARGET === true && HALF === 30, '①-0 손잡이 켬 · 반감기 기본 30날(HAPPY_EQ_HALF_DAYS)');
{
  process.env.T1134_C = '0.004';
  const G = 0.62, N = 40, D = HALF * 10;
  const R = [0.3, 0.7, 1.0].map((h0) => run(h0, D, G, N));
  const ends = R.map((r) => r.end), spread = Math.max(...ends) - Math.min(...ends);
  const tgt = Math.max(0, Math.min(1, 0.5 + G - 0.004 * N));
  ok(spread < 0.001, `①-1 출발 0.3 · 0.7 · 1.0 → ${D}날(반감기 열 배) 뒤 셋 차 < 0.001`, { ends: ends.map((x) => +x.toFixed(6)), spread: +spread.toExponential(2) });
  ok(ends.every((x) => Math.abs(x - tgt) < 0.001), `①-2 끝값 = 목표 ${tgt.toFixed(3)}`, { tgt });
  const d30 = R.map((r) => r.tr[HALF - 1]);
  ok(Math.abs(Math.abs(d30[2] - tgt) - Math.abs(1.0 - tgt) / 2) < 1e-9, '①-3 반감기 30날 뒤 남은 차 = 처음 차의 절반(1.0 출발)', { at30: +d30[2].toFixed(6) });
  const ups = R[0].tr.every((x, i) => i === 0 || x >= R[0].tr[i - 1] - 1e-12), downs = R[2].tr.every((x, i) => i === 0 || x <= R[2].tr[i - 1] + 1e-12);
  ok(ups && downs, '①-4 낮게 출발하면 오르기만 · 높게 출발하면 내리기만(목표 쪽으로만 움직인다)');
}

console.log('② 겪은 일');
{
  process.env.T1134_C = '0.004';
  const G = 0.62, N = 40, D = HALF * 10 + 100;
  const base = run(0.7, D, G, N), hit = run(0.7, D, G, N, { day: 100, amt: 1 / N });
  ok(hit.tr[100] < base.tr[100] - 1e-6, '②-1 굶어 죽음 한 번(1/N) 넣은 날부터 h 가 대조보다 낮다', { base: +base.tr[100].toFixed(4), hit: +hit.tr[100].toFixed(4) });
  ok(Math.abs(hit.end - base.end) < 0.001, `②-2 ${D}날 뒤 같은 끝값으로 돌아온다(겪은 일은 반감기 30날로 사라진다)`, { base: +base.end.toFixed(6), hit: +hit.end.toFixed(6) });
  const v = { _H: 0.5, _t1134E: 0 };
  E.t1134Step(v, 0.5, 10, 1);
  ok(Math.abs(v._t1134E - 1 / E.t1197DieDays()) < 1e-12, '②-3 굶주림 날 하루(마을 전체) = 1/굶어 죽기까지 날(★[T1197] 켬 = 몸 정본 유도 · 끔 = 빚 죽음 문턱 14) — 그날에 한 사람 몫', { E: v._t1134E, die: E.t1197DieDays() });
}

console.log('③ 목표 식');
{
  const tg = (G, N, c) => { process.env.T1134_C = String(c); const v = { _H: 0.5, _t1134E: 0 }; return E.t1134Step(v, G, N, 0).target; };
  ok(Math.abs(tg(0.3, 50, 0.002) - (0.5 + 0.3 - 0.1)) < 1e-12, '③-1 h* = 0.5 + G − c·N (0.5 + 0.3 − 0.002 × 50 = 0.7)');
  ok(tg(0.3, 200, 0.002) < tg(0.3, 20, 0.002), '③-2 같은 좋은 것이면 큰 마을이 덜 행복하다(인구만큼 불만 · ㄱ 선형)');
  ok(tg(0.3, 200, 0) === tg(0.3, 20, 0), '③-3 c = 0 이면 인구 무관');
  ok(tg(2.0, 10, 0) === 1 && tg(0, 1000, 0.01) === 0, '③-4 0 ~ 1 로 자른다(위 상한을 닫는다)');
  delete process.env.T1134_C;
  ok(E.t1134C() === E.T1134_C_DEFAULT, '③-5 c 미설정 = 기본(★[T1147] 0.00741 — 판이 잰 값)');
}

console.log('④ econ 하루(tickVillage)');
{
  process.env.T1134_C = '0.004';
  E.setSeed(9);
  const v = E.createVillage({ name: '시험', initialPop: 30, fertility: 1, water: 0.3, game: 0.6, wood: 1, ore: 0.5, stone: 1 });
  let okRange = true;
  for (let d = 1; d <= 60; d++) { E.tickVillage(v, d); const h = v.lastStats && v.lastStats.happiness; if (!(h >= 0 && h <= 1)) okRange = false; }
  ok(okRange && v._H != null, '④-1 60날 내내 h 가 0 ~ 1 안 · 마을 칸 _H 가 선다', { h: v._H });
  ok(typeof v.lastStats.happinessGoods === 'number' && typeof v.lastStats.happinessEq === 'number', '④-2 좋은 것 · 목표 칸이 선다(계측)', { G: v.lastStats.happinessGoods, tgt: v.lastStats.happinessEq });
  const src = require('fs').readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
  ok(/T1134_HAPPY_TARGET && !\(stats\.happiness < T1134_EMIG_H\)\) _t1075Emig = 0/.test(src) && E.T1134_EMIG_H === 0.25, '④-3 이탈 압력은 h < 0.25 일 때만(그 위는 출생만 깎인다)');
  delete process.env.T1134_C;
}

console.log('⑤ 끔 = 종전 비트');
{
  const kid = (val) => { const env = Object.assign({}, process.env, { HC_CHILD: '1' }); delete env.T1134_HAPPY_TARGET; delete env.T1134_C; if (val !== undefined) env.T1134_HAPPY_TARGET = val;
    const r = spawnSync(process.execPath, [__filename], { env, encoding: 'utf8', maxBuffer: 1 << 26 }); return r.stdout; };
  const a = kid(undefined), b = kid('0'), c = kid('1');
  ok(a.length > 100 && a === c, '⑤-1 [T1147] 손잡이 없음 = `=1`(켬 기본 · 마을 이틀 바이트 같음)');
  ok(b !== a, '⑤-2 `=0` 은 다르다(되돌림 문이 산다 · 자명 통과 금지)');
  delete process.env.T1134_C;
  ok(E.t1134C() === 0.00741 && E.T1134_C_DEFAULT === 0.00741, '⑤-3 c 기본 0.00741(T1134 §5 · ★재민 11-04)');
  process.env.T1134_C = '0'; ok(E.t1134C() === 0, '⑤-4 `T1134_C=0` = 인구 항 없음'); delete process.env.T1134_C;
}

console.log(`\n=== T1134 수렴: 통과 ${pass} · 실패 ${fail} ===`);
process.exit(fail ? 1 : 0);
