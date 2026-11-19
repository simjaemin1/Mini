#!/usr/bin/env node
// @regress
// @bait 1   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1328-ore-zero.js — 0원 원석은 교역 · 광부 값에 안 든다 (T1328 · T1317 회부 3 · PM 11-15 "원석에 바닥을 안 건다") ==========
//
// ★무엇 — 원석 상한(`_oreCapV2` — 녹일 금속 값 × 수율)이 시대를 모르는 금속(철 · 니켈 · 아연)의 원석 값을 0 으로 낸다(T1301 관측 153칸 · T1317 랩 800날:
//   캔 양 0 · 교역 0/24,254 줄 · 첫 재고만 썩음). PM 판단은 "바닥을 안 건다 — 영향 0 으로 닫는다". 이 하네스는 그 "영향 0" 을 지킨다:
//   ① [상황] 작은 세계(8마을 · 60날)에도 0원 원석 칸이 실제로 선다(자명 통과 금지).
//   ② 그 품목은 교역 장부(`tradeLog` — 보낸 것 · 바구니 · 산 것)에 한 줄도 안 실린다.
//   ③ 광부 한 시간 값(`t1266OreValue` — 몫 × 그림자 값)에서 0원 원석 몫은 0 이다 — 섞인 조성이면 아는 원석 몫만 남는다.
//   ④ 같은 물음을 광부 문 켬(`T1266_ORE_BODY=1 T1293_ORE_SAT=1` — 녹임 목표 몫만 값) 아이 판에서도 — 0 그대로.
//   ★미끼 [T1356] — econ 사본 한 곳: 광부 한 시간 값의 그림자 값 칸에 **바닥 1** 을 건다(PM 이 물리친 "원석에 바닥" 그 꼴) → ③★ 0원 원석 값 = 0 이 빨강.
//   새 수 0 · 판정 0 · 제품 무변(읽기만).
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x != null && x !== '' ? '  ' + x : '')); };

function probe(V2in) {
  const _log = console.log; console.log = () => {};   // 세계 만들기 · 틱의 소식 줄을 막는다(판정 줄만 남긴다)
  let out;
  try {
    const V2 = V2in || require(path.join(ROOT, 'sim', 'economy-sim-v2.js'));
    const OG = require(path.join(ROOT, 'server', 'ore-goods'));
    const w = V2.createWorldV2({ seed: 42, villageCount: 8, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
    for (let d = 0; d < 60; d++) V2.tickWorldV2(w);
    const Z = new Set(); let cells = 0, known = null, vz = null;
    for (const v of w.villages) {
      const P = V2.computeShadowPrices(v);
      for (const k in P) if (OG.isOre(k)) { if (P[k] === 0) { Z.add(k); cells++; if (!vz) vz = v; } else if (P[k] > 0 && !known) known = k; }
    }
    let rows = 0, hit = 0; const hitItems = new Set();
    for (const row of w.tradeLog || []) {
      rows++;
      const lines = [];
      if (row && row.sent) lines.push(row.sent);
      if (row && Array.isArray(row.basket)) lines.push(...row.basket);
      if (row && row.bought) lines.push(...(Array.isArray(row.bought) ? row.bought : [row.bought]));
      if (row && Array.isArray(row.retBasket)) lines.push(...row.retBasket);
      let h = false; for (const x of lines) if (x && Z.has(x.res)) { h = true; hitItems.add(x.res); }
      if (h) hit++;
    }
    const z = [...Z][0];
    const val = (mix) => (vz && V2.t1266OreValue) ? V2.t1266OreValue(vz, 8, null, mix, 10) : null;
    const vZ = z ? val({ [z]: 1 }) : null, vK = known ? val({ [known]: 1 }) : null, vM = (z && known) ? val({ [z]: 0.5, [known]: 0.5 }) : null;
    out = { zero: [...Z], cells, rows, hit, hitItems: [...hitItems], known, pZ: vZ && vZ.p, pK: vK && vK.p, pM: vM && vM.p };
  } finally { console.log = _log; }
  return out;
}

if (process.env.T1328_CHILD === '1') { process.stdout.write('\n@@' + JSON.stringify(probe()) + '\n'); process.exit(0); }

console.log('\n=== 0원 원석은 교역 · 광부 값에 안 든다 (T1328 · 작은 세계 8마을 · 60날) ===');
const R = probe();
ok(R.cells > 0 && R.zero.length > 0, '① [상황] 0원 원석 칸이 실제로 선다(자명 통과 금지)', `${R.cells}칸 · ${R.zero.join(' · ')}`);
ok(R.rows > 0, '① [상황] 교역이 실제로 돌았다(장부 줄 0 이면 ② 가 공짜다)', `${R.rows}줄`);
ok(R.hit === 0, '② ★0원 원석은 교역 장부에 한 줄도 안 실린다(보낸 것 · 바구니 · 산 것 · 되돌린 바구니)', `${R.hit}줄${R.hitItems.length ? ' · ' + R.hitItems.join(' · ') : ''}`);
ok(R.pK > 0, '③ [상황] 아는 원석은 광부 한 시간 값이 0 이 아니다(대조 — 자명 통과 금지)', `${R.known} p=${R.pK}`);
ok(R.pZ === 0, '③ ★0원 원석만 캐는 광부 한 시간 값 = 0', `p=${R.pZ}`);
ok(R.pK > 0 && Math.abs(R.pM - 0.5 * R.pK) <= 1e-12 * Math.max(1, R.pK), '③ ★섞인 조성(반 · 반) = 아는 원석 몫만(0원 몫 0)', `p=${R.pM} · 반 몫 ${0.5 * R.pK}`);
{
  const env = Object.assign({}, process.env, { T1328_CHILD: '1', T1266_ORE_BODY: '1', T1293_ORE_SAT: '1' });
  const r = spawnSync(process.execPath, [__filename], { env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const m = /\n@@(\{.*\})\n/.exec(r.stdout || '');
  const C = m ? JSON.parse(m[1]) : null;
  ok(!!C && r.status === 0, '④ [상황] 광부 문 켬 아이 판(T1266 몸 · T1293 녹임 목표)이 돌았다', C ? `0원 ${C.cells}칸` : String(r.stderr || '').slice(0, 120));
  ok(!!C && C.pZ === 0 && C.hit === 0, '④ ★광부 문 켬에서도 0원 원석 값 0 · 교역 0', C ? `p=${C.pZ} · 교역 ${C.hit}줄` : '');
}
// ★미끼 [T1356] — econ 사본(같은 자리 · 같은 이웃 모듈)에서 한 곳만 바꾼다: 그림자 값 칸 `(px[id] || 0)` → 바닥 1. ③★ 가 빨강이어야 한다.
{
  const Module = require('module'), fs = require('fs');
  const F = path.join(ROOT, 'sim', 'economy-sim-v2.js'), src = fs.readFileSync(F, 'utf8');
  const FROM = 'p += g * (px[id] || 0);', TO = 'p += g * Math.max(1, px[id] || 0);';
  const n = src.split(FROM).length - 1;
  let B = null, err = '';
  if (n === 1) { const _l = console.log; try { console.log = () => {}; const m = new Module(F, module); m.filename = F; m.paths = Module._nodeModulePaths(path.dirname(F)); m._compile(src.replace(FROM, TO), F); console.log = _l; B = probe(m.exports); } catch (e) { err = String(e && e.message || e).slice(0, 120); } finally { console.log = _l; } }
  ok(n === 1 && !!B && B.cells > 0 && B.pZ > 0, '미끼 — 광부 값 그림자 칸에 바닥 1 을 건 econ 사본 → ③★(0원 원석 값 = 0) 빨강', `바꾼 자리 ${n} · 사본 p=${B ? B.pZ : err || '?'} · 0원 ${B ? B.cells : '?'}칸`);
}
console.log(`\n=== test-t1328-ore-zero 결과: ${pass} 통과 / ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
