'use strict';
// (@regress 없음 — 러너 밖 · T742 계측기 · 제품 무변)
// === scripts/t742-mod-hook.js — 존 · 모듈 메모리 날마다 해시(마을 칸 밖) — "재기동 없이 날을 뛴 판"과 갈리는 주인 찾기 ==================
//   `scripts/t740-run.js` 가 `T740_EXTRA_PRE` 로 얹는다. 읽기만 — 세계에 0.
//   무엇을: server/*.js 모듈(존 zone.js 포함)의 **맨 바깥 선언**(줄 머리 `const|let X =`) 전부 + 마을 모듈 `state.*`(마을 · world · deps 밖) + econ world 의 칸(마을 밖).
//     적재 때 각 모듈 끝에 읽기 함수 한 줄을 덧붙인다(`module.exports.__t742m` · 제품 파일 무변 · t650 · t722 의 사본 문법).
//   ⇒ `<T577_OUT>.t742.json` — 날마다 { d, h: { '파일:이름': 6자 해시 } }. 함수 · 상수(첫날과 끝날이 같은 원시 값)는 뺀다.
//   해시 규약은 `t740-side-hook` canon 과 같다(Map · Set 풀어서 · 마을 · econ 마을 · 주민 · 몸 · world 이름표) · 큰 칸(원소 20만 넘음 · 타입 배열)은 크기만.
const OUT0 = process.env.T577_OUT || '';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Module = require('module');
const ROOT = path.join(__dirname, '..');
const SRV = path.join(ROOT, 'server') + path.sep;
const VILL = path.join(ROOT, 'server', 'villages.js');
const MODS = new Map();   // 파일 → 이름 목록
const _cmp = Module.prototype._compile;
Module.prototype._compile = function (content, filename) {
  if (OUT0 && filename.startsWith(SRV) && content.indexOf('__t742m') < 0) {
    const names = [];
    const re = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm; let m;
    while ((m = re.exec(content))) names.push(m[1]);
    const uniq = [...new Set(names)];
    if (uniq.length) {
      MODS.set(filename, uniq);
      content += `\n;try { (typeof module !== 'undefined') && (module.__t742m = function () { const o = {}; ${uniq.map((n) => `try { o[${JSON.stringify(n)}] = ${n}; } catch (e) {}`).join(' ')} return o; }); } catch (e) {}\n`;
    }
  }
  return _cmp.call(this, content, filename);
};
if (!OUT0) return;
const H6 = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 6);
const BIG = 200000;
function mkCanon(st) {
  const tag = new Map();
  if (st) {
    for (const vl of st.villages || []) { tag.set(vl, '@v' + vl.name); if (vl.econ) { tag.set(vl.econ, '@e' + vl.econ.name); for (const n of vl.econ.npcs || []) if (n && typeof n === 'object') tag.set(n, '@n' + n.id); } }
    if (st.world) tag.set(st.world, '@W');
    const P = st.deps && st.deps.players; if (P && P.forEach) P.forEach((p, id) => { if (p && typeof p === 'object') tag.set(p, '@p' + id); });
    if (st.deps) tag.set(st.deps, '@deps');
    if (st.db) tag.set(st.db, '@db');
  }
  let budget = 0;
  const canon = (x, d, stack) => {
    if (++budget > 3e6) return '@budget';
    if (x === undefined) return 'u';
    if (x === null || typeof x !== 'object') return typeof x === 'function' ? 'ƒ' : (typeof x === 'number' && !Number.isFinite(x) ? String(x) : x);
    if (d > 0 && tag.has(x)) return tag.get(x);
    if (d > 8) return '@deep';
    if (stack.has(x)) return '@cyc';
    if (ArrayBuffer.isView(x)) return ['T', x.length];
    if (x instanceof Map && x.size > BIG) return ['M#', x.size];
    if (x instanceof Set && x.size > BIG) return ['S#', x.size];
    if (Array.isArray(x) && x.length > BIG) return ['A#', x.length];
    if (x.constructor && x.constructor !== Object && x.constructor !== Array && x.constructor !== Map && x.constructor !== Set) {
      const cn = x.constructor.name; if (/Socket|Server|Database|Statement|Stream|Timeout|Interval|Worker|Promise|WeakMap|WeakSet/.test(cn)) return '@' + cn;
    }
    stack.add(x);
    let r;
    if (x instanceof Map) r = ['M', [...x.entries()].map(([k, v]) => [canon(k, d + 1, stack), canon(v, d + 1, stack)])];
    else if (x instanceof Set) r = ['S', [...x].map((v) => canon(v, d + 1, stack))];
    else if (Array.isArray(x)) r = x.map((v) => canon(v, d + 1, stack));
    else { r = {}; for (const k of Object.keys(x)) r[k] = canon(x[k], d + 1, stack); }
    stack.delete(x);
    return r;
  };
  return (x) => { budget = 0; return canon(x, 0, new Set()); };
}
const getSt = () => { try { const m = require.cache[VILL]; const f = m && m.exports && (m.exports.__t722 || m.exports.__t740); return f ? f() : null; } catch (e) { return null; } };
const SKIP_ST = new Set(['villages', 'world', 'deps', 'db', 'econ', 'econV2', 'pathfind', '_route', 'byDbId', 'byEcon', 'clientPayload', '_warPerf']);
function snap() {
  const st = getSt(); const canon = mkCanon(st); const h = {};
  const put = (k, v) => { if (typeof v === 'function') return; let j; try { j = JSON.stringify(canon(v)); } catch (e) { j = '(err)'; } h[k] = H6(j === undefined ? 'u' : j); };
  if (st) {
    for (const k of Object.keys(st)) if (!SKIP_ST.has(k)) put('state.' + k, st[k]);
    const W = st.world; if (W) for (const k of Object.keys(W)) if (k !== 'villages') put('world.' + k, W[k]);
    //   econ 마을 칸마다(마을 51 을 이어서) — 갈린 날 차례로 쓰기 자리를 좁힌다(T728 쓰기 자리 추적의 첫 걸음)
    const EV = (st.villages || []).map((v) => v.econ).filter(Boolean), ek = new Set(); for (const e of EV) for (const k of Object.keys(e)) if (k !== '_world') ek.add(k);
    for (const k of ek) put('econ.' + k, EV.map((e) => (k in e ? e[k] : '∅')));
  }
  for (const [fn, names] of MODS) {
    const m = require.cache[fn] || (fn.endsWith(path.join('server', 'zone.js')) ? process.mainModule : null);
    const g = m && m.__t742m; if (!g) continue;
    let o; try { o = g(); } catch (e) { continue; }
    const b = path.basename(fn, '.js');
    for (const n of names) { if (!(n in o)) continue; const v = o[n]; if (typeof v === 'function') continue; if (b === 'villages' && n === 'state') continue; put(b + ':' + n, v); }
  }
  return h;
}
const OUT = OUT0 + '.t742.json';
const days = []; let last = -1, msTot = 0, first = null;
const Ev = require(path.join(ROOT, 'server', 'events'));
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try { const d = day | 0; if (d !== last) { last = d; const t0 = Date.now(); const h = snap(); msTot += Date.now() - t0; days.push({ d, h }); if (days.length % 25 === 0) flush(); } } catch (e) { console.error('[t742] 해시 실패', e.message); }
    return sd.apply(this, arguments);
  };
  return L;
};
global.__t742Snap = snap;
function flush() { try { fs.writeFileSync(OUT, JSON.stringify({ msTot, days })); } catch (e) {} }
process.on('exit', flush);
// [T742_CONT_SYNC=1] 대조 판(`T722_CONT` · `__t740Cont`)이 econ 날을 K 날 뛸 때, **econ 날을 따로 세는 층**의 "마지막 날"도 같이 그 날로 둔다 —
//   제품이 다시 뜰 때 하는 그대로(도적 `bindHost` → `S.lastDay = day0` "재부팅 당일 이중 실행 방지"). 안 그러면 대조 판만 뛴 날의 도적 데일리를 한 번 더 돈다.
if (process.env.T742_CONT_SYNC === '1') {
  const iv = setInterval(() => {
    if (!global.__t740Cont || global.__t740Cont.__t742) return;
    clearInterval(iv);
    const f0 = global.__t740Cont;
    const f = function (st) {
      f0.apply(this, arguments);
      try { const m = require.cache[path.join(ROOT, 'server', 'bandits.js')]; const o = m && m.__t742m && m.__t742m(); if (o && o.S && o.S.ready) { o.S.lastDay = st.world.day; console.log(`[t742] 대조 — 도적 마지막 날 ${o.S.lastDay}(제품 부팅과 같게)`); } } catch (e) { console.error('[t742] 대조 동기 실패', e.message); }
    };
    f.__t742 = 1; global.__t740Cont = f;
  }, 50);
  iv.unref && iv.unref();
}
