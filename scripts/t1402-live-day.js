#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1402 판 · 판정 0)
// === scripts/t1402-live-day.js — "다 지어 놓은 집"에서 사는 사람의 하루가 하루 몫을 채우는가(T1402 ① · 서 있기 0점 뒤) ==========
//
// ★무엇: 존 정본(`handlePlayerInput` 감싸개 · `_t1332Dwell` · 점수 꼴 'b' 그대로)을 켬으로 띄우고 · 시계는 넣는 길(`_t1332SetClock`)로 하루를 흘린다.
//   사람은 하루 내내 제 집 땅덩이(집 3 × 3 가운데 · 내 상자 곁)에 있다 · 머묾 재기는 존 타이머와 같은 간격(머묾의 4분의 1).
//   하루 꼴: ⓐ 서 있기만 · ⓑ 자고 · 불 피우고 · 보관함 열어 보기(서버 사건이 없다 — 잠 · 불 · 상자 열기는 짐이 안 바뀐다) ·
//     ⓒ 아침에 꺼내 먹고 저녁에 넣기(보관함 두 번) · ⓓ 끼니마다 꺼내 먹고(세 번) 저녁에 넣기 · ⓔ ⓓ 에 하루 한 번 만들기(짐 바뀜 사건 하나 더 — 여기선 상자 넣기로 갈음)
//   하루 몫 = 넓이 N 의 `deeds.dailyNeed(N)`(9칸 3.0점 · 24칸 57.6점 · 40칸 266.7점).
//   node scripts/t1402-live-day.js [--json <파일>]   (T1343_Q_IDLE=0.25 로 부르면 되돌린 꼴)
if (require.main === module) require('./lib-port').noCentral();
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const HOUR = 3600 * 1000, DAYMS = 24 * HOUR;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
if (process.env.__T1402L) {
  Object.assign(process.env, { ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', CLAIM_ABSENCE: '0', T1305_DEEDS: '1' });
  const _l = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const H = require(path.join(ROOT, 'server', 'zone.js')).__testBind();
  console.log = _l;
  const D = H.Deeds, F = D.CFG, SZ = H.BUILDING_SIZE;
  const SHAPES = {
    a: [], b: [],
    c: [[7, 'chest_take'], [21, 'chest_put']],
    d: [[7, 'chest_take'], [12, 'chest_take'], [18, 'chest_take'], [21, 'chest_put']],
    e: [[7, 'chest_take'], [10, 'chest_put'], [12, 'chest_take'], [18, 'chest_take'], [21, 'chest_put']],
  };
  const res = {};
  let T = Date.now(); H._t1332SetClock(() => T);
  let k = 0;
  for (const [name, plan] of Object.entries(SHAPES)) {
    const p = { pid: 'p_live' + k, playerId: 't1402_live' + k, name: 'live' + k, persistent: false, ws: { readyState: 1, send: () => {} }, x: 0, y: 0, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100, inventory: { wood: 9999, stone: 9999 }, equipment: [], equipSlots: {}, craftSkill: {} };
    H.players.set(p.pid, p);
    const X = 58000 + k * 40, Y = 58000; k++;
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) { p.x = (X + x) * SZ + SZ / 2; p.y = (Y + y) * SZ + SZ / 2; H.tryClaim(p, 'personal'); }
    p.x = (X + 1) * SZ + SZ / 2; p.y = (Y + 1) * SZ + SZ / 2; delete p._t1332Dw; delete p._t1343Work;
    const bid = 'b_live' + k; H.buildings.set(bid, { id: bid, type: 'chest', x: p.x + 8, y: p.y, ownerId: p.playerId, ownerName: p.name, data: { wood: 50 }, dbId: 0 });
    let got = 0; const _a = D.addPts; D.addPts = function (P, ch, pts) { got += Math.max(0, +pts || 0); return _a.apply(this, arguments); };
    const step = Math.max(1000, F.DWELL_MS / 4), t0 = T; let i = 0;
    for (let t = 0; t < DAYMS; t += step) {
      while (i < plan.length && t >= plan[i][0] * HOUR) { H.handlePlayerInput(p, JSON.stringify({ type: plan[i][1], buildingId: bid, item: 'wood', amount: 1 })); i++; }
      T = t0 + t; H._t1332Dwell(p, T);
    }
    T = t0 + DAYMS; D.addPts = _a; H.players.delete(p.pid);
    res[name] = { pts: got, events: plan.length };
  }
  console.log('@@T1402L ' + JSON.stringify({ res, Q_IDLE: F.Q_IDLE, Q_WORK: F.Q_WORK, DWELL_S: F.DWELL_MS / 1000, need: Object.fromEntries([9, 24, 40, 70].map((n) => [n, +D.dailyNeed(n).toFixed(1)])) }));
  process.exit(0);
}
let o = '';
try { o = execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { __T1402L: '1', DB_PATH: `/tmp/t1402-live-${process.pid}.db`, PORT: String(require('./lib-port').port(37950)) }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 300000 }); } catch (e) { o = String((e && e.stdout) || ''); }
for (const f of ['', '-wal', '-shm']) { try { fs.unlinkSync(`/tmp/t1402-live-${process.pid}.db${f}`); } catch (e) {} }
const m = /@@T1402L (\{.*\})/.exec(o); if (!m) { console.error('아이 판 없음'); process.exit(1); }
const r = JSON.parse(m[1]);
const NAME = { a: 'ⓐ 서 있기만', b: 'ⓑ 자고 · 불 피우고 · 보관함 열어 보기(서버 사건 0)', c: 'ⓒ 아침 꺼내 먹기 · 저녁 넣기(보관함 2번)', d: 'ⓓ 끼니마다 꺼내 먹기 · 저녁 넣기(4번)', e: 'ⓔ ⓓ + 하루 한 번 더(5번)' };
console.log(`=== T1402 사는 사람의 하루 — 점수 꼴 'b' · Q_IDLE ${r.Q_IDLE} · Q_WORK ${r.Q_WORK} · 머묾 ${r.DWELL_S}초 ===`);
console.log('| 하루 꼴 | 짐 바뀐 일 | 하루 점수 | 9칸(3.0) | 24칸(57.6) | 40칸(266.7) | 70칸 |');
console.log('|---|---:|---:|---|---|---|---|');
for (const [k, v] of Object.entries(r.res)) console.log(`| ${NAME[k]} | ${v.events} | ${v.pts.toFixed(1)} | ${v.pts >= r.need[9] ? '○' : '✗'} | ${v.pts >= r.need[24] ? '○' : '✗'} | ${v.pts >= r.need[40] ? '○' : '✗'} | ${v.pts >= r.need[70] ? '○' : '✗'}(${r.need[70]}) |`);
const J = arg('--json', null); if (J) fs.writeFileSync(J, JSON.stringify(r, null, 1));
