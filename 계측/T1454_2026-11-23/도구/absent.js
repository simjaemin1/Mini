'use strict';
// T1454 덧붙임 하나 — 비운 움집 하나(운영 시계 하루 24분 = 현실 하루 60날 · 가운데 빠르기) · 부위 값 · 돌아온 날 한 줄(문턱 둘)
const fs = require('fs');
const TMP = `/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1454/absent-${process.pid}.db`;
Object.assign(process.env, { ZONE_ID: 'hanbando', PORT: '39793', DB_PATH: TMP, ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', T1438_DECAY: '1', CENTRAL_URL: 'http://127.0.0.1:1' });
const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Z = require('/home/claude/t1454/server/zone.js'); console.log = _log;
const H = Z.__testBind(), D = H.Decay;
const hut = D.kindOf('hut', null), chest = D.kindOf('chest', null);
const r = (p) => D.partRate(p, 'mid');
const roof = hut.parts.find((p) => p.k === 'roof'), frame = hut.parts.find((p) => p.k === 'frame'), cb = chest.parts[0];
const PER = 60;
for (const day of [3, 7, 14, 30, 60, 91, 95]) {
  const g = day * PER, v = (p) => Math.max(0, 1 - r(p) * g);
  console.log(`현실 ${day}일(게임 ${g}날): 지붕 ${(v(roof) * 100).toFixed(0)}% · 뼈대 ${(v(frame) * 100).toFixed(0)}% · 상자 ${(v(cb) * 100).toFixed(0)}%`);
}
console.log('뼈대 0 = 현실', (1 / r(frame) / PER).toFixed(1), '일 · 지붕 0 =', (1 / r(roof) / PER).toFixed(1), '일 · 상자 0 =', (1 / r(cb) / PER).toFixed(1), '일');
const need = (p, v) => { let best = null; for (const it of Object.keys(p.items || {})) { const sh = D.shareOf(p, it, 1); if (sh > 0 && (!best || sh > best.sh)) best = { it, sh }; } return best ? `${best.it} ${Math.ceil((1 - v) / best.sh - 1e-9)}(몫 ${best.sh.toFixed(4)})` : ''; };
for (const day of [7, 14, 30, 60]) { const g = day * PER, v = (p) => Math.max(0, 1 - r(p) * g); console.log(day, '지붕', need(roof, v(roof)), '뼈대', need(frame, v(frame)), '상자', need(cb, v(cb))); }
console.log('지붕 재료', JSON.stringify(roof.items), '뼈대', JSON.stringify(frame.items), '상자', JSON.stringify(cb.items));
for (const f of fs.readdirSync(require('path').dirname(TMP))) if (f.startsWith(`absent-${process.pid}.db`)) fs.unlinkSync(require('path').join(require('path').dirname(TMP), f));
process.exit(0);
