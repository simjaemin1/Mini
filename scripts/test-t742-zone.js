#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t742-zone.js — T742 존 · 모듈 메모리 영속(`T742_ZONE_KEEP`) 계약 ==========================================
//   정본 함수를 그대로 부른다(`villages.t742Bind` · `__labProbe._t742Probe`).
//   ① 손잡이 기본 끔(env 없는 자식) · 끔이면 거는 문이 무동작(이름 0)
//   ② 켬: 도적 주사위 차례(`bandits.bTick`)가 모듈 적재로 걸린다 · 메타 이름표 칸 왕복(Map 열매 재고 꼴 · 차례 그대로)
//   ③ 걸리기 전에 읽은 값은 기다렸다가 넣는다 · 그 사이 저장이 와도 잃지 않는다
//   ④ ★[T753] 다시 셈 캐시의 "만든 상자" — 비옥도 장(`villages.fertBox` · 마지막으로 깐 상자)과 물거리 EDT(`villages.wfBox` · 마을마다 만든 영토 상자)가
//      메타 이름표 칸으로 왕복하고, 되돌림이 **같은 상자로 다시 만든다**(값 = 지형 + 상자의 함수 · 안 멈춘 판이 쓰던 묵은 상자 그대로)
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
console.log('\n=== T742 존 · 모듈 메모리 영속 ===');
{
  const env = Object.assign({}, process.env, { T742_ZONE_KEEP: '0' });   // ★[PM 10-14] 기본 켬 — 끔 = '0'
  const v = execFileSync(process.execPath, ['-e', "const V=require('./server/villages.js');require('./server/bandits.js');process.stdout.write(JSON.stringify([V.__labProbe._t742Probe.T742_ZONE, V.__labProbe._t742Probe.names().length, V.t742Bind('x',()=>1,()=>{})]))"], { cwd: ROOT, env }).toString();
  ok(v === '[false,0,false]', '① 끔(`=0`) — 거는 문 무동작 · 이름 0', v);
}
process.env.T742_ZONE_KEEP = '1';
const V = require(path.join(ROOT, 'server', 'villages.js'));
require(path.join(ROOT, 'server', 'bandits.js'));
const P = V.__labProbe._t742Probe;
ok(P.T742_ZONE && P.names().includes('bandits.bTick'), '② 켬 — 도적 주사위 차례가 걸린다', P.names().join(','));
let store = new Map([['a', { n: 1.5, yr: 3 }], ['b', { n: 0, yr: 2 }]]);
V.t742Bind('t.fruit', () => store, (m) => { store = m; });
const o = JSON.parse(JSON.stringify(P.out()));
ok(o['t.fruit'] && o['bandits.bTick'] != null, '② 메타 이름표 칸에 둘 다 실린다', Object.keys(o).join(','));
store = new Map();
P.in(o);
ok(store instanceof Map && [...store.keys()].join('|') === 'a|b' && store.get('a').n === 1.5, '② 되돌림 — Map 차례 · 값 그대로(재기동 = 딴 열매가 다시 달리지 않는다)');
// ③ 늦게 걸리는 이름
P.in({ 't.late': { $M: ['k', 7] } });
const o2 = P.out();
ok(o2['t.late'] && JSON.stringify(o2['t.late']) === JSON.stringify({ $M: ['k', 7] }), '③ 아직 안 걸린 이름은 저장이 와도 읽은 그대로 다시 싣는다');
let late = null; V.t742Bind('t.late', () => late, (m) => { late = m; });
ok(late instanceof Map && late.get('k') === 7 && !(P.pend() && 't.late' in P.pend()), '③ 걸리는 순간 넣고 기다림에서 지운다');
// ④ ★[T753] 비옥도 장 · 물거리 EDT 상자
{
  const VL = require(path.join(ROOT, 'server', 'village-layout.js'));
  let ff = [964, 1864, 62]; const laid = [];
  const ta = { isWater: (x, y) => x === 10 && y >= 0 && y <= 40, fertBox: () => ff, prepareFert: (a, b, c) => { laid.push([a, b, c]); ff = [a, b, c]; } };
  const k0 = V.__labProbe._huntProbe.setTa(ta);
  const vil = { dbId: 77, name: '어촌2' };
  const SU = Object.values(V.__labProbe).find((x) => x && typeof x === 'object' && typeof x.setup === 'function');
  const keep = SU.setup({ villages: [vil], byDbId: new Map([[77, vil]]) });
  const stale = [0, 0, 20, 20];   // 처음 쓸 때의 영토 상자(그 뒤 영토가 자라도 이 상자로 쓴다)
  vil._wf = VL.waterEDT(ta, stale[0] - 32, stale[1] - 32, stale[2] + 32, stale[3] + 32);
  Object.defineProperty(vil._wf, '_t753B', { value: stale, writable: true, configurable: true });
  ok(P.names().includes('villages.fertBox') && P.names().includes('villages.wfBox'), '④ 켬 — 비옥도 상자 · 물거리 상자가 걸린다');
  const o3 = JSON.parse(JSON.stringify(P.out()));
  ok(JSON.stringify(o3['villages.fertBox']) === '[964,1864,62]' && JSON.stringify(o3['villages.wfBox']) === '{"77":[0,0,20,20]}', '④ 메타 이름표 칸에 상자가 실린다(EDT 값은 안 싣는다)', JSON.stringify([o3['villages.fertBox'], o3['villages.wfBox']]));
  ok(!Object.keys(vil._wf).includes('_t753B'), '④ 상자 표는 안 세는 칸(마을 칸 해시 무변)');
  vil._wf = null; ff = null;   // 다시 뜬 꼴 — 캐시 0
  P.in(o3);
  ok(JSON.stringify(laid) === '[[964,1864,62]]', '④ 되돌림 — 비옥도 장을 같은 상자로 다시 깐다', JSON.stringify(laid));
  const fresh = VL.waterEDT(ta, -32, -32, 52, 52); let same = !!vil._wf, n = 0;
  if (vil._wf) for (let y = -40; y <= 60; y++) for (let x = -40; x <= 60; x++) { n++; if (vil._wf.at(x, y) !== fresh.at(x, y)) same = false; }
  ok(same && vil._wf._t753B && vil._wf._t753B.join() === '0,0,20,20', '④ 되돌림 — 물거리 EDT 를 묵은 상자로 다시 만든다(칸 ' + n + ' 다 같음)');
  SU.setup(keep); V.__labProbe._huntProbe.setTa(k0);
}
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
