// === scripts/t453-rss-probe.js — 존 한 대의 RSS 를 **주인별로** 여는 계측 전용 예비 적재 (T453 ①) ===================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음). `server/zone.js` 는 **한 글자도 안 만진다** —
//   T432 `t432-probe.js` 문법 그대로: 적재 순간에만 zone.js 원문 **뒤에** 읽기 창 함수 하나를 덧붙여 컴파일한다(동작 0).
//   `node --expose-gc -r scripts/t453-rss-probe.js server/zone.js`
//
// ★읽는 법 — 존 프로세스에 `SIGUSR2` → ① `global.gc()` 두 번(T433 규약 "GC 뒤") ② `process.memoryUsage()` ·
//   `v8.getHeapSpaceStatistics()` · `v8.getHeapStatistics()` ③ 창 함수(개체 수 — Map 크기·청크 수·색인 수)
//   ④ `T453_SNAP=1` 이면 그 순간 **힙 스냅샷**(`v8.writeHeapSnapshot` — 있는 문법)을 `<OUT>.heapsnapshot` 으로 쓴다.
//   스냅샷엔 주인 손잡이를 `globalThis.__t453o` 에 달아 둔다(읽는 쪽 `t453-heap-owners.js` 가 이 이름으로 주인을 찾는다 · 쓰기 0).
//   결과는 `T453_PROBE_OUT` 에 JSON.
'use strict';
const Module = require('module');
const fs = require('fs');
const path = require('path');
const v8 = require('v8');
const OUT = process.env.T453_PROBE_OUT || '';
const ZONE_JS = path.join('server', 'zone.js');
const _compile = Module.prototype._compile;
Module.prototype._compile = function (content, filename) {
  if (filename.endsWith(ZONE_JS)) {
    content += `
;(function () {
  const _req = (m) => { try { return require(m); } catch (e) { return null; } };
  globalThis.__t453owners = function () {
    const T = _req('./terrain'), CH = _req('./chunk'), V = _req('./villages');
    // 주인 손잡이 — 이름 = 표의 칸. 값은 **그 자리의 객체 그대로**(사본 0).
    const o = {
      terrain_zone: T && T.ZONE_TERRAIN, terrain_mod: T,
      chunk_mgr: chunkManager, chunk_mod: CH, ring_cache: _ringCache, ring_cache_raw: _ringCacheRaw, far_cache: _farCache,
      resources, buildings, mobs, players, observers, claims, corpses, groundItems, harvestedSeeds, resourcesByDbId, minedCells,
      stair_cache: stairCellCache, fruit_store: _fruitStore, qt_players: typeof qtPlayers !== 'undefined' ? qtPlayers : null,
      qt_mobs: typeof qtMobs !== 'undefined' ? qtMobs : null, qt_buildings: typeof qtBuildings !== 'undefined' ? qtBuildings : null,
      blk_bits: typeof _BLK_BITS !== 'undefined' ? _BLK_BITS : null,
      villages_mod: V, water_tiles: typeof WATER_TILES !== 'undefined' ? WATER_TILES : null,
    };
    return o;
  };
  // ★[T453 ⓪] 승격을 받는 쪽이 무엇을 하나 — \`T453_PROMOTE=1\` 이면 관측자 메시지 처리기(\`handleObserverMessage\`)에
  //   **재기만 하는** 겉옷(t432 의 activateChunk 겉옷과 같은 문법 · 부르는 순서·인자·반환 그대로): 받은 시각(Date.now — 하네스 시계와 같은 벽시계) ·
  //   처리 ms · 받기 직전 1초 동안의 이벤트 고리 최대 지연(20ms 타이머의 늦음).
  if (process.env.T453_PROMOTE === '1') {
    let _lagMax = 0, _lagAt = performance.now();
    setInterval(() => { const n = performance.now(); const lag = n - _lagAt - 20; _lagAt = n; if (lag > _lagMax) _lagMax = lag; }, 20).unref();
    setInterval(() => { _lagMax = 0; }, 1000).unref();
    const _h = handleObserverMessage;
    handleObserverMessage = function (ws, raw) {
      let isP = false; try { isP = String(raw).indexOf('promote_to_primary') >= 0; } catch (e) {}
      if (!isP) return _h(ws, raw);
      const w0 = Date.now(), t0 = performance.now(), lag = _lagMax;
      const r = _h(ws, raw);
      console.log('[t453] promote 받음 ' + w0 + ' · 처리 ' + (performance.now() - t0).toFixed(1) + 'ms · 직전 1초 고리 지연 최대 ' + lag.toFixed(0) + 'ms · 활성 청크 ' + activeChunkKeys.size);
      return r;
    };
  }
  globalThis.__t453counts = function () {
    const T = _req('./terrain');
    let segN = 0, segEntries = 0, bbox = 0;
    const zt = (T && T.ZONE_TERRAIN) || {};
    for (const z of Object.keys(zt)) { const t = zt[z] || {}; for (const k of ['rivers', 'ridges', 'valleys']) for (const f of (t[k] || [])) { if (f && f._segIdx) { segN++; segEntries += f._segIdx.entries || 0; } if (f && f._bbox) bbox++; } }
    let ring = 0; for (const v of _ringCache.values()) ring += (v && v.cells && v.cells.size) || 0;
    return { zonesInTerrain: Object.keys(zt).length, segIdxPaths: segN, segEntries, bbox,
      res: resources.size, bld: buildings.size, mobs: mobs.size, players: players.size, observers: observers.size,
      act: activeChunkKeys.size, ringChunks: _ringCache.size, ringCells: ring, ringRaw: _ringCacheRaw.size, far: _farCache.size,
      harvested: harvestedSeeds.size, resByDb: resourcesByDbId.size, mined: minedCells.size, stair: stairCellCache.size,
      waterTiles: typeof WATER_TILES !== 'undefined' && WATER_TILES ? WATER_TILES.size : null };
  };
})();
`;
  }
  return _compile.call(this, content, filename);
};
function snapOnce(tag) {
  if (!OUT) return;
  try {
    const t0 = Date.now();
    if (typeof global.gc === 'function') { global.gc(); global.gc(); }
    const gcMs = Date.now() - t0;
    const m = process.memoryUsage();
    const spaces = {}; for (const s of v8.getHeapSpaceStatistics()) spaces[s.space_name] = { used: s.space_used_size, size: s.space_size };
    const hs = v8.getHeapStatistics();
    const counts = typeof globalThis.__t453counts === 'function' ? globalThis.__t453counts() : null;
    let snap = null;
    if (process.env.T453_SNAP === '1') {
      globalThis.__t453o = typeof globalThis.__t453owners === 'function' ? globalThis.__t453owners() : null;
      snap = v8.writeHeapSnapshot(`${OUT}.${tag}.heapsnapshot`);
      globalThis.__t453o = null;
    }
    const rec = { tag, t: Date.now(), gcMs, mem: m, spaces, heap: { total: hs.total_heap_size, used: hs.used_heap_size, malloced: hs.malloced_memory, peakMalloced: hs.peak_malloced_memory, external: hs.external_memory }, counts, snap };
    let all = []; try { all = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) {}
    all.push(rec);
    fs.writeFileSync(OUT + '.tmp', JSON.stringify(all)); fs.renameSync(OUT + '.tmp', OUT);
  } catch (e) { try { fs.writeFileSync(OUT + '.err', String(e && e.stack || e)); } catch (_) {} }
}
let _n = 0;
process.on('SIGUSR2', () => { _n++; snapOnce(process.env['T453_TAG_' + _n] || ('s' + _n)); });
