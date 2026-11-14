#!/usr/bin/env node
'use strict';
// @regress
// === scripts/test-t1314-cols.js — 몸 칸 열(SoA) 첫 걸음 = 몸 칸과 같음 (T1314 · `server/hot-cols.js`) ===
//   ① 무작위 몸 1,000(쌍 — 맨 객체 ↔ 칸 받은 몸) × 걸음 1,000 — 다섯 칸에 수(−0 · NaN · ∞) · undefined · null · 글자 · 객체를 쓰기 길(`w`)로 섞어 쓰고
//      몸 칸 = 맨 객체(Object.is) · 열 = 몸 칸(`check` 어긋남 0) · 머리 읽기(`nda` · `pi` · `pn` · `px` · `py`) = 몸 칸 · 키 차례 · `JSON.stringify` 바이트 같음.
//   ② 존 글자 — 다섯 칸을 쓰는 자리(`_t671Shape` 밖)가 전부 `HC.ON ? HC.w(…) : 종전` 꼴 · 머리 읽기 둘 · 견줌 자리 하나가 `HC.ON` / `HC.VERIFY` 뒤.
//   ③ 왜 거울 꼴인가 — 몸 칸을 제자리에서 접근자로 바꾸면 사전 모드(이 판에서 다시 본다) · 거울 꼴 몸은 빠른 모드 · 모양 하나.
//   ④ 미끼 — 몸 칸만 고치고 열을 안 고친 쓰기 길 사본은 ① 의 `check` 가 문다.
//   ⑤ 손잡이 — `T1314_HOT_COLS` 는 `'1'` · `'verify'` 만 켬.
const path = require('path'), fs = require('fs'), vm = require('vm'), v8 = require('v8');
v8.setFlagsFromString('--allow-natives-syntax');
const same = new Function('a', 'b', 'return %HaveSameMap(a, b)'), fast = new Function('a', 'return %HasFastProperties(a)');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ✓ ' + m + (d !== undefined ? '  ' + d : '')); } else { fail++; console.log('  ✗ ' + m + (d !== undefined ? '  ' + d : '')); } };
const SRC = fs.readFileSync(path.join(ROOT, 'server', 'hot-cols.js'), 'utf8');
const load = (src, env) => { const m = { exports: {} }; vm.runInThisContext('(function (module, exports, require, process) {' + src + '\n})')(m, m.exports, require, { env: env || {} }); return m.exports; };
let s0 = 13141114 >>> 0; const r = () => ((s0 = (Math.imul(s0, 1664525) + 1013904223) >>> 0) / 4294967296);
const mkBody = (i) => ({ pid: 'n' + i, x: i * 3.5, y: -i, vx: 0, vy: 0, hp: 100, nextDecisionAt: 0, targetX: i, targetY: -i, behavior: 'idle',
  path: undefined, pathIndex: undefined, _t791P: undefined, _t791Pn: undefined, _t791Px: undefined, _t791Py: undefined, inventory: { stone: i % 3 } });
const VAL = () => { const k = r(); return k < 0.5 ? (r() - 0.5) * 1e4 : k < 0.55 ? -0 : k < 0.58 ? NaN : k < 0.6 ? Infinity : k < 0.7 ? undefined : k < 0.78 ? null : k < 0.85 ? Math.floor(r() * 9) : k < 0.92 ? 'w' + Math.floor(r() * 5) : { k: Math.floor(r() * 3) }; };
function sim(H, N, T) {
  const A = [], B = [];
  for (let i = 0; i < N; i++) { A.push(mkBody(i)); const b = mkBody(i); H.install(b); B.push(b); }
  let bad = 0, rd = 0, json = 0, keys = 0, q = 0;
  for (let t = 0; t < T; t++) {
    const i = Math.floor(r() * N), f = H.FIELDS[Math.floor(r() * H.FIELDS.length)], v = VAL();
    A[i][f] = v; H.w(B[i], f, v);
    if (r() < 0.3) { A[i].pathIndex++; H.w(B[i], 'pathIndex', +B[i].pathIndex + 1); }   // `x++` 자리의 꼴(undefined → NaN 까지 같은 값)
    for (const g of H.FIELDS) { q++; if (!Object.is(A[i][g], B[i][g])) bad++; }
    const p = B[i]; if (!Object.is(H.nda(p), p.nextDecisionAt) || !Object.is(H.pi(p), p.pathIndex) || !Object.is(H.pn(p), p._t791Pn) || !Object.is(H.px(p), p._t791Px) || !Object.is(H.py(p), p._t791Py)) rd++;
  }
  for (let i = 0; i < N; i++) {
    if (Object.keys(A[i]).join(',') !== Object.keys(B[i]).filter((k) => k !== '_hcS').join(',')) keys++;
    if (JSON.stringify(A[i]) !== JSON.stringify(B[i], (k, v) => (k === '_hcS' ? undefined : v))) json++;
  }
  return { bad, rd, json, keys, q, colBad: H.check(), A, B };
}
console.log('\n① 칸 받은 몸 = 맨 객체 · 열 = 몸 칸(몸 1,000 × 걸음 1,000)');
const H = load(SRC, {});
const R1 = sim(H, 1000, 1000);
ok(R1.bad === 0 && R1.colBad === 0, `몸 칸 = 맨 객체 · 열 = 몸 칸(Object.is · 다섯 칸 × 몸 1,000 전수)`, `견줌 ${R1.q} · 몸 ${R1.bad} · 열 ${R1.colBad}(check ${H.stat.checks})`);
ok(R1.rd === 0, '머리 읽기 다섯 = 몸 칸', `어긋남 ${R1.rd}`);
ok(R1.keys === 0 && R1.json === 0, '키 차례 · JSON 바이트 같음(몸 칸 번호 `_hcS` 하나만 더해졌다)', `키 ${R1.keys} · JSON ${R1.json}`);
ok(H.stat.other > 0 && H.stat.writes >= 1000, '전제 — 수 아닌 값 갈래 · 쓰기 길을 탔다', `그 밖 ${H.stat.other} · 쓰기 ${H.stat.writes}`);
console.log('\n② 존 글자');
{
  const Z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  const i0 = Z.indexOf('function _t671Shape(p) {'), i1 = Z.indexOf('\n}\n', i0), Zx = Z.slice(0, i0) + Z.slice(i1);
  const code = Zx.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  const raw = [...code.matchAll(/(else )?\b(npc|p)\.(nextDecisionAt|pathIndex|_t791Pn|_t791Px|_t791Py)\s*(=(?!=)|\+\+)/g)].filter((m) => !m[1]);
  const viaW = (code.match(/if \(HC\.ON\) HC\.w\((npc|p), '(nextDecisionAt|pathIndex|_t791Pn|_t791Px|_t791Py)'/g) || []).length;
  ok(raw.length === 0 && viaW >= 20, `다섯 칸 쓰기 자리 — 쓰기 길 ${viaW} 곳 · 길 밖 맨 쓰기 0`, raw.slice(0, 3).map((m) => m[0]).join(' | '));
  ok(/HC\.ON \? now < HC\.nda\(npc\) : now < npc\.nextDecisionAt/.test(Z) && /HC\.ON \? HC\.pi\(npc\) : npc\.pathIndex/.test(Z) && /if \(HC\.VERIFY && /.test(Z) && /  if \(HC\.ON\) HC\.install\(player\);/.test(Z), '머리 읽기 둘 · 칸 받기 · 견줌이 `HC.ON` / `HC.VERIFY` 뒤(끔 = 종전 글자)');
}
console.log('\n③ 왜 거울 꼴인가');
{
  const D = { get() { return 1; }, set(v) {}, enumerable: true, configurable: true };
  const a = mkBody(0); Object.defineProperty(a, 'targetX', D);
  ok(!fast(a), '제자리 접근자 꼴은 사전 모드로 떨어진다(그래서 몸 칸은 데이터 그대로 · 열은 두 번째 자리)');
  const nMaps = (L) => { const reps = []; for (const o of L) if (!reps.some((x) => same(x, o))) reps.push(o); return reps.length; };
  const B = R1.B, A = R1.A; let dict = 0; for (const b of B) if (!fast(b)) dict++;
  const mb = nMaps(B), ma = nMaps(A);
  ok(dict === 0 && mb <= ma, '거울 꼴 몸 1,000 — 사전 모드 0 · 모양 수 ≤ 맨 객체의 모양 수(열이 새 모양을 안 만든다)', `열 몸 ${mb} · 맨 객체 ${ma} · 사전 ${dict}`);
}
console.log('\n④ 미끼 — 몸 칸만 고치고 열을 안 고친 쓰기 길');
{
  const bait = SRC.replace('function w(p, f, v) { p[f] = v; const s = p._hcS; if (s >= 0) { _put(K[IX[f]], s, v); stat.writes++; } return v; }', 'function w(p, f, v) { p[f] = v; stat.writes++; return v; }');
  ok(bait !== SRC, '미끼 사본을 지었다');
  const R4 = sim(load(bait, {}), 300, 1000);
  ok(R4.colBad > 0, '① 의 열 견줌(`check`)이 문다(자명 통과 아님)', `어긋남 ${R4.colBad}`);
}
console.log('\n⑤ 손잡이');
ok(load(SRC, {}).ON === false && load(SRC, { T1314_HOT_COLS: '1' }).ON === true && load(SRC, { T1314_HOT_COLS: 'verify' }).VERIFY === true && load(SRC, { T1314_HOT_COLS: 'yes' }).ON === false, "`T1314_HOT_COLS` 는 `'1'` · `'verify'` 만 켬");
console.log(`\n=== T1314 몸 칸 열 ${pass} 통과 · ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
