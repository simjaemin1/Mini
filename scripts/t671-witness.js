#!/usr/bin/env node
// === scripts/t671-witness.js — T671 ② 바이트 같음 증인 (러너 밖 · 서버 0) ===============================================
// T670 증인 문법 그대로: 종전 글자(`git show <ref>:server/zone.js` · 기본 T670 가지 끝)와 지금 글자에서 **같은 함수**를 떠
// 같은 입력열을 먹이고 돌려준 값 · 사람의 모든 필드를 `Object.is` 로 견준다(−0 · NaN 까지).
//   ⓐ 비교 술어 `_t671Lt`/`_t671Gt` ↔ `Math.hypot(dx, dy) < R` / `> R` — R = 5 · 10 · 12 · 48(제품이 쓰는 넷) ·
//      경계 바로 옆(상대 1e-13 안) 표본 + 고른 표본 + 경계를 비트 단위로 넘나드는 표본 + 가장자리(NaN · ±∞ · ±0 · 넘침 · 밑넘침)
//   ⓑ `detectStuck` — 종전 ↔ 지금(서 있음 12px · 움직임 5px 경계를 일부러 노린 걸음)
//   ⓒ `followNpcPath` — 종전 ↔ 지금(10px 경계 · 다점 경로 · 돌려준 값 · vx/vy 비트)
//   ⓓ `computeNpcPath` — 종전 ↔ 지금(48px 경계 · 뒤 갈래는 같은 결정론 대역으로 — 돌려준 길 내용 · 사람 필드)
//   ⓔ `_t671Shape` — 목록이 리터럴·스폰 대입과 겹치지 않는다(값을 덮지 않는다) · 이름 붙은 쓰기만 · 중복 0 · 켬/끔 손잡이 한 자리
// 실행: node scripts/t671-witness.js [ref=88bd5795]
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const REF = process.argv[2] || '88bd5795';
const OLD = execFileSync('git', ['show', `${REF}:server/zone.js`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
const NEW = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x != null ? '  ' + x : '')); };
const fnSrc = (S, name) => { const i = S.indexOf(`function ${name}(`); if (i < 0) return null; const j = S.indexOf('\n}\n', i); return S.slice(i, j + 2); };
const lineSrc = (S, name) => { const i = S.indexOf(`function ${name}(`); if (i < 0) return null; return S.slice(i, S.indexOf('\n', i) + 1); };
let x = 0x9e3779b9; const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
const same = (a, b) => { const ka = Object.keys(a).sort(), kb = Object.keys(b).sort(); if (ka.join() !== kb.join()) return 'keys ' + ka + ' / ' + kb;
  for (const k of ka) { const va = a[k], vb = b[k]; if (va && typeof va === 'object') { if (va === vb) continue; const r = same(va, vb); if (r !== true) return k + '.' + r; } else if (!Object.is(va, vb)) return k + ' ' + va + ' ≠ ' + vb; } return true; };
const clone = (o) => { const r = {}; for (const k of Object.keys(o)) { const v = o[k]; r[k] = Array.isArray(v) ? v.map((p) => ({ ...p })) : (v && typeof v === 'object') ? { ...v } : v; } return r; };
const HELP = lineSrc(NEW, '_t671Lt') + lineSrc(NEW, '_t671Gt');
const _f64 = new Float64Array(1), _u64 = new BigUint64Array(_f64.buffer);
const nextUp = (v, k) => { _f64[0] = v; _u64[0] += BigInt(k); return _f64[0]; };   // 양수에서 k ulp 옆

console.log('\n=== T671 ② 바이트 같음 증인 · 종전', REF, '===');
// ⓐ 술어
{
  ok(!!lineSrc(NEW, '_t671Lt') && !!lineSrc(NEW, '_t671Gt'), 'ⓐ [전제] 지금 글자에서 두 술어를 떴다');
  const { Lt, Gt } = new Function(HELP + '\nreturn { Lt: _t671Lt, Gt: _t671Gt };')();
  let n = 0, nBand = 0, nSqDiff = 0, bad = null;
  const chk = (dx, dy, R) => { n++; const h = Math.hypot(dx, dy); const a = h < R, b = Lt(dx, dy, R), c = h > R, d = Gt(dx, dy, R);
    if ((dx * dx + dy * dy < R * R) !== a) nSqDiff++;
    const d2 = dx * dx + dy * dy; if (!(d2 < R * R * (1 - 1e-12)) && !(d2 > R * R * (1 + 1e-12))) nBand++;
    if (a !== b || c !== d) { if (!bad) bad = [dx, dy, R, h, a, b, c, d]; } };
  for (const R of [5, 10, 12, 48]) {
    for (let i = 0; i < 1500000; i++) {   // 경계 바로 옆 — 세계 좌표에서 뺀 dx/dy(제품의 꼴)
      const a = rnd() * Math.PI * 2, rr = R * (1 + (rnd() - 0.5) * 2e-13), x0 = rnd() * 3e5, y0 = rnd() * 3e5;
      chk((x0 + Math.cos(a) * rr) - x0, (y0 + Math.sin(a) * rr) - y0, R);
    }
    for (let i = 0; i < 500000; i++) chk((rnd() - 0.5) * 6 * R, (rnd() - 0.5) * 6 * R, R);   // 고르게
    for (let i = 0; i < 200000; i++) {   // 정확히 경계 위의 점(축 · 피타고라스)에서 비트 단위로 ±64 ulp
      const a = rnd() * Math.PI * 2, dx = Math.cos(a) * R, dy = Math.sqrt(Math.max(0, R * R - dx * dx));
      const k = Math.floor(rnd() * 129) - 64; chk(dx < 0 ? -nextUp(-dx, Math.max(0, k)) : nextUp(dx, Math.max(0, k)), k < 0 ? nextUp(dy, -k) : dy, R);
    }
    for (const [ex, ey] of [[R, 0], [0, R], [-R, 0], [0, -R], [R * 0.6, R * 0.8], [R * 0.8, -R * 0.6], [nextUp(R, 1), 0], [nextUp(R, -1), 0]]) chk(ex, ey, R);
  }
  const EDGE = [NaN, Infinity, -Infinity, 0, -0, 1e-200, -1e-200, 5e-324, 1e200, -1e200, 1.7976931348623157e308];
  let ne = 0; for (const R of [5, 10, 12, 48]) for (const a of EDGE) for (const b of EDGE.concat([3, -4, R])) { chk(a, b, R); ne++; }
  ok(n > 8500000, 'ⓐ [상황] 표본 수', n);
  ok(nSqDiff > 100, 'ⓐ [상황] 제곱 비교만으로는 **실제로 갈린다**(이 증인이 경계를 밟았다)', nSqDiff);
  ok(nBand > 100, 'ⓐ [상황] 띠 안(hypot 로 넘긴) 표본', nBand);
  ok(ne > 400, 'ⓐ [상황] 가장자리(NaN · ±∞ · ±0 · 넘침 · 밑넘침 · 최소 비정규) 짝', ne);
  ok(!bad, 'ⓐ ★★`_t671Lt`/`_t671Gt` ↔ `Math.hypot(…) < R` / `> R` — **한 번도 안 다르다**', bad ? JSON.stringify(bad) : null);
}
// ⓑ detectStuck
{
  const so = (fnSrc(OLD, '_t670Stuck') ? lineSrc(OLD, '_t670Stuck') : '') + fnSrc(OLD, 'detectStuck');
  const sn = HELP + lineSrc(NEW, '_t670Stuck') + fnSrc(NEW, 'detectStuck');
  ok(/_t671Lt/.test(sn) && /_t671Gt/.test(sn) && !/_t671/.test(so), 'ⓑ [전제] 두 글자가 실제로 다르다');
  const Fo = new Function(so + '\nreturn detectStuck;')(), Fn = new Function(sn + '\nreturn detectStuck;')();
  let n = 0, d = null, near12 = 0, near5 = 0;
  for (let p = 0; p < 64 && !d; p++) {
    const A = { x: 1000 + p * 50.37, y: 2000.11, targetX: 1200 + p * 50, targetY: 2100.3, path: null, pathIndex: 0 }; let B = clone(A);
    let now = 1e6;
    for (let t = 0; t < 4000 && !d; t++) {
      now += 33 + (rnd() < 0.01 ? 2000 : 0);
      const r = rnd();
      if (r < 0.25) { const a = rnd() * 6.283, s = 5 * (1 + (rnd() - 0.5) * 1e-12); const S = A._stuckPos; if (S) { A.x = S.x + Math.cos(a) * s; A.y = S.y + Math.sin(a) * s; near5++; } }   // 움직임 5px 경계
      else if (r < 0.5) { const a = rnd() * 6.283, s = 12 * (1 + (rnd() - 0.5) * 1e-12); A.x = A.targetX + Math.cos(a) * s; A.y = A.targetY + Math.sin(a) * s; near12++; }   // 서 있음 12px 경계
      else if (r < 0.7) { A.x += (rnd() - 0.5) * 20; A.y += (rnd() - 0.5) * 20; }
      else if (r < 0.71) { A.x = rnd() < 0.5 ? -0 : NaN; }
      if (rnd() < 0.05) { A.path = rnd() < 0.5 ? null : [{ x: 0, y: 0 }]; A.pathIndex = rnd() < 0.5 ? 0 : 1; }
      B.x = A.x; B.y = A.y; B.path = A.path; B.pathIndex = A.pathIndex;
      const ra = Fo(A, now), rb = Fn(B, now); n++;
      const s = same(A, B); if (ra !== rb || s !== true) d = [n, ra, rb, s];
    }
  }
  ok(n > 200000 && near12 > 40000 && near5 > 40000, 'ⓑ [상황] 걸음 · 12px 경계 · 5px 경계', `${n} · ${near12} · ${near5}`);
  ok(!d, 'ⓑ ★★`detectStuck` 종전 ↔ 지금 — 돌려준 값 · 사람 필드(Object.is) **한 번도 안 다르다**', d ? JSON.stringify(d) : null);
}
// ⓒ followNpcPath
{
  const so = fnSrc(OLD, 'followNpcPath'), sn = HELP + fnSrc(NEW, 'followNpcPath');
  ok(/_t671Lt/.test(sn) && !/_t671/.test(so), 'ⓒ [전제] 두 글자가 실제로 다르다');
  const Fo = new Function('MOVE_SPEED', so + '\nreturn followNpcPath;')(160), Fn = new Function('MOVE_SPEED', sn + '\nreturn followNpcPath;')(160);
  let n = 0, d = null, nearN = 0;
  for (let i = 0; i < 600000 && !d; i++) {
    const L = 1 + Math.floor(rnd() * 4), P = [];
    const x0 = rnd() * 3e5, y0 = rnd() * 3e5;
    for (let k = 0; k < L; k++) P.push({ x: x0 + (rnd() - 0.5) * 400, y: y0 + (rnd() - 0.5) * 400 });
    const pi = Math.floor(rnd() * (L + 1));
    let X = x0, Y = y0;
    if (pi < L && rnd() < 0.6) { const a = rnd() * 6.283, s = 10 * (1 + (rnd() - 0.5) * 1e-12); X = P[pi].x - Math.cos(a) * s; Y = P[pi].y - Math.sin(a) * s; nearN++; }
    const A = { x: X, y: Y, vx: 1, vy: 2, path: rnd() < 0.02 ? null : P, pathIndex: pi }, B = { x: X, y: Y, vx: 1, vy: 2, path: A.path, pathIndex: pi };
    const sm = rnd() < 0.3 ? undefined : rnd() * 3;
    const ra = Fo(A, sm), rb = Fn(B, sm); n++;
    const s = same(A, B); if (ra !== rb || s !== true) d = [n, ra, rb, s];
  }
  ok(n >= 600000 && nearN > 200000, 'ⓒ [상황] 부름 · 10px 경계', `${n} · ${nearN}`);
  ok(!d, 'ⓒ ★★`followNpcPath` 종전 ↔ 지금 — 돌려준 값 · `pathIndex` · vx/vy 비트 **한 번도 안 다르다**', d ? JSON.stringify(d) : null);
}
// ⓓ computeNpcPath
{
  const so = fnSrc(OLD, 'computeNpcPath'), sn = HELP + fnSrc(NEW, 'computeNpcPath');
  ok(/_t671Lt/.test(sn) && !/_t671/.test(so), 'ⓓ [전제] 두 글자가 실제로 다르다');
  const h = (...a) => { let s = 0; for (const v of a) s = (s * 31 + Math.floor((v || 0) * 7)) % 1000003; return s; };
  const env = { straightPathClear: (ax, ay, bx, by) => h(ax, ay, bx, by) % 3 === 0, T381_PATH_DEAD: true, BUILDING_SIZE: 32,
    isTerrainBlockedLocal: (a, b) => h(a, b) % 7 === 0, _pfRadius: (v) => v ? 64 : 24, T399_CELL_CAP: false, isBlockedByWall: () => false,
    pfFindPath: (sx, sy, ex, ey) => h(sx, sy, ex, ey) % 5 === 0 ? null : [{ x: sx, y: sy }, { x: (sx + ex) / 2, y: (sy + ey) / 2 }, { x: ex, y: ey }],
    _roadPrefer: null, _streamOn: () => false, _streamCost: null, PathCore: { smoothPath: (wp) => wp.slice() }, Roads: { ENABLED: false }, _roadKeep: null };
  const K = Object.keys(env);
  const Fo = new Function(...K, so + '\nreturn computeNpcPath;')(...K.map((k) => env[k])), Fn = new Function(...K, sn + '\nreturn computeNpcPath;')(...K.map((k) => env[k]));
  let n = 0, d = null, near = 0;
  for (let i = 0; i < 600000 && !d; i++) {
    const x0 = rnd() * 3e5, y0 = rnd() * 3e5; let tx, ty;
    if (rnd() < 0.6) { const a = rnd() * 6.283, s = 48 * (1 + (rnd() - 0.5) * 1e-12); tx = x0 + Math.cos(a) * s; ty = y0 + Math.sin(a) * s; near++; }
    else { tx = x0 + (rnd() - 0.5) * 300; ty = y0 + (rnd() - 0.5) * 300; }
    const P = rnd() < 0.3 ? [{ x: tx, y: ty }] : rnd() < 0.5 ? null : [{ x: 1, y: 2 }];
    const base = { x: x0, y: y0, targetX: tx, targetY: ty, path: P, behavior: rnd() < 0.2 ? 'flee' : 'wander', simVillageId: rnd() < 0.8 ? 'v1' : null, _lastAStarAt: rnd() < 0.5 ? 0 : 1e6 - 100 };
    const A = { ...base }, B = { ...base };
    const now = 1e6 + Math.floor(rnd() * 4000);
    const ra = Fo(A, now), rb = Fn(B, now); n++;
    const rs = (ra === null || rb === null) ? (ra === rb) : (Array.isArray(ra) && Array.isArray(rb) && JSON.stringify(ra) === JSON.stringify(rb) && ra.every((p, j) => Object.is(p.x, rb[j].x) && Object.is(p.y, rb[j].y)) && ((ra === P) === (rb === P)));
    const s = same(A, B); if (!rs || s !== true) d = [n, JSON.stringify(ra), JSON.stringify(rb), s];
  }
  ok(n >= 600000 && near > 300000, 'ⓓ [상황] 부름 · 48px 경계', `${n} · ${near}`);
  ok(!d, 'ⓓ ★★`computeNpcPath` 종전 ↔ 지금 — 돌려준 길(내용 · 좌표 비트 · 재사용 여부) · 사람 필드 **한 번도 안 다르다**', d ? JSON.stringify(d) : null);
}
// ⓔ _t671Shape
{
  const f = fnSrc(NEW, '_t671Shape');
  ok(!!f, 'ⓔ [전제] `_t671Shape` 를 떴다');
  const body = f.split('\n').slice(1, -1).map((l) => l.replace(/\/\/.*$/, '')).join(' ').trim();   // 줄 끝 주석은 뺀다
  const stmts = body.split(';').map((s) => s.trim()).filter(Boolean);
  ok(stmts.every((s) => /^p\.[A-Za-z_$][\w$]* = undefined$/.test(s)), 'ⓔ 이름 붙은 쓰기만(계산 키 0 — 사전 모드 문턱 회피)', stmts.length + '줄');
  const keys = stmts.map((s) => s.slice(2, s.indexOf(' ')));
  ok(new Set(keys).size === keys.length, 'ⓔ 키 중복 0', keys.length);
  const sp = fnSrc(NEW, 'spawnNpc'); const i0 = sp.indexOf('  const player = {'), i1 = sp.indexOf('  if (T671_SHAPE) _t671Shape(player);');
  ok(i0 > 0 && i1 > i0, 'ⓔ [전제] 스폰의 리터럴 → `_t671Shape` 순서');
  const before = sp.slice(i0, i1);
  const hit = keys.filter((k) => new RegExp('(^|[\\s{,])' + k.replace('$', '\\$') + '\\s*[:,]|player\\.' + k.replace('$', '\\$') + '\\s*=').test(before));
  ok(hit.length === 0, 'ⓔ ★목록이 리터럴·스폰 대입과 **안 겹친다**(이미 값을 받은 필드를 `undefined` 로 덮지 않는다)', hit.join(',') || null);
  ok((NEW.match(/_t671Shape\(/g) || []).length === 2 && /const T671_SHAPE = process\.env\.T671_SHAPE !== '0';/.test(NEW), 'ⓔ 손잡이 `T671_SHAPE` 한 자리(PM 10-07 켬 기본 · =0 이면 부름 0)');
}
// ⓕ `_warPackOf` — `delete` 를 `undefined` 로 바꿔도 같은 답인가: 서버 전체의 이 필드 자리가 전부 같음 비교·대입뿐인가(글자 표)
{
  const V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  const all = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'server')).filter((f) => f.endsWith('.js'))) {
    const S = fs.readFileSync(path.join(ROOT, 'server', f), 'utf8'); let i = -1;
    while ((i = S.indexOf('_warPackOf', i + 1)) >= 0) { const ln = S.slice(S.lastIndexOf('\n', i) + 1, S.indexOf('\n', i)); if (/^\s*\/\//.test(ln)) continue; all.push(f + ': ' + S.slice(i - 10, i + 22)); }
  }
  const okUse = (u) => /\._warPackOf (===|!==) w\.id/.test(u) || /\._warPackOf = (w\.id|undefined)/.test(u) || /delete p\._warPackOf/.test(u) || /p\._warPackOf = undefined/.test(u);
  const bad = all.filter((u) => !okUse(u));
  ok(all.length >= 8, 'ⓕ [상황] `_warPackOf` 자리 수', all.length);
  ok(bad.length === 0, 'ⓕ ★읽는 자리는 같음 비교(`=== w.id`·`!== w.id`)뿐 — 키 목록·`in`·펼침 0 ⇒ 없음 ↔ `undefined` 같은 답', bad.join(' | ') || null);
  ok(/function _t671Unpack\(p\) \{ if \(T671_SHAPE\) p\._warPackOf = undefined; else delete p\._warPackOf; \}/.test(V) && (V.match(/delete p\._warPackOf/g) || []).length === 1,
     'ⓕ 끔 = 종전 `delete` 그대로(지우는 자리 셋이 한 함수로)');
}
console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
process.exit(fail ? 1 : 0);
