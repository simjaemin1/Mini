// === scripts/t443-smelt-probe.js — 제련 연료 계측 (T443 · 계측기 · 러너 밖 · 제품 무접촉) =========================
//   쓰는 법: `T443_JSON=<경로> node -r ./scripts/t443-smelt-probe.js scripts/t17-metrics.js 800 <seed>`
//   econ 이 이미 세는 칸(`_smeltedTotal` · T443 켬이면 `_smeltFuelWood`·`_smeltFuelCh`·`_smeltNoFuel`·`_smeltShort`)을
//   끝날 때 마을별로 적는다. 세계는 안 건드린다(끈 판 JSON 이 기준선과 같아야 한다 — 보고가 대조한다).
'use strict';
const path = require('path'), fs = require('fs');
const V2 = require(path.join(__dirname, '..', 'sim', 'economy-sim-v2.js'));
const orig = V2.tickWorldV2; let W = null, day = 0; const minS = new Map();
V2.tickWorldV2 = function (w) { W = w; const r = orig.apply(this, arguments); day++;
  for (const v of (w.villages || [])) { if (!(v._smeltedTotal > 0)) continue; const m = minS.get(v.name) || { wood: Infinity, bronzeTool: 0 }; m.wood = Math.min(m.wood, v.storage.wood || 0); minS.set(v.name, m); }
  return r; };
process.on('exit', () => {
  if (!process.env.T443_JSON || !W) return;
  const vs = W.villages.filter((v) => v && v.npcs).map((v) => ({ name: v.name, pop: v.npcs.length, smelted: +(v._smeltedTotal || 0).toFixed(2),
    fuelWood: +(v._smeltFuelWood || 0).toFixed(2), fuelCh: +(v._smeltFuelCh || 0).toFixed(2), noFuel: v._smeltNoFuel || 0, short: v._smeltShort || 0,
    copper: +(v.storage.copper || 0).toFixed(1), tin: +(v.storage.tin || 0).toFixed(1), wood: +(v.storage.wood || 0).toFixed(1), charcoal: +(v.storage.charcoal || 0).toFixed(1),
    woodMin: minS.has(v.name) ? +minS.get(v.name).wood.toFixed(1) : null, bronzeW: +(v._bronzeWeaponMade || 0).toFixed(1),
    kiln: v._kiln ? 1 : 0, kilnWood: +(v._kilnWood || 0).toFixed(1), kilnCharcoal: +(v._kilnCharcoal || 0).toFixed(1), kilnDays: v._kilnDays || 0, lumberjack: (v.counts && v.counts.lumberjack) || 0 }));   // ★[T452] 숯가마 칸
  fs.writeFileSync(process.env.T443_JSON, JSON.stringify({ days: day, vs }, null, 1));
});
