'use strict';
// (@regress 없음 — 러너 밖 · T951 관찰기 · 제품 무변 · 읽기만)
// === scripts/t951-raid-observe.js — 마을별 · 날별 **습격 손실** — 서버 판 자(`t577-server-run.js`) 곁 프리로드 ===
//   쓰는 법: NODE_OPTIONS="-r $PWD/scripts/t934-observe.js -r $PWD/scripts/t951-raid-observe.js" T858_NO_SHIELD=1 node scripts/t577-server-run.js 400 1020,7,42
//            (아이 존만 · 판 JSON 곁 `<판>-<시드>.t951.json` · 굶어 죽음 · 인구 고리 칸은 곁의 `.t934.json` 이 같은 날 같은 마을로 든다)
//   ★왜 [T934 회부 3 → T951] 보호막 끔 × 도적 판의 굶주림 +541 이 "습격 · 행상 피살이 굶는 마을로 가는 식량 배분을 끊는 길"인가를 마을 줄로 본다.
//   뜨는 것(econ 이 이미 쓰는 문 · 칸을 읽기만 한다 — 사본 0 · 새 수 0):
//     loot  — econ 의 약탈 훅 `world.onBanditLoot(from, to, res, amt, day)` 한 번마다 [날 · 출발(제 마을) · 목적 · 품목 · 양 · 식량 환산 · 방향]
//             방향 = 부른 자리(가는 길 `_caravanArrive` = 'out' — 내다 파는 짐 · 귀환 = 'in' — 사 오던 짐). 식량 환산 = econ `totalFoodEquivalent`(그 품목 그 양만 든 곳간).
//             ⚠훅을 감쌀 뿐 · 원 훅(호스트 `bandits.js`)은 그대로 부른다(돌려주는 값 그대로).
//     days  — 장부 하루 끝(`scanDay`)마다 마을마다 [습격당함 누계(`tradeStats.caravansRaided`) · 잃은 짐 누계(`cargoLost`) · 행상 피살 누계(`tradersKilled`)
//             · 받은 식량 누계(`foodImported`) · 태어난 날(`_bornDay` — 보호막 창 = 나이 < SHIELD_DAYS) · 도적화(`_banditized`)]
//     store — 곳간을 도적이 직접 비우는 길: 서버 코드에 판 꾸밈(`BANDIT_FIXTURE`) 하나뿐이라(T934 §1-1) 따로 안 뜬다 — 위 곳간 칸 변화는 t934 의 tfe 가 든다.
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t951.json' : '';
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const Ev = require(path.join(ROOT, 'server', 'events'));
const rec = {
  knob: Object.fromEntries(['T858_NO_SHIELD', 'ENABLE_BANDITS', 'DCTL_SKIP', 'DCTL_ARM', 'T577_RAMP', 'BANDIT_MINDAY', 'T932_SMELT_CONT'].map((k) => [k, process.env[k] != null ? process.env[k] : null])),
  cols: ['raided', 'cargoLost', 'tradersKilled', 'foodImp', 'born', 'banditized'],
  lootCols: ['day', 'from', 'to', 'res', 'amt', 'foodEq', 'dir'],
  names: null, loot: [], rows: [],
};
const r3 = (x) => Math.round((+x || 0) * 1e3) / 1e3;
const foodEq = (res, amt) => { try { const st = { food: 0, fish: 0, meat: 0, cooked_food: 0 }; st[res] = (st[res] || 0) + amt; return V1.totalFoodEquivalent({ storage: st, npcs: [] }); } catch (e) { return null; } };
const dirOf = () => { const s = new Error().stack || ''; return /_caravanArrive/.test(s) ? 'out' : 'in'; };
let hooked = false, last = -1;
function hook(world) {
  hooked = true;
  const orig = world.onBanditLoot;
  if (typeof orig !== 'function') { rec.noHook = true; return; }
  world.onBanditLoot = function (from, to, res, amt, day) {
    try { rec.loot.push([day | 0, from && from.name, to && to.name, res, r3(amt), r3(foodEq(res, amt)), dirOf()]); } catch (e) {}
    return orig.apply(this, arguments);
  };
}
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try {
      if (!hooked && world) hook(world);
      if ((day | 0) !== last) { last = day | 0; snap(world, day | 0); }
    } catch (e) { rec.err = String(e && e.message); }
    return sd.apply(this, arguments);
  };
  return L;
};
function snap(world, day) {
  const V = world.villages || [];
  if (!rec.names) rec.names = V.map((v) => v.name);
  for (const v of V) if (rec.names.indexOf(v.name) < 0) rec.names.push(v.name);
  const row = new Array(rec.names.length).fill(null);
  for (const v of V) {
    const i = rec.names.indexOf(v.name), t = v.tradeStats || {};
    row[i] = [t.caravansRaided || 0, r3(t.cargoLost), t.tradersKilled || 0, r3(t.foodImported), v._bornDay || 0, v._banditized ? 1 : 0];
  }
  rec.rows.push([day, row]);
}
process.on('exit', () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
