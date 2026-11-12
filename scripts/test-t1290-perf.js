#!/usr/bin/env node
'use strict';
// @regress
// === scripts/test-t1290-perf.js — µs 줄기 T1290 의 두 자리(결과 바이트 같음 · 손잡이 0) ===
//   ① 생활층 크루 물음 — `_t435CrewHas` · `_t527CrewHas` = 배열 판 `.some(p => p.pid === pid)`(명부 · 빈 몸 · 건너뜀 · 끊음 흔든 판)
//      · `_t1181Step` 이 넘긴 술어 = 다시 물은 술어(글자).
//   ② 틱마다 부르는 모듈 문 — roads `_rVil` 은 데운 뒤 경로 풀기 0 · 캐시가 지워지면 종전처럼 다시 적재 · villages 밭 개간 문은 머리 모듈.
//   ③ 미끼 — 건너뜀 · 끊음을 빠뜨린 훑기는 ① 의 견줌이 문다.
//   (결정 문 근처 질의를 빌린 배열로 바꾼 판은 재 보니 몫이 늘어 되돌렸다 — 보고 §2.)
const assert = require('assert/strict'), path = require('path'), fs = require('fs'), Module = require('module'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ✓ ' + m + (d !== undefined ? '  ' + d : '')); } else { fail++; console.log('  ✗ ' + m + (d !== undefined ? '  ' + d : '')); } };
let s = 20261112 >>> 0; const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);

console.log('\n① 크루 물음 — 배열 없는 판 = 배열 판');
{
  const V = require('../server/villages'), P = V.__labProbe._t1290Probe, S = V.__p3Bind({}).state;
  const E = require('../sim/economy-sim');
  const players = new Map(); S.deps = Object.assign(S.deps || {}, { players });
  for (let i = 0; i < 40; i++) players.set('n' + i, { pid: 'n' + i });
  let q = 0, bad = 0, hit = 0, nSite = 0, nGran = 0, nBoth = 0;
  for (let t = 0; t < 400; t++) {
    const ids = []; const m = Math.floor(r() * 9);
    for (let k = 0; k < m; k++) ids.push('n' + Math.floor(r() * 46));   // 없는 몸(40 ~ 45) · 겹침 섞임
    const vil = { npcPids: r() < 0.05 ? undefined : ids, _site: r() < 0.5 ? {} : null, _granPend: r() < 0.5 ? {} : null };
    if (vil._site) nSite++; if (vil._granPend) nGran++; if (vil._site && vil._granPend) nBoth++;
    for (let k = 0; k < 48; k++) {
      const pid = 'n' + k;
      const a1 = P.crew435(vil).some((p) => p.pid === pid), b1 = P.crew435Has(vil, pid);
      const a2 = P.crew527(vil).some((p) => p.pid === pid), b2 = P.crew527Has(vil, pid);
      q += 2; if (a1 !== b1) bad++; if (a2 !== b2) bad++; if (a1 || a2) hit++;
    }
  }
  ok(bad === 0 && hit > 100, `마을 400 × 몸 48 — 곳간 · 다리 크루 같은 답(건너뜀 · 끊음 ${P.crew()} · 빈 몸 · 겹침)`, `견줌 ${q} · 참 ${hit} · 어긋남 ${bad}`);
  ok(nSite > 50 && nGran > 50 && nBoth > 20 && !!E.T435_GRANARY_ACT, '전제 — 건너뜀 갈래를 다 탔다(집터 · 곳간 터 · 둘 다) · 곳간 행위 켬 기본', `집터 ${nSite} · 곳간 ${nGran} · 둘 ${nBoth} · T400 ${!!E.T400_BUILD_ACT}`);
  const src = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  const st = src.slice(src.indexOf('function _t1181Step(vil,npc,now,awake) {'), src.indexOf('function _t1181Step(vil,npc,now,awake) {') + 400);
  ok(/if\(!E\.productionActsBound\(vil\.econ\)\)return false;/.test(st) && /_t1181Task\(vil,npc,true\)/.test(st), '`_t1181Step` 은 술어가 참일 때만 `bound = true` 를 넘긴다(같은 줄 위에서 물었다)');
}

console.log('\n② 틱마다 부르는 모듈 문 — 경로 풀기 0');
{
  const R = fs.readFileSync(path.join(ROOT, 'server', 'roads.js'), 'utf8');
  const head = R.indexOf('let _rVK = null;'), end = R.indexOf('\n', R.indexOf('function _villagesBusy()'));
  ok(head > 0 && end > head, 'roads 두 문(`_sliceMs` · `_villagesBusy`)이 `_rVil` 을 쓴다');
  const body = R.slice(head, end);
  let res = 0, req = 0;
  const cache = {};
  const fakeReq = function (id) { req++; res++; const k = '/v/' + id; if (!cache[k]) cache[k] = { exports: { tickSliceMs: () => 7, villagesBusy: () => true, n: req } }; return cache[k].exports; };
  fakeReq.resolve = (id) => { res++; return '/v/' + id; };
  fakeReq.cache = cache;
  const ctx = { require: fakeReq }; vm.createContext(ctx); vm.runInContext(body + '\nthis._sliceMs=_sliceMs; this._villagesBusy=_villagesBusy;', ctx);
  ctx._sliceMs(); const r0 = res;
  let x = 0; for (let i = 0; i < 1000; i++) { x += ctx._sliceMs(); if (ctx._villagesBusy()) x++; }
  ok(res === r0 && x === 8000, `데운 뒤 2,000 부름 — 경로 풀기 ${res - r0} 번 · 같은 답`);
  delete cache['/v/./villages'];
  const before = req; ctx._sliceMs();
  ok(req === before + 1, '캐시 칸이 지워지면 종전처럼 `require` 로 다시 적재(하네스가 모듈을 갈아 끼운 판)');
  const V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  const f1 = V.slice(V.indexOf('function _t1221ClearS(vil, k) {'), V.indexOf('\n}\n', V.indexOf('function _t1221ClearS(vil, k) {')));
  const f2 = V.slice(V.indexOf('function _t1243ClearedM2(vil, k) {'), V.indexOf('\n', V.indexOf('function _t1243ClearedM2(vil, k) {')));
  ok(!/require\(/.test(f1) && !/require\(/.test(f2) && /^const _terrCost = require\('\.\/terr-cost'\);/m.test(V), '밭 개간 문 둘 — 머리에서 잡은 `_terrCost`(같은 모듈 객체) · 부를 때 `require` 0');
}

console.log('\n③ 미끼 — 끊음을 빠뜨린 배열 없는 판');
{
  const V = require('../server/villages'), P = V.__labProbe._t1290Probe;
  const players = V.__p3Bind({}).state.deps.players;
  const bad = (vil, pid) => { for (const k of (vil.npcPids || [])) { const p = players.get(k); if (p && p.pid === pid) return true; } return false; };   // 건너뜀 · 끊음 없는 훑기(틀린 판)
  let q = 0, diff = 0;
  for (let t = 0; t < 200; t++) {
    const ids = []; for (let k = 0; k < 6; k++) ids.push('n' + Math.floor(r() * 40));
    const vil = { npcPids: ids, _site: r() < 0.5 ? {} : null, _granPend: r() < 0.5 ? {} : null };
    for (let k = 0; k < 40; k++) { q++; if (bad(vil, 'n' + k) !== P.crew435(vil).some((p) => p.pid === 'n' + k)) diff++; }
  }
  ok(diff > 0, '건너뜀 · 끊음을 빠뜨리면 ① 의 견줌이 문다(자명 통과 아님)', `견줌 ${q} · 어긋남 ${diff}`);
}
console.log(`\n=== T1290 성능 자리 ${pass} 통과 · ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
