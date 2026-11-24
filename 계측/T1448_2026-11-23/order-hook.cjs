// T1448 진단 — "차례가 결과에 닿나" 판 훅(재는 판만 · 제품 무접촉).
//   NODE_OPTIONS="--require <이 파일>" 로 판에 싣는다. `server/roads.js` 가 실리는 순간 그 모듈의 장부(`_S`)에서
//   넣은 차례로 도는 다섯(`cells` · `paved` · `dirty` · `coarse` · `chg`)을 **값은 그대로 · 도는 차례만 바꾼** 꼴로 갈아 끼운다.
//     T1448_ORDER=asc  — 칸 키 오름차순(= 행 우선 공간 차례 · 배열 장부가 낼 법한 차례)
//     T1448_ORDER=desc — 칸 키 내림차순(가장 먼 차례 — 넣은 차례와도 오름과도 다르다)
//   `bootUnpaved`(배열)는 부팅이 `cells` 를 도는 차례로 쌓이니 같이 바뀐다. T688 표(`I.*` — 모듈 안)는 못 닿는다(값 무관 — 보고 표).
//   T1448_ORDER_OUT=<파일> 이면 판 끝(exit)에 몇 번 · 몇 키를 바꾼 차례로 돌았는지 적는다(훅이 정말 섰나).
'use strict';
const MODE = (process.env.T1448_ORDER || '').trim();
if (MODE === 'asc' || MODE === 'desc') {
  const Module = require('module');
  const fs = require('fs');
  const cmp = MODE === 'asc' ? (a, b) => a - b : (a, b) => b - a;
  const ST = { mode: MODE, pid: process.pid, patched: false, it: {}, keys: {} };
  const tick = (name, n) => { ST.it[name] = (ST.it[name] || 0) + 1; ST.keys[name] = (ST.keys[name] || 0) + n; };
  const mkIter = (arr, f) => { let i = 0; return { [Symbol.iterator]() { return this; }, next() { while (i < arr.length) { const r = f(arr[i++]); if (r !== undefined) return { value: r.v, done: false }; } return { value: undefined, done: true }; } }; };
  class SMap extends Map {
    constructor(src, name) { super(src || undefined); this._nm = name || 'map'; }
    _ks() { const ks = Array.from(Map.prototype.keys.call(this)); ks.sort(cmp); tick(this._nm, ks.length); return ks; }
    entries() { const ks = this._ks(); return mkIter(ks, (k) => (Map.prototype.has.call(this, k) ? { v: [k, Map.prototype.get.call(this, k)] } : undefined)); }
    keys() { const ks = this._ks(); return mkIter(ks, (k) => (Map.prototype.has.call(this, k) ? { v: k } : undefined)); }
    values() { const ks = this._ks(); return mkIter(ks, (k) => (Map.prototype.has.call(this, k) ? { v: Map.prototype.get.call(this, k) } : undefined)); }
    [Symbol.iterator]() { return this.entries(); }
    forEach(f, t) { for (const [k, v] of this.entries()) f.call(t, v, k, this); }
  }
  class SSet extends Set {
    constructor(src, name) { super(src || undefined); this._nm = name || 'set'; }
    _ks() { const ks = Array.from(Set.prototype.values.call(this)); ks.sort(cmp); tick(this._nm, ks.length); return ks; }
    values() { const ks = this._ks(); return mkIter(ks, (k) => (Set.prototype.has.call(this, k) ? { v: k } : undefined)); }
    keys() { return this.values(); }
    entries() { const ks = this._ks(); return mkIter(ks, (k) => (Set.prototype.has.call(this, k) ? { v: [k, k] } : undefined)); }
    [Symbol.iterator]() { return this.values(); }
    forEach(f, t) { for (const k of this.values()) f.call(t, k, k, this); }
  }
  const slot = (S, prop, wrap) => {
    let cur = S[prop] == null ? S[prop] : wrap(S[prop]);
    Object.defineProperty(S, prop, { configurable: true, enumerable: true, get() { return cur; }, set(v) { cur = v == null ? v : wrap(v); } });
  };
  const patch = (m) => {
    const S = m._S; if (!S || ST.patched) return;
    S.cells = new SMap(S.cells, 'cells');
    S.paved = new SSet(S.paved, 'paved');
    slot(S, 'dirty', (v) => (v instanceof SSet ? v : new SSet(v, 'dirty')));
    slot(S, 'coarse', (v) => (v instanceof SMap ? v : new SMap(v, 'coarse')));
    slot(S, 'chg', (v) => (v instanceof SSet ? v : new SSet(v, 'chg')));
    ST.patched = true;
  };
  const orig = Module._load;
  Module._load = function (request, parent, isMain) {
    const m = orig.apply(this, arguments);
    try { if (m && m._S && typeof m.clientRoads === 'function' && typeof m.stampCell === 'function' && !ST.patched) patch(m); } catch (e) { ST.err = String(e && e.message || e); }
    return m;
  };
  const OUT = process.env.T1448_ORDER_OUT;
  if (OUT) process.on('exit', () => { if (!ST.patched) return; try { fs.writeFileSync(`${OUT}.${process.pid}.json`, JSON.stringify(ST)); } catch (e) { } });
}
