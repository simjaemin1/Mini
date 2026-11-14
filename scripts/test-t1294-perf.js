#!/usr/bin/env node
'use strict';
// @regress
// === scripts/test-t1294-perf.js — µs 둘째(T1294) 자리: 바이트 같은 몫 = 종전 길 · 손잡이 몫 = 열쇠(지형 세대) ===
//   ① 도착 몸 길(ⓐ 바이트 같은 몫) — zone.js 의 `npcStep` 길 토막(needPath → 묻기 → 따라가기) 글자를 떠서 샌드박스에서
//      종전 글자(`_t1294Arrived` 뺌)와 나란히 몸 300 × 틱 600(도착 · 밀림 · 목표 바뀜 · 세대 바뀜 · −0 속도) — 몸 칸 전부 같음(`_pathAt` 만 다를 수 있다).
//   ② ⓐ 손잡이 켬 — 지형 세대가 바뀌면 다시 묻는다(세대가 같으면 안 묻는다) · ③ 미끼: 열쇠에서 지형 세대를 뺀 사본은 세대가 바뀐 뒤에도 안 묻는다 → ② 의 견줌이 문다.
//   ④ 어부 던질 자리 기억(ⓑ 바이트 같은 몫) — `_t1294Cast` 글자를 떠서 같은 몸 · 같은 x · y · 같은 세대면 지난 답 = 새로 셈(몸 40 × 틱 3,000) ·
//      켬(칸 열쇠)은 답이 갈릴 수 있다(셈이 바뀐다는 확인) · 미끼: 세대 빠진 기억은 세대가 바뀐 뒤 옛 답을 준다.
//   ⑤ `productionActsBound` 기억(econ) = 종전 식(세계 · 등록 흔든 판) · ⑥ 몸 모양 — `_t671Shape` 를 거친 두 몸에 어부 · 캐러밴 · 도적 · 짐 장부 칸을 써도 같은 숨은 모양.
const path = require('path'), fs = require('fs'), vm = require('vm'), v8 = require('v8');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ✓ ' + m + (d !== undefined ? '  ' + d : '')); } else { fail++; console.log('  ✗ ' + m + (d !== undefined ? '  ' + d : '')); } };
let s0 = 20261113 >>> 0; const r = () => ((s0 = (Math.imul(s0, 1664525) + 1013904223) >>> 0) / 4294967296);
const Z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const fn = (head) => { const i = Z.indexOf(head); if (i < 0) throw new Error(head); const j = Z.indexOf('\n}\n', i); return Z.slice(i, j + 2); };

// ── 길 토막 ──
const fLt = Z.slice(Z.indexOf('function _t671Lt('), Z.indexOf('\n', Z.indexOf('function _t671Lt(')) + 1);
const fArr = fn('function _t1294Arrived(npc, targetKey) {');
const fMir = fn('function _t791Mir(npc) {');
const fFol = fn('function followNpcPath(npc, speedMult) {');
let fCmp = fn('function computeNpcPath(npc, now) {');
fCmp = fCmp.slice(0, fCmp.indexOf('  const isVil')) + '  return [{ x: npc.targetX + 3, y: npc.targetY - 2 }, { x: npc.targetX, y: npc.targetY }];\n}\n';   // 48px 밖 = 두 점 길(결정적 대역)
const a = Z.indexOf('  const needPath = !npc.path'), b = Z.indexOf('  const arrived = followNpcPath(npc, speedMult);', a);
const seg = Z.slice(a, b) + '  const arrived = followNpcPath(npc, speedMult);\n  return arrived;\n';
ok(/\|\| \(T1294_ARRIVED_PATH && needPath && _t1294Arrived\(npc, targetKey\)\);/.test(seg) && /  if \(needPath && !_skip\) \{\n    const p = computeNpcPath\(npc, now\);/.test(seg) && /npc\._pathAt = now;/.test(seg), '길 토막 글자를 떴다(`_skip` 끝 손잡이 항 · 묻는 문 글자 그대로(계측기 닻) · 종전 쓰기 넷)');
const mk = (src, knob, arrSrc) => {
  const ctx = { Math, Object, T370_PATH_REUSE: false, T1294_ARRIVED_PATH: knob, T791_PATH_MIR: true, T1145_XY_COLS: false, T738_SOA_XY: false, MOVE_SPEED: 64, NPC_WALK_MULT: 1, GEN: 0, _t1294Stat: { strict: 0, knob: 0 } };
  vm.createContext(ctx);
  vm.runInContext(fLt.replace(/^function /, 'function ') + fMir + fFol + fCmp + (arrSrc || fArr) + 'function _t1294Gen() { return GEN; }\n' +
    'function step(npc, now, targetKey, speedMult) {\n' + src + '}\n', ctx);
  return ctx;
};
const OLD = seg.replace(/\n\s*\|\| \(T1294_ARRIVED_PATH && needPath && _t1294Arrived\(npc, targetKey\)\);[^\n]*/, ';');
if (OLD === seg) throw new Error('종전 글자 짓기 실패');
function sim(ctxA, ctxB, opt) {
  const N = 300, T = 600, A = [], B = [];
  for (let i = 0; i < N; i++) { const tx = 500 + r() * 2000, ty = 500 + r() * 2000, d = [0, 4, 9, 30, 120][i % 5]; const o = { x: tx + d, y: ty, vx: 0, vy: 0, targetX: tx, targetY: ty, path: undefined, pathIndex: undefined, _pathFor: undefined, _pathAt: undefined, _t791P: undefined, _t791Pn: undefined, _t791Px: undefined, _t791Py: undefined, _t1294G: undefined }; A.push({ ...o }); B.push({ ...o }); }
  let diff = 0, cmp = 0, skips = 0, now = 1000;
  for (let t = 0; t < T; t++) {
    now += 33; const ev = [];
    for (let i = 0; i < N; i++) ev.push([r(), r(), r(), r()]);
    const gb = r() < (opt.genP || 0.01); if (gb) { ctxA.GEN++; ctxB.GEN++; }
    for (const [W, C] of [[A, ctxA], [B, ctxB]]) for (let i = 0; i < N; i++) {
      const p = W[i], [e1, e2, e3, e4] = ev[i];
      if (e1 < 0.03) { p.targetX = p.x + (e2 - 0.5) * (e3 < 0.5 ? 16 : 300); p.targetY = p.y + (e4 - 0.5) * 16; }   // 목표 바뀜(가까이 · 멀리)
      else if (e1 < 0.05) { p.vx = (e2 - 0.5) * 40; p.vy = e3 < 0.3 ? -0 : 0; }                                            // 밀림 · −0
      else if (e1 < 0.06) { p.x += (e2 - 0.5) * 30; }                                                                       // 떠밀린 자리
      const key = `${p.targetX | 0}_${p.targetY | 0}`;
      C.step(p, now, key, 1);
      p.x += p.vx * 0.033; p.y += p.vy * 0.033;
    }
    for (let i = 0; i < N; i++) { cmp++; const x = A[i], y = B[i]; for (const k of ['x', 'y', 'vx', 'vy', 'pathIndex', '_pathFor', 'targetX', 'targetY', '_t791Pn', '_t791Px', '_t791Py']) if (!Object.is(x[k], y[k])) { diff++; break; } if (x.path !== x._t791P || JSON.stringify(x.path) !== JSON.stringify(y.path)) diff++; }
  }
  skips = ctxA._t1294Stat.strict + ctxA._t1294Stat.knob;
  return { diff, cmp, skips, strict: ctxA._t1294Stat.strict, knob: ctxA._t1294Stat.knob };
}
console.log('\n① 도착 몸 길 — 끔 = 종전 글자 · 바이트 같은 갈래(10px · 속도 +0)만 켜도 종전과 몸 칸 같음');
{
  const R0 = sim(mk(seg, false), mk(OLD, false), {});
  ok(R0.diff === 0 && R0.strict + R0.knob === 0, `끔 — 술어를 안 부른다(단락) · 몸 칸 어긋남 ${R0.diff}`, `견줌 ${R0.cmp}`);
  const strictOnly = fArr.replace(/\n  if \(T1294_ARRIVED_PATH && npc\._t1294G[^\n]*/, '');
  ok(strictOnly !== fArr, '바이트 같은 갈래만 남긴 술어 사본을 지었다(셈 바뀌는 48px 갈래 뺌)');
  const R1 = sim(mk(seg, true, strictOnly), mk(OLD, false), {});
  ok(R1.diff === 0 && R1.strict > 10000, `몸 300 × 틱 600 — 10px · 속도 +0 갈래 건너뜀 = 종전(자리 · 속도 · 길 · 거울) 어긋남 ${R1.diff}`, `견줌 ${R1.cmp} · 건너뜀 ${R1.strict}`);
}
console.log('\n② ⓐ 손잡이 켬 — 지형 세대가 열쇠');
const gate = (arrSrc) => {
  const C = mk(seg, true, arrSrc); C.GEN = 5;
  const p = { x: 1030, y: 1000, vx: 0, vy: 0, targetX: 1000, targetY: 1000, path: undefined, pathIndex: undefined, _pathFor: undefined, _pathAt: undefined, _t791P: undefined, _t791Pn: undefined, _t791Px: undefined, _t791Py: undefined, _t1294G: undefined };
  const k = '1000_1000';
  C.step(p, 1000, k, 1); p.pathIndex = p.path.length; p.vx = 0;          // 길을 지었고(세대 5) 30px 에 선 채 끝
  const P0 = p.path; C.step(p, 1033, k, 1); const same = p.path === P0 && p.pathIndex === P0.length;   // 같은 세대 = 안 묻는다(선 자리)
  C.GEN = 6; p.pathIndex = P0.length; C.step(p, 1066, k, 1); const asked = p._t1294G === 6;              // 세대가 바뀌면 다시 묻는다
  return { same, asked };
};
{
  const G = gate();
  ok(G.same && G.asked, '같은 세대 · 같은 목표 · 48px 안 · 길 끝 = 안 묻는다 / 세대가 바뀌면 묻는다', JSON.stringify(G));
  const R2 = sim(mk(seg, true), mk(OLD, false), {});
  ok(R2.knob > 0 && R2.diff > 0, '켬은 셈이 바뀐다(종전과 몸 칸이 갈린다 — 끔 기본 손잡이인 까닭)', `켬 건너뜀 ${R2.knob} · 어긋남 ${R2.diff}`);
}
console.log('\n③ 미끼 — 기억 열쇠에서 지형 세대를 뺀 사본');
{
  const bait = fArr.replace('npc._t1294G === _t1294Gen() && ', '');
  ok(bait !== fArr, '미끼 사본을 지었다(열쇠의 세대 항 하나 뺌)');
  const G = gate(bait);
  ok(!G.asked, '미끼는 세대가 바뀐 뒤에도 안 묻는다 → ② 의 단언이 문다(자명 통과 아님)', JSON.stringify(G));
}
console.log('\n④ 어부 던질 자리 기억');
{
  const fCast = fn('function _t1294Cast(p, spot) {');
  const run = (knob, src) => {
    const ctx = { Math, Object, WeakMap, T1294_LIFE_MEMO: knob, GEN: 0, calls: 0 };
    vm.createContext(ctx);
    vm.runInContext('const _t1294CastM = new WeakMap(), _t1294CastStat = { q: 0, hit: 0 };\nfunction _t1294Gen() { return GEN; }\n' +
      'function _castTargetFor(p, spot) { calls++; const h = Math.sin(p.x * 12.9898 + p.y * 78.233 + GEN * 3.7) * 43758.5453; const f = h - Math.floor(h); return f < 0.3 ? null : { x: Math.round(p.x / 32) * 32 + 16, y: Math.round(p.y / 32) * 32 - 16, sp: { water: true, v: f } }; }\n' + (src || fCast) + '\nthis.st = _t1294CastStat;', ctx);
    return ctx;
  };
  const go = (knob, src) => {
    const C = run(knob, src), D = run(false, 'function _t1294Cast(p, spot) { return _castTargetFor(p, spot); }');
    const B = Array.from({ length: 40 }, () => ({ x: 100 + r() * 3000, y: 100 + r() * 3000 })), B2 = B.map((p) => ({ ...p }));
    let diff = 0, q = 0;
    for (let t = 0; t < 3000; t++) {
      if (r() < 0.002) { C.GEN++; D.GEN++; }
      for (let i = 0; i < B.length; i++) {
        if (r() < 0.1) { const dx = (r() - 0.5) * 20, dy = (r() - 0.5) * 20; B[i].x += dx; B[i].y += dy; B2[i].x += dx; B2[i].y += dy; }
        const x = C._t1294Cast(B[i], true), y = D._t1294Cast(B2[i], true); q++;
        if (JSON.stringify(x) !== JSON.stringify(y)) diff++;
      }
    }
    return { diff, q, hit: C.st.hit, callsC: C.calls, callsD: D.calls };
  };
  const E1 = go(false);
  ok(E1.diff === 0 && E1.hit > 50000, `끔(정확한 x · y 열쇠) — 기억 길 = 새로 셈`, `견줌 ${E1.q} · 어긋남 ${E1.diff} · 기억 ${E1.hit} · 부름 ${E1.callsC} ← ${E1.callsD}`);
  const E2 = go(true);
  ok(E2.diff > 0, '켬(칸 열쇠)은 답이 갈린다(셈이 바뀐다 — 끔 기본 손잡이)', `어긋남 ${E2.diff}`);
  const bait = fCast.replace(' && m.g === g', '');
  const E3 = go(false, bait);
  ok(bait !== fCast && E3.diff > 0, '미끼 — 세대 빠진 기억은 세대가 바뀐 뒤 옛 답(① 의 견줌이 문다)', `어긋남 ${E3.diff}`);
}
console.log('\n⑤ productionActsBound 기억 = 종전 식');
{
  const E = require('../sim/economy-sim');
  const S = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
  const H = new WeakSet(), old = (v) => !!(v && v._world && H.has(v._world));
  const worlds = Array.from({ length: 8 }, () => ({})); let q = 0, bad = 0;
  for (let t = 0; t < 4000; t++) {
    if (r() < 0.01) { const w = worlds[Math.floor(r() * 8)]; E.bindProductionActs(w); H.add(w); }
    const k = r(), v = k < 0.05 ? null : k < 0.1 ? {} : k < 0.12 ? { _world: 0 } : { _world: worlds[Math.floor(r() * 8)] };
    q++; if (E.productionActsBound(v) !== old(v)) bad++;
  }
  ok(bad === 0 && !/_productionActHosts\.delete/.test(S), `세계 8 · 물음 4,000(등록 사이사이) — 같은 답 · 등록 집합에서 지우는 자리 0`, `어긋남 ${bad}`);
}
console.log('\n⑥ 몸 모양 하나로');
{
  v8.setFlagsFromString('--allow-natives-syntax');
  const same = new Function('a', 'b', 'return %HaveSameMap(a, b)');
  const sh = fn('function _t671Shape(p) {');
  const ctx = { _t316Econ: false, T1140_STUCK_INLINE: false, T1140_HOT_ORDER: false, T1144_LIFE_EVENT: true, T1241_DES: false, require };
  vm.createContext(ctx); vm.runInContext(sh + 'this.f = _t671Shape;', ctx);
  const mkB = () => { const p = { pid: 'x', x: 1, y: 2 }; ctx.f(p); return p; };
  const A = mkB(), F = mkB(), C = mkB(), D = mkB(), K = mkB();
  F._lastFishAt = 123; C.simCaravan = true; D._bdtGid = 7; D._t1078Fed = 1; K.kgLedger = {}; K._granTask = null;
  ok(same(A, F) && same(A, C) && same(A, D) && same(A, K), '어부 · 캐러밴 · 도적 · 짐 장부 · 곳간행 칸을 써도 태어날 때와 같은 모양(새 모양 0)');
  const G = { pid: 'x', x: 1, y: 2 }; G._lastFishAt = 1;
  ok(!same(A, G), '전제 — `_t671Shape` 를 안 거친 몸은 모양이 다르다(자명 통과 아님)');
}
console.log(`\n=== T1294 성능 자리 ${pass} 통과 · ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
