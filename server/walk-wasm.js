// === server/walk-wasm.js — T461 걸음 문 WASM 커널의 JS 껍데기(손잡이 `T461_WALK_WASM` · 기본 끔) =================
//   커널 원문 `tools/walk-wasm/walk.c` · 산출물 `server/walk-wasm.wasm`(레포에 커밋 · 빌드 한 줄은 원문 머리).
//   ★메모리는 JS 가 만들어 넘긴다(`--import-memory`) — 열(`Float64Array`)을 그 위에 놓고 JS·커널이 **같은 바이트**를 본다(복사 0).
//   ★배치: [커널 자료·스택 … __heap_base] [지형 2비트(존 수명 · 성장에도 제자리)] [주민 열 · 나무 열(틱마다 다시 채움 · 모자라면 키운다)]
//   ⚠메모리가 자라면 옛 뷰는 떨어진다 — `ensure` 가 뷰를 다시 만들고 커널에 주소를 다시 준다. 부르는 쪽은 `ensure` 뒤의 뷰만 쓴다.
'use strict';
const fs = require('fs');
const path = require('path');
const PAGE = 65536;
const al = (x, a) => Math.ceil(x / a) * a;

// opt: { zw, zh, iceN, iceS, iceBand, speed, terrMiss(x,y)→bool, wallQ(nx,ny,ox,oy)→bool }
function create(opt) {
  const buf = fs.readFileSync(path.join(__dirname, 'walk-wasm.wasm'));
  const mod = new WebAssembly.Module(buf);
  const tw = Math.ceil(opt.zw / 32), th = Math.ceil(opt.zh / 32);
  const tbBytes = ((tw * th) >> 2) + 2;                     // 타일당 2비트 = 4타일/바이트(+ 끝 여유 — `isTerrainBlockedLocal` T356 판과 같은 셈)
  const memory = new WebAssembly.Memory({ initial: 32 });   // 커널 자료+스택(모듈이 2쪽을 요구) 넉넉히 — 나머지는 `layout` 이 키운다
  const inst = new WebAssembly.Instance(mod, { env: {
    memory,
    terr_miss: (x, y) => (opt.terrMiss(x, y) ? 1 : 0),
    wall_q: (nx, ny, ox, oy) => (opt.wallQ(nx, ny, ox, oy) ? 1 : 0),
  } });
  const E = inst.exports;
  const heap = al(E.__heap_base.value, 16);
  const tbOff = heap, dynOff = al(tbOff + tbBytes, 16);
  const W = { n: 0, m: 0, h: 0, X: null, Y: null, VX: null, VY: null, RD: null, ST: null, RX: null, RY: null, RR: null, TB: null, CNT: null };
  function layout(nCap, mCap) {
    const hCap = 1 << Math.max(4, Math.ceil(Math.log2(Math.max(2, mCap * 2))));
    let o = dynOff; const at = {};
    for (const k of ['X', 'Y', 'VX', 'VY', 'RD']) { at[k] = o; o += nCap * 8; }
    for (const k of ['RX', 'RY', 'RR']) { at[k] = o; o += mCap * 8; }
    at.RNEXT = o; o += mCap * 4; at.RHEAD = o; o += hCap * 4; at.ST = o; o += nCap;
    const need = Math.ceil(o / PAGE), have = memory.buffer.byteLength / PAGE;
    if (need > have) memory.grow(need - have);
    const B = memory.buffer;
    for (const k of ['X', 'Y', 'VX', 'VY', 'RD']) W[k] = new Float64Array(B, at[k], nCap);
    for (const k of ['RX', 'RY', 'RR']) W[k] = new Float64Array(B, at[k], mCap);
    W.ST = new Uint8Array(B, at.ST, nCap); W.TB = new Uint8Array(B, tbOff, tbBytes);
    W.n = nCap; W.m = mCap; W.h = hCap;
    E.ww_cfg(opt.zw, opt.zh, opt.iceN ? 1 : 0, opt.iceS ? 1 : 0, opt.iceBand, opt.speed, tbOff, tw,
      at.X, at.Y, at.VX, at.VY, at.RD, at.ST, at.RX, at.RY, at.RR, at.RNEXT, at.RHEAD, hCap - 1);
    W.CNT = new Uint32Array(B, E.ww_counts(), 8);
  }
  layout(1024, 256);
  W.ensure = (n, m) => { if (n > W.n || m > W.m) layout(Math.max(W.n, al(n * 1.25, 256)), Math.max(W.m, al(m * 1.25, 256))); };
  W.trees = (m) => E.ww_trees(m);
  W.step = (n, dt) => E.ww_step(n, dt);
  W.clearTerrain = () => { W.TB.fill(0); };
  W.bytes = () => memory.buffer.byteLength;
  W.wasmBytes = buf.length;
  W.zw = opt.zw; W.zh = opt.zh; W.tw = tw;   // ★[T672] 서 있는 몸 거름(`_wwStill`)이 커널과 같은 칸 셈을 JS 에서 한다(읽기만)
  return W;
}
module.exports = { create };
