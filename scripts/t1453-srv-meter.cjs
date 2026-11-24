// (@regress 없음 — 계측 훅 · 러너 밖 · T1453 · 판정 0)
// === scripts/t1453-srv-meter.cjs — 존 CPU(보내는 쪽) 자: 존 아이 프리로드(제품 무접촉 · `NODE_OPTIONS=--require`) ========================
//   T1453_METER_OUT=<파일> — 5초마다 · 끝날 때 JSON 한 덩이:
//     stringify[] = 존이 짓는 JSON 글자 중 welcome · road_cells · buildings_spawn · buildings_removed(갈래 · 글자 수 · ms · 벽시계 at)와 10만 자 넘는 모든 글자
//     roads[] = `Roads.clientRoads()` 한 번마다 ms · 칸 · roadsIn[] = `Roads.clientRoadsIn()` 한 번마다 ms · 칸(T1453 켬의 청크 몫)
//     cpu = process.cpuUsage() 누계(µs) · mem = process.memoryUsage()(MB)
'use strict';
const OUT = process.env.T1453_METER_OUT, Z = /zone\.js$/.test(process.argv[1] || '');
if (Z && OUT) {
  const fs = require('fs'), Module = require('module');
  const S0 = JSON.stringify;
  const R = { stringify: [], roads: [], roadsIn: [], cpu: null, mem: null };
  const KEEP = new Set(['welcome', 'road_cells', 'buildings_spawn', 'buildings_removed']);
  JSON.stringify = function (v, r, s) {
    const t = process.hrtime.bigint(); const out = S0.call(JSON, v, r, s); const ms = Number(process.hrtime.bigint() - t) / 1e6;
    const ty = v && typeof v === 'object' ? v.type : undefined;
    if ((ty && KEEP.has(ty)) || (out && out.length >= 100000)) { if (R.stringify.length < 200000) R.stringify.push({ at: Date.now(), type: ty || '?', len: out ? out.length : 0, ms: +ms.toFixed(3) }); }
    return out;
  };
  const _load = Module._load;
  Module._load = function (req, parent, isMain) {
    const m = _load.apply(this, arguments);
    try {
      if (m && typeof m.clientRoads === 'function' && !m.__t1453 && /roads(\.js)?$/.test(req)) {
        m.__t1453 = true;
        const a = m.clientRoads, b = m.clientRoadsIn;
        m.clientRoads = function () { const t = process.hrtime.bigint(); const o = a.apply(this, arguments); R.roads.push({ at: Date.now(), ms: +(Number(process.hrtime.bigint() - t) / 1e6).toFixed(3), cells: o ? o.length / 3 : 0 }); return o; };
        if (b) m.clientRoadsIn = function (x, y, w, h, out) { const n0 = out ? out.length : 0, t = process.hrtime.bigint(); const o = b.apply(this, arguments); if (R.roadsIn.length < 200000) R.roadsIn.push({ at: Date.now(), ms: +(Number(process.hrtime.bigint() - t) / 1e6).toFixed(4), cells: o ? (o.length - n0) / 3 : 0 }); return o; };
      }
    } catch (e) {}
    return m;
  };
  const flush = () => { try { const mu = process.memoryUsage(); R.cpu = process.cpuUsage(); R.mem = { rss: mu.rss >> 20, heap: mu.heapUsed >> 20 }; fs.writeFileSync(OUT, S0.call(JSON, R)); } catch (e) {} };
  setInterval(flush, 5000).unref();
  process.on('exit', flush);
}
