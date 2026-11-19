#!/usr/bin/env node
// === scripts/t1140-witness.js — T1140 ③ 깎기 셋 — 같은 값 증인 (러너 밖 · 서버 0 · 세계 0) ===============================
// 종전 글자(`git show <ref>:server/zone.js` · 기본 2ddf789a = 이 카드 베이스 main)와 작업본 글자를 함수째 떠서 견준다.
//   ⓐ [③-다 `T1140_STUCK_INLINE`] 종전 `detectStuck`(+`_t670Stuck`) ↔ 켬 `_t1140Detect`(+`_t1140St`) — 같은 몸 사건열(걸음 · 서 있음 12px 경계 ·
//      움직임 5px 경계 · 타이머 1500ms 경계 · 길 있음/없음/거울 · 처음 · −0 · NaN · undefined · ∞)에서 매 부름 돌려준 값 · 몸 모든 칸이 한 번도 안 다르다
//      (`_stuckPos` {x, y, at} ↔ `_t1140Sx` · `_t1140Sy` · `_t1140Sa` 세 수 `Object.is`).
//   ⓑ [③-다] 끔 = 첫 줄 단락(`if (T1140_STUCK_INLINE) return …` 뒤 종전 글자 그대로) · `_stuckPos` 를 읽고 쓰는 자리 = 서버 전체에서 그 둘뿐
//   ⓒ [③-가 `T1140_HOT_ORDER`] 차례 리터럴(`_t1140Lit`)로 지은 몸 = T806 켬 리터럴로 지은 몸 — 같은 키 집합(+ 막힘 칸 셋 `undefined`) · 키마다 `Object.is`(속 객체는 깊게) · 키 차례만 다르다
//      + 서버 전체에 몸 키를 차례로 도는 자리(`Object.keys(npc|body)` · `for…in npc` · `{...npc}` · `JSON.stringify(npc)`) 0
//   ⓓ [③-나 `T1140_LIFE_REQ`] 켬 `_fishingMod()` 는 `require('./fishing')` 와 같은 객체 · `_tripDayMs()` 같은 수
//   ⓔ 미끼 — 켬 갈래의 x↔y 칸을 바꾸면 · 타이머 문턱을 1501 로 바꾸면 문다
// 실행: node scripts/t1140-witness.js [ref=2ddf789a]
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다 — 존이 기본 localhost:3010(나란히 돌면 남의 central)에 붙지 않게 닿지 않는 주소를 준다
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const REF = process.argv[2] || '2ddf789a';
const OLD = execFileSync('git', ['show', `${REF}:server/zone.js`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
const NEW = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x != null ? '  ' + x : '')); };
const fnSrc = (S, name) => { const i = S.indexOf(`function ${name}(`); if (i < 0) throw new Error('없음 ' + name); const j = S.indexOf('\n}\n', i); return S.slice(i, j + 2); };
const lineSrc = (S, name) => { const i = S.indexOf(`function ${name}(`); if (i < 0) throw new Error('없음 ' + name); return S.slice(i, S.indexOf('\n', i) + 1); };
const HELP = (S) => lineSrc(S, '_t671Lt') + lineSrc(S, '_t671Gt');
const buildOld = (S) => new Function(HELP(S) + lineSrc(S, '_t670Stuck') + fnSrc(S, 'detectStuck') + '\nreturn detectStuck;')();
const buildNew = (S, on, patch) => {
  const i = S.indexOf('if (T1140_STUCK_INLINE) detectStuck = _t1140Detect;'); if (i < 0) throw new Error('되묶기 줄 없음');
  let src = 'const T1140_STUCK_INLINE = ' + (on ? 'true' : 'false') + ';\n' + HELP(S) + lineSrc(S, '_t670Stuck') + lineSrc(S, '_t1140St') + fnSrc(S, '_t1140Detect') + fnSrc(S, 'detectStuck') + S.slice(i, S.indexOf('\n', i) + 1);
  if (patch) src = patch(src);
  return new Function(src + '\nreturn detectStuck;')();
};
const ST = ['_t1140Sx', '_t1140Sy', '_t1140Sa'];
const stuckOld = (A) => (A._stuckPos ? [A._stuckPos.x, A._stuckPos.y, A._stuckPos.at] : null);
const stuckNew = (B) => (B._t1140Sa === undefined ? null : [B._t1140Sx, B._t1140Sy, B._t1140Sa]);
function same(A, B, inline) {
  const skip = new Set(['_stuckPos', ...ST]);
  const ka = Object.keys(A).filter((k) => !skip.has(k)).sort(), kb = Object.keys(B).filter((k) => !skip.has(k)).sort();
  if (ka.join() !== kb.join()) return 'keys ' + ka + ' / ' + kb;
  for (const k of ka) if (!Object.is(A[k], B[k])) return k + ' ' + A[k] + ' ≠ ' + B[k];
  const a = stuckOld(A), b = inline ? stuckNew(B) : stuckOld(B);
  if ((a === null) !== (b === null)) return '막힘 칸 있음/없음';
  if (a) for (let i = 0; i < 3; i++) if (!Object.is(a[i], b[i])) return '막힘 칸[' + i + '] ' + a[i] + ' ≠ ' + b[i];
  return true;
}
let seed = 0x9e3779b9; const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
function run(Fo, Fn, inline, ticks, odd) {
  let n = 0, d = null; const kinds = { stand: 0, move5: 0, timer: 0, walk: 0, odd: 0, path: 0, mir: 0, stuckTrue: 0 };
  for (let p = 0; p < 96 && !d; p++) {
    const A = { x: 1000 + p * 50.37, y: 2000.11, targetX: 1200 + p * 50, targetY: 2100.3, path: undefined, pathIndex: undefined, _t791P: undefined, _t791Pn: undefined, _stuckN: undefined, _stuckPos: undefined };
    const B = Object.assign({}, A); if (inline) { delete B._stuckPos; for (const k of ST) B[k] = undefined; }
    let now = 1e6 + p * 17;
    for (let t = 0; t < ticks && !d; t++) {
      if (rnd() < 0.012) { now += 33 + 1440 + ((rnd() * 120) | 0); kinds.timer++; } else now += 33;   // 타이머 경계(1500) 둘레로 뛴다
      const set = (k, v) => { A[k] = v; B[k] = v; };
      const r = rnd(), S = stuckOld(A);
      if (r < 0.2) { if (S) { const a = rnd() * 6.283, s = 5 * (1 + (rnd() - 0.5) * 1e-12); set('x', S[0] + Math.cos(a) * s); set('y', S[1] + Math.sin(a) * s); kinds.move5++; } }
      else if (r < 0.4) { const a = rnd() * 6.283, s = 12 * (1 + (rnd() - 0.5) * 1e-12); set('x', A.targetX + Math.cos(a) * s); set('y', A.targetY + Math.sin(a) * s); kinds.stand++; }
      else if (r < 0.55) { set('x', A.x + (rnd() - 0.5) * 20); set('y', A.y + (rnd() - 0.5) * 20); kinds.walk++; }
      else if (r < 0.6) { const P = [{ x: A.targetX, y: A.targetY }]; set('path', rnd() < 0.5 ? P : null); set('pathIndex', (rnd() * 2) | 0); if (rnd() < 0.5 && A.path) { set('_t791P', A.path); set('_t791Pn', 1); kinds.mir++; } kinds.path++; }
      else if (r < 0.62) { set('targetX', rnd() < 0.1 ? null : A.x + (rnd() - 0.5) * 40); set('targetY', A.y + (rnd() - 0.5) * 40); }
      else if (r < 0.62 + odd) { const v = [-0, NaN, undefined, Infinity, -Infinity, 9e15][(rnd() * 6) | 0]; set(rnd() < 0.5 ? 'x' : 'y', v); kinds.odd++; }
      else if (r < 0.65 + odd) { if (rnd() < 0.3) { set('x', 1000 + p * 50.37); set('y', 2000.11); } }   // 제자리(타이머가 찬다)
      const ro = Fo(A, now), rn = Fn(B, now); n++;
      if (ro) kinds.stuckTrue++;
      if (ro !== rn) { d = `틱 ${t} 몸 ${p} 돌려준 값 ${ro} ≠ ${rn}`; break; }
      const s = same(A, B, inline); if (s !== true) { d = `틱 ${t} 몸 ${p} ${s}`; break; }
      if (ro && rnd() < 0.5) { set('x', A.x + 30); }   // unstuck 흉내(위치만)
    }
  }
  return { n, d, kinds };
}
console.log('\n=== T1140 ③ 깎기 셋 — 같은 값 증인 (종전 ' + REF + ' ↔ 작업본) ===');
const OLDF = buildOld(OLD);
{ const r = run(OLDF, buildNew(NEW, true), true, 4000, 0.004);
  ok(!r.d && r.n > 300000 && r.kinds.stuckTrue > 500 && r.kinds.stand > 50000 && r.kinds.move5 > 50000 && r.kinds.mir > 1000, 'ⓐ ★[③-다] 켬 `_t1140Detect` ↔ 종전 `detectStuck` — 돌려준 값 · 몸 모든 칸 · 막힘 세 수 한 번도 안 다르다', r.d || `${r.n} 부름 · ${JSON.stringify(r.kinds)}`); }
{ const r = run(OLDF, buildNew(NEW, true), true, 3000, 0.08);
  ok(!r.d && r.kinds.odd > 10000, 'ⓐ′ [③-다] 수 아닌 위치(−0 · NaN · undefined · ±∞ · 9e15)가 섞여도 같다', r.d || `${r.n} 부름 · 이상값 ${r.kinds.odd}`); }
{ const r = run(OLDF, buildNew(NEW, false), false, 3000, 0.01);
  ok(!r.d && r.n > 200000 && fnSrc(OLD, 'detectStuck') === fnSrc(NEW, 'detectStuck') && lineSrc(OLD, '_t670Stuck') === lineSrc(NEW, '_t670Stuck'), 'ⓑ [③-다] 끔 = 종전 글자 그대로(`detectStuck` · `_t670Stuck` 글자 같음 · 켬은 바인딩 되묶기 한 줄)', r.d || `${r.n} 부름`); }
{ const files = fs.readdirSync(path.join(ROOT, 'server')).filter((f) => f.endsWith('.js'));
  const sites = []; for (const f of files) { const S = fs.readFileSync(path.join(ROOT, 'server', f), 'utf8').split('\n'); S.forEach((L, i) => { if (/_stuckPos/.test(L.replace(/\/\/.*$/, ''))) sites.push(f + ':' + (i + 1)); }); }
  const fnOf = (ln) => { const L = NEW.split('\n'); for (let i = ln - 1; i >= 0; i--) { const m = /^function (\w+)\(/.exec(L[i]); if (m) return m[1]; } return '?'; };
  const fns = new Set(sites.filter((s) => s.startsWith('zone.js:')).map((s) => fnOf(+s.split(':')[1])));
  const outside = sites.filter((s) => !s.startsWith('zone.js:'));
  ok(outside.length === 0 && [...fns].every((f) => ['_t671Shape', '_t1140Lit', 'spawnNpc', '_t670Stuck', 'detectStuck'].includes(f)), 'ⓑ′ [③-다] `_stuckPos` 를 읽고 쓰는 자리 = `_t670Stuck` · `detectStuck`(+ 모양 선언 · 리터럴)뿐', [...fns].join(',') + ' · 밖 ' + outside.length); }
// ⓒ 차례 리터럴
{
  const sp = fnSrc(NEW, 'spawnNpc'), a = sp.indexOf('\n', sp.indexOf('T806_HOT_INOBJ ? {')), b = sp.indexOf('  } : {\n    pid, playerId', a);
  const lit806 = '({' + sp.slice(a + 1, b) + '})';
  const env = 'const PLAYER_MAX_HP = 100, HUNGER_MAX = 100, THIRST_MAX = 100;\n';
  const mk806 = new Function('pid', 'npcId', 'name', 'color', 'cx', 'cy', 'opts', env + 'return ' + lit806 + ';');
  const mk1140 = new Function('pid', 'npcId', 'name', 'color', 'cx', 'cy', 'opts', env + fnSrc(NEW, '_t1140Lit') + '\nreturn _t1140Lit(pid, npcId, name, color, cx, cy, opts);');
  const deep = (x, y) => { if (Object.is(x, y)) return true; if (!x || !y || typeof x !== 'object' || typeof y !== 'object' || Array.isArray(x) !== Array.isArray(y)) return false; const kx = Object.keys(x), ky = Object.keys(y); return kx.join() === ky.join() && kx.every((k) => deep(x[k], y[k])); };
  const realNow = Date.now; let bad = null, nk = 0, extra = [];
  for (const opts of [{}, { villageId: 'v1', villageName: '마을' }, { villageId: 0, villageName: '' }]) {
    Date.now = () => 1793700000000;
    const o = mk806('p1', 'npc_x_1', '이름🤖', '#abc', 1234.5, -0, opts), q = mk1140('p1', 'npc_x_1', '이름🤖', '#abc', 1234.5, -0, opts);
    Date.now = realNow;
    const ko = Object.keys(o), kq = Object.keys(q); nk = ko.length;
    extra = kq.filter((k) => !ko.includes(k));
    if (ko.some((k) => !kq.includes(k))) bad = '빠진 키';
    else if (extra.some((k) => q[k] !== undefined) || extra.join() !== ST.join()) bad = '더한 키 ' + extra;
    else for (const k of ko) if (!deep(o[k], q[k])) { bad = '값 ' + k; break; }
    if (!bad && ko.join() === kq.filter((k) => !ST.includes(k)).join()) bad = '차례가 같다(바뀐 것 없음)';
    if (o.inventory === q.inventory) bad = '속 객체 공유';
  }
  ok(!bad, 'ⓒ ★[③-가] 차례 리터럴 몸 = T806 켬 리터럴 몸(같은 키 + 막힘 칸 셋 `undefined` · 값 `Object.is`/깊게 · 차례만 다르다)', bad || `키 ${nk} + ${extra.length}`);
  const files = fs.readdirSync(path.join(ROOT, 'server')).filter((f) => f.endsWith('.js'));
  const hits = []; const RE = /\.\.\.(npc|body)\b(?!\.)|Object\.(keys|entries|values|assign|getOwnPropertyNames)\((npc|body)\b|for \(const \w+ in (npc|body)\)|JSON\.stringify\((npc|body)\)|structuredClone\((npc|body)\)/;
  for (const f of files.filter((f) => f !== 'central-client.js')) fs.readFileSync(path.join(ROOT, 'server', f), 'utf8').split('\n').forEach((L, i) => { if (RE.test(L.replace(/\/\/.*$/, ''))) hits.push(f + ':' + (i + 1)); });   // central-client 의 `body` = HTTP 몸(사람 몸 아님)
  ok(hits.length === 0, 'ⓒ′ [③-가] 서버에 몸 키를 차례로 도는 자리(`Object.keys(npc|body)` · `for…in` · 펼침 · `JSON.stringify(npc)`) 0', hits.join(' · ') || '0');
}
// ⓓ require 한 번 — 작업본 villages.js 의 두 함수를 글자째 떠서 같은 require(서버 폴더 기준)로 돌린다
{
  const V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  const req = require('module').createRequire(path.join(ROOT, 'server', 'villages.js'));
  const mk = (on, trip) => new Function('require', 'const T1140_LIFE_REQ = ' + on + ', T627_TRIP_DAY = ' + trip + '; const state = { dayMs: 4000 }; let _t1140Fish; ' + lineSrc(V, '_zc720').replace(/^/, 'let _zc720m = null;\n') + fnSrc(V, '_fishingMod') + fnSrc(V, '_tripDayMs') + '\nreturn { fish: _fishingMod, trip: _tripDayMs };')(req);
  const F = req('./fishing'), W = req('./zone-config').WORLD;
  let good = true; const seen = [];
  for (const trip of [true, false]) { const on = mk(true, trip), off = mk(false, trip);
    const a1 = on.fish(), a2 = on.fish(), b1 = off.fish();
    good = good && a1 === F && a2 === F && b1 === F && Object.is(on.trip(), off.trip()) && Object.is(on.trip(), trip ? ((W && W.dayLengthMs) || 4000) : 4000);
    seen.push(on.trip()); }
  ok(good, 'ⓓ [③-나] 켬 `_fishingMod()` = `require(\'./fishing\')` 같은 객체(두 번 다) · `_tripDayMs()` 켬 = 끔 = 정본 식', '하루 ' + seen.join(' · '));
}
// ⓔ 미끼
{
  const r1 = run(OLDF, buildNew(NEW, true, (s) => s.replace('npc._t1140Sx = npc.x; npc._t1140Sy = npc.y;', 'npc._t1140Sx = npc.y; npc._t1140Sy = npc.x;')), true, 2000, 0.004);
  const r2 = run(OLDF, buildNew(NEW, true, (s) => s.replace('now - npc._t1140Sa > 1500', 'now - npc._t1140Sa > 1501')), true, 4000, 0.004);
  ok(!!r1.d && !!r2.d, 'ⓔ 미끼 둘(x↔y 칸 · 타이머 1501) — 다 문다', `${r1.d ? '문다' : '안 문다'} · ${r2.d ? '문다' : '안 문다'}`);
}
console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
process.exit(fail ? 1 : 0);
