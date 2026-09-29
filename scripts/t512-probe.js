// === scripts/t512-probe.js — 존↔존 흐름 계측 예비 적재(T512 · 러너 밖 · 동작 0) ==============================
//   `NODE_OPTIONS=--require …/t512-probe.js` + `T512_OUT=<dir>` — zone.js 원문 **뒤에** 읽기 창을 덧붙인다(t432/t453/t498 문법).
//   ⓐ 20ms 마다 이 존의 사람 몸 자리(절대 px)와 이 존이 든 **유령**(ghostPlayers — 보낸 존의 몸이 이 존에 비친 자리)을 JSONL 로.
//   ⓑ `postJSON` 겉옷 — `/ghost_sync` 가 날아가는 중인 수(동시 최대) · 걸린 ms · 실패 수. `/handoff_prepare` ms.
//   ⓒ `fireHandoff` 겉옷(t498-probe 와 같은 줄) — 떠나는 존 인계 ms.
//   분석은 `t512-analyze.js`(두 존의 줄을 벽시계로 맞댄다 — 한 상자라 시계가 하나다).
'use strict';
const Module = require('module');
const path = require('path');
const _compile = Module.prototype._compile;
Module.prototype._compile = function (content, filename) {
  if (filename.endsWith(path.join('server', 'zone.js'))) content += `
;(function () {
  const fs = require('fs');
  const OUT = process.env.T512_OUT; if (!OUT) return;
  const f = fs.openSync(require('path').join(OUT, 'probe-' + ZONE_ID + '.jsonl'), 'a');
  const w = (o) => { try { fs.writeSync(f, JSON.stringify(o) + '\\n'); } catch (e) {} };
  setInterval(() => {
    const t = Date.now(), me = [], gh = [];
    for (const p of players.values()) if (!p.isNpc) me.push([p.playerId, +(ZONE.worldOffsetX + p.x).toFixed(1), +(ZONE.worldOffsetY + p.y).toFixed(1), +(p.vx || 0).toFixed(1), +(p.vy || 0).toFixed(1)]);
    for (const [gid, g] of ghostPlayers) gh.push([gid, g.ax, g.ay, g.vx, g.vy, g.recvAt, g.t || null]);
    if (me.length || gh.length) w({ k: 's', t, me, gh });
  }, 20).unref();
  const _pj = postJSON; let inflight = 0, maxIn = 0;
  postJSON = function (host, port, p, data) {
    const t0 = Date.now(); if (p === '/ghost_sync') { inflight++; if (inflight > maxIn) maxIn = inflight; }
    return _pj.apply(this, arguments).then((r) => { if (p === '/ghost_sync') inflight--; if (p !== '/ghost_sync' || Math.random() < 0.1) w({ k: 'post', p, ms: Date.now() - t0, inflight, maxIn }); return r; },
      (e) => { if (p === '/ghost_sync') inflight--; w({ k: 'postfail', p, ms: Date.now() - t0, err: String(e && e.message) }); throw e; });
  };
  const _f = fireHandoff;
  fireHandoff = async function (player, targetZoneId) {
    const t0 = performance.now(), was = !!(player && player.handingOff);
    try { return await _f.apply(this, arguments); }
    finally { if (!was && player && player.handingOff) w({ k: 'fire', to: targetZoneId, ms: +(performance.now() - t0).toFixed(1) }); }
  };
  setInterval(() => w({ k: 'max', maxIn }), 5000).unref();
})();
`;
  return _compile.call(this, content, filename);
};
