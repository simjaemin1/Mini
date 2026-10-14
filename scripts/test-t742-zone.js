#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t742-zone.js — T742 존 · 모듈 메모리 영속(`T742_ZONE_KEEP`) 계약 ==========================================
//   정본 함수를 그대로 부른다(`villages.t742Bind` · `__labProbe._t742Probe`).
//   ① 손잡이 기본 끔(env 없는 자식) · 끔이면 거는 문이 무동작(이름 0)
//   ② 켬: 도적 주사위 차례(`bandits.bTick`)가 모듈 적재로 걸린다 · 메타 이름표 칸 왕복(Map 열매 재고 꼴 · 차례 그대로)
//   ③ 걸리기 전에 읽은 값은 기다렸다가 넣는다 · 그 사이 저장이 와도 잃지 않는다
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
console.log('\n=== T742 존 · 모듈 메모리 영속 ===');
{
  const env = Object.assign({}, process.env); delete env.T742_ZONE_KEEP;
  const v = execFileSync(process.execPath, ['-e', "const V=require('./server/villages.js');require('./server/bandits.js');process.stdout.write(JSON.stringify([V.__labProbe._t742Probe.T742_ZONE, V.__labProbe._t742Probe.names().length, V.t742Bind('x',()=>1,()=>{})]))"], { cwd: ROOT, env }).toString();
  ok(v === '[false,0,false]', '① 기본 끔 — 거는 문 무동작 · 이름 0(env 없는 자식)', v);
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
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
