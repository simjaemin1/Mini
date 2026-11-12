#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1147-emig-pick.js — T1147: 불행 이탈의 받는 곳 = 둘레 여럿(교역로 4일 안) 중 더 행복하고 받을 자리가 있는 곳 ======
//   진짜 서버 함수(`villages._t1147Pick`)를 존을 띄워 부른다 — 마을 행복 · 침상 · 곳간만 판 꾸밈으로 세운다(고르는 셈은 그대로).
//   ① 4일 안 후보 중 행복이 가장 높은 곳 · ② 4일 밖은 안 고른다 · ③ 떠나는 마을보다 안 행복하면 안 고른다(아무도 안 떠남 = null)
//   ④ 침상이 꽉 찬 곳 · 곳간이 3일치 밑인 곳은 안 고른다 · ⑤ 같은 행복이면 가까운 곳 · ⑥ 고른 곳이 가장 가까운 곳인지 따로 센다(보고 칸).
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다 — 존이 기본 localhost:3010(나란히 돌면 남의 central)에 붙지 않게 닿지 않는 주소를 준다
if (process.env.T474_CARAVAN_WALK === undefined) process.env.T474_CARAVAN_WALK = '0';   // ★[PM land1045] T474 켬 기본 — 이 하네스의 판 · 픽스처(소문 ≠ 캐러밴 대조 · '교역로 4일' 이웃 표본)는 종전 캐러밴 시계(500) 위에서 짠 것이라 끔으로 묶는다(단언 무변 · 켬 세계는 test-move-soa ⑱ ⑲ · test-t1136-basket 이 잰다)
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? '  ' + JSON.stringify(x) : '')); };
(async () => {
  const TMP = `/tmp/test-t1147-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  Object.assign(process.env, { ZONE_ID: 'hanbando', PORT: String(require('./lib-port').port(44000)), DB_PATH: TMP, ENABLE_VILLAGES: '1', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', LATENCY_MS: '0' });
  const _l = console.log, _w = console.warn, _e = console.error;
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  require(path.join(ROOT, 'server', 'zone.js'));
  const SV = require(path.join(ROOT, 'server', 'villages.js'));
  const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2.js'));
  const E1 = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let vils = [];
  for (let i = 0; i < 600; i++) { await sleep(500); const cv = (SV.clientVillages && SV.clientVillages()) || []; vils = cv.map((c) => SV.villageByDbId(c.id)).filter((v) => v && v.econ && v.econ.npcs.length); if (vils.length >= 20) break; }
  console.log = _l; console.warn = _w; console.error = _e;
  ok(vils.length >= 20 && typeof SV._t1147Pick === 'function', '①-0 마을이 섰다 · 고르는 함수가 있다', vils.length);
  if (vils.length < 20) return done();
  const W = vils[0].econ._world, M = W._distMatrix, ev = W.villages;
  const days = (a, b) => { const i = ev.indexOf(a.econ), j = ev.indexOf(b.econ); const d = (M && i >= 0 && j >= 0) ? M[i][j] : Math.hypot(a.ccx - b.ccx, a.ccy - b.ccy) * 2.5; return isFinite(d) ? V2.travelDaysForDistance(d) : Infinity; };
  // 떠나는 마을 = 4일 안 이웃이 셋 이상인 곳
  let src = null, near = [], far = [];
  for (const v of vils) { const n = vils.filter((u) => u !== v && days(v, u) <= 4); if (n.length >= 3) { src = v; near = n; far = vils.filter((u) => u !== v && days(v, u) > 4); break; } }
  ok(!!src && far.length > 0, '①-1 판 — 4일 안 이웃 셋 이상 · 4일 밖 마을도 있는 떠나는 마을', src ? { src: src.name, near: near.length, far: far.length } : null);
  if (!src) return done();
  const setH = (v, h) => { v.econ.lastStats = Object.assign({}, v.econ.lastStats || {}, { happiness: h }); };
  const room = (v) => { v.econ.housing = v.econ.npcs.length + 10; v.econ._mapBeds = v.econ.npcs.length + 10; v.econ.storage.food = Math.max(v.econ.storage.food || 0, (v.econ.npcs.length + 1) * 3 + 50); };
  for (const v of vils) { setH(v, 0.1); room(v); }
  setH(src, 0.2);
  const [a, b, c] = near;
  setH(a, 0.5); setH(b, 0.7); setH(c, 0.6);
  if (far[0]) setH(far[0], 0.99);
  ok(SV._t1147Pick(src) === b, '①-2 4일 안 후보 중 행복이 가장 높은 곳(0.7) — 4일 밖 0.99 는 안 고른다', { got: (SV._t1147Pick(src) || {}).name, want: b.name });
  b.econ._mapBeds = b.econ.npcs.length;
  ok(SV._t1147Pick(src) === c, '④-1 침상이 꽉 찬 곳은 건너뛴다(다음 0.6)');
  b.econ._mapBeds = b.econ.npcs.length + 10;
  const keep = b.econ.storage; b.econ.storage = Object.assign({}, keep); for (const k of Object.keys(b.econ.storage)) b.econ.storage[k] = 0;
  ok(E1.totalFoodEquivalent(b.econ) < (b.econ.npcs.length + 1) * 3 && SV._t1147Pick(src) === c, '④-2 곳간이 (인구 + 1) × 3일치 밑인 곳은 건너뛴다');
  b.econ.storage = keep;
  for (const v of near) setH(v, 0.15);
  ok(SV._t1147Pick(src) === null, '③ 둘레가 떠나는 마을(0.2)보다 안 행복하면 null — 아무도 안 떠난다');
  // ⑤ 같은 행복이면 가까운 곳
  const byD = near.slice().sort((x, y) => { const i = ev.indexOf(src.econ); return (M ? M[i][ev.indexOf(x.econ)] - M[i][ev.indexOf(y.econ)] : 0); });
  setH(byD[0], 0.8); setH(byD[byD.length - 1], 0.8);
  ok(SV._t1147Pick(src) === byD[0], '⑤ 같은 행복(0.8)이면 가까운 곳', { got: (SV._t1147Pick(src) || {}).name, want: byD[0].name });
  const st = SV.t1147Stat();
  ok(st.pick >= 4 && st.none >= 1 && st.nearest + st.other === st.pick && Array.isArray(st.rows), '⑥ 고른 곳이 가장 가까운 곳인지 따로 센다(보고 칸)', { pick: st.pick, nearest: st.nearest, other: st.other, none: st.none });
  done();
})().catch((e) => { console.log('예외', e && e.stack); fail++; done(); });
function done() { console.log(`\n=== T1147 받는 곳: 통과 ${pass} · 실패 ${fail} ===`); process.exit(fail ? 1 : 0); }
