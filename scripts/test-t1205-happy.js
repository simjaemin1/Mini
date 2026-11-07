#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1205-happy.js — T1205: 행복 = 천천히(0.5 + 좋은 것 − 겪은 일) − 그날 바로(c × 인구ᵃ ÷ 영토ᵇ) ==========
//
// ★[T1205 · ★재민 11-07 판정대기 문 32] 하네스가 지키는 것:
//   ⓪ 글자 — 손잡이 한 줄(켬 기본 · `=0` = T1134 그대로) · T1134 위에만 · 영토 문(호스트 `world.terrCells` · 바닥 = 창설 영토) · 서버가 영토를 준다 · war-core 승전 문
//   ① 식 — S 는 반감기 30날로 목표에 다가가고(0 ~ 1 로 안 자른다) · h = clip01(S − B) · B = c·Nᵃ/Tᵇ · 같은 날 인구가 바뀌면 h 가 그날 바뀐다(그날 바로)
//   ② 영토 — 영토가 넓으면 덜 불행 · "영토 100 에 10명 < 영토 1000 에 100명" 불행 · 바닥 = 창설 영토
//   ③ 겪은 일 — 부호 있음 · −0.2 ~ +1 로 자름 · 연승 픽스처: 승전을 몇 번 해도 S 의 목표 ≤ 0.5 + G + 0.2(행복 농사 상한)
//   ④ 효과 — 생산 배수 = 1 + 2W × max(0, h − 0.75)(0.75 밑 = 1 · h = 1 = 종전 최대 1 + W/2) · 떠나기 = N × k₂ × max(0, 0.25 − h)(k₂ = 하루 상한 ÷ 0.25)
//   ⑤ 몰아넣기(영토 100 셀에 100명) — 식: h 0 · 출생 최대에서도 순증 < 0 · 픽스처: 첫날 h < 0.25 · 떠남 · 부담 0 대조보다 적다 · 출생 ≤ 떠남
//   ⑥ 과잉 이탈 0 — 떠남 압력이 그날 필요한 수보다 커도 h 가 0.25 에 닿는 그 사람에서 멈춘다(한 사람 덜 떠나면 0.25 밑)
//   ⑦ 끔 — `T1205_HAPPY=0` 판은 다르다(되돌림 문이 산다) · 끔 판의 마을 칸에 T1205 칸이 안 선다
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

if (process.env.T1205_CHILD) {   // ⑦ 의 아이 — 마을 사흘 바이트
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  E.setSeed(5);
  const v = E.createVillage({ name: '시험', initialPop: 30, fertility: 1, water: 0.3, game: 0.6, wood: 1, ore: 0.5, stone: 1 });
  E.setSeed(42); for (let d = 1; d <= 3; d++) E.tickVillage(v, d);
  const o = {}; for (const k of ['storage', 'counts', 'lastStats', '_dPAccum', '_H', '_t1205S']) o[k] = v[k];
  process.stdout.write(JSON.stringify(o));
  process.exit(0);
}

for (const k of Object.keys(process.env)) if (/^T1205_/.test(k) || k === 'T1134_HAPPY_TARGET' || k === 'T1134_C') delete process.env[k];
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? '  ' + JSON.stringify(x) : '')); };
const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const WAR = fs.readFileSync(path.join(ROOT, 'sim', 'war-core.js'), 'utf8');
const VIL = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
const r4 = (x) => +(+x).toFixed(4);

console.log('⓪ 글자');
ok(E.T1205_HAPPY === true && E.T1134_HAPPY_TARGET === true, '⓪-1 켬 기본(손잡이 없는 판)');
ok(/const T1205_HAPPY = T1134_HAPPY_TARGET && !\(typeof process !== 'undefined' && process\.env && process\.env\.T1205_HAPPY === '0'\);/.test(SRC), '⓪-2 손잡이 한 줄 — T1134 위에만 · `=0` 만 끔');
ok(/if \(T1205_HAPPY\) \{[\s\S]{0,600}t1205Step\(v, _G, _homeN, _T, _hsh\)[\s\S]{0,400}\} else \{\s*const _r = t1134Step\(v, stats\.happiness, _homeN, _hsh\);/.test(SRC), '⓪-3 끔 = T1134 걸음 그대로(같은 자리 else)');
ok(/world\.terrCells = \(v\) => \{ const vil = state\.byEcon\.get\(v\); return vil && vil\._terrSet \? vil\._terrSet\.size : null; \};/.test(VIL), '⓪-4 서버가 영토(생활층 `_terrSet` 넓이)를 준다');
ok(/T1205_HAPPY: econ\.T1205_HAPPY, t1205Ev: econ\.t1205Ev/.test(VIL) && /FOOD\.t1205Ev\(A, -got \/ Math\.max\(feA, got\)\)/.test(WAR), '⓪-5 승전 = 좋은 일 — war-core 약탈 문 하나(빼앗아 온 식량 ÷ 우리 곳간) · 서버가 econ 문을 넘긴다');
{ const P = E.t1205Par(); ok(P.a === 2 && P.b === 0.5 && P.c === 0.0046 && P.luxW === 0.15 && Math.abs(P.k2 - 0.06 / 0.25) < 1e-12, '⓪-6 기본(보고 §2 판에서 고름) a = 2 · b = ½ · c = 0.0046 · 사치품 0.15 · k₂ = 하루 상한 0.06 ÷ 0.25(새 수 0)', P); }

console.log('① 식');
{
  const P = E.t1205Par(), HALF = E.t1134Half();
  const v = { _t1134E: 0 };
  let r = null; for (let d = 0; d < HALF * 10; d++) r = E.t1205Step(v, 0.8, 40, 4900, 0);
  ok(Math.abs(r.slow - 1.3) < 1e-6, '①-1 S 는 목표 0.5 + G(0.8) = 1.3 에 닿는다(0 ~ 1 로 안 자른다 — 위 몫은 부담이 깎는다)', { S: r4(r.slow) });
  ok(Math.abs(r.burden - P.c * 1600 / 70) < 1e-12 && Math.abs(r.h - Math.max(0, Math.min(1, r.slow - r.burden))) < 1e-12, '①-2 B = c × N² ÷ √T · h = clip01(S − B)', { B: r4(r.burden), h: r4(r.h) });
  const v2 = { _t1134E: 0, _t1205S: 0.5 }; E.t1205Step(v2, 0.8, 40, 4900, 0);
  ok(Math.abs(v2._t1205S - (1.3 + (0.5 - 1.3) * Math.pow(0.5, 1 / HALF))) < 1e-12, '①-3 S 는 반감기 30날 걸음(하루 남는 몫 ½^(1/30))', { S: r4(v2._t1205S) });
  const a = { _t1134E: 0, _t1205S: 1.2 }, b = { _t1134E: 0, _t1205S: 1.2 };
  const ra = E.t1205Step(a, 0.7, 120, 4900, 0), rb = E.t1205Step(b, 0.7, 60, 4900, 0);
  ok(Math.abs(ra.slow - rb.slow) < 1e-12 && rb.h - ra.h > 0.3, '①-4 그날 바로 — 같은 S 에서 인구가 절반이면 그날 h 가 오른다(부담만 다르다)', { h120: r4(ra.h), h60: r4(rb.h) });
}

console.log('② 영토');
{
  const B = (n, t) => E.t1205Burden(n, t);
  ok(B(100, 1000) > B(10, 100), '②-1 영토 1000 에 100명이 영토 100 에 10명보다 더 불행(★재민 11-07 글자)', { a: r4(B(10, 100)), b: r4(B(100, 1000)) });
  ok(B(100, 4000) < B(100, 1000), '②-2 같은 인구면 영토가 넓을수록 덜 불행');
  const v = E.createVillage({ name: '땅', initialPop: 10, fertility: 1, water: 0.5, game: 0.5, wood: 1, ore: 0.5, stone: 1 });
  const floor = v.land.baseSize * 25;
  v._world = { terrCells: () => 7 }; const t1 = E.t1205Terr(v);
  v._world = { terrCells: () => floor + 500 }; const t2 = E.t1205Terr(v);
  v._world = null; const t3 = E.t1205Terr(v);
  ok(t1 === floor && t2 === floor + 500 && t3 === Math.max(floor, v.land.size * 25), '②-3 영토 = 호스트 셀 수 · 바닥 = 창설 영토 · 호스트 없는 판 = econ 땅 넓이 × 25', { floor, t1, t2, t3 });
}

console.log('③ 겪은 일');
{
  const v = { _t1134E: 0 };
  E.t1205Ev(v, 3); ok(v._t1134E === E.T1205_E_MAX, '③-1 나쁜 일 상한 +1', v._t1134E);
  E.t1205Ev(v, -5); ok(v._t1134E === E.T1205_E_MIN, '③-2 좋은 일 바닥 −0.2', v._t1134E);
  const w = { _t1134E: 0, _t1205S: 0.6 }; let r = null;
  for (let d = 0; d < 400; d++) { E.t1205Ev(w, -0.15); r = E.t1205Step(w, 0.5, 30, 3600, 0); }
  ok(r.target <= 0.5 + 0.5 + 0.2 + 1e-12 && r.target > 0.5 + 0.5 + 0.15, '③-3 연승 픽스처(날마다 승전 400날) — 목표 ≤ 0.5 + G + 0.2(바닥 −0.2 가 행복 농사를 막는다)', { tgt: r4(r.target), E: r4(w._t1134E) });
  const u = { _t1134E: 0.5 }; E.t1205Step(u, 0.5, 30, 3600, 0);
  ok(Math.abs(u._t1134E - 0.5 * Math.pow(0.5, 1 / 30)) < 1e-12, '③-4 겪은 일은 반감기 30날로 사라진다(부호 무관 같은 걸음)');
}

console.log('④ 효과');
{
  ok(/_hwm = T1205_HAPPY \? 1 \+ 2 \* _hwW \* Math\.max\(0, v\.lastStats\.happiness - 0\.75\) : happyWorkMul\(v\.lastStats\.happiness, _hwW\);/.test(SRC), '④-1 생산 배수 = 1 + 2W × max(0, h − 0.75)(글자)');
  const mul = (h) => { const v = E.createVillage({ name: '일', initialPop: 20, fertility: 1, water: 0.5, game: 0.5, wood: 1, ore: 0.5, stone: 1 }); E.tickVillage(v, 1); v.lastStats.happiness = h; E.tickVillage(v, 2); return v._hwmLast; };
  const W = E.happyWorkWOf({});
  const m1 = mul(1), m75 = mul(0.75), m6 = mul(0.6), m9 = mul(0.9);
  ok(Math.abs(m1 - (1 + W / 2)) < 1e-12 && m75 === 1 && m6 === 1 && Math.abs(m9 - (1 + 2 * W * 0.15)) < 1e-12, '④-2 h 1 = 종전 최대 1 + W/2 · 0.75 · 0.6 = 1 · 0.9 = 1 + 2W·0.15(연속 · 경계에서 0 부터)', { m1, m75, m6, m9, W });
  ok(/if \(T1205_HAPPY\) _t1075Emig = _homeN \* t1205Par\(\)\.k2 \* Math\.max\(0, T1134_EMIG_H - stats\.happiness\);/.test(SRC), '④-3 떠나기 = 인구 × k₂ × max(0, 0.25 − h)(글자)');
}

// 픽스처 — 같은 econ 마을(비옥 3) · 창설 영토 100 셀(baseSize 4) · 영토는 호스트가 준다 · 떠남은 호스트가 받는다(세는 칸)
function fixture(T, days, env) {
  const keep = {}; for (const k in (env || {})) { keep[k] = process.env[k]; process.env[k] = env[k]; }
  E.setSeed(9);
  const v = E.createVillage({ name: '몰이', initialPop: 100, fertility: 3, water: 1, game: 1, wood: 1.5, ore: 0.5, stone: 1 });
  v.land.baseSize = 4;
  v.storage = { food: 6000, wood: 3000, tool: 100, clothes: 60 };
  const S = { out: 0, rows: [] };
  v._world = { terrCells: () => T, t1075Emigrate: () => { S.out++; return true; } };
  for (let d = 1; d <= days; d++) { const o0 = S.out, n0 = v.npcs.length; E.tickVillage(v, d); S.rows.push({ d, n: v.npcs.length, h: v.lastStats.happiness, S: v.lastStats.happinessSlow, happy: v._dpDebug.happy, out: S.out, born: Math.max(0, v.npcs.length - n0 + (S.out - o0)) }); }
  for (const k in keep) { if (keep[k] === undefined) delete process.env[k]; else process.env[k] = keep[k]; }
  return { v, S };
}
console.log('⑤ 몰아넣기 — 영토 100 셀에 100명');
{
  const P = E.t1205Par();
  //   식으로 — 판의 100명 마을 S(보고 §2 표 · 1.01)면 영토 100 셀에서 h = 0 · 출생 항 −0.3rN · 떠남 k₂·0.25·N ⇒ 로지스틱 최대(rN)를 더해도 순증 < 0
  const h100 = Math.max(0, Math.min(1, 1.01 - E.t1205Burden(100, 100, P))), r = 0.04;
  ok(h100 === 0 && r - 0.3 * r - P.k2 * 0.25 < 0, '⑤-1 식 — 100명 · 100 셀 · S 1.01 → h 0 · 출생 최대 r(1) − 0.3r − 떠남 k₂/4 < 0(어떤 K 에서도 순증 0)', { h100, net: +(r - 0.3 * r - P.k2 * 0.25).toFixed(4) });
  const { S } = fixture(100, 30), { S: S0 } = fixture(100, 30, { T1205_C: '0' });
  const first = S.rows[0], end = S.rows[S.rows.length - 1], end0 = S0.rows[S0.rows.length - 1];
  ok(first.h < 0.25 && first.happy < 0 && S.out > 20, '⑤-2 픽스처 첫날 h < 0.25 · 출생 항 음수 · 30날에 20명 넘게 떠남', { h: r4(first.h), happy: first.happy, out: S.out });
  ok(end.n < end0.n && S0.out === 0, '⑤-3 같은 마을 부담 0(c = 0) 대조보다 30날 인구가 적다 · 대조는 아무도 안 떠난다', { n: end.n, ctl: end0.n });
  const bornH = S.rows.reduce((a, x) => a + x.born, 0);
  ok(bornH <= S.out, '⑤-4 30날 출생 ≤ 떠남(순증 0)', { born: bornH, out: S.out });
}

console.log('⑥ 과잉 이탈 0 — 0.25 에 닿는 사람에서 멈춘다');
{
  process.env.T1205_K2 = '50';   // 압력을 크게(필요 수보다 많이 떠나려 한다)
  const P = E.t1205Par();
  E.setSeed(9);
  const v = E.createVillage({ name: '멈춤', initialPop: 80, fertility: 3, water: 1, game: 1, wood: 1.5, ore: 0.5, stone: 1 });
  v.land.baseSize = 4;
  let out = 0, nLast = 0; v._world = { terrCells: () => 900, t1075Emigrate: (vv) => { out++; nLast = vv.npcs.length; return true; } };   // 떠나는 순간의 인구(그 사람 포함)
  v.storage.food = 20000; v.storage.wood = 5000;
  E.tickVillage(v, 1);
  const n1 = nLast - 1, S1 = v._t1205S, T = 900;   // 마지막 사람이 떠난 뒤 인구(그날 다른 일 앞)
  const hAfter = Math.max(0, Math.min(1, S1 - E.t1205Burden(n1, T, P))), hOneLess = Math.max(0, Math.min(1, S1 - E.t1205Burden(n1 + 1, T, P)));
  ok(out > 0 && (v._t1205Stop || 0) === 1, '⑥-1 그날 떠남이 필요 수에서 멈췄다(멈춤 칸 1)', { out, n1 });
  ok(hAfter >= 0.25 - 1e-9 && hOneLess < 0.25, '⑥-2 떠난 뒤 h ≥ 0.25 · 한 사람 덜 떠났으면 0.25 밑(필요한 수만큼만)', { hAfter: r4(hAfter), hOneLess: r4(hOneLess) });
  ok(E.t1205NeedOut({ _t1205S: 0.2 }, 50, 900) === Infinity, '⑥-3 S < 0.25 면(좋은 것 · 겪은 일 탓) 떠나도 안 오른다 — 멈춤 수 없음(압력 식만)');
  delete process.env.T1205_K2;
}

console.log('⑦ 끔');
{
  const kid = (val) => { const env = Object.assign({}, process.env, { T1205_CHILD: '1' }); delete env.T1205_HAPPY; if (val !== undefined) env.T1205_HAPPY = val;
    return spawnSync(process.execPath, [__filename], { env, encoding: 'utf8', maxBuffer: 1 << 26 }).stdout; };
  const on = kid(undefined), on1 = kid('1'), off = kid('0');
  ok(on.length > 100 && on === on1, '⑦-1 손잡이 없음 = `=1`(켬 기본 · 마을 사흘 바이트 같음)');
  ok(off !== on, '⑦-2 `=0` 은 다르다(되돌림 문이 산다 · 자명 통과 금지)');
  const o = JSON.parse(off);
  ok(o._t1205S === undefined && o.lastStats && o.lastStats.happinessBurden === undefined, '⑦-3 끔 판엔 T1205 칸이 안 선다(T1134 그대로)');
}

console.log(`\n=== T1205 행복 식: 통과 ${pass} · 실패 ${fail} ===`);
process.exit(fail ? 1 : 0);
