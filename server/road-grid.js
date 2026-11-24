'use strict';
// =============================================================================
// server/road-grid.js — ★★[T1448 2026-11-23 · 재민 판정 62 "모든 셀마다 갖는 속성 중에 길 수치를 두면 되는 거 아니었어..?" → (나)]
//   길 장부를 **칸 배열**로 — 구역(16 × 16칸 — 존 청크 1,024 px = T1446 화면 상자 32칸의 ¼ · 넷이 꼭 맞는다)마다 숫자 배열(값 Float64 · 마지막 날 Int32 · 등급 Uint8) ·
//   밟힌 적 없는 구역은 배열이 없다 · 칸마다 객체 0. `roads.js` 가 손잡이 `T1448_ROAD_GRID` 켬일 때만 이 꼴을 쓴다(끔 = 종전 Map · Set 그대로).
//
//   ★문 글자 무변 — `roads.js` 의 장부(cells · sent · paved · T688 lvl)가 쓰는 Map · Set 꼴(get · set · has · delete · size · clear · 차례대로 돌기)을
//     그대로 낸다. `cells.get(k)` 는 그 칸 자리를 가리키는 작은 손잡이(`CellRef` — v · d 를 읽고 쓰면 배열 칸을 읽고 쓴다)를 준다 —
//     종전 `{v, d}` 객체를 그 자리에서 고치던 글자(`r.v *= …` · `r.d = t`)가 같은 뜻으로 산다.
//   ★값 — Float64 = JS 수 그대로(반올림 0). 날 = 그릇 하나의 밑 날(`dB` — 처음 적힌 날)에서 잰 차를 Int32 로(라이브 날 124만 · 250ms 판 자의 날 71억 —
//     날 수 자체는 Int32 를 넘을 수 있어도 한 판 안의 폭은 작다) · 폭이 Int32 를 넘거나 정수가 아닌 날이 오면 그 순간 그릇 전부를 Float64(날 그대로)로 바꾼다
//     ⇒ 어느 날이든 적은 날 = 읽는 날(하네스 ① · test-t1001-econ-day 의 맞춤 몫 7,173,017,989). 값이 1 밑이면 지운다(=0) — 종전 지우기와 같은 자리 · 같은 날.
//   ★있음 = 값 > 0 — 종전 장부의 칸은 늘 값 ≥ 1(새 칸 1 · 1 밑으로 닳으면 지움)이라 "값 0 = 밟힌 적 없음"과 같은 뜻이다(구별이 필요한 자리 0 — 보고 §코너).
//   ★차례 — 칸 키 오름(행 우선 · cy × 폭 + cx). 종전 Map 은 넣은 차례였다(부팅 직후 = DB 행 차례 = 키 오름 · 그 뒤 새 칸은 끝에) —
//     값에 닿는 차례 자리는 없다(보고 T1448 §3 — 400날 판 차례 뒤집기 둘 다 같음). 부팅 차례(다진 길 · 꺼진 사이 풀린 길)는 키 오름 그대로다.
// =============================================================================
//   구역 크기 — 11-09 라이브 사본 68만 칸을 16 · 32 · 64 · 128칸 구역으로 센 배열 총량 36 · 48 · 61 · 74 MB(보고 T1448 §2 · 진단 `diag-1109.json`) — 가장 작은 16.
//   (화면 상자 · 서버 문 `clientRoadsBox` 는 32칸 단위 그대로 — 구역 넷이 꼭 맞는다 · 저장 구역 크기와 따로)
const C = 16, CC = C * C;
const SHIFT = 4;   // log2(C)

class Grid {
  constructor(W, H) {
    this.W = W | 0; this.H = H | 0;
    this.GW = Math.ceil(this.W / C); this.GH = Math.ceil(this.H / C);
    this.ch = new Array(this.GW * this.GH).fill(null);
    this.rowCols = new Array(this.GH).fill(null);   // 구역 줄마다 배열이 선 구역 열(오름)
    this.nCh = 0; this.size = 0;
  }
  _ci(k) { const x = k % this.W, y = (k / this.W) | 0; return (y >> SHIFT) * this.GW + (x >> SHIFT); }
  _li(k) { const x = k % this.W, y = (k / this.W) | 0; return ((y & (C - 1)) << SHIFT) | (x & (C - 1)); }
  _reg(ci) {   // 새 구역 — 그 줄의 열 목록에 오름으로
    const gy = (ci / this.GW) | 0, gx = ci - gy * this.GW;
    let a = this.rowCols[gy]; if (!a) a = this.rowCols[gy] = [];
    let i = a.length; a.push(gx); while (i > 0 && a[i - 1] > gx) { a[i] = a[i - 1]; i--; } a[i] = gx;
    this.nCh++;
  }
  _clearAll() { this.ch.fill(null); this.rowCols.fill(null); this.nCh = 0; this.size = 0; }
  // 빠른 훑기(읽기만) — 칸 키 오름으로 `each(c, i, k)` · 돌 때 객체 0(차례 = `_walk` 와 같다 — 하네스 ①)
  _scan(each) {
    const W = this.W, H = this.H;
    for (let gy = 0; gy < this.GH; gy++) {
      const cols = this.rowCols[gy]; if (!cols || !cols.length) continue;
      for (let ly = 0; ly < C; ly++) {
        const cy = (gy << SHIFT) + ly; if (cy >= H) break;
        const rb = cy * W, base = ly << SHIFT;
        for (let j = 0; j < cols.length; j++) {
          const gx = cols[j], c = this.ch[gy * this.GW + gx]; if (!c) continue;
          const x0 = gx << SHIFT, xn = Math.min(C, W - x0);
          for (let lx = 0; lx < xn; lx++) each(c, base | lx, rb + x0 + lx);
        }
      }
    }
  }
  // 키 오름으로 (k, 구역, 칸) — `live(c, i)` 가 참인 칸만
  *_walk(live) {
    const W = this.W, H = this.H;
    for (let gy = 0; gy < this.GH; gy++) {
      const cols = this.rowCols[gy]; if (!cols || !cols.length) continue;
      for (let ly = 0; ly < C; ly++) {
        const cy = (gy << SHIFT) + ly; if (cy >= H) break;
        for (let j = 0; j < cols.length; j++) {
          const gx = cols[j], c = this.ch[gy * this.GW + gx]; if (!c) continue;
          const base = ly << SHIFT, x0 = gx << SHIFT;
          for (let lx = 0; lx < C; lx++) { const cx = x0 + lx; if (cx >= W) break; const i = base | lx; if (live(c, i)) yield [cy * W + cx, c, i]; }
        }
      }
    }
  }
}

class CellRef {   // 칸 자리 손잡이 — v · d 를 읽고 쓰면 배열 칸(날은 밑 날 차 — 쓰기는 먼저 바꾼 값을 받고 나서 배열에: 바꾸며 그릇이 Float64 로 갈 수 있다)
  constructor(c, i) { this.c = c; this.i = i; }
  get v() { return this.c.v[this.i]; } set v(x) { this.c.v[this.i] = x; }
  get d() { return this.c.g._dDec(this.c.d[this.i]); } set d(x) { const s = this.c.g._dEnc(x); this.c.d[this.i] = s; }
}
const _cellLive = (c, i) => c.v[i] > 0;
const I32MAX = 2147483647, I32MIN = -2147483648;
class CellGrid extends Grid {   // cells — k → {v, d}
  constructor(W, H) { super(W, H); this.dB = null; this.d64 = false; }
  _mk(ci) { const c = { v: new Float64Array(CC), d: this.d64 ? new Float64Array(CC) : new Int32Array(CC), n: 0, g: this }; this.ch[ci] = c; this._reg(ci); return c; }
  _dEnc(x) {   // 날 → 담을 수(Int32 차 · 그릇이 Float64 면 날 그대로)
    if (this.d64) return x;
    if (this.dB === null) { if (!Number.isInteger(x)) { this._d64(); return x; } this.dB = x; }
    const o = x - this.dB;
    if (o > I32MAX || o < I32MIN || !Number.isInteger(o)) { this._d64(); return x; }
    return o;
  }
  _dDec(s) { return this.d64 ? s : s + this.dB; }
  _d64() {   // 그릇 전부 날을 Float64(날 그대로)로 — 값 무변 · 한 번(드문 일)
    const b = this.dB || 0;
    for (const c of this.ch) if (c) { const a = new Float64Array(CC); for (let i = 0; i < CC; i++) if (c.v[i] > 0) a[i] = c.d[i] + b; c.d = a; }
    this.d64 = true;
  }
  has(k) { const c = this.ch[this._ci(k)]; return !!c && c.v[this._li(k)] > 0; }
  get(k) { const c = this.ch[this._ci(k)]; if (!c) return undefined; const i = this._li(k); return c.v[i] > 0 ? new CellRef(c, i) : undefined; }
  set(k, o) {
    const ci = this._ci(k), i = this._li(k); let c = this.ch[ci]; if (!c) c = this._mk(ci);
    if (!(c.v[i] > 0)) { c.n++; this.size++; }
    const s = this._dEnc(o.d);
    c.v[i] = o.v; c.d[i] = s;
    return this;
  }
  delete(k) { const c = this.ch[this._ci(k)]; if (!c) return false; const i = this._li(k); if (!(c.v[i] > 0)) return false; c.v[i] = 0; c.d[i] = 0; c.n--; this.size--; return true; }
  clear() { this._clearAll(); }
  *entries() { for (const [k, c, i] of this._walk(_cellLive)) yield [k, new CellRef(c, i)]; }
  *keys() { for (const [k] of this._walk(_cellLive)) yield k; }
  *values() { for (const [, c, i] of this._walk(_cellLive)) yield new CellRef(c, i); }
  [Symbol.iterator]() { return this.entries(); }
  forEach(f, t) { for (const [k, r] of this.entries()) f.call(t, r, k, this); }
  scan(fn) {   // 읽기만 — fn(k, 값, 날) · 칸 키 오름(`_scan` 과 같은 차례 · 칸마다 부르는 함수 없이 — 웰컴 · 부팅이 68만 칸을 돈다)
    const W = this.W, H = this.H, b = this.d64 ? 0 : (this.dB || 0);
    for (let gy = 0; gy < this.GH; gy++) {
      const cols = this.rowCols[gy]; if (!cols || !cols.length) continue;
      for (let ly = 0; ly < C; ly++) {
        const cy = (gy << SHIFT) + ly; if (cy >= H) break;
        const rb = cy * W, base = ly << SHIFT;
        for (let j = 0; j < cols.length; j++) {
          const gx = cols[j], c = this.ch[gy * this.GW + gx]; if (!c || !c.n) continue;
          const x0 = gx << SHIFT, xn = Math.min(C, W - x0), v = c.v, d = c.d;
          for (let lx = 0; lx < xn; lx++) { const i = base | lx, x = v[i]; if (x > 0) fn(rb + x0 + lx, x, d[i] + b); }
        }
      }
    }
  }
  // 덩이(저장 · 덤프) — 구역마다 [구역 키, 칸 수, 칸 자리(Uint16) · 값(Float64) · 날(날 그대로 — Float64)] (있는 칸만 · 칸 자리 오름)
  packChunk(ci) {
    const c = this.ch[ci]; if (!c || !c.n) return null;
    const n = c.n, li = new Uint16Array(n), v = new Float64Array(n), d = new Float64Array(n), b = this.d64 ? 0 : this.dB;
    let j = 0; for (let i = 0; i < CC; i++) if (c.v[i] > 0) { li[j] = i; v[j] = c.v[i]; d[j] = c.d[i] + b; j++; }
    return { ci, n, li, v, d };
  }
  unpackChunk(ci, li, v, d) {
    let c = this.ch[ci]; if (!c) c = this._mk(ci);
    for (let j = 0; j < li.length; j++) { const i = li[j]; if (!(c.v[i] > 0)) { c.n++; this.size++; } const s = this._dEnc(d[j]); c = this.ch[ci]; c.v[i] = v[j]; c.d[i] = s; }
  }
  chunkKeys() { const out = []; for (let ci = 0; ci < this.ch.length; ci++) if (this.ch[ci] && this.ch[ci].n) out.push(ci); return out; }
  mem() { return this.nCh * CC * (this.d64 ? 16 : 12); }   // 바이트(값 8 + 날 4 — Float64 로 간 그릇은 8) — 구역 하나 3,072
}

const _u8Live = (c, i) => c[i] !== 0;
class U8Map extends Grid {   // sent · T688 lvl — k → 1 · 2(0 = 없음)
  _mk(ci) { const c = new Uint8Array(CC); this.ch[ci] = c; this._reg(ci); return c; }
  has(k) { const c = this.ch[this._ci(k)]; return !!c && c[this._li(k)] !== 0; }
  get(k) { const c = this.ch[this._ci(k)]; if (!c) return undefined; const x = c[this._li(k)]; return x ? x : undefined; }
  set(k, x) {
    if (!x) { this.delete(k); return this; }
    const ci = this._ci(k), i = this._li(k); let c = this.ch[ci]; if (!c) c = this._mk(ci);
    if (!c[i]) this.size++;
    c[i] = x; return this;
  }
  delete(k) { const c = this.ch[this._ci(k)]; if (!c) return false; const i = this._li(k); if (!c[i]) return false; c[i] = 0; this.size--; return true; }
  clear() { this._clearAll(); }
  *entries() { for (const [k, c, i] of this._walk(_u8Live)) yield [k, c[i]]; }
  *keys() { for (const [k] of this._walk(_u8Live)) yield k; }
  *values() { for (const [, c, i] of this._walk(_u8Live)) yield c[i]; }
  [Symbol.iterator]() { return this.entries(); }
  forEach(f, t) { for (const [k, x] of this.entries()) f.call(t, x, k, this); }
  scan(fn) { this._scan((c, i, k) => { const x = c[i]; if (x) fn(k, x); }); }   // 읽기만 — fn(k, 등급) · 칸 키 오름
  mem() { return this.nCh * CC; }
}

class BitSet extends Grid {   // paved — 칸 키 집합(구역마다 256 비트 = 32 바이트)
  _mk(ci) { const c = new Uint8Array(CC >> 3); this.ch[ci] = c; this._reg(ci); return c; }
  has(k) { const c = this.ch[this._ci(k)]; if (!c) return false; const i = this._li(k); return (c[i >> 3] & (1 << (i & 7))) !== 0; }
  add(k) {
    const ci = this._ci(k), i = this._li(k); let c = this.ch[ci]; if (!c) c = this._mk(ci);
    const m = 1 << (i & 7); if (!(c[i >> 3] & m)) { c[i >> 3] |= m; this.size++; }
    return this;
  }
  delete(k) { const c = this.ch[this._ci(k)]; if (!c) return false; const i = this._li(k), m = 1 << (i & 7); if (!(c[i >> 3] & m)) return false; c[i >> 3] &= ~m; this.size--; return true; }
  clear() { this._clearAll(); }
  *values() { for (const [k] of this._walk((c, i) => (c[i >> 3] & (1 << (i & 7))) !== 0)) yield k; }
  keys() { return this.values(); }
  *entries() { for (const k of this.values()) yield [k, k]; }
  [Symbol.iterator]() { return this.values(); }
  forEach(f, t) { for (const k of this.values()) f.call(t, k, k, this); }
  scan(fn) { this._scan((c, i, k) => { if (c[i >> 3] & (1 << (i & 7))) fn(k); }); }   // 읽기만 — fn(k) · 칸 키 오름
  mem() { return this.nCh * (CC >> 3); }
}

class DayMap extends U8Map {   // T688 sched — k → 다음 문턱 날(Float64 — 날 그대로 · 0 = 없음 · 문턱 날 = 마지막 날 + 1 날 넘게 · 날은 0 이상)
  _mk(ci) { const c = new Float64Array(CC); this.ch[ci] = c; this._reg(ci); return c; }
  mem() { return this.nCh * CC * 8; }
}
// T688 due 날 통 — 그날 문턱을 넘는 칸(Set 꼴: add · delete · size · 돌기). 붙이기만 한다 — 다른 날로 다시 잡힌 칸은 옛 통에 남았다가
//   돌 때 거른다(`sched` 가 정본: 그 칸의 날이 이 통의 날일 때만 산 칸) · 같은 칸이 둘이면 하나만 낸다 · 죽은 자리가 산 칸의 두 배를 넘으면 다진다.
//   차례 = 처음 든 자리(Set 은 마지막 든 자리) — 다시 잡혔다 돌아온 칸만 다르다 · 값에 닿는 자리 0(보고 T1448 차례 표 — 코스 칸 고칠 차례 · 내일 풀릴 칸 차례)
class DueList {
  constructor(sched, dd) { this.s = sched; this.dd = dd; this.a = new Int32Array(4); this.n = 0; this.live = 0; }
  add(k) { if (this.n === this.a.length) { const b = new Int32Array(this.a.length * 2); b.set(this.a); this.a = b; } this.a[this.n++] = k; this.live++; return this; }
  delete(k) { this.live--; if (this.n > 2 * this.live + 16) this._compact(k); return true; }   // k = 지금 다른 날로 옮겨 가는 칸(`sched` 가 아직 이 날) — 다질 때 뺀다
  _compact(skip) {
    const seen = new Set(), out = [];
    for (let j = 0; j < this.n; j++) { const k = this.a[j]; if (k === skip || seen.has(k) || this.s.get(k) !== this.dd) continue; seen.add(k); out.push(k); }
    const b = new Int32Array(Math.max(4, out.length * 2)); b.set(out); this.a = b; this.n = out.length; this.live = out.length;
  }
  get size() { return this.live; }
  *[Symbol.iterator]() {
    const dup = this.n > this.live ? new Set() : null;
    for (let j = 0; j < this.n; j++) { const k = this.a[j]; if (this.s.get(k) !== this.dd) continue; if (dup) { if (dup.has(k)) continue; dup.add(k); } yield k; }
  }
  values() { return this[Symbol.iterator](); }
  keys() { return this[Symbol.iterator](); }
  mem() { return this.a.length * 4; }
}
// 코스 지도 — 4칸 격자 칸마다 한 바이트(0 = 없음) · Map 꼴(get · set · delete · has · size · clear · 키 오름으로 돌기) · 상자 안 최저 할인(`minIn`)
class DenseU8 {
  constructor(gw, gh) { this.gw = gw; this.gh = gh; this.a = new Uint8Array(gw * gh); this.size = 0; }
  get(k) { const x = this.a[k]; return x ? x : undefined; }
  has(k) { return !!this.a[k]; }
  set(k, x) { if (!x) { this.delete(k); return this; } if (!this.a[k]) this.size++; this.a[k] = x; return this; }
  delete(k) { if (!this.a[k]) return false; this.a[k] = 0; this.size--; return true; }
  clear() { this.a.fill(0); this.size = 0; }
  *entries() { const a = this.a; for (let k = 0; k < a.length; k++) if (a[k]) yield [k, a[k]]; }
  *keys() { const a = this.a; for (let k = 0; k < a.length; k++) if (a[k]) yield k; }
  *values() { const a = this.a; for (let k = 0; k < a.length; k++) if (a[k]) yield a[k]; }
  [Symbol.iterator]() { return this.entries(); }
  forEach(f, t) { for (const [k, x] of this.entries()) f.call(t, x, k, this); }
  minIn(COST, gx0, gy0, gx1, gy1) {   // 상자 [gx0..gx1]×[gy0..gy1] 안 등급 칸의 COST 최저 · 없으면 1(종전 `_minIn` 과 같은 답 — 전수 대신 상자만 본다)
    let m = 1; const a = this.a, gw = this.gw;
    const x0 = Math.max(0, gx0), x1 = Math.min(gw - 1, gx1), y0 = Math.max(0, gy0), y1 = Math.min(this.gh - 1, gy1);
    for (let y = y0; y <= y1; y++) for (let x = x0, k = y * gw + x0; x <= x1; x++, k++) { const lv = a[k]; if (lv && COST[lv] < m) m = COST[lv]; }
    return m;
  }
  copy() { const o = new DenseU8(this.gw, this.gh); o.a.set(this.a); o.size = this.size; return o; }   // 얼린 보기(`frozenView`)
  mem() { return this.a.length; }
}
// 덩이 글자(DB 행 · 덤프) — 머리 16(칸 수 n · 꼴 표 · 밑 날 Float64) · 칸 자리 Uint16 × n · (8 맞춤) · 값 Float64 × n · 날(밑 날 차 Int32 × n — 꼴 표 1 이면 날 그대로 Float64 × n)
//   밑 날 = 그 구역 첫 칸의 날 · 차가 Int32 를 넘거나 정수가 아닌 날이 있으면 Float64(날 그대로) — 되읽은 날 = 적은 날(작은 끝)
function encodeChunk(p) {
  const n = p.n, base = n ? p.d[0] : 0;
  let f64 = !Number.isInteger(base);
  if (!f64) for (let j = 0; j < n; j++) { const x = p.d[j] - base; if (x > I32MAX || x < I32MIN || !Number.isInteger(x)) { f64 = true; break; } }
  const h = (16 + n * 2 + 7) & ~7, buf = Buffer.alloc(h + n * (f64 ? 16 : 12));
  buf.writeUInt32LE(n, 0); buf.writeUInt32LE(f64 ? 1 : 0, 4); buf.writeDoubleLE(base, 8);
  let o = 16;
  for (let j = 0; j < n; j++) { buf.writeUInt16LE(p.li[j], o); o += 2; }
  while (o % 8) o++;
  for (let j = 0; j < n; j++) { buf.writeDoubleLE(p.v[j], o); o += 8; }
  if (f64) for (let j = 0; j < n; j++) { buf.writeDoubleLE(p.d[j], o); o += 8; }
  else for (let j = 0; j < n; j++) { buf.writeInt32LE(p.d[j] - base, o); o += 4; }
  return buf.subarray(0, o);
}
function decodeChunk(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const n = b.readUInt32LE(0), f64 = (b.readUInt32LE(4) & 1) === 1, base = b.readDoubleLE(8), li = new Uint16Array(n), v = new Float64Array(n), d = new Float64Array(n);
  let o = 16;
  for (let j = 0; j < n; j++) { li[j] = b.readUInt16LE(o); o += 2; }
  while (o % 8) o++;
  for (let j = 0; j < n; j++) { v[j] = b.readDoubleLE(o); o += 8; }
  if (f64) for (let j = 0; j < n; j++) { d[j] = b.readDoubleLE(o); o += 8; }
  else for (let j = 0; j < n; j++) { d[j] = b.readInt32LE(o) + base; o += 4; }
  return { n, li, v, d };
}

module.exports = { C, CC, SHIFT, Grid, CellGrid, CellRef, U8Map, BitSet, DayMap, DueList, DenseU8, encodeChunk, decodeChunk };
