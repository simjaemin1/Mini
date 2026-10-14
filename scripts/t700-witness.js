#!/usr/bin/env node
// === scripts/t700-witness.js — T700 막힘 갈래 깎기 — 바이트 같음 증인 (러너 밖 · 서버 0) =================================
// 종전 글자(`git show <ref>:server/zone.js` · 기본 origin/main)의 `detectStuck`(+`_t670Stuck`)과 지금 글자의 켬 갈래(`_t700Detect`)를
// 같은 몸 사건열에 먹이고 매 부름 돌려준 값 · 몸 필드를 견준다. `_stuckPos` 는 그릇이 다르다(객체 ↔ Float64Array) — 담긴 세 수를
// `Object.is` 로 견준다(종전 undefined ↔ 지금 NaN 은 같은 몫으로 친다 — 그 칸은 뺄셈에만 쓰인다 · ⓑ 가 그 몸을 넣는다).
//   ⓐ 켬 ↔ 종전 — 걸음 · 서 있음(12px 경계) · 움직임(5px 경계) · 타이머(1500ms 경계) · 길 둘 · 처음 · −0 — 한 번도 안 다르다
//   ⓑ 수 아닌 위치(undefined · NaN · 문자열 아닌 값)를 섞어도 돌려준 값·이후 판정이 같다
//   ⓒ 끔 = 종전 글자 그대로(첫 줄 단락)
//   ⓓ `_stuckPos` 를 읽고 쓰는 자리 = 서버 전체에서 이 함수들뿐
//   ⓔ 미끼 — 칸 번호를 바꾸면(x↔y) 문다 · `_stuckN` 을 안 쓰면 문다
// 실행: node scripts/t700-witness.js [ref=origin/main]
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const REF = process.argv[2] || 'origin/main';
const OLD = execFileSync('git', ['show', `${REF}:server/zone.js`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
const NEW = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x != null ? '  ' + x : '')); };
const fnSrc = (S, name) => { const i = S.indexOf(`function ${name}(`); if (i < 0) throw new Error('없음 ' + name); const j = S.indexOf('\n}\n', i); return S.slice(i, j + 2); };
const lineSrc = (S, name) => { const i = S.indexOf(`function ${name}(`); if (i < 0) throw new Error('없음 ' + name); return S.slice(i, S.indexOf('\n', i) + 1); };
const HELP = (S) => lineSrc(S, '_t671Lt') + lineSrc(S, '_t671Gt') + lineSrc(S, '_t670Stuck');
const build = (S, on) => {
  let src = HELP(S) + fnSrc(S, 'detectStuck');
  if (on !== undefined) src = 'const T700_STUCK = ' + (on ? 'true' : 'false') + ';\n' + lineSrc(S, '_t700Set') + fnSrc(S, '_t700Detect') + src;
  return new Function(src + '\nreturn detectStuck;')();
};
const sameNum = (a, b) => Object.is(a, b) || (a === undefined && Number.isNaN(b));
const stuckOf = (S) => (S == null ? null : (S instanceof Float64Array ? [S[0], S[1], S[2]] : [S.x, S.y, S.at]));
const same = (A, B) => {
  const ka = Object.keys(A).filter((k) => k !== '_stuckPos').sort(), kb = Object.keys(B).filter((k) => k !== '_stuckPos').sort();
  if (ka.join() !== kb.join()) return 'keys ' + ka + ' / ' + kb;
  for (const k of ka) if (!(A[k] === B[k] || Object.is(A[k], B[k]))) return k + ' ' + A[k] + ' ≠ ' + B[k];
  const a = stuckOf(A._stuckPos), b = stuckOf(B._stuckPos);
  if ((a === null) !== (b === null)) return '_stuckPos 있음/없음';
  if (a) for (let i = 0; i < 3; i++) if (!sameNum(a[i], b[i])) return '_stuckPos[' + i + '] ' + a[i] + ' ≠ ' + b[i];
  return true;
};
let x = 0x9e3779b9; const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
function run(Fo, Fn, opts) {
  let n = 0, d = null, kinds = { stand: 0, move5: 0, timer: 0, walk: 0, odd: 0, stuckTrue: 0 };
  for (let p = 0; p < 64 && !d; p++) {
    const A = { x: 1000 + p * 50.37, y: 2000.11, targetX: 1200 + p * 50, targetY: 2100.3, path: null, pathIndex: 0 }, B = Object.assign({}, A);
    let now = 1e6 + p * 17;
    for (let t = 0; t < opts.ticks && !d; t++) {
      now += 33 + (rnd() < 0.01 ? 1467 + ((rnd() * 70) | 0) : 0);   // 타이머 경계(1500) 둘레로 뛴다
      const r = rnd();
      const set = (k, v) => { A[k] = v; B[k] = v; };
      if (r < 0.2) { const S = A._stuckPos; if (S) { const a = rnd() * 6.283, s = 5 * (1 + (rnd() - 0.5) * 1e-12); set('x', S.x + Math.cos(a) * s); set('y', S.y + Math.sin(a) * s); kinds.move5++; } }
      else if (r < 0.4) { const a = rnd() * 6.283, s = 12 * (1 + (rnd() - 0.5) * 1e-12); set('x', A.targetX + Math.cos(a) * s); set('y', A.targetY + Math.sin(a) * s); kinds.stand++; }
      else if (r < 0.55) { set('x', A.x + (rnd() - 0.5) * 20); set('y', A.y + (rnd() - 0.5) * 20); kinds.walk++; }
      else if (r < 0.555 + opts.odd) { const v = [-0, NaN, undefined, Infinity][(rnd() * 4) | 0]; set(rnd() < 0.5 ? 'x' : 'y', v); kinds.odd++; }
      else if (r < 0.57 + opts.odd) { set('x', 1000 + p * 50.37); set('y', 2000.11); }   // 수로 되돌림
      if (rnd() < 0.04) { const P = rnd() < 0.4 ? null : rnd() < 0.5 ? [{ x: 0, y: 0 }] : [{ x: 0, y: 0 }, { x: 1, y: 1 }]; set('path', P); set('pathIndex', (rnd() * 3) | 0); }
      if (rnd() < 0.01) { set('targetX', rnd() < 0.3 ? null : A.x + (rnd() - 0.5) * 30); }
      if (rnd() < 0.003) { A._stuckPos = undefined; B._stuckPos = undefined; }   // 처음(없음)
      const ra = Fo(A, now), rb = Fn(B, now); n++;
      if (ra) kinds.stuckTrue++;
      const s = same(A, B); if (ra !== rb || s !== true) d = [p, t, ra, rb, s];
    }
  }
  return { n, d, kinds };
}
console.log('\n=== T700 막힘 갈래 깎기 — 바이트 같음 증인 · 종전', REF, '===');
ok(/const T700_STUCK = process\.env\.T700_STUCK === '1';/.test(NEW) && /  if \(T700_STUCK\) return _t700Detect\(npc, now\);/.test(NEW), '[전제] 손잡이 `T700_STUCK` 기본 끔 · `detectStuck` 첫 줄 단락');
const Fo = build(OLD), Fon = build(NEW, true), Foff = build(NEW, false);
{ const r = run(Fo, Fon, { ticks: 6000, odd: 0 });
  ok(r.n > 300000 && r.kinds.stand > 50000 && r.kinds.move5 > 50000 && r.kinds.stuckTrue > 1000, 'ⓐ [상황] 부름 · 12px · 5px 경계 · 막힘 참', JSON.stringify(r.kinds) + ' · ' + r.n);
  ok(!r.d, 'ⓐ ★★켬 ↔ 종전 — 돌려준 값 · 몸 필드 · `_stuckPos` 세 수(Object.is) **한 번도 안 다르다**', r.d ? JSON.stringify(r.d) : null); }
{ const r = run(Fo, Fon, { ticks: 4000, odd: 0.03 });
  ok(r.kinds.odd > 5000, 'ⓑ [상황] 수 아닌 위치(−0 · NaN · undefined · ∞)', r.kinds.odd);
  ok(!r.d, 'ⓑ ★켬 ↔ 종전 — 수 아닌 위치가 섞여도 돌려준 값·이후 판정 같다(undefined ↔ NaN 은 같은 몫)', r.d ? JSON.stringify(r.d) : null); }
{ const r = run(Fo, Foff, { ticks: 2000, odd: 0.02 });
  ok(!r.d, 'ⓒ 끔 ↔ 종전 — 같다(그릇도 같은 객체)', r.d ? JSON.stringify(r.d) : null); }
{ const hits = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'server')).filter((f) => f.endsWith('.js'))) {
    const S = fs.readFileSync(path.join(ROOT, 'server', f), 'utf8'); let i = -1;
    while ((i = S.indexOf('_stuckPos', i + 1)) >= 0) { const ln = S.slice(S.lastIndexOf('\n', i) + 1, S.indexOf('\n', i)); if (/^\s*\/\//.test(ln)) continue;
      const fnStart = S.lastIndexOf('\nfunction ', i), fn = S.slice(fnStart + 10, S.indexOf('(', fnStart + 10)); hits.push(f + ':' + fn); } }
  const okFns = new Set(['zone.js:_t670Stuck', 'zone.js:detectStuck', 'zone.js:_t700Set', 'zone.js:_t700Detect', 'zone.js:_t671Shape']);
  const bad = hits.filter((h) => !okFns.has(h));
  ok(hits.length >= 10 && bad.length === 0, 'ⓓ `_stuckPos` 자리 = `_t670Stuck` · `detectStuck` · `_t700Set` · `_t700Detect` · `_t671Shape`(모양 선언)뿐', bad.join(',') || hits.length); }
{ const res = [];
  for (const [k, a, b] of [['x↔y 칸', 'S[0] = npc.x; S[1] = npc.y;', 'S[0] = npc.y; S[1] = npc.x;'], ['`_stuckN` 안 씀', '    _t700Set(npc, now);\n    if (npc._stuckN !== 0) npc._stuckN = 0;\n    return false;\n  }\n  const S', '    _t700Set(npc, now);\n    return false;\n  }\n  const S'], ['타이머 칸 틀림', 'now - S[2] > 1500', 'now - S[1] > 1500']]) {
    if (NEW.split(a).length !== 2) { res.push(k + ':앵커없음'); continue; }
    const r = run(Fo, build(NEW.replace(a, b), true), { ticks: 2000, odd: 0 });
    res.push(k + ':' + (r.d ? '물었다' : '놓쳤다')); }
  ok(res.every((s) => s.endsWith('물었다')), 'ⓔ ★미끼 셋 — 증인이 **다 문다**', res.join(' · ')); }
console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
process.exit(fail ? 1 : 0);
