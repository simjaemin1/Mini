'use strict';
// (@regress 없음 — 러너 밖 · T1253 관찰기 · 읽기만 · 제품 손잡이 0)
// === scripts/t1253-fp-hook.js — **날마다 마을별 상태 지문**(서버 판 자 곁 프리로드 · 벽시계 판 ↔ 가상 시계 판 처음 갈림 찾기) ===================
//
// ★[T1253 2026-11-10] 판 자(`t577-server-run.js`) 아이 존 안에서(`T577_OUT`) 사건 장부 `scanDay`(econ 하루 끝 · 서버 기준선 자가 지문을 뜨는 그 문) 때
//   econ 마을마다 두 꼴을 남긴다:
//     ① 칸 지문 — 인구 · 곳간 품목별 · 직업(`counts`) · 주거(`housing` · 확장) · 땅(`land` 수 칸) · 금고 — 칸마다 원값(1e-6)
//     ② 통 지문 — 마을 객체 전부(함수 뺌 · Map/Set 펼침 · 순환 끊음)의 sha1 앞 12자리 + `T1253_DUMP` 날까지는 칸 원문(어느 칸인지 짚으려고)
//   틱 좁히기(`T1253_TRACE_DAY=<날>[-<날>]`) — 곳간 · 금고 · 인구 · 주거가 움직인 자리를 델타 장부로 적는다(자리 = 존 30Hz 틱 본문 · 틱 사이 ·
//     econ 조각 머리 · 마을 · 교역 · 캐러밴 · 꼬리 · 그 밖 서버 층). 틱 수 = 이 훅이 센 30Hz 간격 콜백 수(가상 시계 프리로드 **뒤**에 실어야 그 줄을 센다).
//   ⚠세계에 아무것도 안 쓴다(읽기만 · 시계를 안 읽는다).
// 쓰는 법: NODE_OPTIONS="-r $PWD/scripts/t1253-fp-hook.js [-r $PWD/scripts/t745-vclock.js]" node scripts/t577-server-run.js 10 42
// 출력: `<판>.t1253.json`(T577_OUT 곁)
if (!process.env.T577_OUT) return;
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const OUT = process.env.T577_OUT.replace(/\.json$/, '') + '.t1253.json';
const DUMP = parseInt(process.env.T1253_DUMP || '0', 10) || 0;
const TRACE = process.env.T1253_TRACE_DAY != null ? parseInt(process.env.T1253_TRACE_DAY, 10) : -1;
const H = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const R6 = (v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);
const stor = (o) => { if (!o || typeof o !== 'object') return R6(o); const r = {}; for (const k of Object.keys(o).sort()) r[k] = R6(o[k]); return r; };
let _budget = 0;
function flat(x, seen, depth) {   // 통 지문용 — 원값 그대로(바이트 같음을 보려는 것이라 반올림 0) · 한 번 본 객체는 다시 안 편다 · 마디 상한
  if (--_budget < 0) return '[big]';
  if (x === null || x === undefined) return x === null ? null : '[u]';
  const t = typeof x;
  if (t === 'number') return Number.isFinite(x) ? x : String(x);
  if (t === 'string' || t === 'boolean') return x;
  if (t === 'bigint') return String(x);
  if (t === 'function' || t === 'symbol') return undefined;
  if (seen.has(x)) return '[ref]';
  if (depth > 12) return '[deep]';
  seen.add(x);
  let r;
  if (Array.isArray(x)) r = x.map((y) => { const z = flat(y, seen, depth + 1); return z === undefined ? null : z; });
  else if (x instanceof Map) r = { '[map]': [...x.entries()].map(([k, v]) => [String(k), flat(v, seen, depth + 1)]) };
  else if (x instanceof Set) r = { '[set]': [...x.values()].map((v) => flat(v, seen, depth + 1)) };
  else if (ArrayBuffer.isView(x)) r = { '[ta]': Array.from(x) };
  else { r = {}; for (const k of Object.keys(x).sort()) { const z = flat(x[k], seen, depth + 1); if (z !== undefined) r[k] = z; } }
  return r;
}
const fields = (v) => ({
  pop: (v.npcs || []).length,
  st: stor(v.storage),
  jobs: stor(v.counts),
  hs: [R6(v.housing), v.expansions || 0],
  land: v.land ? Object.fromEntries(Object.keys(v.land).sort().filter((k) => typeof v.land[k] === 'number').map((k) => [k, R6(v.land[k])])) : null,
  tr: (v.treasury && typeof v.treasury === 'object') ? stor(v.treasury) : R6(v.treasury),
});
const rec = { days: [], dump: {}, trace: [] };
let names = null, lastDay = -1, W = null, ivs = 0;
//   통 지문 = 윗 칸마다 sha1(칸 하나 마디 상한 20만) — 어느 윗 칸이 먼저 갈렸나를 바로 본다
const keysOf = (v) => Object.keys(v).sort();
const whole = (v) => { const o = {}, seen = new Set(); for (const k of keysOf(v)) { _budget = 200000; const z = flat(v[k], seen, 1); if (z !== undefined) o[k] = H(JSON.stringify(z)); } return o; };
const rawSmall = (v) => { const o = {}, seen = new Set(); for (const k of keysOf(v)) { _budget = 3000; const z = flat(v[k], seen, 1); if (z !== undefined && _budget >= 0) o[k] = z; } return o; };
const E2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
const mkP = E2.tickWorldV2Parts;
//   틱 좁히기 — 곳간 · 금고 · 인구가 **어느 자리에서** 움직였나(델타 장부). 자리 = 존 틱 머리(그 사이 = 틱 본문 · 서버 층) · econ 조각 들고 남.
//   `T1253_TRACE_DAY=<from>[-<to>]`(econ 날 = world.day) 안에서만 적는다. 한 줄 = [econ 날 · 틱 수 · 자리 · 마을 · 칸 · 앞 · 뒤].
const [TR0, TR1] = TRACE >= 0 ? String(process.env.T1253_TRACE_DAY).split('-').map((x) => parseInt(x, 10)).concat([NaN]).slice(0, 2).map((x, k, a) => (Number.isFinite(x) ? x : a[0])) : [-1, -1];
let snap = null;
function cut(label) {   // 지난 자리 이후 움직인 칸을 label 몫으로 적는다
  if (!W || !(W.day >= TR0 && W.day <= TR1)) { snap = null; return; }
  const now = new Map();
  for (const v of W.villages || []) {
    const o = {}; const st = v.storage || {}; for (const k in st) o['st.' + k] = R6(st[k]);
    const tr = v.treasury; if (tr && typeof tr === 'object') for (const k in tr) o['tr.' + k] = R6(tr[k]); else o.tr = R6(tr);
    o.pop = (v.npcs || []).length; o.hs = R6(v.housing);
    now.set(v.name, o);
  }
  {   // 캐러밴 — 상태 · 목적지 · 도착 날(장부) · 귀환 날
    const o = {}; for (const c of W.caravans || []) o['car.' + c.id] = [c.state, c.from && c.from.name, c.to && c.to.name, c.arriveDay, c.returnArriveDay, c._done ? 1 : 0].join('|');
    now.set('*', o);
  }
  if (snap) for (const [n, o] of now) { const p = snap.get(n) || {}; for (const k of new Set([...Object.keys(o), ...Object.keys(p)])) if (o[k] !== p[k]) rec.trace.push([W.day, ivs, label, n, k, p[k] ?? null, o[k] ?? null]); }
  snap = now;
}
const WATCH = new Set(String(process.env.T1253_WATCH_CAR || '').split(',').filter(Boolean).map(Number));   // 몸 칸을 늘 적을 캐러밴 id
const T30 = (ms) => Math.abs(ms - 1000 / 30) < 2;
{
  const si = global.setInterval;
  global.setInterval = function (fn, ms, ...a) { if (typeof fn !== 'function' || !T30(ms)) return si.apply(this, arguments); return si.call(this, function () { if (TR0 >= 0) cut('틱사이'); ivs++; const r = fn.apply(this, arguments); if (TR0 >= 0) cut('틱본문'); return r; }, ms, ...a); };
}
if (typeof mkP === 'function') E2.tickWorldV2Parts = function (world) {
  const P = mkP.apply(this, arguments);
  W = world;
  //   캐러밴 몸 문(`world.caravanBodyReady` — 서버가 꽂는다) — 판정이 갈리는 자리를 적는다(장 정산 · 가는 길 · 귀환 · 막힌 몸이면 몸 칸)
  if (TR0 >= 0 && typeof world.caravanBodyReady === 'function' && !world.caravanBodyReady.__t1253) {
    const orig = world.caravanBodyReady;
    let VP = null; try { VP = require(path.join(ROOT, 'server', 'villages')).__labProbe._caravanBodyProbe; } catch (e) {}
    const f = function (c, leg) { const r = orig.apply(this, arguments);
      if (world.day >= TR0 && world.day <= TR1) { let b = null; if ((!r || WATCH.has(c.id)) && VP && VP.pack) { try { const pk = (VP.pack() || {}).b || {}, k = pk[String(c.id)]; b = k ? [k.ph, k.lg, k.pg, k.act ? k.act.pg : null, k.at, k.act && k.act.pts ? k.act.pts.length : null, k.act ? k.act.p : null, k.act && k.act.escorts ? (WATCH.has(c.id) ? k.act.escorts.map((e) => [e.p, e.pg, e.prefix]) : k.act.escorts.length) : null] : ['몸 없음', Object.keys(pk).length]; } catch (e) { b = ['pack 실패', String(e && e.message).slice(0, 80)]; } }
        (rec.ready || (rec.ready = [])).push([world.day, ivs, c.id, leg, r ? 1 : 0, b]); }
      return r; };
    f.__t1253 = true; world.caravanBodyReady = f;
  }
  const wrap = (nm, lab) => { const f = P[nm]; if (typeof f !== 'function') return; P[nm] = function (x) { if (TR0 >= 0) cut('서버'); const r = f.apply(this, arguments);
    if (r && typeof r.next === 'function') { const nx = r.next.bind(r); r.next = function () { if (TR0 >= 0) cut('서버'); const q = nx(...arguments); if (TR0 >= 0) cut(lab + '쉼'); return q; }; }
    if (TR0 >= 0) cut(nm === 'village' ? 'econ:vil:' + (x && x.name) : lab); return r; }; };
  for (const [nm, lab] of [['head', 'econ:head'], ['village', 'econ:vil'], ['trade', 'econ:trade'], ['tradeSteps', 'econ:trade'], ['caravans', 'econ:caravan'], ['tail', 'econ:tail']]) wrap(nm, lab);
  return P;
};
const Ev = require(path.join(ROOT, 'server', 'events'));
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments); const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try {
      const d = day | 0;
      if (d !== lastDay) {
        lastDay = d;
        const V = world.villages || [];
        if (!names) names = V.map((v) => v.name);
        const f = V.map(fields);
        rec.days.push([d, ivs, f.map((x) => H(JSON.stringify(x))), V.map(whole)]);
        rec.dump[d] = V.map((v, i) => (d <= DUMP ? { f: f[i], raw: rawSmall(v) } : { f: f[i] }));
      }
    } catch (e) { /* 관찰 실패는 세계에 0 */ }
    return sd.apply(this, arguments);
  };
  return L;
};
process.on('exit', () => { try { fs.writeFileSync(OUT, JSON.stringify(Object.assign({ names }, rec))); } catch (e) {} });
