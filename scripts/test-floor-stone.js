#!/usr/bin/env node
// @regress
// === scripts/test-floor-stone.js — 돌 바닥 마을은 제 돌을 안 판다 (T1049 · ★재민 11-01 "처음 마을들은 터지면 안 된다" · 손잡이 T1049_FLOOR_STONE) ===
//   ★왜 — T1049 실측: 서버 판 자(800날)의 해체 마을 · 랩 t17 의 소멸 마을이 다 돌 바닥(land.stone = 바닥 0.25 · 바위 지형 0)이고,
//     처음 곳간 돌(≈190)을 교역으로 판다(랩 1020 농촌10 D1~75 에 100) → 석공이 멈추고 도구가 닳아 맨손(0.25×) → 곡 1/5 → 두 번째 겨울에 굶는다.
//     바닥 마을은 돌을 다시 못 채운다(채집 상한 0.225/인·일 · T152). 손잡이는 두 문을 막는다:
//       ⓐ 떠나는 캐러밴의 수출 후보(`tickTradeV2Steps` · T180 줄 곁) · ⓑ 도착한 캐러밴이 대금으로 사 가는 귀환 화물(`_caravanTrade` — 파는 쪽 유보 없이 `> 1` 이면 판다).
//   재는 것:
//     ① 바닥 수 — sim v1 `STONE_FLOOR_LAND` 가 정본 `server/livelihood.js` `FLOOR.stone` 과 같다(sim 은 server 를 못 실어 이름 하나로 묶었다 · 사본 갈림 0).
//     ② 손잡이 — 끔이 기본(종전 바이트) · `=1` 이면 켬. (판 자 대조에서 해체가 안 줄어 켬 기본 후보에서 내렸다 — 보고 T1049 §3)
//     ③ 세계(v2 · 5마을 · 300날) — 마을 하나를 돌 바닥으로 두고 곳간에 돌 400 을 넣는다. 그 마을 곳간 돌이 줄 때 부른 자리를 접근자로 센다(값 무변).
//        ★켬: 교역 두 문(`tickTradeV2Steps` · `_caravanTrade`)으로 나간 돌 = 0.
//        ★★자명 통과 금지 — 끔(기본)에선 같은 세계에서 그 두 문으로 돌이 **나간다**(> 0). 안 나가면 이 세계는 아무것도 안 잰다.
//        ★바닥 아닌 마을의 돌 교역은 켬에서도 그대로 산다(손잡이가 돌 교역 전체를 끄는 게 아니다) — 켬 판에서 다른 마을의 돌이 교역 문으로 나간 양 > 0.
//        (`tickCaravansV2` 로 줄어드는 돌은 받은 귀환 화물의 교역세 3% 다 — 제 곳간 돌을 파는 문이 아니라 들여온 돌에서 떼는 몫이라 안 센다.)
//     ④ 랩 번들 — 번들(`sim/economy-engine.browser.js`)이 같은 문(`_t1049Floor`)과 바닥 수를 싣는다(랩 = 서버 규칙).
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const V1P = path.join(ROOT, 'sim', 'economy-sim.js'), V2P = path.join(ROOT, 'sim', 'economy-sim-v2.js');
const BUNDLE = path.join(ROOT, 'sim', 'economy-engine.browser.js');

if (process.env.T1049_SUB === 'world') {
  const E = require(V2P);
  const w = E.createWorldV2({ seed: 7, villageCount: 5, namePool: ['가', '나', '다', '라', '마'], infoRange: 5000, raidPer100: 0, picker: 'rational' });
  const FL = require(V1P).STONE_FLOOR_LAND;
  const floorV = w.villages[0];
  floorV.land.stone = FL; floorV.storage.stone = 400;
  for (const v of w.villages.slice(1)) { v.land.stone = Math.max(v.land.stone || 0, 1.0); v.storage.stone = Math.max(v.storage.stone || 0, 400); }
  const out = new Map();   // 마을 → { 함수: 양 }
  const _h = {};
  const top = () => { const L = Error.stackTraceLimit; Error.stackTraceLimit = 5; Error.captureStackTrace(_h, top); Error.stackTraceLimit = L;
    for (const ln of String(_h.stack).split('\n').slice(1)) { if (/test-floor-stone/.test(ln)) continue; const m = /at (?:Object\.)?([A-Za-z_$][\w$]*)/.exec(ln); return m ? m[1] : '?'; } return '?'; };
  const trap = (v) => { const st = v.storage; if (st.__t) return; Object.defineProperty(st, '__t', { value: 1, enumerable: false });
    let val = st.stone; Object.defineProperty(st, 'stone', { enumerable: true, configurable: true, get() { return val; },
      set(x) { if (+x < +val) { const o = out.get(v.name) || (out.set(v.name, {}), out.get(v.name)); const f = top(); o[f] = (o[f] || 0) + ((+val || 0) - (+x || 0)); } val = x; } }); };
  for (let d = 0; d < 300; d++) { for (const v of w.villages) trap(v); E.tickWorldV2(w); }
  const trade = (o) => ((o && o.tickTradeV2Steps) || 0) + ((o && o._caravanTrade) || 0);
  let others = 0; for (const v of w.villages.slice(1)) others += trade(out.get(v.name));
  console.log(JSON.stringify({ on: E.T1049_FLOOR_STONE, floor: trade(out.get(floorV.name)), others, floorStone: +floorV.storage.stone.toFixed(2), by: out.get(floorV.name) || {} }));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const kid = (env) => JSON.parse(execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { T1049_SUB: 'world' }, env), encoding: 'utf8', maxBuffer: 1 << 24 }).trim().split('\n').pop());
console.log('\n=== 돌 바닥 마을은 제 돌을 안 판다 (T1049) ===');

console.log('\n① 바닥 수');
{
  const v1 = require(V1P), L = require(path.join(ROOT, 'server', 'livelihood.js'));
  ok(L.FLOOR && Number.isFinite(L.FLOOR.stone), '(상황) 정본 livelihood FLOOR.stone 이 있다', L.FLOOR && L.FLOOR.stone);
  ok(v1.STONE_FLOOR_LAND === L.FLOOR.stone, '★sim v1 STONE_FLOOR_LAND = livelihood FLOOR.stone(사본 갈림 0)', `${v1.STONE_FLOOR_LAND} / ${L.FLOOR.stone}`);
}

console.log('\n② 손잡이');
const on = kid({ T1049_FLOOR_STONE: '1' }), off = kid({ T1049_FLOOR_STONE: '' });
ok(off.on === false, '★끔이 기본(env 없음 — 종전 바이트)', off.on);
ok(on.on === true, '★`T1049_FLOOR_STONE=1` 이면 켬', on.on);

console.log('\n③ 세계 — 돌 바닥 마을 하나(곳간 돌 400) · 300날');
console.log(`    [상황] 끔: 바닥 마을 돌이 교역 문으로 ${off.floor.toFixed(1)} 나감 · 다른 마을 ${off.others.toFixed(1)} · 바닥 마을 끝 돌 ${off.floorStone} · 문별 ${JSON.stringify(Object.fromEntries(Object.entries(off.by).map(([k, x]) => [k, +x.toFixed(1)])))}`);
console.log(`    [상황] 켬: 바닥 마을 돌이 교역 문으로 ${on.floor.toFixed(1)} 나감 · 다른 마을 ${on.others.toFixed(1)} · 바닥 마을 끝 돌 ${on.floorStone} · 문별 ${JSON.stringify(Object.fromEntries(Object.entries(on.by).map(([k, x]) => [k, +x.toFixed(1)])))}`);
ok(off.floor > 0, '★★자명 통과 금지 — 끔(기본)에선 같은 세계에서 바닥 마을 돌이 교역 문(수출 · 귀환 화물)으로 나간다', off.floor.toFixed(2));
ok(on.floor === 0, '★★켬 — 바닥 마을 돌은 교역 문으로 0 나간다(수출 · 귀환 화물 둘 다)', on.floor.toFixed(2));
ok(on.others > 0, '★켬에서도 바닥 아닌 마을의 돌 교역은 산다(돌 교역 전체를 끈 게 아니다)', on.others.toFixed(2));

console.log('\n④ 랩 번들 — 같은 규칙');
{
  const B = fs.existsSync(BUNDLE) ? fs.readFileSync(BUNDLE, 'utf8') : '';
  ok(/const _t1049Floor = /.test(B) && /T1049_FLOOR_STONE/.test(B) && /STONE_FLOOR_LAND = 0\.25/.test(B), '★번들이 같은 문(`_t1049Floor`) · 손잡이 · 바닥 수를 싣는다(랩 = 서버)');
  for (const f of ['마을실험실.html', '전쟁실험실.html']) {
    const p = path.join(ROOT, 'lab', f); if (!fs.existsSync(p)) continue;
    ok(/const _t1049Floor = /.test(fs.readFileSync(p, 'utf8')), `★랩 ${f} 인라인 엔진도 같은 문을 싣는다`);
  }
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
