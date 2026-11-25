'use strict';
// (@regress 없음 — 러너 밖 귀 · T1480)
// =============================================================================
// scripts/t1480-posdump.js — 읽기만 하는 귀(제품 코드 · 하네스 손 0). `NODE_OPTIONS=--require scripts/t1480-posdump.js` 로만 건다.
//   존(server/zone.js)이 `Membership.handleChat` 를 부를 때 채팅 줄이 `/인출` 이면, **부르기 전** 손님의 자리 · `_memberNearVid` · 가장 가까운 마을 앞자리(곳간 쪽 기준점)와
//   그 거리를 한 줄 `$T1480_POS`(기본 /tmp/t1480-pos.jsonl)에 적는다. 값은 읽기만 한다(쓰기 0 · 판은 그대로).
//   모듈은 미리 불러 오지 않는다 — `Module.prototype.require` 로 앱이 제 손으로 부른 뒤에 감싼다(불러오는 차례가 안 바뀐다).
// =============================================================================
try {
  if (/zone\.js$/.test(String(process.argv[1] || ''))) {
    const fs = require('fs');
    const Module = require('module');
    const OUT = process.env.T1480_POS || '/tmp/t1480-pos.jsonl';
    let VIL = null, wrapped = false;
    const nearest = (x, y) => {
      if (!VIL || !VIL.villageByDbId || !VIL.villageAnchorPx) return null;
      let best = null;
      for (let id = 1; id <= 400; id++) {
        let v = null; try { v = VIL.villageByDbId(id); } catch (e) { v = null; }
        if (!v) continue;
        const a = VIL.villageAnchorPx(v), d = Math.hypot(a.x - x, a.y - y);
        if (!best || d < best.d) best = { vid: id, ax: Math.round(a.x), ay: Math.round(a.y), d: Math.round(d), name: v.name || null };
      }
      return best;
    };
    const origReq = Module.prototype.require;
    Module.prototype.require = function (id) {
      const m = origReq.apply(this, arguments);
      try {
        const f = Module._resolveFilename(id, this);
        if (/server[\\/]villages\.js$/.test(f)) VIL = m;
        if (/server[\\/]membership\.js$/.test(f) && !wrapped && m && typeof m.handleChat === 'function') {
          wrapped = true;
          const orig = m.handleChat;
          m.handleChat = function (player, text) {
            try {
              if (player && String(text || '').trim().startsWith('/인출')) {
                fs.appendFileSync(OUT, JSON.stringify({ ms: Date.now(), text: String(text).slice(0, 40), x: Math.round(player.x), y: Math.round(player.y),
                  nearVid: player._memberNearVid == null ? null : player._memberNearVid, nearest: nearest(player.x, player.y) }) + '\n');
              }
            } catch (e) { /* 귀는 판을 건드리지 않는다 */ }
            return orig.apply(this, arguments);
          };
        }
      } catch (e) { /* 없어도 판은 돈다 */ }
      return m;
    };
  }
} catch (e) { /* 없어도 판은 돈다 */ }
