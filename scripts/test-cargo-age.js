#!/usr/bin/env node
// @regress
// === scripts/test-cargo-age.js — 캐러밴 짐이 길 위에서 늙는다: 값으로 (T784 · 재민 10-14 · 손잡이 T784_CARGO_AGE · T795 켬 기본 · `=0` = 끔 = T784 앞 바이트) ===
//
// ★왜 T732 는 짐 로트를 관측만 했다(자리 = 몸에 지님 · 도착 때 f 를 값에 쓰는 것은 미뤘다). 생선을 열흘 길에 실어도 출발 결정은
//   도착지 값 그대로를 기대했고, 도착해서도 갓 잡은 값으로 팔았다. 켬이면 econ v2 세 자리가 **같은 곡선**(`spoil.freshnessOf` 정본)을 곱한다:
//   출발 결정(첫째 · 둘째 짐의 기대 값 — 다리 날 수) · 도착 매도(첫째 · 둘째 판 값 — 길 위 실제 날 수). 짐 수량은 그대로 곳간에 든다.
//
//  ① 손잡이 — 켬 기본(T795) · '0' 하나만 끔(없음 · '1' · 'true' = 켬 · 켬끼리 세계 지문 같다) · 끔은 세계를 바꾼다(자명 통과 금지)
//  ② 곡선 정본 — 늙는 품목(`lots.isLot`)은 `spoil.freshnessOf` 와 한 자리도 안 다르다 · 그 밖은 1 · 0 아래로 안 간다 · 날이 늘면 안 오른다
//  ③ 도착 날 셈 — 떠난 날부터 도착 날까지(우회로 늘어난 날까지 늙는다) · 이웃 존에서 넘어온 짐은 길 날 수 이상
//  ④ 배선 — 네 자리(첫째 · 둘째 기대 값 · 첫째 · 둘째 판 값) · 끔 갈래는 종전 식 글자 그대로 · 판 값은 장부 내려놓기 앞에서 센다 · 곳간 가산 줄 무변
//  ⑤ 켬 세계 — 도착 때 다 상한 짐(f = 0)을 싣고 떠난 캐러밴 0 · 늙는 짐의 도착 신선도(단위 가중)가 끔보다 낮지 않다
//  ⑥ 랩 번들 — 브라우저 꼴(vm · require 없음 · process 덧대기)로 띄운 번들이 정본과 같은 세계(끔 · 켬 두 판) · 두 랩 HTML 이 지금 번들을 싣는다
//
// 실행: node scripts/test-cargo-age.js
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const V2P = path.join(ROOT, 'sim', 'economy-sim-v2.js');
const BUNDLE = path.join(ROOT, 'sim', 'economy-engine.browser.js');

// ── 아이 판 — 손잡이를 env 로 주고 세계 지문 · 캐러밴 출발 표본을 낸다 ──
if (process.env.T784_SUB === 'world') {
  const E = require(V2P);
  const seed = +process.env.T784_SEED || 7, days = +process.env.T784_DAYS || 200;
  const w = E.createWorldV2({ seed, villageCount: 5, namePool: ['가', '나', '다', '라', '마'], infoRange: 5000, raidPer100: 0.005, picker: 'rational' });
  const seen = new Set(), dep = [];
  for (let d = 0; d < days; d++) {
    E.tickWorldV2(w);
    for (const c of w.caravans || []) {
      if (seen.has(c.id)) continue; seen.add(c.id);
      dep.push({ r: c.giveRes, n: c.giveAmt, t: c.travelDays, r2: c.giveRes2, n2: c.giveAmt2 });
    }
  }
  const fp = w.villages.map((v) => `${v.name}:${v.npcs.length}/f${Math.floor(v.storage.food)}/c${Math.round(v.storage.fish || 0)}`).join(' ');
  console.log(JSON.stringify({ on: E.T784_CARGO_AGE, fp, dep }));
  process.exit(0);
}
const KEEP = (() => { const e = Object.assign({}, process.env); delete e.T784_CARGO_AGE; delete e.T784_SUB; return e; })();
const sub = (knob, seed, days) => {
  const env = Object.assign({}, KEEP, { T784_SUB: 'world', T784_SEED: String(seed), T784_DAYS: String(days) });
  if (knob !== undefined) env.T784_CARGO_AGE = knob;
  try { return JSON.parse(execFileSync(process.execPath, [__filename], { env, stdio: 'pipe', maxBuffer: 64 << 20 }).toString().trim().split('\n').pop()); }
  catch (e) { return { err: String((e && e.message) || e).slice(0, 300) }; }
};

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const say = (m) => console.log(m);

say('=== 캐러밴 짐이 길 위에서 늙는다 — 값으로 (T784 · T795 켬 기본 · 되돌림 T784_CARGO_AGE=0) ===');

// ① 손잡이
say('\n① 손잡이 — 켬 기본(T795) · \'0\' 하나만 끔');
const U = sub('0', 7, 200), O = sub(undefined, 7, 200), T = sub('true', 7, 200), I = sub('1', 7, 200);
ok(!U.err && !O.err && !T.err && !I.err && U.on === false && O.on === true && T.on === true && I.on === true, '① \'0\' = 끔 · 없음 · \'true\' · \'1\' = 켬', [U, O, T, I].map((x) => x.err || x.on).join(' · '));
ok(O.fp && O.fp === T.fp && O.fp === I.fp && JSON.stringify(O.dep) === JSON.stringify(I.dep), '① 켬끼리 세계 지문 · 출발 표본 같다(200일)', O.fp);
ok(U.fp && U.fp !== O.fp, '① [자명 통과 금지] 끔(`=0`)은 세계를 바꾼다(T784 앞 세계)', U.fp);

// ② 곡선 정본
say('\n② 곡선 정본 — `spoil.freshnessOf` 하나 · 늙는 품목만');
const E = require(V2P), Spoil = require(path.join(ROOT, 'server', 'spoil')), Lots = require(path.join(ROOT, 'server', 'lots'));
const F = E._t784Probe && E._t784Probe.F, AR = E._t784Probe && E._t784Probe.arrive;
ok(typeof F === 'function' && typeof AR === 'function', '② 하네스 문(`_t784Probe.F` · `.arrive`)이 있다');
const ITEMS = Object.keys(E.ELASTICITY || {});
const lot = ITEMS.filter((r) => Lots.isLot(r)), non = ITEMS.filter((r) => !Lots.isLot(r));
const DAYS = [0, 0.5, 1, 2, 3, 5, 7, 10, 20, 45, 90, 200, 400];
let bad = [], mono = 0;
for (const r of lot) {
  let prev = 2;
  for (const d of DAYS) { const a = F(r, d), b = Math.max(0, Spoil.freshnessOf(r, d)); if (a !== b) bad.push(`${r}@${d}:${a}/${b}`); if (a > prev) mono++; prev = a; if (a < 0) bad.push(`${r}@${d}<0`); }
}
ok(lot.length > 20 && bad.length === 0 && mono === 0, `② 늙는 품목 ${lot.length}종 × ${DAYS.length}날 — 정본 곡선과 같다 · 날이 늘면 안 오른다 · 0 아래 없음`, bad.slice(0, 4).join(' '));
const nonBad = non.filter((r) => DAYS.some((d) => F(r, d) !== 1));
ok(non.length > 10 && nonBad.length === 0, `② 안 늙는 품목 ${non.length}종 — 늘 1(spoil 특산 기본 5일을 안 먹는다 · 돌 · 원석 · 도구 · 가죽 …)`, nonBad.slice(0, 5).join(' '));
ok(lot.includes('fish') && F('fish', 2) < 1 && F('fish', 30) === 0 && non.includes('stone') && F('stone', 400) === 1,
  '② 표본 — 생선 2일 < 1 · 30일 = 0 · 돌 400일 = 1', `생선 2일 ${F('fish', 2)} · 보관일 ${Spoil.shelfOf('fish')}`);

// ③ 도착 날 셈
say('\n③ 도착 날 셈 — 떠난 날부터 도착 날까지');
const r0 = lot.find((r) => Spoil.shelfOf(r) >= 10 && Spoil.shelfOf(r) <= 60) || 'vegetable';   // 7일에도 0 이 아닌 품목(생선 2.5일은 4일에 이미 0)
ok(AR({ departDay: 10 }, r0, 14) === F(r0, 4) && F(r0, 4) < 1, `③ 떠난 날 10 · 도착 14 → 4일 곡선(${r0} · 보관일 ${Spoil.shelfOf(r0)})`, `${AR({ departDay: 10 }, r0, 14)}`);
ok(AR({ departDay: 10 }, r0, 17) === F(r0, 7) && F(r0, 7) < F(r0, 4), '③ 우회로 늘어난 날까지 늙는다(7일 < 4일)', `${F(r0, 7)} < ${F(r0, 4)}`);
ok(AR({ departDay: 20, travelDays: 6, _xzHome: { zone: 'x', id: 1 } }, r0, 20) === F(r0, 6) && AR({ departDay: 20, travelDays: 2, _xzHome: {} }, r0, 25) === F(r0, 5),
  '③ 이웃 존에서 넘어온 짐 — 넘어온 날이 departDay 라 길 날 수 이상으로 센다');
ok(AR({ departDay: 10 }, 'stone', 99) === 1 && AR({ departDay: 10 }, r0, 9) === 1, '③ 안 늙는 품목 1 · 날이 거꾸로면 0일(1)');

// ④ 배선(소스)
say('\n④ 배선 — 네 자리 · 끔 갈래는 종전 식 그대로');
const src = fs.readFileSync(V2P, 'utf8');
ok(/const T784_CARGO_AGE = !\(typeof process !== 'undefined' && process\.env && process\.env\.T784_CARGO_AGE === '0'\);/.test(src), '④ 손잡이는 켬 기본 · 되돌림 `=== \'0\'` 하나(채택 꼴 — lab-wiring-check [F]④)');
const uses = (src.match(/T784_CARGO_AGE \?|if \(T784_CARGO_AGE\)/g) || []).length;
ok(uses === 4, '④ 손잡이를 읽는 자리 넷(첫째 · 둘째 기대 값 · 첫째 · 둘째 판 값)', `${uses}`);
ok(src.includes('_legProfitPerUnit(pFrom, T784_CARGO_AGE ? pTo * _t784F(cand.res, travelDaysForDistance(dist)) : pTo, transportCostPerUnit, expectedLossRatio)'),
  '④ 첫째 기대 값 — 도착 쪽 값 × 다리 날 수 신선도 · 끔 = `pTo`');
ok(src.includes("T784_CARGO_AGE ? ((b.prices && b.prices[c2.res]) || 0) * _t784F(c2.res, travelDaysForDistance(best.dist)) : ((b.prices && b.prices[c2.res]) || 0)"),
  '④ 둘째 기대 값 — 같은 수레(첫째의 거리) · 끔 = 종전 값');
const iG = src.indexOf('const grossCredit = T784_CARGO_AGE ? _impactSellV2(c.to, c.giveRes, deliveredGive) * _t784Arrive(c, c.giveRes, day) : _impactSellV2(c.to, c.giveRes, deliveredGive);');
const iU = src.indexOf("if (_LOTH) _LOTH.unload(c, 'give', c.to, c.giveRes, deliveredGive);");
const iG2 = src.indexOf('if (T784_CARGO_AGE) _gross2 *= _t784Arrive(c, c.giveRes2, day);');
const iU2 = src.indexOf("if (_LOTH) _LOTH.unload(c, 'give2', c.to, c.giveRes2, _delivered2);");
ok(iG > 0 && iU > iG && iG2 > 0 && iU2 > iG2, '④ 판 값 × 도착 신선도 — 첫째 · 둘째 · 장부 내려놓기 앞에서 센다');
ok(src.includes('c.to.storage[c.giveRes] = (c.to.storage[c.giveRes] || 0) + deliveredGive;') && src.includes('c.to.storage[c.giveRes2] = (c.to.storage[c.giveRes2] || 0) + _delivered2;'),
  '④ 곳간 가산 줄 무변 — 짐 수량은 그대로 든다(소멸 · 생성 0 · 상한 몫은 econ 상한 규칙)');
ok(!/granary-lots|_LOTH\.cargoFresh/.test(src.slice(src.indexOf('const T784_CARGO_AGE'), src.indexOf('function _t784Arrive') + 400)), '④ 값은 장부를 안 읽는다(T732 훅은 관측자 그대로 · 서버 = 랩 = CLI 한 식)');

// ⑤ 켬 세계
say('\n⑤ 켬 세계 — 다 상한 짐을 싣고 떠나지 않는다');
const stat = (X) => {
  let rot = 0, U = 0, W = 0, n = 0;
  for (const d of X.dep || []) {
    for (const [r, q] of [[d.r, d.n], [d.r2, d.n2]]) {
      if (!r || !(q > 0) || !Lots.isLot(r)) continue;
      const f = F(r, d.t); n++; U += q; W += q * f; if (f === 0) rot++;
    }
  }
  return { rot, n, f: U > 0 ? +(W / U).toFixed(4) : null, all: (X.dep || []).length };
};
const S7 = [stat(U), stat(O)];
const U42 = sub('0', 42, 200), O42 = sub(undefined, 42, 200);
const S42 = [stat(U42), stat(O42)];
ok(S7[1].rot === 0 && S42[1].rot === 0, '⑤ 켬 — 도착 때 f = 0 인 짐을 실은 출발 0(시드 7 · 42 · 200일)', `끔 ${S7[0].rot} · ${S42[0].rot} → 켬 ${S7[1].rot} · ${S42[1].rot}`);
ok(S7[1].f != null && S42[1].f != null && S7[1].f >= S7[0].f && S42[1].f >= S42[0].f, '⑤ 늙는 짐의 도착 신선도(단위 가중) 켬 ≥ 끔',
  `시드 7 ${S7[0].f} → ${S7[1].f}(짐 ${S7[0].n} → ${S7[1].n}) · 시드 42 ${S42[0].f} → ${S42[1].f}(짐 ${S42[0].n} → ${S42[1].n})`);

// ⑥ 랩 번들
say('\n⑥ 랩 번들 — 브라우저 꼴로 띄워도 정본과 같은 세계');
const bsrc = fs.readFileSync(BUNDLE, 'utf8');
ok(/modules\["spoil"\]=/.test(bsrc) && /modules\["lots"\]=/.test(bsrc) && /if\(\/\(\^\|\[\/\]\)spoil\$\/\.test\(p\)\)return modules\.spoil;/.test(bsrc), '⑥ 번들이 spoil · lots 를 싣고 `require` 를 그 둘로 잇는다');
const runB = (knob, seed, days) => {
  const ctx = { console: { log() {}, warn() {}, error() {} }, Math, Date, JSON };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.process = { env: knob ? { T784_CARGO_AGE: knob } : {} };
  vm.createContext(ctx); vm.runInContext(bsrc, ctx);
  const B = ctx.EconEngine;
  const w = B.createWorldV2({ seed, villageCount: 5, namePool: ['가', '나', '다', '라', '마'], infoRange: 5000, raidPer100: 0.005, picker: 'rational' });
  for (let d = 0; d < days; d++) B.tickWorldV2(w);
  return { on: B.T784_CARGO_AGE, fp: w.villages.map((v) => `${v.name}:${v.npcs.length}/f${Math.floor(v.storage.food)}/c${Math.round(v.storage.fish || 0)}`).join(' ') };
};
const B0 = runB('0', 7, 200), B1 = runB(null, 7, 200), B42 = runB(null, 42, 200);   // 덧대기 env 가 비면 켬(T795)
ok(B0.on === false && B0.fp === U.fp, '⑥ 끔 — 번들 세계 = 정본 세계(시드 7 · 200일)', B0.fp);
ok(B1.on === true && B1.fp === O.fp && B42.fp === O42.fp, '⑥ 켬 — 번들 세계 = 정본 세계(시드 7 · 42) — 곡선 표가 서버와 한 벌', B1.fp);
const body = bsrc.trim();
const labs = ['전쟁실험실.html', '마을실험실.html'].map((f) => fs.readFileSync(path.join(ROOT, 'lab', f), 'utf8'));
ok(labs.every((h) => h.includes(body.slice(0, 2000)) && h.includes(body.slice(-2000)) && h.includes('_t784Probe')), '⑥ 두 랩 HTML 이 지금 번들을 싣는다(재생성: `node sim/build-econ-bundle.js` → `node sim/inline-engine.js`)');

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
