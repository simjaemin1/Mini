// === scripts/t432-probe.js — 존 프로세스 안을 들여다보는 **계측 전용** 예비 적재(T432 ②) ===========================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음). 레포의 `server/zone.js` 는 **한 글자도 안 만진다**.
//   `node --expose-gc -r scripts/t432-probe.js server/zone.js` 로 띄우면 **적재 순간**에만 zone.js 원문 **뒤에** 함수 하나를
//   덧붙여 컴파일한다(모듈 안 변수 — 활성 청크 · 자원 · 건물 · 몹 — 를 읽는 창 · 동작 0). 그리고 청크 켜기/끄기 두 함수에
//   **세기만 하는** 겉옷을 입힌다(부르는 순서·인자·반환 그대로).
//
// ★읽는 법 — 존 프로세스에 `SIGUSR2` 를 보내면: ① `global.gc()`(전체 GC — T410 자의 규약 "GC 뒤") ② `process.memoryUsage()`
//   ③ 창 함수 값을 `T432_PROBE_OUT` 파일에 JSON 으로 쓴다. 틱을 멈추지 않는다(신호 처리기 한 번 · 창 밖에서 부른다).
//
// 창이 내는 것:
//   act          활성 청크 수(`activeChunkKeys.size`)
//   bodyCk       주민 몸이 **선** 청크 수(`simVillageId` · hp>0 · 겹침 띠와 무관한 "지금 선 자리")
//   bandN        겹침 띠 안의 몸(청크를 둘 이상 붙잡은 몸 — T432 켬에서만 0 이 아닐 수 있다)
//   viewCk       사람·관측자 둘레 청크 수(반경 `CHUNK_ACTIVE_RADIUS` — 종전 규칙 그대로 다시 센다)
//   res · seed   자원 개체 수 · 그 가운데 시드 자원(`isSeed`)
//   bld · bt     올라온 건물 개체 수(`buildings.size` — 활성 청크만 DB 에서 올라온다) · 종류별(`vb:` = 마을 밭 타일 — 비영속 시각 타일)
//   mobs · mobsAct   몹 개체 수(야생 포함) · 활성 청크 안의 몹(AI 가 도는 몹)
//   res N · resAct   주민 몸 수 · 활성 청크 안의 주민(결정·이동 문 · 공간 인덱스 · 낙하 · HP · 비키기가 도는 몸)
//   actN · deactN    누계 — 청크 켜기(`activateChunk`) · 끄기(`deactivateChunk`) 호출 수(되풀이 = 켜고 끄기의 값)
//   actDistinct · reN · reMax   켜진 적 있는 청크 수 · 두 번 이상 켜진 청크 수(되풀이) · 한 청크가 가장 많이 켜진 횟수
'use strict';
const Module = require('module');
const fs = require('fs');
const path = require('path');
const OUT = process.env.T432_PROBE_OUT || '';
const ZONE_JS = path.join('server', 'zone.js');
const _compile = Module.prototype._compile;
Module.prototype._compile = function (content, filename) {
  if (filename.endsWith(ZONE_JS)) {
    content += `
;(function () {
  const C = { actN: 0, deactN: 0, per: new Map() };   // per: 청크 → 켜진 횟수(되풀이 = 2 이상)
  const _a = activateChunk, _d = deactivateChunk;
  activateChunk = function (cx, cy) { C.actN++; const k = cx + '_' + cy; C.per.set(k, (C.per.get(k) || 0) + 1); return _a(cx, cy); };
  deactivateChunk = function (cx, cy, live) { C.deactN++; return _d(cx, cy, live); };
  globalThis.__t432probe = function () {
    const cs = chunkManager.chunkSize, bodies = new Set(); let resN = 0, resAct = 0, bandN = 0;
    for (const p of players.values()) {
      if (!p.isNpc || !p.simVillageId || p.hp <= 0) continue;
      resN++;
      const cx = Math.floor(p.x / cs), cy = Math.floor(p.y / cs);
      bodies.add(cx + '_' + cy);
      if (activeChunkKeys.has(chunkManager.keyOf(cx, cy))) resAct++;
      if (p._t432held && p._t432held.length > 1) bandN++;
    }
    const view = new Set(), r = Math.ceil(CHUNK_ACTIVE_RADIUS / cs);
    const around = (x, y) => { const pcx = Math.floor(x / cs), pcy = Math.floor(y / cs);
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) { const cx = pcx + dx, cy = pcy + dy;
        if (cx < 0 || cy < 0 || cx >= chunkManager.colsX || cy >= chunkManager.colsY) continue; view.add(cx + '_' + cy); } };
    for (const p of players.values()) if (!p.isNpc && p.hp > 0) around(p.x, p.y);
    for (const d of observers.values()) around(d.viewerX, d.viewerY);
    let seed = 0; for (const x of resources.values()) if (x.isSeed) seed++;
    let mobsAct = 0; for (const m of mobs.values()) if (activeChunkKeys.has(m._chunkKey)) mobsAct++;
    let reN = 0, reMax = 0; for (const n of C.per.values()) { if (n >= 2) reN++; if (n > reMax) reMax = n; }
    const bt = {}; for (const b of buildings.values()) { const t = (typeof b.id === 'string' && b.id.startsWith('vb')) ? 'vb:' + b.type : b.type; bt[t] = (bt[t] || 0) + 1; }
    return { act: activeChunkKeys.size, bodyCk: bodies.size, bandN, viewCk: view.size, res: resources.size, seed, bld: buildings.size,
      mobs: mobs.size, mobsAct, resN, resAct, actN: C.actN, deactN: C.deactN, actDistinct: C.per.size, reN, reMax, bt };
  };
})();
`;
  }
  return _compile.call(this, content, filename);
};
// ★CPU 프로필(선택) — `T432_PROF_OUT` 가 있으면 적재 뒤 `T432_PROF_START_S` 초에 V8 프로파일러를 켜고
//   `T432_PROF_DUR_S` 초 뒤 끄고 `.cpuprofile` 을 쓴다(같은 프로세스 안 `inspector` 세션 · 멈춤 0 · 표본 간격 기본).
//   갈래 이름을 붙이는 것은 읽는 쪽(`scripts/t432-prof.js`)이다 — 여기는 V8 이 준 것을 그대로 쓴다.
//   `T432_PROF_START_S` 는 쉼표 목록이어도 된다(창 여럿 — 낮·밤) → `<OUT 이름>-<i>.cpuprofile`(창 하나면 OUT 그대로).
if (process.env.T432_PROF_OUT) {
  const inspector = require('inspector');
  const PO = process.env.T432_PROF_OUT;
  const starts = String(process.env.T432_PROF_START_S || '120').split(',').map((x) => parseFloat(x) * 1000).filter((x) => x >= 0);
  const du = parseFloat(process.env.T432_PROF_DUR_S || '60') * 1000;
  const S = new inspector.Session(); S.connect();
  S.post('Profiler.enable');
  starts.forEach((st, i) => {
    const out = starts.length > 1 ? PO.replace(/\.cpuprofile$/, '') + '-' + i + '.cpuprofile' : PO;
    setTimeout(() => {
      S.post('Profiler.start', () => {
        setTimeout(() => S.post('Profiler.stop', (err, r) => {
          try { fs.writeFileSync(out, JSON.stringify(err ? { err: String(err) } : r.profile)); } catch (e) {}
        }), du).unref();
      });
    }, st).unref();
  });
}
process.on('SIGUSR2', () => {
  if (!OUT) return;
  try {
    const t0 = Date.now();
    if (typeof global.gc === 'function') global.gc();
    const gcMs = Date.now() - t0;
    const m = process.memoryUsage();
    const s = typeof globalThis.__t432probe === 'function' ? globalThis.__t432probe() : null;
    fs.writeFileSync(OUT + '.tmp', JSON.stringify({ t: Date.now(), gcMs, mem: { rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal, external: m.external }, s }));
    fs.renameSync(OUT + '.tmp', OUT);
  } catch (e) { try { fs.writeFileSync(OUT, JSON.stringify({ err: String(e && e.message || e) })); } catch (_) {} }
});
