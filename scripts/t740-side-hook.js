'use strict';
// (@regress 없음 — 러너 밖 · T740 계측기 · 제품 무변)
// === scripts/t740-side-hook.js — 서버 마을 칸(`state.villages[i].*` · econ 밖) 날마다 해시 — Map · Set 을 **풀어서** =====================
//   `scripts/t740-run.js` 가 NODE_OPTIONS 로 얹는다(t722-stop-hook · t650-print 와 함께). 읽기만 — 세계에 0.
//   env:
//     T577_OUT=<판>          → `<판>.t740.json` — 날마다 { d, f: { 칸: 마을마다 6자 해시를 이은 줄 } }
//     T740_DUMP_DAYS=a,b     그 날엔 칸 값을 통째로(풀어 쓴 JSON) `<판>.t740.d<날>.json` 에(첫 갈림 들여다보기)
//     T740_CONT_K=K          (대조 판 · t722 훅 `T722_CONT=1`) 멈춤 판과 같은 자리에서 벽시계 · econ 날을 K 날 밀고 재기동 없이 이어 간다(`__t740Cont`).
//     T740_CLOCK_AT=<ms>     (다시 뜬 판) 부팅 동안 벽시계를 그 값에 얼린다(아래 시계).
//     T740_FORCE_JUMP=K      (계측 사본) 다시 뜬 판의 날 뜀을 벽시계 대신 K 로 고정(빠른 시계 자에선 부팅 시간만으로 수백 날이 뛴다).
//   해시 규약(`canon`): Map → ['M', [[k, v] …]](차례 그대로) · Set → ['S', […]] · 마을 · econ 마을 · econ 주민 · 몸 · world 는 이름표(@v · @e · @n · @p · @W) ·
//     함수 · undefined 는 'ƒ' · 'u' · 깊이 10 · 순환은 '@cyc'.
const OUT0 = process.env.T577_OUT || '';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Module = require('module');
const ROOT = path.join(__dirname, '..');
const VILL = path.join(ROOT, 'server', 'villages.js');
const FJ = process.env.T740_FORCE_JUMP != null && process.env.T740_FORCE_JUMP !== '' ? parseInt(process.env.T740_FORCE_JUMP, 10) : null;
const DUMPD = new Set(String(process.env.T740_DUMP_DAYS || '').split(',').filter(Boolean).map(Number));

// 사본 글자(villages.js) — state 읽기 한 줄(t722 훅이 이미 붙였으면 그걸 쓴다) · 날 뜀 둘
const _prev = Module._extensions['.js'];
Module._extensions['.js'] = function (m, filename) {
  if (filename === VILL && CLK_FROZEN0) {   // 첫 틱에 시계를 푼다(아래 시계)
    const r = FJ == null ? _prev(m, filename) : _wrapFJ(m, filename);
    const g = m.exports.onGameTick;
    if (typeof g === 'function') m.exports.onGameTick = function () { const f = m.exports.__t722 || m.exports.__t740, st = f ? f() : null; if (st && st.ready && global.__t740Unfreeze) global.__t740Unfreeze(); return g.apply(this, arguments); };
    return r;
  }
  if (filename !== VILL || FJ == null) return _prev(m, filename);
  return _wrapFJ(m, filename);
};
const CLK_FROZEN0 = !!process.env.T740_CLOCK_AT;
function _wrapFJ(m, filename) {
  // 다른 훅(t722)이 같은 자리를 먼저 바꿀 수 있어 _compile 에서 고친다
  const _c = m._compile;
  m._compile = function (src, fn) {
    if (FJ != null) {
      const a = '    const nd = (M.anchor.day | 0) + Math.max(0, Math.floor(state.lastGameDay - M.anchor.g));';
      if (src.includes(a)) { src = src.replace(a, `    const nd = (M.anchor.day | 0) + ${FJ};`); console.log(`[t740] T740_FORCE_JUMP=${FJ} — 사본`); }
      else console.log('[t740] ✗ 날 뜀 자리 못 찾음');
      // T722_NOJUMP 가 먼저 if 를 껐으면 여기 문도 죽는다 — 그 경우는 부르는 쪽이 NOJUMP 를 안 준다
    }
    return _c.call(this, src, fn);
  };
  return _prev(m, filename);
}
// ── 시계(계측 사본 · 제품 무변) ──────────────────────────────────────────────────────────────
//   T740_CLOCK_AT=<ms>  다시 뜬 판 — 부팅 동안 Date.now 를 그 값에 얼려 두고(빠른 시계 자에선 부팅 70초가 280 날이다) 준비가 서는 순간부터 흐르게 한다.
//                       값 = 멈춘 순간(stop.json `at`) + K 날 — 멈춤 없는 대조 판(`__t740Cont`)과 같은 벽시계에서 다시 시작한다.
//   __t740Cont(st)      대조 판 — 멈춤 판과 같은 자리(경계 얼림 · 마감 · 저장 큐 드레인 뒤)에서 벽시계를 K 날 밀고 econ 날도 K 뛴 뒤 얼림을 푼다(재기동 없음).
let CLK_OFF = 0, CLK_FROZEN = process.env.T740_CLOCK_AT ? +process.env.T740_CLOCK_AT : null, CLK_PAUSE = null;
{
  const _prevNow = Date.now;
  Date.now = function () {
    if (CLK_PAUSE != null) return CLK_PAUSE;
    if (CLK_FROZEN != null) return CLK_FROZEN;
    return _prevNow() + CLK_OFF;
  };
  //   풀리는 때 = 마을 시뮬의 **첫 틱**(`onGameTick` — 존 게임 루프가 세계를 처음 굴리는 순간). 준비(`ready`) 뒤에도 존 부팅이 수십 초 더 돌아
  //   (빠른 시계에선 수백 날) 그때 풀면 벽시계만 앞서 간다(작물 · 장 끝 시각이 벽시계 날을 읽는다).
  global.__t740Unfreeze = () => { if (CLK_FROZEN == null) return; CLK_OFF = CLK_FROZEN - _prevNow(); console.log(`[t740] 시계 풀림 — 첫 틱 · ${CLK_FROZEN}(얼린 값)부터`); CLK_FROZEN = null; };
}
global.__t740Pause = () => { CLK_PAUSE = Date.now(); };
global.__t740Cont = (st) => {
  const K = parseInt(process.env.T740_CONT_K || '0', 10) || 0;
  const at = CLK_PAUSE != null ? CLK_PAUSE : Date.now(); CLK_PAUSE = null;
  CLK_OFF += (at + K * st.dayMs) - Date.now();
  if (K) st.world.day = (st.world.day | 0) + K;
  st.lastGameDay = Math.floor((Date.now() - st.epoch) / st.dayMs);
  console.log(`[t740] 대조 — 벽시계 +${K} 날 · econ 날 ${st.world.day} · 앵커 ${st.lastGameDay}`);
  st.dayFreeze = false;
};
const H6 = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 6);
function mkCanon(st) {
  const tag = new Map();
  for (const vl of st.villages || []) { tag.set(vl, '@v' + vl.name); if (vl.econ) { tag.set(vl.econ, '@e' + vl.econ.name); for (const n of vl.econ.npcs || []) if (n && typeof n === 'object') tag.set(n, '@n' + n.id); } }
  if (st.world) tag.set(st.world, '@W');
  const P = st.deps && st.deps.players; if (P && P.forEach) P.forEach((p, id) => { if (p && typeof p === 'object') tag.set(p, '@p' + id); });
  const canon = (x, d, stack) => {
    if (x === undefined) return 'u';
    if (x === null || typeof x !== 'object') return typeof x === 'function' ? 'ƒ' : (typeof x === 'number' && !Number.isFinite(x) ? String(x) : x);
    if (d > 0 && tag.has(x)) return tag.get(x);
    if (d > 10) return '@deep';
    if (stack.has(x)) return '@cyc';
    stack.add(x);
    let r;
    if (x instanceof Map) r = ['M', [...x.entries()].map(([k, v]) => [canon(k, d + 1, stack), canon(v, d + 1, stack)])];
    else if (x instanceof Set) r = ['S', [...x].map((v) => canon(v, d + 1, stack))];
    else if (Array.isArray(x)) r = x.map((v) => canon(v, d + 1, stack));
    else if (ArrayBuffer.isView(x)) r = ['T', Array.from(x)];
    else { r = {}; for (const k of Object.keys(x)) r[k] = canon(x[k], d + 1, stack); }
    stack.delete(x);
    return r;
  };
  return (x) => canon(x, 0, new Set());
}
function sideSnap(st, full) {
  const canon = mkCanon(st);
  const vils = st.villages || [];
  const keys = new Set(); for (const vl of vils) for (const k of Object.keys(vl)) if (k !== 'econ') keys.add(k);
  const f = {}, raw = full ? {} : null;
  for (const k of [...keys].sort()) {
    let s = '';
    for (const vl of vils) {
      let j; try { j = (k in vl) ? JSON.stringify(canon(vl[k])) : '∅'; } catch (e) { j = '(err)'; }
      s += H6(j === undefined ? 'u' : j);
      if (raw) (raw[vl.name] || (raw[vl.name] = {}))[k] = j && j.length > 200000 ? j.slice(0, 200000) + '…' : j;
    }
    f[k] = s;
  }
  return { f, raw, names: vils.map((v) => v.name) };
}
let VS = null;
const getSt = () => { try { const V = require(VILL); if (V.__t722) return V.__t722(); if (V.__t740) return V.__t740(); } catch (e) {} return null; };
// state 읽기 줄이 없으면(t722 훅 없이 쓸 때) 덧붙인다
{
  const _p2 = Module._extensions['.js'];
  Module._extensions['.js'] = function (m, filename) {
    if (filename !== VILL) return _p2(m, filename);
    const _c = m._compile;
    m._compile = function (src, fn) { if (src.indexOf('__t722 = function') < 0 && src.indexOf('__t740 = function') < 0) src += '\n;module.exports.__t740 = function () { return state; };\n'; return _c.call(this, src, fn); };
    return _p2(m, filename);
  };
}
global.__t740Side = (st) => { try { return sideSnap(st, true); } catch (e) { return { err: e.message }; } };
// [T740_SAVE_DUMP=<파일>] 종료 저장 줄(`saveVillagesAndMeta` — T728 경계 종료가 마을 행 + 메타 행을 한 트랜잭션으로 적는 그 줄)이 불리는 순간 칸 값을 통째로
//   (실제 시계 판 — 하루 한가운데 SIGTERM · 저장된 바로 그 상태 ↔ 다시 뜬 상태를 견준다 · `t740-moment.js` 가 읽는 stop.json 꼴)
if (process.env.T740_SAVE_DUMP) {
  const DBF = path.join(ROOT, 'server', 'zone-local-db.js');
  const iv = setInterval(() => {
    const m = require.cache[DBF]; if (!m || !m.exports || !m.exports.saveVillagesAndMeta) return;
    clearInterval(iv);
    const f0 = m.exports.saveVillagesAndMeta;
    m.exports.saveVillagesAndMeta = function () {
      try { const st = getSt(); const S = sideSnap(st, true);
        fs.writeFileSync(process.env.T740_SAVE_DUMP, JSON.stringify({ tag: 'save', at: Date.now(), epoch: st.epoch, dayMs: st.dayMs, lastGameDay: st.lastGameDay, worldDay: st.world && st.world.day, side: S })); } catch (e) { console.error('[t740] 저장 덤프 실패', e.message); }
      return f0.apply(this, arguments);
    };
  }, 20);
  iv.unref && iv.unref();
}
if (!OUT0) return;
const OUT = OUT0 + '.t740.json';
const days = [];
let last = -1, msTot = 0;
const Ev = require(path.join(ROOT, 'server', 'events'));
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try {
      const d = day | 0;
      if (d !== last) {
        last = d;
        const st = getSt();
        if (st) {
          const t0 = Date.now();
          const S = sideSnap(st, DUMPD.has(d));
          if (S.raw) fs.writeFileSync(`${OUT0}.t740.d${d}.json`, JSON.stringify({ d, names: S.names, raw: S.raw }));
          days.push({ d, f: S.f, n: S.names.length });
          msTot += Date.now() - t0;
          if (days.length % 25 === 0) fs.writeFileSync(OUT, JSON.stringify({ names: S.names, msTot, days }));
        }
      }
    } catch (e) { console.error('[t740] 해시 실패', e.message); }
    return sd.apply(this, arguments);
  };
  return L;
};
const flush = () => { try { const st = getSt(); fs.writeFileSync(OUT, JSON.stringify({ names: st ? st.villages.map((v) => v.name) : null, msTot, days })); } catch (e) {} };
process.on('exit', flush);
module.exports = { sideSnap, mkCanon };
