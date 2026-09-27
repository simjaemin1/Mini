// === scripts/t449-coll-probe.js — 실서버 판에서 **벽 질의 답이 옛 격자와 같은가**를 세는 계측 전용 예비 적재(T449 ③) ==========
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음). 레포 `server/zone.js` 는 한 글자도 안 만진다.
//   적재 순간 zone.js 원문 **뒤에** 겉옷 하나를 덧붙인다: `isBlockedByWall`(A\*·이동·직선 판정이 부르는 그 술어)을 부를 때마다
//     ⓐ 새 격자(`qtColl` — 제품)로 한 번 ⓑ 옛 격자(`qtBuildings` — T449 전 그 격자)로 한 번 돌려 **답을 견준다**(다름을 센다)
//     ⓒ `T449_COLL_BAIT=1` 이면 미끼 격자(새 격자에서 벽을 뺀 것)로 한 번 더 — 자가 벽을 실제로 보는지(다름이 나야 한다)
//     ⓓ 두 격자의 걸린 시간(hrtime · 차례를 번갈아 — 캐시 편향 0)과 벽 질의 한 번이 받아 온 항목 수(16번에 한 번 표본)
//   제품이 쓰는 답은 **ⓐ 그대로**다(판의 걸음은 제품 그대로 간다). 값은 셋을 도는 만큼 느려진다 — 이 판의 틱 값은 읽지 마라.
// ★`scripts/t432-probe.js` 를 같이 싣는다(활성 청크·건물·GC 뒤 메모리 창 그대로) — `T410_PRELOAD` 로 이 파일을 주면 된다.
//   SIGUSR2 → `T449_COLL_OUT` 에 { n, diff, bait, baitN, msOld, msNew, refOld, refNew, refN, since } 를 쓴다.
'use strict';
require('./t432-probe.js');
const Module = require('module');
const fs = require('fs');
const path = require('path');
const OUT = process.env.T449_COLL_OUT || '';
const ZONE_JS = path.join('server', 'zone.js');
const _compile = Module.prototype._compile;
Module.prototype._compile = function (content, filename) {
  if (filename.endsWith(ZONE_JS)) {
    content += `
;(function () {
  const C = { n: 0, diff: 0, bait: 0, baitN: 0, tOld: 0n, tNew: 0n, refOld: 0, refNew: 0, refN: 0, since: Date.now() };
  const BAIT = process.env.T449_COLL_BAIT === '1';
  let qtBait = null, baitFor = null;
  const _orig = isBlockedByWall;
  isBlockedByWall = function (nx, ny, ox, oy, fl, tr) {
    if (!qtColl || !qtBuildings) return _orig(nx, ny, ox, oy, fl, tr);
    const save = qtColl;
    let a, b, t0, t1, t2;
    if ((C.n & 1) === 0) {
      t0 = process.hrtime.bigint(); a = _orig(nx, ny, ox, oy, fl, tr); t1 = process.hrtime.bigint();
      qtColl = qtBuildings; b = _orig(nx, ny, ox, oy, fl, tr); qtColl = save; t2 = process.hrtime.bigint();
      C.tNew += t1 - t0; C.tOld += t2 - t1;
    } else {
      t0 = process.hrtime.bigint(); qtColl = qtBuildings; b = _orig(nx, ny, ox, oy, fl, tr); qtColl = save; t1 = process.hrtime.bigint();
      a = _orig(nx, ny, ox, oy, fl, tr); t2 = process.hrtime.bigint();
      C.tOld += t1 - t0; C.tNew += t2 - t1;
    }
    C.n++; if (a !== b) C.diff++;
    if ((C.n & 15) === 0) { C.refN++; C.refOld += qtBuildings.queryCircle(nx, ny, BUILDING_SIZE * 2).length; C.refNew += save.queryCircle(nx, ny, BUILDING_SIZE * 2).length; }
    if (BAIT) {
      if (baitFor !== save) {   // 새 격자가 다시 섰으면 미끼도 — 같은 청크 · 같은 차례에서 벽만 뺀다
        baitFor = save; qtBait = new Quadtree(0, 0, ZONE.zoneWidth, ZONE.zoneHeight);
        for (const k of activeChunkKeys) { const c = chunkManager.chunks.get(k); if (c) for (const bb of c.buildings.values()) if (COLL_TYPES.has(bb.type) && bb.type !== 'wall') qtBait.insert({ x: bb.x, y: bb.y, ref: bb }); }
      }
      qtColl = qtBait; const x = _orig(nx, ny, ox, oy, fl, tr); qtColl = save;
      C.baitN++; if (x !== b) C.bait++;
    }
    return a;
  };
  globalThis.__t449coll = () => ({ n: C.n, diff: C.diff, bait: C.bait, baitN: C.baitN, msOld: Number(C.tOld) / 1e6, msNew: Number(C.tNew) / 1e6,
    refOld: C.refOld, refNew: C.refNew, refN: C.refN, since: C.since });
})();
`;
  }
  return _compile.call(this, content, filename);
};
process.on('SIGUSR2', () => {
  if (!OUT) return;
  try {
    const s = typeof globalThis.__t449coll === 'function' ? globalThis.__t449coll() : null;
    fs.writeFileSync(OUT + '.tmp', JSON.stringify({ t: Date.now(), s }));
    fs.renameSync(OUT + '.tmp', OUT);
  } catch (e) { try { fs.writeFileSync(OUT, JSON.stringify({ err: String(e && e.message || e) })); } catch (_) {} }
});
