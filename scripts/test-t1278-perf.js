#!/usr/bin/env node
'use strict';
// @regress
// === scripts/test-t1278-perf.js — 몸 판 CPU 1 · 2위 덩이(캐러밴 몸 전진 · 이동 준비 `_wwPre`)를 줄인 자리 [T1278] ===
//   ① 캐러밴 몸 전진 — 몸 틱(`tickCaravanBodies` · 정본 `_caravanBodyProbe.tick`)이 데운 뒤 `require()` 경로 풀기(`Module._resolveFilename`)를 0 번 부른다.
//      종전 `_t1182Step` 은 몸 · 호위 · 알갱이마다 `require('./zone-config')` 를 불러 그 풀기가 캐러밴 전진 CPU 의 ~92 %(30날 표본)였다.
//      ★기계 무관 단언 — 시간이 아니라 부른 수를 센다. 같은 판에서 몸 자리 · 진행도가 종전 식(같은 수식을 이 하네스가 다시 셈)과 비트 같다.
//   ② 서 있는 몸 답 기억(`_wwIsStill` · zone.js) — 그 함수 글자를 떠서(사본 0 · 실행은 이 하네스 안 샌드박스) 지형 비트 · 몸 자리를 흔들며
//      기억 길 = 새로 셈 길(답 전부 같음) · 지형 비트 0 은 기억 안 함 · `clearTerrain` 두 자리가 세대를 올린다.
//   ③ 미끼 — 세대를 안 올린 기억(지운 뒤에도 옛 답)은 ② 의 견줌이 문다.
const assert = require('assert/strict'), path = require('path'), fs = require('fs'), Module = require('module'), vm = require('vm');
if (process.env.T1253_CLOCK_FIX == null) process.env.T1253_CLOCK_FIX = '0';   // test-t1182-caravan-body 와 같은 묶음(몸 틱을 인수 시각으로 몬다)
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ✓ ' + m + (d !== undefined ? '  ' + d : '')); } else { fail++; console.log('  ✗ ' + m + (d !== undefined ? '  ' + d : '')); } };

console.log('\n① 캐러밴 몸 전진 — require 풀기 0');
{
  const V = require('../server/villages'), E = require('../sim/economy-sim-v2'), W = require('../server/zone-config').WORLD, MM = require('../public/move-model');
  const P = V.__labProbe._caravanBodyProbe, S = V.__p3Bind({}).state;
  const w = E.createWorldV2({ seed: 7, villageCount: 2, picker: 'rational', infoRange: 5000, raidPer100: 0 });
  const [a, b] = w.villages;
  const N = 12, bodies = new Map(), players = new Map();
  for (let k = 0; k < N; k++) {
    const c = { id: 100 + k, from: a, to: b, trader: a.npcs[0], state: 'outbound', arriveDay: 10000, escort: 0 };
    const p = { pid: 'm' + k, x: 0, y: k * 40, hp: 100, hunger: 100, thirst: 100 };
    const body = { c, pid: p.pid, phase: 'outbound', toV: b, _t1182: true, _t1182At: 1000, escorts: [], pinHunger: 100, pinThirst: 100, repairFailN: 0, lastRepairAt: 0, delayedDays: 0 };
    P.pts(body, [{ x: 0, y: k * 40 }, { x: 4000, y: k * 40 }, { x: 4000, y: k * 40 + 3000 }]);
    bodies.set(c.id, body); players.set(p.pid, p);
  }
  Object.assign(S, { world: w, ready: false, dayMs: W.dayLengthMs, roads: null, deps: { players, npcs: new Map(), moveSpeed: 0, isPositionActive: () => true, isBlockedByWall: () => false, setHp: (q, v) => { q.hp = v; return v; } }, caravanBodies: bodies, _carTickAt: 1000 });
  let t = 1000;
  P.tick(t += 33);   // 데우기(처음 한 번은 모듈을 잡는다)
  const orig = Module._resolveFilename; let n = 0;
  Module._resolveFilename = function () { n++; return orig.apply(this, arguments); };
  const step = (dtMs) => (S.deps.moveSpeed || MM.DEFAULTS.baseSpeed) * dtMs / 1000 * W.dayLengthMs / S.dayMs;   // 정본 `_t1182Step` 식(종전 글자) — 진행도 대조용
  const prog0 = [...bodies.values()].map((x) => x.prog);
  const T = 300; for (let i = 0; i < T; i++) P.tick(t += 33);
  Module._resolveFilename = orig;
  ok(n === 0, `몸 ${N} × 틱 ${T} — require 경로 풀기 ${n} 번(종전 꼴이면 몸 · 틱마다 1 번 이상 = ${N * T} 이상)`);
  const want = Math.min(4000 + 3000, step(33) * T);
  const got = [...bodies.values()].map((x, k) => x.prog - prog0[k]);
  ok(got.every((g) => Math.abs(g - want) < 1e-6), `진행도 = 정본 식(속도 × dt × 하루 비) × 틱 — 몸 ${N} 모두`, `${got[0].toFixed(6)} · 식 ${want.toFixed(6)}`);
  ok(MM.DEFAULTS.baseSpeed > 0 && S.deps.moveSpeed === 0, '전제 — 존 속도 없음(0)이라 move-model 기본 속도 갈래를 탄다(자명 통과 아님)');
}

console.log('\n② 서 있는 몸 답 기억 — 기억 길 = 새로 셈');
{
  const src = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  const grab = (head) => { const i = src.indexOf(head); assert.ok(i >= 0, head); const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2); };
  const fIs = grab('function _wwIsStill(p, i) {'), fGrow = grab('function _wwStGrow(need) {');
  const decl = src.match(/let _wwTbGen = 0, _wwStN = 0;[^\n]*\nlet _wwStRef = [^\n]*\n/);
  ok(!!decl, '세대 · 기억 칸 선언이 `_WW` 선언 곁(이른 줄)에 있다 — `clearTerrain` 자리가 먼저 불려도 TDZ 0');
  ok((src.match(/_WW\.clearTerrain\(\)/g) || []).length === 2 && (src.match(/_WW\.clearTerrain\(\); _wwTbGen\+\+;/g) || []).length === 2, '`clearTerrain` 두 자리가 세대를 올린다');
  ok(/_wwIsStill\(p, T774_ACTIVE_COL \? _si : undefined\)/.test(src), '부르는 곳은 T774 슬롯을 넘긴다(끔이면 기억 없음)');
  const make = (bump) => {
    const ctx = { Math, Float64Array, Uint32Array, Uint8Array, T1145_XY_COLS: false, _xyX: null, _xyY: null, _WW: { zw: 3200, zh: 3200, tw: 100, TB: new Uint8Array(100 * 100 * 2 / 8) } };
    vm.createContext(ctx);
    vm.runInContext(decl[0].replace(/^let /gm, 'var ') + fIs + fGrow + `\nfunction clear(){ _WW.TB.fill(0); ${bump ? '_wwTbGen++;' : ''} }\nfunction fresh(p){ const x=p.x,y=p.y; if(!(x>0&&y>0&&x<_WW.zw&&y<_WW.zh)) return false; const b=(Math.floor(y/32)*_WW.tw+Math.floor(x/32))<<1; return ((_WW.TB[b>>3]>>(b&7))&3)===1; }`, ctx);
    return ctx;
  };
  const run = (ctx) => {
    let s = 12345 >>> 0; const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    const setBit = (cx, cy, v) => { const b = (cy * 100 + cx) << 1; if ((ctx._WW.TB[b >> 3] >> (b & 7)) & 3) return; ctx._WW.TB[b >> 3] |= (v << (b & 7)); };   // 커널 꼴 — 0(모름)인 칸만 한 번 굽는다
    const bodies = Array.from({ length: 300 }, (_, k) => ({ pid: k, x: 5 + r() * 3190, y: 5 + r() * 3190 }));
    bodies[0].x = 0; bodies[1].x = -0; bodies[2].x = NaN; bodies[3].x = 3200.5;   // 범위 밖 · ±0 · NaN
    let bad = 0, q = 0;
    for (let t = 0; t < 400; t++) {
      for (let k = 0; k < 40; k++) setBit(Math.floor(r() * 100), Math.floor(r() * 100), r() < 0.7 ? 1 : 2);   // 커널이 구운 칸(0 → 1 · 2)
      if (t % 97 === 50) ctx.clear();                                                                       // 지형 비트 영점(다리 · 환호)
      for (let k = 0; k < bodies.length; k++) {
        const p = bodies[k];
        if (r() < 0.05 && k > 3) { p.x = 5 + r() * 3190; p.y = 5 + r() * 3190; }
        const a = ctx._wwIsStill(p, k), f = ctx.fresh(p); q++; if (a !== f) bad++;
      }
      if (t % 50 === 7) bodies.reverse();   // 슬롯의 몸이 바뀐다(ref 검사)
    }
    return { bad, q };
  };
  const A = run(make(true));
  ok(A.bad === 0, `몸 300 × 틱 400 — 기억 길 = 새로 셈(지형 비트 굽기 · 영점 · 슬롯 바뀜 · 범위 밖 · ±0 · NaN)`, `견줌 ${A.q} · 어긋남 ${A.bad}`);
  console.log('\n③ 미끼 — 세대를 안 올린 기억');
  const B = run(make(false));
  ok(B.bad > 0, '세대를 안 올리면 영점 뒤 옛 답이 남아 ② 의 견줌이 문다', `어긋남 ${B.bad}`);
}
console.log(`\n=== T1278 성능 자리 ${pass} 통과 · ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
