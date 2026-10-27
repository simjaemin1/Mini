#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t931-slotk-ema.js — 식량 자리 K 에도 신뢰 관성(T931 ① · ★T943 `'season'` 켬 기본) ===
//
// ★[T931 2026-10-26 · T924 회부 2-ⓐ · 재민 10-24 "창고에 식량이 있는데 자유민이 그렇게 빨리 죽어?"]
//   K = min(식량 자리 slotK · 식량 흐름 prodK · 땔감 fuelK) 중 prodK(EMA 0.97) · fuelK(EMA 0.98)는 신뢰 관성을 갖는데 slotK 만 계절 땅 배수
//   (v2 `applyLandModifiers` — `SEASON_MULT.winter`)를 그날 그대로 받아 12월 1일 K 가 하루에 떨어진다(보고 T924 §2-b).
//   손잡이 `T931_SLOTK_EMA` — ★[T943] 켬 기본 = `'season'`(미설정 · 그 밖 · 브라우저) · 되돌림 `'0'` = 끔 = 종전 바이트 · `'1'` = 값 전체(남김):
//     켜면 K 에 드는 slotK 가 땔감 K 와 같은 꼴 · 같은 수(0.98 · 0.02)의 관성을 갖는다(`'1'` 값 전체 · `'season'` 땅 배수 몫만).
// 재는 것 (손잡이는 모듈 상수라 팔마다 아이 프로세스 · 포트 0 · 서버 안 띄움)
//   ⓐ 끔(`'0'`) = 종전 — 새 칸 0(`_slotKema` · `_slotKfEma` · `_kDbg.slotRaw` 없음) · `_kDbg.slot` = 그날 자리(`totalFoodSlots`) ·
//      ★[T943] 켬 기본 짝: 손잡이 없음 · `''` · `'x'`(그 밖) 셋 = `'season'` 판과 마을 상태 JSON 한 글자 같다 · `'0'` 판과는 갈린다
//   ⓑ 켬 — 첫날 관성 = 그날 자리(늦음 0) · 날마다 `_slotKema` = 0.98 × 어제 + 0.02 × 그날 자리(땔감 K 줄의 그 수 — 정본 글자를 읽는다) · `_kDbg.slot` = 그 값 · `slotRaw` = 그날 자리
//   ⓒ 겨울 계단 — v2 글자에서 읽은 `SEASON_MULT.winter`(물 · 사냥감 · 지력 …)로 `applyLandModifiers` 꼴 그대로 땅을 바꿔 90일:
//      끔 = 겨울 첫날 slot 이 그날 자리로 떨어진다(계단) · 켬 = 첫날 slot 은 어제 값의 98% + 그날 자리의 2% · 90일 동안 계단 몫의 남은 비 ≈ 0.98^일
//   ⓓ 켬 — K = max(POP_MIN, min(slot, prod, fuel)) 그대로(K 식 무변 — 관성은 slot 칸에만)
//   ⓔ 자리가 그대로인 판(계절 · 확장 없는 400일)엔 켬 = 끔 — 새 칸 둘(`_slotKema` · `_kDbg.slotRaw`) 빼고 상태 JSON 한 글자 같다
//   ⓕ 정적 — 되돌림 `=== '0'` · `'1'` · 켬 기본(`!OFF && !EMA`) 한 자리씩 · 랩 배선 ④ 채택 손잡이 표에 이름 · 관성 줄의 수 = `_fuelKema` 줄의 수 · 자리를 쓰는 다른 문(`tryExpandTerritory` 의 `totalFoodSlots(v)` · `jobCapacity`) 글자 무변 ·
//      `_kDbg` 줄 글자 무변(`t264-arm` 닻) · 번들 · 랩 둘에 같은 줄
//   ⓖ `'season'` — 같은 관성을 땅 배수의 몫에만: 날마다 f = 그날 자리 ÷ 원래 땅의 자리(그날 size) · `_slotKfEma` = 0.98 × 어제 + 0.02 × f · slot = 원래 땅의 자리 × 관성 f ·
//      배수가 없는 판(`_origLand` 없음 — 400일)은 f = 1 → 끔과 같은 마을(새 칸 둘 빼고) · 겨울 첫날 slot > 그날 자리 ·
//      영토가 는 날(겨울 50일째 size +10 — `tryExpandTerritory` 가 그날 땅의 size 를 바꾸는 꼴)은 원래 땅의 자리가 그날 바로 따라간다(`'1'` 은 관성으로 천천히)
//
// 실행: node scripts/test-t931-slotk-ema.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SIM = path.join(ROOT, 'sim', 'economy-sim.js');
const V2SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim-v2.js'), 'latin1');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };

//   v2 `SEASON_MULT` 를 글자에서 읽는다(옮겨 적지 않는다 — 겨울 · 봄 줄)
function seasonRow(name) {
  const m = new RegExp(name + ': \\{([^}]*)\\}').exec(V2SRC);
  if (!m) return null;
  const o = {}; for (const kv of m[1].split(',')) { const [k, x] = kv.split(':').map((s) => s.trim()); if (k) o[k] = +x; }
  return o;
}
const WINTER = seasonRow('winter'), SPRING = seasonRow('spring');

// 아이: 마을 하나 400일(땅 그대로) → mode 'season' 이면 겨울 90일(v2 `applyLandModifiers` 꼴 · 끝에 `restoreLand` 꼴로 size 를 원래 땅에 옮김) → 봄 30일
const CHILD = `
const v1 = require(${JSON.stringify(SIM)});
const mode = process.argv[1], W = JSON.parse(process.argv[2]), S = JSON.parse(process.argv[3]);
const v = v1.createVillage({ initialPop: 20, name: 'p', wood: 0.45 });
const rows = [];
const KEYS = ['fertility', 'water', 'game', 'wood', 'stone', 'ore'];
//   v2 \`applyLandModifiers\` · \`restoreLand\` 그대로(원래 땅은 \`v._origLand\` · 틱 뒤 size · baseSize 를 원래 땅에 옮기고 지운다)
function day(d, mult, grow) {
  if (mult) { if (!v._origLand) v._origLand = { ...v.land }; const orig = v._origLand; const L = { ...orig }; for (const k of KEYS) L[k] = orig[k] * (mult[k] || 1); v.land = L; }
  if (grow) v.land.size += grow;   // 영토가 는 날(\`tryExpandTerritory\` 가 그날 땅의 size 를 바꾸는 꼴 — 틱 뒤 원래 땅으로 옮겨진다)
  const e0 = v._slotKema, f0 = v._slotKfEma;
  let base = null;   // 원래 땅(그날 size)의 자리 — 'season' 검사용(정본 함수를 원래 땅으로 · 틱 앞)
  if (v._origLand) { const L = v.land; v.land = Object.assign({}, v._origLand, { size: L.size, baseSize: L.baseSize }); base = v1.totalFoodSlots(v); v.land = L; } else base = v1.totalFoodSlots(v);
  v1.tickVillage(v, d);
  const raw = v1.totalFoodSlots(v);   // 그날 땅(계절 배수가 걸린 채)으로 다시 센 자리 — 확장은 K 앞에서 돈다(tickVillage 안 차례)
  const kd = v._kDbg || {}, dp = v._dpDebug || {};
  rows.push([d, v.npcs.length, v._deathsToday || 0, dp.K, kd.slot, raw, v._slotKema === undefined ? null : v._slotKema, e0 === undefined ? null : e0, kd.prod, kd.fuel, kd.slotRaw === undefined ? null : kd.slotRaw, v.land.size, mult ? 1 : 0,
    base, v._slotKfEma === undefined ? null : v._slotKfEma, f0 === undefined ? null : f0]);
  if (mult) { v._origLand.size = v.land.size; v._origLand.baseSize = v.land.baseSize; v.land = v._origLand; v._origLand = null; }
}
for (let d = 1; d <= 400; d++) day(d, null);
const st400 = JSON.stringify(v, (k, x) => (typeof x === 'function' || k === '_world') ? undefined : x);
if (mode === 'season') { for (let d = 401; d <= 490; d++) day(d, W, d === 450 ? 10 : 0); for (let d = 491; d <= 520; d++) day(d, S); }
const st = JSON.stringify(v, (k, x) => (typeof x === 'function' || k === '_world') ? undefined : x);
console.log(JSON.stringify({ rows, st400, st, popMin: v1.POP_MIN != null ? v1.POP_MIN : null }));
`;
function run(env, mode) {
  const e = Object.assign({}, process.env); delete e.T931_SLOTK_EMA; Object.assign(e, env);
  const out = execFileSync(process.execPath, ['-e', CHILD, mode, JSON.stringify(WINTER), JSON.stringify(SPRING)], { env: e, encoding: 'utf8', maxBuffer: 1 << 28 });
  return JSON.parse(out.trim().split('\n').pop());
}
const S = fs.readFileSync(SIM, 'utf8');
const C = { d: 0, pop: 1, deaths: 2, K: 3, slot: 4, raw: 5, ema: 6, ema0: 7, prod: 8, fuel: 9, slotRaw: 10, size: 11, win: 12, base: 13, fema: 14, fema0: 15 };
const r1 = (x) => +(+x).toFixed(1);
const POPMIN = +(/const POP_MIN = ([0-9.]+)/.exec(S) || [])[1];
//   땔감 K 줄의 관성 수(정본 글자를 읽는다)
const FM = /v\._fuelKema = v\._fuelKema === undefined \? _fuelKraw : ([0-9.]+) \* v\._fuelKema \+ ([0-9.]+) \* _fuelKraw;/.exec(S);
const KEEP = FM ? +FM[1] : NaN, TAKE = FM ? +FM[2] : NaN;

console.log(`(겨울 배수 ${JSON.stringify(WINTER)} · 봄 ${JSON.stringify(SPRING)} — v2 글자 · 땔감 관성 ${KEEP} · ${TAKE} — 땔감 줄 글자 · POP_MIN ${POPMIN})`);
ok(WINTER && WINTER.water < 1 && WINTER.game < 1 && SPRING, 'v2 `SEASON_MULT` 겨울 · 봄 줄을 글자에서 읽었다');
ok(Number.isFinite(KEEP) && Number.isFinite(TAKE) && Math.abs(KEEP + TAKE - 1) < 1e-12, '땔감 K 관성 줄(`_fuelKema`)의 두 수를 글자에서 읽었다(합 1)', `${KEEP} · ${TAKE}`);

console.log('ⓐ 끔(\'0\') = 종전 · 켬 기본 짝 — 손잡이 없음 · \'\' · \'x\' = \'season\' (400일 + 겨울 90일 + 봄 30일)');
const off = run({ T931_SLOTK_EMA: '0' }, 'season');
ok(!/"_slotKema"/.test(off.st) && !/"_slotKfEma"/.test(off.st) && !/"slotRaw"/.test(off.st), "끔('0') — 새 칸 0(`_slotKema` · `_slotKfEma` · `_kDbg.slotRaw` 없음)");
ok(off.rows.every((r) => r[C.slot] === r1(r[C.raw]) && r[C.ema] === null && r[C.fema] === null && r[C.slotRaw] === null), "끔('0') — 날마다 `_kDbg.slot` = 그날 자리(`totalFoodSlots`) 그대로", `${off.rows.length}날`);
const def = run({}, 'season'), defE = run({ T931_SLOTK_EMA: '' }, 'season'), defX = run({ T931_SLOTK_EMA: 'x' }, 'season'), seA = run({ T931_SLOTK_EMA: 'season' }, 'season');
ok(def.st === seA.st && defE.st === seA.st && defX.st === seA.st, "★[T943] 켬 기본 — 손잡이 없음 · '' · 'x' 셋이 'season' 판과 마을 상태 JSON 한 글자 같다", `${seA.st.length} B`);
ok(def.st !== off.st, "켬 기본 판은 끔('0') 판과 갈린다(되돌림이 산다)", '');

console.log('ⓑ 켬 — 첫날 = 그날 자리 · 날마다 0.98 × 어제 + 0.02 × 그날 자리');
const on = run({ T931_SLOTK_EMA: '1' }, 'season');
{
  const r0 = on.rows[0];
  ok(r0[C.ema0] === null && r0[C.ema] === r0[C.raw], '첫날 관성 = 그날 자리(늦음 0)', `자리 ${r0[C.raw]} · 관성 ${r0[C.ema]}`);
  let bad = 0, badDbg = 0, badRaw = 0;
  for (const r of on.rows.slice(1)) {
    const want = KEEP * r[C.ema0] + TAKE * r[C.raw];
    if (r[C.ema] !== want) bad++;
    if (r[C.slot] !== r1(r[C.ema])) badDbg++;
    if (r[C.slotRaw] !== r1(r[C.raw])) badRaw++;
  }
  ok(bad === 0, `날마다 \`_slotKema\` = ${KEEP} × 어제 + ${TAKE} × 그날 자리(같은 연산 · 한 비트 같음)`, `틀린 날 ${bad} / ${on.rows.length - 1}`);
  ok(badDbg === 0 && badRaw === 0, '`_kDbg.slot` = 관성 값(K 에 든 값) · `_kDbg.slotRaw` = 그날 자리', `slot 틀림 ${badDbg} · slotRaw 틀림 ${badRaw}`);
}

console.log('ⓒ 겨울 계단 — 땅이 겨울 배수로 바뀐 첫날 · 90일');
{
  const w0off = off.rows.find((r) => r[C.d] === 401), w0on = on.rows.find((r) => r[C.d] === 401), pOn = on.rows.find((r) => r[C.d] === 400), pOff = off.rows.find((r) => r[C.d] === 400);
  ok(w0off[C.raw] < pOff[C.raw], '겨울 땅이 그날 자리를 줄인다(이 마을 — 계단이 있는 판)', `${pOff[C.raw]} → ${w0off[C.raw]}`);
  ok(w0off[C.slot] === r1(w0off[C.raw]), '끔 — 겨울 첫날 slot 이 그날 자리로 떨어진다(계단)', `${pOff[C.slot]} → ${w0off[C.slot]}`);
  ok(w0on[C.ema] === KEEP * pOn[C.ema] + TAKE * w0on[C.raw] && w0on[C.ema] > w0on[C.raw], '켬 — 겨울 첫날 slot = 어제 관성의 98% + 그날 자리의 2%(그날 자리보다 높다)', `${r1(pOn[C.ema])} → ${r1(w0on[C.ema])} (그날 자리 ${w0on[C.raw]})`);
  //   계단 몫의 남은 비 — 자리가 겨울 내내 그대로인 날들(확장 없는 날)엔 (관성 − 자리) / (겨울 앞 관성 − 자리) = 0.98^일
  const win = on.rows.filter((r) => r[C.win] && r[C.d] < 450), raw0 = win[0][C.raw], flat = win.every((r) => r[C.raw] === raw0);   // 영토가 느는 50일째(450) 앞까지
  if (flat) {
    const last = win[win.length - 1], n = last[C.d] - 400, want = Math.pow(KEEP, n), got = (last[C.ema] - raw0) / (pOn[C.ema] - raw0);
    ok(Math.abs(got - want) < 1e-9, `겨울 ${n}일 뒤 계단 몫의 남은 비 = ${KEEP}^${n}`, `${got.toFixed(6)} · ${want.toFixed(6)}`);
  } else ok(true, '겨울 동안 자리가 바뀌었다(확장) — 닫힌 꼴 대신 ⓑ 의 날마다 식으로 갈음', '');
  const offK0 = w0off[C.K], onK0 = w0on[C.K];
  ok(onK0 >= offK0, '켬 — 겨울 첫날 K 가 끔보다 낮지 않다(같은 마을 · 그날 자리보다 높은 slot)', `끔 ${offK0} · 켬 ${onK0}`);
}

console.log('ⓓ 켬 — K = max(POP_MIN, min(slot, prod, fuel)) 그대로');
{
  let bad = 0;
  //   prod · fuel 은 `_kDbg` 의 한 자리 반올림 · K 도 한 자리 반올림 — 두 반올림(0.05 + 0.05) 안에서 같으면 같은 식이다
  for (const r of on.rows) { const want = Math.max(POPMIN, Math.min(r[C.ema], r[C.prod], r[C.fuel])); if (Math.abs(r[C.K] - want) > 0.1 + 1e-9) bad++; }
  ok(bad === 0, 'K 식 무변 — 관성은 slot 칸에만', `틀린 날 ${bad} / ${on.rows.length}`);
}

console.log('ⓔ 자리가 그대로인 판(계절 없는 400일) — 켬 = 끔(새 칸 둘 빼고)');
{
  const strip = (s) => { const o = JSON.parse(s); delete o._slotKema; if (o._kDbg) delete o._kDbg.slotRaw; return JSON.stringify(o); };
  const rawFlat = on.rows.filter((r) => r[C.d] <= 400).every((r) => r[C.raw] === on.rows[0][C.raw]);
  ok(rawFlat, '이 판 400일 동안 그날 자리가 한 번도 안 바뀌었다(계절 · 확장 0 — 견줄 수 있는 판)', `자리 ${on.rows[0][C.raw]}`);
  ok(strip(on.st400) === strip(off.st400), '400일 마을 상태 — 켬 = 끔(`_slotKema` · `_kDbg.slotRaw` 빼고 한 글자 같다)', `${off.st400.length} B`);
  ok(on.st !== off.st, '겨울을 지난 판은 갈린다(관성이 K 에 닿았다)', '');
}

console.log('ⓕ 정적');
{
  const knobO = S.match(/const T931_SLOTK_OFF = [^\n]*/g) || [], knob = S.match(/const T931_SLOTK_EMA = [^\n]*/g) || [], knobS = S.match(/const T931_SLOTK_SEASON = [^\n]*/g) || [];
  ok(knobO.length === 1 && /process\.env\.T931_SLOTK_EMA === '0'\)/.test(knobO[0]), "★[T943] 되돌림 `=== '0'` 한 자리(끔 = 종전 바이트)", knobO[0] ? knobO[0].slice(0, 110) : '없음');
  ok(knob.length === 1 && /^const T931_SLOTK_EMA = !T931_SLOTK_OFF && \(.*process\.env\.T931_SLOTK_EMA === '1'\);/.test(knob[0]), "`'1'` = 값 전체 한 자리(끔이 먼저)", knob[0] ? knob[0].slice(0, 110) : '없음');
  ok(knobS.length === 1 && /^const T931_SLOTK_SEASON = !T931_SLOTK_OFF && !T931_SLOTK_EMA;/.test(knobS[0]), "★[T943] 켬 기본 = `'season'`(끔도 `'1'` 도 아니면 — 미설정 · 그 밖 · 브라우저)", knobS[0] ? knobS[0].slice(0, 120) : '없음');
  let W = ''; try { W = fs.readFileSync(path.join(ROOT, 'scripts', 'lab-wiring-check.js'), 'utf8'); } catch (e) { W = ''; }
  ok(/'T931_SLOTK_EMA'\]\) \{/.test(W), '랩 배선 ④ 채택 손잡이 표에 `T931_SLOTK_EMA`(채택분은 `=== \'0\'` 되돌림 꼴 — 배선 검사가 번들 글자로 본다)');
  const sl = /v\._slotKfEma = v\._slotKfEma === undefined \? f : ([0-9.]+) \* v\._slotKfEma \+ ([0-9.]+) \* f;/.exec(S);
  ok(!!sl && +sl[1] === KEEP && +sl[2] === TAKE, "'season' 관성 줄의 수 = 땔감 K 줄의 수(새 수 0)", sl ? `${sl[1]} · ${sl[2]}` : '줄 없음');
  const line = /const slotK = T931_SLOTK_EMA \? \(v\._slotKema = v\._slotKema === undefined \? _slotKraw : ([0-9.]+) \* v\._slotKema \+ ([0-9.]+) \* _slotKraw\) : T931_SLOTK_SEASON \? _t931SeasonSlot\(v, _slotKraw\) : _slotKraw;/.exec(S);
  ok(!!line && +line[1] === KEEP && +line[2] === TAKE, '관성 줄의 수 = 땔감 K 줄의 수(새 수 0)', line ? `${line[1]} · ${line[2]}` : '줄 없음');
  ok((S.match(/const _slotKraw = totalFoodSlots\(v\);/g) || []).length === 1, 'K 자리는 정본 자리 함수 그대로(`totalFoodSlots(v)` 한 번)');
  const exp = /function tryExpandTerritory\(v, day\) \{[\s\S]{0,200}?const slotK = totalFoodSlots\(v\);\n  if \(N \/ Math\.max\(1, slotK\) < 0\.85\) return;/.test(S);
  ok(exp, '영토 확장 판단은 그날 자리 그대로(`tryExpandTerritory` 글자 무변)');
  ok(/function totalFoodSlots\(v\) \{\n  const c = jobCapacity\(v\);\n  return c\.farmer \+ c\.fisher \+ c\.hunter \+ Math\.floor\(c\.forager \* 0\.5\);\n\}/.test(S), '자리 함수 글자 무변(`totalFoodSlots`)');
  ok(S.includes("  v._kDbg = { slot: +slotK.toFixed(1), prod: +prodK.toFixed(1), fuel: +fuelK.toFixed(1) };   // ★K 분해 노출"), '`_kDbg` 줄 글자 무변(`t264-arm` 닻)');
  const srcN = (S.match(/T931_SLOTK_EMA/g) || []).length;
  for (const f of ['sim/economy-engine.browser.js', 'lab/마을실험실.html', 'lab/전쟁실험실.html']) {
    let t = ''; try { t = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { t = ''; }
    const n = (t.match(/T931_SLOTK_EMA/g) || []).length, has = line && t.includes(line[0]);
    ok(n === srcN && has, `${f} — 같은 줄(손잡이 글자 ${n} · 정본 ${srcN} · 관성 줄 있음)`);
  }
}

console.log("ⓖ 'season' — 같은 관성을 땅 배수의 몫에만");
{
  const se = run({ T931_SLOTK_EMA: 'season' }, 'season');
  const strip = (s, k) => { const o = JSON.parse(s); delete o[k]; if (o._kDbg) delete o._kDbg.slotRaw; return JSON.stringify(o); };
  ok(strip(se.st400, '_slotKfEma') === strip(off.st400, '_slotKfEma'), "배수가 없는 400일(`_origLand` 없음 · f = 1) — 'season' = 끔(`_slotKfEma` · `_kDbg.slotRaw` 빼고 한 글자 같다)", `${off.st400.length} B`);
  ok(se.rows.filter((r) => r[C.d] <= 400).every((r) => r[C.fema] === 1 && r[C.slot] === r1(r[C.raw])), "배수가 없는 날 관성 f = 1 · slot = 그날 자리", '');
  let bad = 0, badS = 0;
  for (const r of se.rows.slice(1)) {
    const f = r[C.base] > 0 ? r[C.raw] / r[C.base] : 1, want = r[C.fema0] === null ? f : KEEP * r[C.fema0] + TAKE * f;
    if (r[C.fema] !== want) bad++;
    if (Math.abs(r[C.slot] - r1(r[C.base] * r[C.fema])) > 1e-9) badS++;
  }
  ok(bad === 0, `날마다 \`_slotKfEma\` = ${KEEP} × 어제 + ${TAKE} × (그날 자리 ÷ 원래 땅의 자리)`, `틀린 날 ${bad} / ${se.rows.length - 1}`);
  ok(badS === 0, 'slot(K 에 든 값) = 원래 땅의 자리 × 관성 f', `틀린 날 ${badS}`);
  const w0 = se.rows.find((r) => r[C.d] === 401);
  ok(w0[C.raw] < w0[C.base] && w0[C.slot] > w0[C.raw], '겨울 첫날 — 그날 자리 < 원래 땅의 자리 · slot 은 그날 자리보다 높다(관성)', `그날 ${w0[C.raw]} · 원래 ${w0[C.base]} · slot ${w0[C.slot]}`);
  //   영토가 는 날(450) — 'season' 은 원래 땅의 자리가 그날 바로 따라간다 · '1' 은 관성(0.02 몫)으로
  const g = (R, d) => R.find((r) => r[C.d] === d);
  const s49 = g(se.rows, 449), s50 = g(se.rows, 450), o49 = g(on.rows, 449), o50 = g(on.rows, 450), f49 = g(off.rows, 449), f50 = g(off.rows, 450);
  ok(s50[C.base] > s49[C.base] && f50[C.raw] > f49[C.raw], '영토가 는 날 — 원래 땅의 자리 · 그날 자리가 는다(size +10)', `원래 ${s49[C.base]} → ${s50[C.base]} · 그날(끔) ${f49[C.raw]} → ${f50[C.raw]}`);
  const jumpS = s50[C.slot] - s49[C.slot], jumpO = o50[C.slot] - o49[C.slot], jumpF = f50[C.slot] - f49[C.slot];
  ok(jumpS > 0.8 * (s50[C.base] - s49[C.base]) * s50[C.fema] && jumpO < 0.1 * jumpF, "'season' 은 그날 바로(원래 땅 자리의 는 몫 × 관성 f) · '1' 은 관성으로(끔이 는 몫의 0.1 아래)", `'season' +${jumpS.toFixed(2)} · '1' +${jumpO.toFixed(2)} · 끔 +${jumpF.toFixed(2)}`);
  ok(se.st !== off.st && se.st !== on.st, "'season' 판은 끔 · '1' 과 갈린다(관성이 K 에 닿았다)", '');
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
