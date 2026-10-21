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
//  ⑤ 켬 세계 — 도착 때 다 상한 짐(f = 0)을 싣고 떠난 캐러밴 0
//     ★[T812] "늙는 짐의 도착 신선도(단위 가중) 켬 ≥ 끔" 은 **재기만** 한다(판정 줄에서 내렸다) — 끔 세계 · 켬 세계의 **서로 다른 출발 묶음**을 견주는 수라
//       세계에 기댄다: T784 만(T792 와 같이 착지한 main) 시드 7 0.8214 → 0.8131 · T812 켬 시드 7 0.8214 → 0.8728 인데 시드 42 0.9930 → 0.9928(보고/T812 §3).
//       세계에 안 기대는 몫(f = 0 짐 출발 0 · 기대 값의 곱 = 도착 값의 곱 · 곡선 정본)은 위아래 줄이 잰다.
//  ⑥ 랩 번들 — 브라우저 꼴(vm · require 없음 · process 덧대기)로 띄운 번들이 정본과 같은 세계(끔 · 켬 두 판) · 두 랩 HTML 이 지금 번들을 싣는다
//  ⑦ [T812 · 손잡이 T812_CARGO_TEMP · T820 켬 기본 · '0' 하나만 끔] 장부 시계 — 다리 나이 = 그 날들의 기온 가중 노출(`spoil.dayExposure` 합 = `cumExposure` 차) ·
//     끔이면 떠난 날을 받아도 날 수 그대로(바이트) · 켬이면 출발 결정 · 도착 매도 둘 다 같은 노출 · 번들(날씨 정본 실음) = 정본
//  ★[T820] 부모 판은 늘 기본(켬 · 켬)으로 돈다 — 손잡이 env 를 지우고 정본을 부른다. 끔 쪽은 아이 판이 잰다.
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
  //   ★[T840] 고도 주입(하네스 전용 — 호스트 지형층 훅 `land.elev` 자리 · 마을마다 km) — 지금 세계엔 그 값을 넣는 호스트가 없다(늘 0)
  if (process.env.T784_ELEV) { const L = String(process.env.T784_ELEV).split(',').map(Number); w.villages.forEach((v, i) => { v.land = v.land || {}; v.land.elev = L[i % L.length]; }); }
  const seen = new Set(), dep = [];
  for (let d = 0; d < days; d++) {
    E.tickWorldV2(w);
    for (const c of w.caravans || []) {
      if (seen.has(c.id)) continue; seen.add(c.id);
      dep.push({ r: c.giveRes, n: c.giveAmt, t: c.travelDays, r2: c.giveRes2, n2: c.giveAmt2, d0: c.departDay });
    }
  }
  const fp = w.villages.map((v) => `${v.name}:${v.npcs.length}/f${Math.floor(v.storage.food)}/c${Math.round(v.storage.fish || 0)}`).join(' ');
  console.log(JSON.stringify({ on: E.T784_CARGO_AGE, t812: E.T812_CARGO_TEMP, fp, dep }));
  process.exit(0);
}
// ── 아이 판(T812) — 손잡이를 켠 판의 두 문(`_t784Probe.F` 떠난 날 받음 · `.arrive`)이 노출 곡선 위인가 ──
// ── 아이 판(T840) — 다리 고도: econ 곱 · 장부 정산이 같은 고도를 쓰는가 ──
if (process.env.T784_SUB === 'elev') {
  const E = require(V2P), S = require(path.join(ROOT, 'server', 'spoil')), L = require(path.join(ROOT, 'server', 'lots'));
  const fr = (r, x) => (L.isLot(r) ? Math.max(0, S.freshnessOf(r, x)) : 1);
  const econ = [];
  for (const [r, n, d0, el] of [['millet', 7, 200, 2], ['millet', 4, 30, 1.2], ['vegetable', 3, 140, 0.8], ['fish', 1, 300, 2]]) {
    econ.push({ r, n, d0, el, F: E._t784Probe.F(r, n, d0, el), F0: E._t784Probe.F(r, n, d0, 0), ref: fr(r, E._t812Probe.exp(d0, n, el)),
      arr: E._t784Probe.arrive({ departDay: d0, to: { land: { elev: el } } }, r, d0 + n) });
  }
  //   장부 — 캐러밴 짐(몸에 지님) → 받는 마을(고도 el)에 내려 곳간에 든다. 그 레코드의 노출 = 몸에 지님 구간을 그 고도로 정산한 값인가
  const G = require(path.join(ROOT, 'server', 'granary-lots'));
  const DAY = 1440000; let now = 50 * DAY;
  L.setClock(() => now, DAY);
  const vA = { name: 'A', storage: { millet: 10 }, land: { elev: 0 } }, vB = { name: 'B', storage: { millet: 10 }, land: { elev: 2 } }, c = { id: 1 };
  const okA = G.attach(vA), okB = G.attach(vB);
  G.cargo(c, 'give', [{ k: 49 * DAY, u: 5, f0: 1, e: 0, t: 49, m: 0.7, w: 0.55 }]);
  const carry = JSON.parse(JSON.stringify(G.cargoDump(c).give[0]));
  now = 54 * DAY;   // 다리 5일
  G.unload(c, 'give', vB, 'millet', 5);
  vB.storage.millet = vB.storage.millet + 5;   // 받는 곳간에 든다(`_in` — 대기 레코드를 곳간 레코드로)
  G.clearIn(vB, 'millet');
  const got = (G.ledger(vB, 'millet') || []).find((r) => r.k === 49 * DAY) || null;
  const nf = now / DAY;
  console.log(JSON.stringify({ t840: E.T840_LEG_ELEV, gT840: G.T840, econ, okA, okB, carry, got,
    e2: +S.exposureAt(carry, nf, 2).toFixed(6), e0: +S.exposureAt(carry, nf, 0).toFixed(6) }));
  process.exit(0);
}
if (process.env.T784_SUB === 'probe') {
  const E = require(V2P), S = require(path.join(ROOT, 'server', 'spoil')), L = require(path.join(ROOT, 'server', 'lots'));
  const fr = (r, x) => (L.isLot(r) ? Math.max(0, S.freshnessOf(r, x)) : 1);
  const out = [];
  for (const [r, n, d0] of [['fish', 1, 10], ['fish', 2, 120], ['millet', 7, 200], ['millet', 4, 300], ['vegetable', 3, 45], ['stone', 9, 100], ['millet', 2.5, 77]]) {
    const x = E._t812Probe.exp(d0, n);
    const m = Math.ceil(n);
    out.push({ r, n, d0, F: E._t784Probe.F(r, n, d0), F0: E._t784Probe.F(r, n), ref: fr(r, x), x,
      arr: E._t784Probe.arrive({ departDay: d0 }, r, d0 + m), refA: fr(r, E._t812Probe.exp(d0, m)),
      //   이웃 존 짐 — departDay 가 넘어온 날(= 오늘) · 길 날 수 m ⇒ 떠난 날 = 오늘 − m
      xz: E._t784Probe.arrive({ departDay: d0 + m, travelDays: m, _xzHome: {} }, r, d0 + m), refX: fr(r, E._t812Probe.exp(d0, m)) });
  }
  console.log(JSON.stringify({ t812: E.T812_CARGO_TEMP, out }));
  process.exit(0);
}
const KEEP = (() => { const e = Object.assign({}, process.env); delete e.T784_CARGO_AGE; delete e.T812_CARGO_TEMP; delete e.T840_LEG_ELEV; delete e.T784_ELEV; delete e.T784_SUB; return e; })();
delete process.env.T784_CARGO_AGE; delete process.env.T812_CARGO_TEMP; delete process.env.T840_LEG_ELEV;   // ★[T820] 부모 판 = 기본(아래 `require(V2P)` 앞)
const sub = (knob, seed, days, extra, part) => {
  const env = Object.assign({}, KEEP, extra || {}, { T784_SUB: part || 'world', T784_SEED: String(seed), T784_DAYS: String(days) });
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
ok(AR({ departDay: 10 }, r0, 14) === F(r0, 4, 10) && F(r0, 4, 10) < 1, `③ 떠난 날 10 · 도착 14 → 4일 곡선(${r0} · 보관일 ${Spoil.shelfOf(r0)})`, `${AR({ departDay: 10 }, r0, 14)}`);
ok(AR({ departDay: 10 }, r0, 17) === F(r0, 7, 10) && F(r0, 7, 10) < F(r0, 4, 10), '③ 우회로 늘어난 날까지 늙는다(7일 < 4일 · 같은 날 떠남)', `${F(r0, 7, 10)} < ${F(r0, 4, 10)}`);
ok(AR({ departDay: 20, travelDays: 6, _xzHome: { zone: 'x', id: 1 } }, r0, 20) === F(r0, 6, 14) && AR({ departDay: 20, travelDays: 2, _xzHome: {} }, r0, 25) === F(r0, 5, 20),
  '③ 이웃 존에서 넘어온 짐 — 넘어온 날이 departDay 라 길 날 수 이상으로 센다');
ok(AR({ departDay: 10 }, 'stone', 99) === 1 && AR({ departDay: 10 }, r0, 9) === 1, '③ 안 늙는 품목 1 · 날이 거꾸로면 0일(1)');

// ④ 배선(소스)
say('\n④ 배선 — 네 자리 · 끔 갈래는 종전 식 그대로');
const src = fs.readFileSync(V2P, 'utf8');
ok(/const T784_CARGO_AGE = !\(typeof process !== 'undefined' && process\.env && process\.env\.T784_CARGO_AGE === '0'\);/.test(src), '④ 손잡이는 켬 기본 · 되돌림 `=== \'0\'` 하나(채택 꼴 — lab-wiring-check [F]④)');
const uses = (src.match(/T784_CARGO_AGE \?|if \(T784_CARGO_AGE\)/g) || []).length;
ok(uses === 4, '④ 손잡이를 읽는 자리 넷(첫째 · 둘째 기대 값 · 첫째 · 둘째 판 값)', `${uses}`);
ok(src.includes('_legProfitPerUnit(pFrom, T784_CARGO_AGE ? pTo * _t784F(cand.res, travelDaysForDistance(dist), day, _elevKmOf(b.v)) : pTo, transportCostPerUnit, expectedLossRatio)'),
  '④ 첫째 기대 값 — 도착 쪽 값 × 다리 날 수 신선도 · 끔 = `pTo`');
ok(src.includes("T784_CARGO_AGE ? ((b.prices && b.prices[c2.res]) || 0) * _t784F(c2.res, travelDaysForDistance(best.dist), day, _elevKmOf(best.b.v)) : ((b.prices && b.prices[c2.res]) || 0)"),
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
  let rot = 0, U = 0, W = 0, WX = 0, n = 0;
  for (const d of X.dep || []) {
    for (const [r, q] of [[d.r, d.n], [d.r2, d.n2]]) {
      if (!r || !(q > 0) || !Lots.isLot(r)) continue;
      const f = F(r, d.t), fx = F(r, d.t, d.d0); n++; U += q; W += q * f; WX += q * fx; if (fx === 0) rot++;   // ★[T820] f 달력 날 · fx 장부 시계(켬 기본 세계의 결정이 쓰는 곱)
    }
  }
  return { rot, n, f: U > 0 ? +(W / U).toFixed(4) : null, fx: U > 0 ? +(WX / U).toFixed(4) : null, all: (X.dep || []).length };
};
const S7 = [stat(U), stat(O)];
const U42 = sub('0', 42, 200), O42 = sub(undefined, 42, 200);
const S42 = [stat(U42), stat(O42)];
ok(S7[1].rot === 0 && S42[1].rot === 0, '⑤ 켬 — 도착 때 f = 0 인 짐을 실은 출발 0(시드 7 · 42 · 200일)', `끔 ${S7[0].rot} · ${S42[0].rot} → 켬 ${S7[1].rot} · ${S42[1].rot}`);
say(`  · [재기만 · T812] 늙는 짐의 도착 신선도(단위 가중 · 달력 날) 끔 → 켬 — 시드 7 ${S7[0].f} → ${S7[1].f}(짐 ${S7[0].n} → ${S7[1].n}) · 시드 42 ${S42[0].f} → ${S42[1].f}(짐 ${S42[0].n} → ${S42[1].n}) — 서로 다른 출발 묶음(세계에 기댄다)`);
//   ★[T820] 켬 기본 세계(T784 · T812 둘 다 켬)는 결정이 장부 시계 곱(fx)을 쓴다 — 같은 꼴(재기만)로 두 시계 다 · 끔 쪽 둘(T784 끔 · T812 끔) 다 찍는다.
const Q7 = stat(sub(undefined, 7, 200, { T812_CARGO_TEMP: '0' })), Q42 = stat(sub(undefined, 42, 200, { T812_CARGO_TEMP: '0' }));
say(`  · [재기만 · T820] 장부 시계 f(단위 가중) — T784 끔 → T812 끔 → 켬 기본: 시드 7 ${S7[0].fx} → ${Q7.fx} → ${S7[1].fx}(짐 ${S7[0].n} → ${Q7.n} → ${S7[1].n}) · 시드 42 ${S42[0].fx} → ${Q42.fx} → ${S42[1].fx}(짐 ${S42[0].n} → ${Q42.n} → ${S42[1].n})`);
say(`  · [재기만 · T820] 달력 날 f — T784 끔 → T812 끔 → 켬 기본: 시드 7 ${S7[0].f} → ${Q7.f} → ${S7[1].f} · 시드 42 ${S42[0].f} → ${Q42.f} → ${S42[1].f}`);

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

// ⑦ T812 — 장부 시계
say('\n⑦ [T812] 장부 시계 — 다리 나이 = 그 날들의 기온 가중 노출');
ok(/const T812_CARGO_TEMP = !\(typeof process !== 'undefined' && process\.env && process\.env\.T812_CARGO_TEMP === '0'\);/.test(src), '⑦ 손잡이는 켬 기본 · 되돌림 `=== \'0\'` 하나(T820 · 채택 꼴)');
const X = E._t812Probe && E._t812Probe.exp;
ok(typeof X === 'function' && E.T812_CARGO_TEMP === true, '⑦ 하네스 문(`_t812Probe.exp`) · 이 판은 켬(기본)');
let xbad = [];
for (const d0 of [0, 45, 100, 200, 300, 333]) for (const n of [0, 1, 3, 7, 12]) {
  const a = X(d0, n), b = Spoil.cumExposure(d0 + n, 0, Spoil.placeFields('carry').w) - Spoil.cumExposure(d0, 0, Spoil.placeFields('carry').w);
  if (Math.abs(a - b) > 1e-9) xbad.push(`${d0}+${n}:${a}/${b}`);
}
const xh = X(100, 2.5), xl = X(100, 2), xu = X(100, 3);
ok(xbad.length === 0 && Math.abs(xh - (xl + 0.5 * (xu - xl))) < 1e-12, '⑦ 다리 노출 = `cumExposure(d0 + n) − cumExposure(d0)`(6날 × 5길이 · 몸에 지님 자리) · 소수 날은 그날 하루치의 몫', xbad.slice(0, 3).join(' '));
const sx = [0, 1, 2, 3, 5, 8].map((n) => X(170, n)), sw = [0, 1, 2, 3, 5, 8].map((n) => X(260, n));
ok(sx.every((v, i) => i === 0 || v >= sx[i - 1]) && Math.abs(X(170, 8) - X(260, 8)) > 0.5,
  '⑦ 길이가 늘면 안 준다 · 철마다 다르다(같은 8일이 날에 따라 다른 나이 — 날 수 셈이면 둘 다 8)', `8일 = 노출 ${X(170, 8).toFixed(3)}(170일 떠남) · ${X(260, 8).toFixed(3)}(260일 떠남)`);
const P0 = sub(undefined, 0, 0, { T812_CARGO_TEMP: '0' }, 'probe');
ok(!P0.err && P0.t812 === false && P0.out.length === 7 && P0.out.every((o) => o.F === o.F0), '⑦ 끔(`=0` 아이 판) — 떠난 날을 받아도 날 수 그대로(T820 앞 바이트)', P0.err || '');
const P1 = sub(undefined, 0, 0, { T812_CARGO_TEMP: '1' }, 'probe');
const pbad = (P1.out || []).filter((o) => Math.abs(o.F - o.ref) > 1e-12 || Math.abs(o.arr - o.refA) > 1e-12 || Math.abs(o.xz - o.refX) > 1e-12);
ok(!P1.err && P1.t812 === true && P1.out.length === 7 && pbad.length === 0 && P1.out.some((o) => o.F !== o.F0),
  '⑦ 켬 — 출발 결정의 곱(`F(품목, 날, 떠난 날)`) = 도착 매도의 곱(`arrive` · 이웃 존 짐도) = `freshnessOf(품목, 그 다리 노출)` · 날 수 셈과 실제로 갈린다', P1.err || JSON.stringify(pbad.slice(0, 2)));
const W1 = sub(undefined, 7, 200, { T812_CARGO_TEMP: '1' }), W0 = sub(undefined, 7, 200, { T812_CARGO_TEMP: '0' }), WT = sub(undefined, 7, 200, { T812_CARGO_TEMP: 'true' });
ok(!W1.err && W1.t812 === true && WT.t812 === true && O.t812 === true && W0.t812 === false && W1.fp === O.fp && WT.fp === O.fp && W0.fp !== O.fp,
  '⑦ 없음 · \'1\' · \'true\' = 켬(T820 기본 · 켬끼리 세계 같다) · \'0\' = 끔은 세계를 바꾼다(T812 앞 세계)', W0.fp);
const S7t = stat(W1);
ok(S7t.rot === 0, '⑦ 켬 세계 — 도착 때 f = 0 인 짐을 실은 출발 0(시드 7 · 장부 시계로 잰 f)', `짐 ${S7t.n} · f ${S7t.f}`);
ok(src.includes('pTo * _t784F(cand.res, travelDaysForDistance(dist), day, _elevKmOf(b.v)) : pTo,') && src.includes('* _t784F(c2.res, travelDaysForDistance(best.dist), day, _elevKmOf(best.b.v)) :')
  && src.includes('return _t784F(res, n, day - n, _elevKmOf(c.to));'), '⑦ 배선 — 첫째 · 둘째 기대 값은 오늘 떠나는 다리 · 도착은 도착 날 − 길 날 수에서 떠난 다리');
const bs = fs.readFileSync(BUNDLE, 'utf8');
ok(/modules\["weather"\]=/.test(bs) && /if\(\/\(\^\|\[\/\]\)weather\$\/\.test\(p\)\)return modules\.weather;/.test(bs), '⑦ 번들이 날씨 정본을 싣고 `require` 를 잇는다(없으면 하루 노출 1 = 날 수)');
const runB2 = (env, seed, days) => {
  const ctx = { console: { log() {}, warn() {}, error() {} }, Math, Date, JSON };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.process = { env };
  vm.createContext(ctx); vm.runInContext(bs, ctx);
  const B = ctx.EconEngine;
  const w = B.createWorldV2({ seed, villageCount: 5, namePool: ['가', '나', '다', '라', '마'], infoRange: 5000, raidPer100: 0.005, picker: 'rational' });
  for (let d = 0; d < days; d++) B.tickWorldV2(w);
  return { on: B.T812_CARGO_TEMP, x: B._t812Probe.exp(170, 8), fp: w.villages.map((v) => `${v.name}:${v.npcs.length}/f${Math.floor(v.storage.food)}/c${Math.round(v.storage.fish || 0)}`).join(' ') };
};
const BB = runB2({ T812_CARGO_TEMP: '1' }, 7, 200);
ok(BB.on === true && BB.fp === W1.fp && Math.abs(BB.x - X(170, 8)) < 1e-12, '⑦ 켬 — 번들 세계 = 정본 세계(시드 7 · 200일) · 번들의 다리 노출 = 정본(기온이 날씨 정본에서 온다)', `${BB.x.toFixed(4)} · ${BB.fp}`);

// ⑧ T840 — 다리 고도
say('\n⑧ [T840] 다리 노출에 마을 고도 — 장부와 같이(손잡이 T840_LEG_ELEV=1)');
const GLS = fs.readFileSync(path.join(ROOT, 'server', 'granary-lots.js'), 'utf8');
ok(/const T840_LEG_ELEV = \(typeof process !== 'undefined' && process\.env && process\.env\.T840_LEG_ELEV === '1'\);/.test(src) && /const T840 = process\.env\.T840_LEG_ELEV === '1';/.test(GLS),
  '⑧ 손잡이 하나(`=== \'1\'` · econ v2 · 장부 둘이 같은 env)');
ok(typeof E.elevKmOf === 'function' && src.includes('const _elev = _elevKmOf(v);') && /require\('\.\.\/sim\/economy-sim-v2\.js'\); _t840E = \(m && typeof m\.elevKmOf === 'function'\)/.test(GLS),
  '⑧ 고도 값은 한 함수(`elevKmOf` — econ 기온이 쓰는 그 값 · 장부가 그것을 부른다 · 사본 0)');
ok(src.includes('_t784F(cand.res, travelDaysForDistance(dist), day, _elevKmOf(b.v))') && src.includes('_t784F(c2.res, travelDaysForDistance(best.dist), day, _elevKmOf(best.b.v))') && src.includes('_t784F(res, n, day - n, _elevKmOf(c.to))')
  && GLS.includes('pushIn(v, res, _legSettle(recs.map((r) => _copy(r, r.u * frac)), v))'), '⑧ 배선 — 출발 결정 둘 · 도착 매도 = 도착 마을 고도 · 장부는 짐을 내리는 그 마을 고도로 몸에 지님 구간을 정산');
let ebad = [];
for (const [d0, n, el] of [[100, 5, 1.5], [200, 8, 2], [30, 3, 0.7]]) {
  const w = Spoil.placeFields('carry').w, a = X(d0, n, el), b = Spoil.cumExposure(d0 + n, el, w) - Spoil.cumExposure(d0, el, w);
  if (Math.abs(a - b) > 1e-9) ebad.push(`${d0}+${n}@${el}`);
}
ok(ebad.length === 0 && X(200, 8, 2) < X(200, 8) && X(200, 8, 0) === X(200, 8), '⑧ 다리 노출(고도) = `cumExposure` 차(같은 고도 표) · 높으면 덜 늙는다 · 고도 0 = 종전 열쇠 그대로', `8일 200일 떠남 — 0km ${X(200, 8).toFixed(3)} · 2km ${X(200, 8, 2).toFixed(3)}`);
const EL1 = sub(undefined, 0, 0, { T840_LEG_ELEV: '1', T732_MOMENT_LOT: '1' }, 'elev'), EL0 = sub(undefined, 0, 0, { T840_LEG_ELEV: '0', T732_MOMENT_LOT: '1' }, 'elev');
const eb1 = (EL1.econ || []).filter((o) => Math.abs(o.F - o.ref) > 1e-12 || Math.abs(o.arr - o.ref) > 1e-12 || o.F === o.F0);
ok(!EL1.err && EL1.t840 === true && EL1.econ.length === 4 && eb1.length === 0, '⑧ 켬 — 출발 결정의 곱 = 도착 매도의 곱 = `freshnessOf(품목, 그 고도의 다리 노출)` · 고도 0 판과 실제로 갈린다', EL1.err || JSON.stringify(eb1[0] || ''));
ok(!EL0.err && EL0.t840 === false && (EL0.econ || []).every((o) => o.F === o.F0 && o.arr === o.F0), '⑧ 끔 — 고도를 받아도 고도 0(main 바이트)', EL0.err || '');
ok(EL1.okA && EL1.okB && EL1.gT840 === true && EL1.got && Math.abs(EL1.got.e - EL1.e2) < 1e-6 && Math.abs(EL1.e2 - EL1.e0) > 1e-3,
  '⑧ 켬 — 장부: 받는 마을(2 km)에 내린 짐 레코드의 노출 = 몸에 지님 구간을 그 고도로 정산한 값(econ 다리와 같은 고도)', EL1.got ? `노출 ${EL1.got.e} · 2km ${EL1.e2} · 0km ${EL1.e0}` : JSON.stringify(EL1).slice(0, 200));
ok(EL0.okB && EL0.gT840 === false && EL0.got && Math.abs(EL0.got.e - EL0.e0) < 1e-6, '⑧ 끔 — 장부: 종전대로 고도 0 으로 정산', EL0.got ? `노출 ${EL0.got.e} · 0km ${EL0.e0}` : '');
const Z1 = sub(undefined, 7, 200, { T840_LEG_ELEV: '1' });
ok(!Z1.err && Z1.fp === O.fp, '⑧ 오늘의 세계(고도를 넣는 호스트 없음 · 늘 0) — 켜도 세계 같다(시드 7 · 200일)', Z1.fp);
const I1 = sub(undefined, 7, 200, { T840_LEG_ELEV: '1', T784_ELEV: '0,0.8,1.6,0.4,2' }), I0 = sub(undefined, 7, 200, { T784_ELEV: '0,0.8,1.6,0.4,2' });
ok(!I1.err && !I0.err && I1.fp !== I0.fp, '⑧ [자명 통과 금지] 고도를 넣은 판(마을 0 · 0.8 · 1.6 · 0.4 · 2 km)에선 켬이 세계를 바꾼다', `${I0.fp} → ${I1.fp}`);

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
