#!/usr/bin/env node
// === scripts/t791-witness.js — T791 ② 길 거울(`T791_PATH_MIR`) 바이트 같음 증인 (러너 밖 · 서버 0) ==========================
// T670 · T671 증인 문법 그대로: 종전 글자(`git show <ref>:server/zone.js` · 기본 T791 가지의 main 밑)와 지금 글자에서 **같은 함수**를 떠
// 걸음 몸통의 길 토막(막힘 판정 → 되묻기 판정 → 길 묻기 · 넣기(+ 거울) → 따라가기 → 걸음)을 같은 순서로 엮고,
// 같은 입력열(몸 · 목표 바꿈 · 길 지움 · 걸음)을 먹여 **돌려준 값 · 몸의 모든 필드**(거울 칸 넷 빼고)를 `Object.is` 로 견준다(−0 · NaN 까지).
//   ⓐ 종전 ↔ 지금 끔(거울 안 비춤)  ⓑ 종전 ↔ 지금 켬(거울 비춤) — 선 몸(도착 · 한 점 길) · 걷는 몸(여러 점 길 · 빈 길) · 목표 바꿈 · 길 지움 · 48 · 12 · 10px 경계
//   ⓒ 거울을 실제로 읽는가(켬에서 거울 맞힘 수 > 0 · 선 몸 틱마다)  ⓓ 자명 통과 금지 — 길 점을 제자리에서 고치면(가짜) 켬이 **갈린다**(전제가 "길은 안 고친다"임을 보인다)
//   ⓔ 정적 전수 — 서버 · sim 전체에서 몸 `.path` 넣기 자리 = 길 넣기 하나 + `null` 둘 · 길 배열/점 제자리 쓰기 0 · `.pathIndex` 쓰기 = 셋 · 거울 칸 쓰기 = `_t791Mir` 하나
//   ⓕ 손잡이 한 자리 · 기본 끔 · 몸 칸 넷이 `_t671Shape` 목록에
// 실행: node scripts/t791-witness.js [ref=02a62e66]
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const REF = process.argv[2] || '02a62e66';
const OLD = execFileSync('git', ['show', `${REF}:server/zone.js`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
const NEW = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x != null && x !== '' ? '  ' + x : '')); };
const fnSrc = (S, name) => { const i = S.indexOf(`function ${name}(`); if (i < 0) return null; const j = S.indexOf('\n}\n', i); return S.slice(i, j + 2); };
const lineSrc = (S, name) => { const i = S.indexOf(`function ${name}(`); if (i < 0) return null; return S.slice(i, S.indexOf('\n', i) + 1); };
const needSrc = (S) => { const m = S.match(/  const needPath = ([\s\S]*?\(npc\._pathAt && now - npc\._pathAt > 5000\));/); return m ? m[1] : null; };
let rs = 0x2545f491; const rnd = () => { rs ^= rs << 13; rs >>>= 0; rs ^= rs >>> 17; rs ^= rs << 5; rs >>>= 0; return rs / 4294967296; };
const MIRK = new Set(['_t791P', '_t791Pn', '_t791Px', '_t791Py']);
const same = (a, b) => {
  const ka = Object.keys(a).filter((k) => !MIRK.has(k)).sort(), kb = Object.keys(b).filter((k) => !MIRK.has(k)).sort();
  if (ka.join() !== kb.join()) return 'keys ' + ka + ' / ' + kb;
  for (const k of ka) { const va = a[k], vb = b[k];
    if (Array.isArray(va) || Array.isArray(vb)) { if (!Array.isArray(va) || !Array.isArray(vb) || va.length !== vb.length) return k + ' 길이';
      for (let i = 0; i < va.length; i++) if (!Object.is(va[i].x, vb[i].x) || !Object.is(va[i].y, vb[i].y)) return k + '[' + i + ']'; }
    else if (va && typeof va === 'object') { if (!vb || typeof vb !== 'object') return k; for (const q of Object.keys(va)) if (!Object.is(va[q], vb[q])) return k + '.' + q; }
    else if (!Object.is(va, vb)) return k + ' ' + va + ' / ' + vb; }
  return true;
};
// ── 두 글자에서 길 토막을 짓는다(대역은 t671-witness ⓓ 와 같은 결정론 대역 · 빈 길 · null 도 낸다) ─────────────────────
const h = (...a) => { let s = 0; for (const v of a) s = (s * 31 + Math.floor((v || 0) * 7)) % 1000003; return s; };
const ENV = { straightPathClear: (ax, ay, bx, by) => h(ax, ay, bx, by) % 3 === 0, T381_PATH_DEAD: true, BUILDING_SIZE: 32,
  isTerrainBlockedLocal: (a, b) => h(a, b) % 7 === 0, _pfRadius: (v) => (v ? 64 : 24), T399_CELL_CAP: false, isBlockedByWall: () => false,
  pfFindPath: (sx, sy, ex, ey) => { const k = h(sx, sy, ex, ey) % 9; return k === 0 ? null : k === 1 ? [] : [{ x: sx, y: sy }, { x: (sx + ex) / 2, y: (sy + ey) / 2 }, { x: ex, y: ey }]; },
  _roadPrefer: null, _streamOn: () => false, _streamCost: null, PathCore: { smoothPath: (wp) => wp.slice() }, Roads: { ENABLED: false }, _roadKeep: null,
  T678_ON: false, T678_VERIFY: false, _t678Now: () => 0, _t678Route: () => undefined, _t678Q: {}, _t678Verify: () => {}, T734_ASTAR_SLICE: false, _t678G: null, _t734Stamp: 0, T734_VERIFY: false, _t734V: null };
function build(S, withMir) {
  const src = lineSrc(S, '_t671Lt') + lineSrc(S, '_t671Gt') + lineSrc(S, '_t670Stuck') + fnSrc(S, 'detectStuck') + fnSrc(S, 'followNpcPath') + fnSrc(S, 'computeNpcPath')
    + (withMir ? fnSrc(S, '_t791Mir') : 'function _t791Mir() {}\n')
    + `function step(npc, now, MIR) {
  if (detectStuck(npc, now)) { npc.path = null; npc.pathIndex = 0; return 'stuck'; }
  if (npc.targetX !== npc._t670TkX || npc.targetY !== npc._t670TkY) { npc._t670TkX = npc.targetX; npc._t670TkY = npc.targetY; npc._t670Tk = \`\${npc.targetX|0}_\${npc.targetY|0}\`; }
  const targetKey = npc._t670Tk;
  const needPath = ${needSrc(S)};
  if (needPath) { const p = computeNpcPath(npc, now); npc.path = p || [{ x: npc.targetX, y: npc.targetY }]; npc.pathIndex = 0; npc._pathFor = targetKey; npc._pathAt = now; if (MIR) _t791Mir(npc); }
  return followNpcPath(npc, 0.6);
}
return step;`;
  const K = Object.keys(ENV);
  return new Function(...K, 'MOVE_SPEED', src)(...K.map((k) => ENV[k]), 120);
}
console.log('\n=== T791 ② 길 거울 바이트 같음 증인 · 종전', REF, '===');
ok(!!needSrc(OLD) && !!needSrc(NEW) && !!fnSrc(NEW, '_t791Mir'), '[전제] 두 글자에서 되묻기 판정 · 막힘 · 따라가기 · 도착 길 · (지금) 거울을 떴다');
ok(needSrc(OLD) !== needSrc(NEW) && fnSrc(OLD, 'followNpcPath') !== fnSrc(NEW, 'followNpcPath'), '[전제] 두 글자가 실제로 다르다');
const So = build(OLD, false), Sn = build(NEW, true);
const mkBody = (i) => { const x0 = 1000 + rnd() * 3e4, y0 = 1000 + rnd() * 3e4; return { pid: 'n' + i, x: x0, y: y0, vx: 0, vy: 0, targetX: x0 + (rnd() - 0.5) * 200, targetY: y0 + (rnd() - 0.5) * 200,
  path: undefined, pathIndex: undefined, _pathAt: undefined, _pathFor: undefined, _stuckN: undefined, _stuckPos: undefined, _t670Tk: undefined, _t670TkX: undefined, _t670TkY: undefined,
  _lastAStarAt: undefined, behavior: rnd() < 0.8 ? 'wander' : 'gather', simVillageId: rnd() < 0.9 ? 7 : undefined, floor: 0,
  _t791P: undefined, _t791Pn: undefined, _t791Px: undefined, _t791Py: undefined }; };
function sim(MIR, bait, label) {
  rs = 0x2545f491;
  const N = 400, T = 900; let n = 0, d = null, hits = 0, stand = 0, multi = 0, empty = 0, nulled = 0, retarget = 0, edge = 0;
  const A = [], B = []; for (let i = 0; i < N; i++) { const b = mkBody(i); A.push(b); B.push(JSON.parse(JSON.stringify(b, (k, v) => (v === undefined ? null : v)))); }
  for (let i = 0; i < N; i++) for (const k of Object.keys(A[i])) if (A[i][k] === undefined) B[i][k] = undefined;   // 같은 모양 · 같은 값
  let now = 5000;
  for (let t = 0; t < T && !d; t++) {
    now += 33 + (t % 3);
    for (let i = 0; i < N && !d; i++) {
      const a = A[i], b = B[i], r = rnd();
      // 바깥 사건 — 같은 사건을 두 몸에
      if (r < 0.004) { const nx = a.x + (rnd() - 0.5) * 600, ny = a.y + (rnd() - 0.5) * 600; a.targetX = b.targetX = nx; a.targetY = b.targetY = ny; retarget++; }
      else if (r < 0.008) { const ang = rnd() * 6.283, s = [48, 12, 10][(rnd() * 3) | 0] * (1 + (rnd() - 0.5) * 1e-12); a.targetX = b.targetX = a.x + Math.cos(ang) * s; a.targetY = b.targetY = a.y + Math.sin(ang) * s; edge++; }
      else if (r < 0.010) { a.path = b.path = null; nulled++; }   // 밤 귀가 · 막힘 풀기 꼴(길 지움)
      if (a.path && a.path === a._t791P && a.pathIndex >= a._t791Pn && a._t791Pn === 1) stand++;
      if (a.path && a.path === a._t791P && (a.pathIndex === 0 || a.pathIndex >= a._t791Pn)) hits++;
      const ra = So(b, now), rb = Sn(a, now, MIR);
      if (a.path && a.path.length > 1) multi++; if (a.path && a.path.length === 0) empty++;
      n++;
      if (!Object.is(ra, rb)) { d = `틱 ${t} 몸 ${i} 돌려준 값 ${ra} / ${rb}`; break; }
      const sm = same(b, a); if (sm !== true) { d = `틱 ${t} 몸 ${i} ${sm}`; break; }
      // 걸음(이동 문 꼴) — 같은 수
      for (const o of [a, b]) { o.x += o.vx * 0.033; o.y += o.vy * 0.033; }
      if (bait && a._t791P && a._t791Pn === 1 && t % 97 === 0) { a.path[0].x += 0.5; b.path[0].x += 0.5; }   // ★가짜: 길 점을 제자리에서 고친다(두 몸 같이)
    }
  }
  return { n, d, hits, stand, multi, empty, nulled, retarget, edge, label };
}
{
  const r = sim(false, false, '끔');
  ok(r.n === 400 * 900 && !r.d, 'ⓐ ★★종전 ↔ 지금 끔 — 돌려준 값 · 몸의 모든 필드 **한 번도 안 다르다**', r.d || `${r.n} 걸음`);
  ok(r.hits === 0, 'ⓐ 끔은 거울을 안 읽는다(거울 칸이 늘 비어 있다)', r.hits);
}
{
  const r = sim(true, false, '켬');
  ok(r.n === 400 * 900 && !r.d, 'ⓑ ★★★종전 ↔ 지금 켬 — 돌려준 값 · 몸의 모든 필드 **한 번도 안 다르다**', r.d || `${r.n} 걸음`);
  ok(r.multi > 10000 && r.empty > 0 && r.nulled > 500 && r.retarget > 500 && r.edge > 500, 'ⓑ [상황] 여러 점 길 · 빈 길 · 길 지움 · 목표 바꿈 · 48/12/10px 경계를 다 밟았다',
     `여러 점 ${r.multi} · 빈 길 ${r.empty} · 지움 ${r.nulled} · 바꿈 ${r.retarget} · 경계 ${r.edge}`);
  ok(r.hits > 100000 && r.stand > 50000, 'ⓒ ★켬은 거울을 **실제로 읽는다**(선 몸 · 첫 점)', `거울 맞힘 ${r.hits} · 선 몸 ${r.stand}`);
}
{
  const r = sim(true, true, '가짜');
  ok(!!r.d, 'ⓓ ★자명 통과 금지 — 길 점을 제자리에서 고치는 가짜는 켬이 **갈린다**(그래서 전제 "길은 짓고 나면 안 고친다"를 ⓔ 로 본다)', r.d);
}
// ⓔ 정적 전수 — 서버 · sim
{
  const files = [...fs.readdirSync(path.join(ROOT, 'server')).filter((f) => f.endsWith('.js')).map((f) => path.join('server', f)),
    ...fs.readdirSync(path.join(ROOT, 'sim')).filter((f) => f.endsWith('.js') && !f.startsWith('_')).map((f) => path.join('sim', f))];
  const put = [], idx = [], mut = [], mir = [];
  for (const f of files) {
    const L = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
    L.forEach((l, i) => { const c = l.replace(/\/\/.*$/, '');
      if (/\b(npc|p|b|body|pl)\.path\s*=[^=]/.test(c)) put.push(`${f}:${i + 1}`);
      if (/\.pathIndex\s*(=[^=]|\+\+|--|\+=|-=)/.test(c)) idx.push(`${f}:${i + 1}`);
      if (/\.path\[[^\]]*\]\s*(=[^=]|\.[xy]\s*(=[^=]|\+=|-=))|\.path\.(push|pop|shift|unshift|splice|reverse|sort|fill|copyWithin)\(|\.path\.length\s*=[^=]/.test(c)) mut.push(`${f}:${i + 1}`);
      if (/\._t791P[nxy]?\s*=[^=]/.test(c)) mir.push(`${f}:${i + 1}`); });
  }
  const Z = NEW.split('\n'), at = (re) => Z.findIndex((l) => re.test(l)) + 1;
  const okPut = put.length === 4 && put.every((s) => s.startsWith('server/zone.js:'));
  ok(okPut, 'ⓔ 몸 `.path` 넣기 = 길 넣기(배열) 하나 + `null` 둘 + 모양 선언(`undefined`) 하나 — 서버 · sim 전수', put.join(' '));
  ok(mut.length === 0, 'ⓔ ★길 배열 · 점 **제자리 쓰기 0**(push · splice · 칸 대입 · 점 좌표 대입 · 길이 대입)', mut.join(' ') || '0');
  ok(idx.length === 4, 'ⓔ `.pathIndex` 쓰기 = 따라가기 ++ · 막힘 풀기 0 · 길 넣기 0 · 모양 선언', idx.join(' '));
  ok(mir.length === 3 && mir.every((s) => { const ln = +s.split(':')[1]; const fi = at(/^function _t791Mir\(npc\) \{/); return s.startsWith('server/zone.js:') && ((ln >= fi && ln <= fi + 4) || ln === at(/p\._t791P = undefined;/)); }),
     'ⓔ 거울 칸 쓰기 = `_t791Mir` 한 함수(+ 모양 선언) — 읽는 자리는 그 배열이 거울의 배열일 때만 믿는다', mir.join(' '));
}
// ⓕ 손잡이 · 모양
{
  const C = NEW.replace(/\/\/.*$/gm, '').split('\n').filter((l) => !/^const T791_PATH_MIR = /.test(l)).join('\n');
  ok(/const T791_PATH_MIR = process\.env\.T791_PATH_MIR !== '0'/.test(NEW) && (C.match(/\bT791_PATH_MIR\b/g) || []).length === 1,
     'ⓕ 손잡이 `T791_PATH_MIR` 한 자리 · ★[T806] **켬 기본**(`=0` 끔 탐침 · 선언 + 거울 비추는 자리 하나)');
  const sh = fnSrc(NEW, '_t671Shape') || '';
  ok(['_t791P', '_t791Pn', '_t791Px', '_t791Py'].every((k) => sh.includes(`p.${k} = undefined;`)), 'ⓕ 몸 칸 넷이 `_t671Shape` 목록에(모양 하나 · test-body-fields 규약)');
}
console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
