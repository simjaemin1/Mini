// (@regress 없음 — T1448 계측 · 읽기만) 구역 크기 · 꼴별 청소 멈춤 — 같은 68만 칸(11-09 사본)을 지어 가득 청소 gc() 아홉 번 가운데 ms
//   node --expose-gc 계측/T1448_2026-11-23/t1448-gc-bench.js <map|c32|c16|slab16|slab32> <world.db 사본>
//   map = 종전 Map(칸 객체) · cNN = 구역 NN칸마다 값 · 날 · 등급 배열(구역 객체 하나) · slabNN = 구역 256개를 한 판에(구역 객체 0)
const { DatabaseSync } = require('node:sqlite');
const MODE = process.argv[2], DB = process.argv[3];
const W = 2188;
const gcm = () => { const g = []; for (let i = 0; i < 9; i++) { const t = process.hrtime.bigint(); global.gc(); g.push(Number(process.hrtime.bigint() - t) / 1e6); } return g.sort((a, b) => a - b)[4]; };
global.gc(); global.gc();
const base = gcm(), h0 = process.memoryUsage();   // 장부 없는 바닥(모듈만)
const d0 = new DatabaseSync(DB, { readOnly: true });
let rows = d0.prepare('SELECT cell_key, v, d FROM roads').all(); d0.close();
let keep;
if (MODE === 'map') { const M = new Map(); for (const r of rows) M.set(r.cell_key, { v: r.v, d: r.d }); keep = M; }
else {
  const C = +MODE.replace(/\D/g, ''), SH = Math.log2(C), CC = C * C, GW = Math.ceil(W / C), slab = MODE.startsWith('slab');
  const ch = new Array(GW * Math.ceil(4063 / C)).fill(null);
  if (!slab) { for (const r of rows) { const k = r.cell_key, x = k % W, y = (k / W) | 0, ci = (y >> SH) * GW + (x >> SH), i = ((y & (C - 1)) << SH) | (x & (C - 1)); let c = ch[ci]; if (!c) c = ch[ci] = { v: new Float64Array(CC), d: new Int32Array(CC), n: 0, u: new Uint8Array(CC) }; c.v[i] = r.v; c.d[i] = r.d; } }
  else { const PER = 256, slabs = []; let n = 0;
    for (const r of rows) { const k = r.cell_key, x = k % W, y = (k / W) | 0, ci = (y >> SH) * GW + (x >> SH), i = ((y & (C - 1)) << SH) | (x & (C - 1)); let c = ch[ci];
      if (!c) { const s = n >> 8; if (!slabs[s]) slabs[s] = { v: new Float64Array(PER * CC), d: new Int32Array(PER * CC), u: new Uint8Array(PER * CC) }; c = ch[ci] = { s: slabs[s], o: (n & 255) * CC, n: 0 }; n++; }
      c.s.v[c.o + i] = r.v; c.s.d[c.o + i] = r.d; } }
  keep = ch;
}
rows = null; global.gc(); global.gc();
const h1 = process.memoryUsage();
console.log(MODE, 'heapMB', ((h1.heapUsed - h0.heapUsed) / 1048576).toFixed(1), 'abMB', ((h1.arrayBuffers - h0.arrayBuffers) / 1048576).toFixed(1), 'gcBase', base.toFixed(2), 'gc', gcm().toFixed(2), keep ? '' : '');
