// === server/des.js — 사건 기반 시뮬(discrete-event) 낱장 셋 (T1241 시제품 · 2026-11-09) ==========================================
//
// ★손잡이 `T1241_DES`(존 `zone.js` 가 읽는다 · 끔 기본) — 끔이면 이 모듈은 불리지도 않는다(존이 `require` 를 손잡이 뒤에 둔다).
// ★무엇(라이브러리 0 · OMNeT++ · SMPL 의 방법만):
//   ⓐ `EventQueue` — 사건을 (시각 · 넣은 차례) 로 줄 세운 이진 힙. 같은 시각 둘은 **먼저 넣은 것이 먼저**(결정론 · 틱 순서 대신 넣은 차례).
//   ⓑ `Facility`   — SMPL facility(서버 수 + 대기 줄). 자리가 차면 줄에 선다 · 놓으면 줄 머리가 받는다(요청 시각 · 넣은 차례 — 결정론).
//   ⓒ `Route`      — 몸의 걸음 한 토막. 출발 시각 + 길 점열 + 칸마다 빠르기 → 도착 시각 · `posAt(t)`(그 사이 아무 때나 몸 자리 · 보간).
//   ⓓ `nextPhaseAt` — 현지 해 몫 fv 가 목표 몫에 닿는 다음 시각(잠 · 깸 · 반일 · 해 질 녘 사건 시각).
// ★값 — 이 파일은 세계를 모른다(존 · 마을 의존 0 · 수와 함수만). 빠르기 · 막힘은 부르는 쪽이 함수로 준다.
'use strict';

// ── ⓐ 사건 대기열 ──────────────────────────────────────────────────────────────
class EventQueue {
  constructor() { this.t = []; this.s = []; this.v = []; this.seq = 0; }
  get size() { return this.t.length; }
  _lt(i, j) { const a = this.t[i], b = this.t[j]; return a < b || (a === b && this.s[i] < this.s[j]); }
  _sw(i, j) { const T = this.t, S = this.s, V = this.v; let x = T[i]; T[i] = T[j]; T[j] = x; x = S[i]; S[i] = S[j]; S[j] = x; x = V[i]; V[i] = V[j]; V[j] = x; }
  push(time, item) {
    const T = this.t; let i = T.length;
    T.push(time); this.s.push(this.seq++); this.v.push(item);
    while (i > 0) { const p = (i - 1) >> 1; if (!this._lt(i, p)) break; this._sw(i, p); i = p; }
    return this.seq - 1;
  }
  peekTime() { return this.t.length ? this.t[0] : Infinity; }
  pop() {
    const T = this.t, n = T.length; if (!n) return null;
    const out = { time: T[0], seq: this.s[0], item: this.v[0] };
    const lt = n - 1;
    if (lt > 0) { T[0] = T[lt]; this.s[0] = this.s[lt]; this.v[0] = this.v[lt]; }
    T.pop(); this.s.pop(); this.v.pop();
    let i = 0; const m = T.length;
    for (;;) { const l = 2 * i + 1, r = l + 1; let b = i;
      if (l < m && this._lt(l, b)) b = l;
      if (r < m && this._lt(r, b)) b = r;
      if (b === i) break; this._sw(i, b); i = b; }
    return out;
  }
  // 시각 ≤ until 인 사건을 차례대로 꺼내 fn(time, item) — 꺼낸 수
  runUntil(until, fn) { let n = 0; while (this.t.length && this.t[0] <= until) { const e = this.pop(); fn(e.time, e.item); n++; } return n; }
}

// ── ⓑ facility(서버 수 + 대기 줄) ─────────────────────────────────────────────────
class Facility {
  constructor(name, cap) { this.name = name; this.cap = Math.max(1, cap | 0); this.busy = new Set(); this.q = []; this.seq = 0; this.served = 0; this.maxQ = 0; }
  // 자리를 묻는다 — 받으면 true · 줄에 서면 false(같은 몸이 두 번 서지 않는다)
  request(who, t) {
    if (this.busy.has(who)) return true;
    if (this.busy.size < this.cap) { this.busy.add(who); this.served++; return true; }
    if (!this.q.some((e) => e.who === who)) { this.q.push({ who, t, s: this.seq++ }); this.q.sort((a, b) => a.t - b.t || a.s - b.s); if (this.q.length > this.maxQ) this.maxQ = this.q.length; }
    return false;
  }
  // 놓는다 — 줄 머리가 자리를 받으면 그 몸(없으면 null)
  release(who) {
    if (!this.busy.delete(who)) { const i = this.q.findIndex((e) => e.who === who); if (i >= 0) this.q.splice(i, 1); return null; }
    if (!this.q.length) return null;
    const e = this.q.shift(); this.busy.add(e.who); this.served++; return e.who;
  }
  queuePos(who) { const i = this.q.findIndex((e) => e.who === who); return i < 0 ? (this.busy.has(who) ? 0 : -1) : i + 1; }
}

// ── ⓒ 걸음 토막 ──────────────────────────────────────────────────────────────────
//   pts = [x0, y0, x1, y1, …](px) · speedAt(x, y) = 그 자리 px/s(> 0) · t0 = 출발 시각(ms) · sub = 빠르기를 다시 읽는 걸음(px)
//   각 다리를 sub px 이하 조각으로 나눠 조각 머리 자리의 빠르기로 그 조각을 건넌다(칸이 바뀌는 자리마다 빠르기가 바뀐다 — 32px 칸에 sub 16 이면 칸마다 둘 이상).
class Route {
  constructor(pts, speedAt, t0, sub) {
    const S = sub || 16;
    const X = [pts[0]], Y = [pts[1]], T = [t0], LG = [0];   // LG[k] = 조각 끝 점 k 가 속한 다리(1 부터 — 다리 j = 점 j−1 → 점 j)
    let t = t0, len = 0;
    for (let i = 2; i + 1 < pts.length; i += 2) {
      const ax = pts[i - 2], ay = pts[i - 1], bx = pts[i], by = pts[i + 1];
      const L = Math.hypot(bx - ax, by - ay); if (!(L > 0)) continue;
      const n = Math.max(1, Math.ceil(L / S));
      for (let k = 1; k <= n; k++) {
        const px = ax + (bx - ax) * (k - 1) / n, py = ay + (by - ay) * (k - 1) / n;
        const v = speedAt(px, py);
        const qx = ax + (bx - ax) * k / n, qy = ay + (by - ay) * k / n;
        t += (L / n) / (v > 0 ? v : 1e-9) * 1000;
        X.push(qx); Y.push(qy); T.push(t); LG.push(i >> 1);
      }
      len += L;
    }
    this.X = X; this.Y = Y; this.T = T; this.L = LG; this.t0 = t0; this.t1 = t; this.len = len; this._k = 1;
  }
  // t 때 자리 → out{x, y, k(지난 조각 끝 번호)} — 시각이 오르기만 하면 커서가 앞으로만 간다(O(1) 몫)
  posAt(t, out) {
    const X = this.X, Y = this.Y, T = this.T, n = T.length;
    const o = out || {};
    if (n < 2 || t >= this.t1) { o.x = X[n - 1]; o.y = Y[n - 1]; o.k = n - 1; o.done = true; return o; }
    if (t <= this.t0) { o.x = X[0]; o.y = Y[0]; o.k = 0; o.done = false; return o; }
    let k = this._k; if (k < 1 || T[k - 1] > t) k = 1;
    while (k < n - 1 && T[k] < t) k++;
    this._k = k;
    const f = (t - T[k - 1]) / (T[k] - T[k - 1]);
    o.x = X[k - 1] + (X[k] - X[k - 1]) * f; o.y = Y[k - 1] + (Y[k] - Y[k - 1]) * f; o.k = k - 1; o.done = false;
    return o;
  }
}

// ── ⓓ 해 몫 사건 시각 ─────────────────────────────────────────────────────────────
//   fv(t) = frac(((t − epoch) mod L) / L + off) — 목표 몫 target 에 **다음에** 닿는 시각(> now · 같은 몫이면 하루 뒤)
function frac(x) { const f = x - Math.floor(x); return f >= 1 ? 0 : f; }
function phaseAt(now, epoch, L, off) { return frac((((now - epoch) % L) + L) % L / L + off); }
function nextPhaseAt(now, epoch, L, off, target) {
  let d = frac(target - phaseAt(now, epoch, L, off));
  if (!(d > 0)) d = 1;
  return now + d * L;
}

module.exports = { EventQueue, Facility, Route, phaseAt, nextPhaseAt, frac };

// T1248: deterministic work progress and an actor wake heap. Event payloads are
// data, never callbacks, so the same queue can be saved with T742 world metadata.
class Work {
  constructor(goal, progress, rate, at) {
    if (!(Number.isFinite(goal) && goal >= 0 && Number.isFinite(rate) && rate > 0 && Number.isFinite(at))) throw new RangeError('invalid work');
    this.goal=goal;this.progress=Math.min(goal,Math.max(0,Number(progress)||0));this.rate=rate;this.at=at;
  }
  valueAt(t) { return Math.min(this.goal,this.progress+Math.max(0,t-this.at)*this.rate); }
  dueAt() { return this.at+(this.goal-this.progress)/this.rate; }
  advance(t) { if(t<this.at)throw new RangeError('work clock went backwards');this.progress=this.valueAt(t);this.at=t;return this.progress; }
  snapshot(t=this.at) { return {goal:this.goal,progress:this.valueAt(t),rate:this.rate,at:t}; }
  static restore(s,at=s.at) { return new Work(s.goal,s.progress,s.rate,at); }
}
const actorCompare=(a,b)=>typeof a==='number'&&typeof b==='number'?a-b:(String(a)<String(b)?-1:String(a)>String(b)?1:0);
class WakeQueue extends EventQueue {
  _lt(i,j) { const a=this.t[i],b=this.t[j];if(a!==b)return a<b;const c=actorCompare(this.v[i].id,this.v[j].id);return c<0||(c===0&&this.s[i]<this.s[j]); }
}
class Dispatcher {
  constructor() { this.queue=new WakeQueue();this.actors=new Map();this.generation=0;this.stats={parked:0,woken:0,canceled:0,stale:0}; }
  park(id,at,data) {
    if(!Number.isFinite(at))throw new RangeError('invalid event time');
    const e={id,at,generation:++this.generation,data};this.actors.set(id,e);this.queue.push(at,{id,generation:e.generation});this.stats.parked++;return e;
  }
  cancel(id) { const e=this.actors.get(id);if(!e)return null;this.actors.delete(id);this.stats.canceled++;return e; }
  runUntil(at,wake) {
    return this.queue.runUntil(at,(time,key)=>{const e=this.actors.get(key.id);if(!e||e.generation!==key.generation){this.stats.stale++;return;}this.actors.delete(key.id);this.stats.woken++;wake(e.id,time,e.data);});
  }
  snapshot() { return {version:1,generation:this.generation,actors:[...this.actors.values()].map(e=>({id:e.id,at:e.at,data:e.data})).sort((a,b)=>a.at-b.at||actorCompare(a.id,b.id)),stats:{...this.stats}}; }
  static restore(s,shift=0) { if(!s||s.version!==1||!Array.isArray(s.actors))throw new Error('invalid dispatcher snapshot');const d=new Dispatcher();for(const e of s.actors)d.park(e.id,e.at+shift,e.data);d.generation=Math.max(d.generation,s.generation||0);if(s.stats)d.stats={...s.stats};return d; }
}
// Facility order and in-service ownership survive a restart. Queued identity is
// kept separately from the actor heap; releasing a slot explicitly wakes its head.
Facility.prototype.snapshot=function(){return {name:this.name,cap:this.cap,busy:[...this.busy],q:this.q.map(e=>({...e})),seq:this.seq,served:this.served,maxQ:this.maxQ};};
Facility.restore=function(s,shift=0){if(!s||!(s.cap>0)||!Array.isArray(s.q)||!Array.isArray(s.busy))throw new Error('invalid facility snapshot');const f=new Facility(s.name,s.cap);f.busy=new Set(s.busy);if(f.busy.size>f.cap)throw new Error('facility over capacity');f.q=s.q.map(e=>({...e,t:e.t+shift}));f.seq=s.seq;f.served=s.served;f.maxQ=s.maxQ;return f;};
Route.prototype.snapshot=function(){return {X:[...this.X],Y:[...this.Y],T:[...this.T],L:[...this.L],t0:this.t0,t1:this.t1,len:this.len,_k:this._k};};
Route.restore=function(s,shift=0){if(!s||!Array.isArray(s.X)||!s.X.length||s.X.length!==s.Y.length||s.X.length!==s.T.length||s.X.length!==s.L.length)throw new Error('invalid route snapshot');const r=Object.create(Route.prototype);Object.assign(r,s,{X:[...s.X],Y:[...s.Y],T:s.T.map(t=>t+shift),L:[...s.L],t0:s.t0+shift,t1:s.t1+shift});return r;};
module.exports.Work=Work;module.exports.Dispatcher=Dispatcher;module.exports.WakeQueue=WakeQueue;
