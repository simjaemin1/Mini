#!/usr/bin/env node
// @regress
// === scripts/test-land-elev.js — 마을 고도를 세운다: land.elev 호스트 · 곳간 구간도 (T856 · 손잡이 T856_LAND_ELEV='1' · 없음 = 끔 = main 바이트) ===
//
// ★왜 [T840 회부 1 · 3] econ 기온 · 다리 노출(T840) · 장부가 다 읽는 한 칸 `land.elev` 를 넣는 호스트가 없었다(늘 0). 켬이면 존이 econ 에 마을을 넘길 때
//   그 마을 중심의 `elevKmAt`(몸 기온이 쓰는 지형 정본 · 사본 0)으로 채우고, 장부는 곳간 구간도 그 마을 고도로 정산한다(econ `elevKmOf` 한 함수).
//
//  ① 손잡이 — '1' 하나만 켬(villages · granary-lots 같은 env) · 끔이면 칸을 안 세운다
//  ② 호스트 — `_t856LandElev(ev, cx, cy)` 가 `init` 이 받은 `elevKmAt` 을 마을 중심 자리(셀 × 32 + 16)로 부른다 · 0 이면 칸을 안 세운다(econ `|| 0` 과 같은 값) ·
//     지형 함수가 없으면(랩 · CLI) 그대로 · econ 기온은 그 칸을 읽는다(같은 함수 `elevKmOf`)
//  ③ 곳간 구간 — 고도 2 km 마을 곳간에서 뗀 레코드(문 · 싣기)의 노출 = 그 구간을 2 km 로 정산한 값 · 상함 판정 · 신선도 읽기도 같은 고도 · 끔이면 0 km
//  ④ 배선 — 존 `init` 에 `elevKmAt` · 부팅(새로 · 복원) · 새 마을 두 자리 · 장부 `_out` · `_rotten` · `freshOf` · 짐 다리(T840)와 한 함수
//
// 실행: node scripts/test-land-elev.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SV = (p) => path.join(ROOT, 'server', p);

if (process.env.T856_SUB === 'host') {
  const V = require(SV('villages.js')), E = require(path.join(ROOT, 'sim', 'economy-sim-v2.js'));
  const calls = [];
  V.__p3Bind({ deps: { elevKmAt: (p) => { calls.push([p.x, p.y]); return p.x === 100 * 32 + 16 ? 1.25 : 0; } } });
  const a = { land: { fertility: 1 } }, b = { land: { fertility: 1, elev: 0.4 } }, c = { land: { fertility: 1 } };
  V._t856LandElev(a, 100, 7); V._t856LandElev(b, 3, 4);
  V.__p3Bind({ deps: {} }); V._t856LandElev(c, 100, 7);   // 지형 함수 없음(랩 · CLI 꼴)
  const T0 = E.temperatureAt(120, null, 0), T1 = E.temperatureAt(120, null, E.elevKmOf(a));
  console.log(JSON.stringify({ on: V.T856_LAND_ELEV, a: a.land, b: b.land, c: c.land, calls, eA: E.elevKmOf(a), dT: +(T0 - T1).toFixed(6), lapse: E.CLIMATE && E.CLIMATE.lapsePerKm }));
  process.exit(0);
}
if (process.env.T856_SUB === 'granary') {
  const G = require(SV('granary-lots.js')), L = require(SV('lots.js')), S = require(SV('spoil.js'));
  const DAY = 1440000; let now = 100 * DAY;
  L.setClock(() => now, DAY);
  const v = { name: 'H', storage: { millet: 0 }, land: { elev: 2 } }, v0 = { name: 'L', storage: { millet: 0 }, land: {} };
  const okH = G.attach(v), okL = G.attach(v0);
  v.storage.millet = 10; v0.storage.millet = 10;   // 지금 얻은 몫(곳간 레코드 · 그 순간)
  const rH = JSON.parse(JSON.stringify((G.ledger(v, 'millet') || [])[0] || null)), rL = JSON.parse(JSON.stringify((G.ledger(v0, 'millet') || [])[0] || null));
  now = 112 * DAY;   // 곳간에 12일
  const fH = G.freshOf(v, 'millet'), fL = G.freshOf(v0, 'millet');
  G.capBegin(v, 'millet'); v.storage.millet = v.storage.millet - 4; const outH = G.capEnd(v, 'millet');   // 떼어 간다(싣기 · 문이 쓰는 그 길)
  G.capBegin(v0, 'millet'); v0.storage.millet = v0.storage.millet - 4; const outL = G.capEnd(v0, 'millet');
  const nf = now / DAY;
  const g = S.placeFields('granary');
  const ref = (r, e) => +S.exposureAt(Object.assign({}, r, { m: g.m, w: g.w }), nf, e).toFixed(6);
  console.log(JSON.stringify({ T856: G.T856, okH, okL, rH, rL, outH, outL, fH, fL, eH2: rH && ref(rH, 2), eH0: rH && ref(rH, 0), eL0: rL && ref(rL, 0),
    frH2: rH && +Math.max(0, S.freshnessOf('millet', S.exposureAt(rH, nf, 2))).toFixed(6), frH0: rH && +Math.max(0, S.freshnessOf('millet', S.exposureAt(rH, nf, 0))).toFixed(6) }));
  process.exit(0);
}

const KEEP = (() => { const e = Object.assign({}, process.env); delete e.T856_LAND_ELEV; delete e.T856_SUB; return e; })();
const sub = (part, knob) => {
  const env = Object.assign({}, KEEP, { T856_SUB: part, T732_MOMENT_LOT: '1' });
  if (knob !== undefined) env.T856_LAND_ELEV = knob;
  try { return JSON.parse(execFileSync(process.execPath, [__filename], { env, stdio: 'pipe', maxBuffer: 64 << 20 }).toString().trim().split('\n').pop()); }
  catch (e) { return { err: String((e && e.message) || e).slice(0, 300) }; }
};
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const say = (m) => console.log(m);
say('=== 마을 고도를 세운다 — land.elev 호스트 · 곳간 구간도 (T856 · 손잡이 T856_LAND_ELEV=1) ===');

say('\n① 손잡이');
const VS = fs.readFileSync(SV('villages.js'), 'utf8'), GS = fs.readFileSync(SV('granary-lots.js'), 'utf8'), ZS = fs.readFileSync(SV('zone.js'), 'utf8');
ok(/const T856_LAND_ELEV = process\.env\.T856_LAND_ELEV === '1';/.test(VS) && /const T856 = process\.env\.T856_LAND_ELEV === '1';/.test(GS), '① `=== \'1\'` 하나(villages · 장부 같은 env)');
const H0 = sub('host'), HT = sub('host', 'true'), H1 = sub('host', '1');
ok(!H0.err && !HT.err && H0.on === false && HT.on === false && H0.calls.length === 0 && !('elev' in H0.a) && H0.b.elev === 0.4, '① 없음 · \'true\' = 끔 — 지형 함수를 안 부르고 칸을 안 건드린다', H0.err || JSON.stringify(H0.a));

say('\n② 호스트 — 마을 중심 elevKmAt');
ok(!H1.err && H1.on === true && H1.a.elev === 1.25 && JSON.stringify(H1.calls[0]) === JSON.stringify([100 * 32 + 16, 7 * 32 + 16]), '② 켬 — `land.elev` = 마을 중심(셀 × 32 + 16)의 `elevKmAt`', H1.err || JSON.stringify(H1.calls));
ok(H1.b && !('elev' in H1.b), '② 그 자리 고도가 0 이면 칸을 안 세운다(옛 칸도 지운다 — econ `|| 0` 과 같은 값 · 저장 바이트 그대로)', JSON.stringify(H1.b));
ok(H1.c && !('elev' in H1.c), '② 지형 함수가 없으면(랩 · CLI) 그대로 0', JSON.stringify(H1.c));
ok(H1.eA === 1.25 && Math.abs(H1.dT - 1.25 * H1.lapse) < 1e-9, '② econ 기온이 그 칸을 읽는다(`elevKmOf` — 감률 × 고도만큼 내려간다)', `${H1.dT}℃ = ${H1.lapse} × 1.25`);

say('\n③ 곳간 구간 — 그 마을 고도로');
const G1 = sub('granary', '1'), G0 = sub('granary');
ok(!G1.err && G1.T856 === true && G1.okH && G1.rH && G1.outH.length === 1 && Math.abs(G1.outH[0].e - G1.eH2) < 1e-6 && Math.abs(G1.eH2 - G1.eH0) > 0.5,
  '③ 켬 — 2 km 곳간에서 뗀 레코드의 노출 = 그 구간을 2 km 로 정산한 값(0 km 와 실제로 다르다)', G1.err || `${G1.outH[0] && G1.outH[0].e} · 2km ${G1.eH2} · 0km ${G1.eH0}`);
ok(G1.okL && G1.outL.length === 1 && (G1.outL[0].e == null || Math.abs(G1.outL[0].e - (G1.rL.e || 0)) < 1e-9), '③ 켬 — 고도 0 마을은 뗄 때 안 건드린다(종전 그대로 — 뒤 정산이 0 km 로 센다)', JSON.stringify(G1.outL[0]));
ok(G1.fH && Math.abs(G1.fH.fresh - G1.frH2) < 1e-6 && Math.abs(G1.frH2 - G1.frH0) > 1e-3, '③ 켬 — 곳간 신선도 읽기(`freshOf`)도 그 고도', G1.fH ? `${G1.fH.fresh} · 2km ${G1.frH2} · 0km ${G1.frH0}` : '');
ok(!G0.err && G0.T856 === false && G0.outH.length === 1 && (G0.outH[0].e == null || Math.abs(G0.outH[0].e - (G0.rH.e || 0)) < 1e-9) && G0.fH && Math.abs(G0.fH.fresh - G0.frH0) < 1e-6,
  '③ 끔 — 고도 칸이 있어도 곳간 구간은 0 km(main 바이트)', G0.err || '');

say('\n④ 배선');
ok(/SimVillages\.init\(\{[^\n]*\n  elevKmAt,/.test(ZS), '④ 존이 `init` 에 지형 정본 `elevKmAt` 을 넘긴다');
ok((VS.match(/_t856LandElev\(ev, [^)]*\);/g) || []).length === 2 && VS.includes('_t856LandElev(ev, row.cx, row.cy);') && VS.includes('_t856LandElev(ev, ccx, ccy);'), '④ econ 에 마을을 넘기는 두 자리(부팅 — 새로 세움 · 복원 · 새 마을)');
ok(/function _elevOf\(v\)/.test(GS) && GS.includes("m.elevKmOf") && GS.includes('const e = _elevOf(v);   // ★[T856]') && /_rotten\(r, res, _vw\.nf, ge\)/.test(GS) && /_rotten\(r, res, nf, ge\)/.test(GS) && GS.includes("Spoil.exposureOf(Object.assign({}, r, { k: r.k }), today, ge)"),
  '④ 장부 — 고도 한 함수(econ `elevKmOf`) · 짐 다리(T840)와 같은 것 · 상함 판정 둘 · 신선도 읽기');

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
