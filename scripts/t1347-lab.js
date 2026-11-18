'use strict';
// (@regress 없음 — 러너 밖 · T1347 랩 자 · 읽기만)
// === scripts/t1347-lab.js — 랩 세계(`econ-lab-real` · 51 곳) N 날 — 받아 올 짐 · 섞어 싣기 목적지 발주 · 청동 · 식량 교역(손잡이는 env) ==========
//   쓰는 법: SEED_ALL=1 VILLAGE_MAX=51 [T1333_ALLOY_ORDER=1] [T1347_FETCH=1] [T1344_MIX_LOAD=1] [T1347_MIX_DEST=1] node scripts/t1347-lab.js 100
//   → JSON 한 줄: 손잡이 · 합(청동 · 사람 · 굶음(식량 빚 죽음 누계) · 교역 줄 · 식량 교역(econ 식량 단위 — 보낸 짐 + 둘째 화물 + 받아 온 짐) · 먹을거리 첫째 화물 줄 ·
//     둘째 화물 줄(그 가운데 먹을거리) · 받아 온 구리 · 주석 · 숯(양) · 광산5 로 간 구리(남이 보낸 줄 · 양 / 광산5 캐러밴이 받아 온 줄 · 양)) ·
//     마지막 날 발주 마을 수(품목별 — 손잡이가 켜져 발주를 센 마을만) · 광산5 한 줄(사람 · 대장장이 · 청동 · 구리 · 주석 · 무기 · (가) 먹인 식량)
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DAYS = +(process.argv[2] || 100);
process.argv = [process.argv[0], path.join(ROOT, 'scripts', 'econ-lab-real.js'), String(DAYS), '0'];
const _log = console.log; console.log = () => {};
let world; try { ({ world } = require(path.join(ROOT, 'scripts', 'econ-lab-real'))); } finally { console.log = _log; }
const v1 = require(path.join(ROOT, 'sim', 'economy-sim')), v2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
const r3 = (x) => +(+x || 0).toFixed(3);
const K5 = '광산5';
const fp = (res) => { const f = v1.storageFoodPer(world.villages[0], res); return f > 0 ? f : 0; };
const tot = { bz: 0, pop: 0, fdDead: 0, rows: 0, food: 0, foodRows: 0, mix2: 0, mix2Food: 0, cuBack: 0, snBack: 0, charBack: 0, cu5n: 0, cu5amt: 0, cu5backN: 0, cu5backAmt: 0 };
for (const v of world.villages) { tot.bz += v._bronzeWeaponMade || 0; tot.pop += v.npcs.length; tot.fdDead += v._fdDeadTot || 0; }   // fdDead = 식량 빚 죽음(굶음) 누계 — econ 정본 칸(서버 판 자 `fd-deaths` 와 같은 칸)
for (const r of (world.tradeLog || [])) {
  if (!r || !r.sent) continue;
  tot.rows++;
  tot.food += (+r.sent.amt || 0) * fp(r.sent.res); if (fp(r.sent.res) > 0) tot.foodRows++;
  if (r.sent2) { tot.mix2++; tot.food += (+r.sent2.amt || 0) * fp(r.sent2.res); if (fp(r.sent2.res) > 0) tot.mix2Food++; }
  if (r.bought) {
    tot.food += (+r.bought.amt || 0) * fp(r.bought.res);
    if (r.bought.res === 'copper') tot.cuBack += +r.bought.amt || 0;
    if (r.bought.res === 'tin') tot.snBack += +r.bought.amt || 0;
    if (r.bought.res === 'charcoal') tot.charBack += +r.bought.amt || 0;
    if (r.bought.res === 'copper' && r.from === K5) { tot.cu5backN++; tot.cu5backAmt += +r.bought.amt || 0; }
  }
  if (r.to === K5 && r.sent.res === 'copper') { tot.cu5n++; tot.cu5amt += +r.sent.amt || 0; }
  if (r.to === K5 && r.sent2 && r.sent2.res === 'copper') { tot.cu5n++; tot.cu5amt += +r.sent2.amt || 0; }
}
for (const k of Object.keys(tot)) tot[k] = r3(tot[k]);
const ord = {}; for (const v of world.villages) { const o = v._t1347O; if (o && o.day === world.day) for (const r of o.list) ord[r] = (ord[r] || 0) + 1; }
const v5 = world.villages.find((v) => v.name === K5);
const k5 = v5 ? { pop: v5.npcs.length, smith: (v5.counts && v5.counts.smith) || 0, bronzeW: r3(v5._bronzeWeaponMade), copper: r3(v5.storage.copper), tin: r3(v5.storage.tin), weapon: r3(v5.storage.weapon), fed: r3(v5._t1347Fed), fdDead: v5._fdDeadTot || 0 } : null;   // fed = 판정 표 (가) 사본이 채운 식량 누계(사본 밖 0)
_log(JSON.stringify({ days: DAYS, knobs: { alloy: v1.T1333_ALLOY_ORDER, fetch: v2.T1347_FETCH, mix: v2.T1344_MIX_LOAD, dest: v2.T1347_MIX_DEST }, tot, ordersLastDay: ord, k5 }));
