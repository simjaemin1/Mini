#!/usr/bin/env node
// probe-negstorage — 회부_인구0마을_곳간음수.md §3 계측 계획의 실행.
// 인프로세스로 zone(ENABLE_VILLAGES=1)을 띄우고, 플레이어 마을 곳간의 식량 키에
// 접근자(defineProperty)를 심어 **음수/대량 감소 쓰기의 스택**을 귀속한다.
'use strict';
const path = require('path');
const fs = require('fs');
const TMP = `/tmp/probe-neg-${process.pid}.db`;
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
process.env.ZONE_ID = 'hanbando';
process.env.PORT = String(39000 + (process.pid % 900));
process.env.DB_PATH = TMP;
process.env.ENABLE_VILLAGES = '1';
process.env.VILLAGE_MAX = '1';
process.env.VILLAGE_DAY_MS = '250';
process.env.VILLAGE_FOUND_COST = '0.1';
process.env.PVILLAGE_GAP = '10';
process.env.PVILLAGE_MAX = '3';
process.env.ENABLE_BANDITS = '0';
process.env.ENABLE_ROADS = '0';

const _log = console.log; let quiet = true;
console.log = (...a) => { const s = a.join(' '); if (!quiet || /곳간|시딩|마을 econ/.test(s)) _log(...a); };
const Zone = require(path.join(__dirname, 'server', 'zone.js'));
const SV = require(path.join(__dirname, 'server', 'villages.js'));
const econMod = require(path.join(__dirname, 'sim', 'economy-sim.js'));
quiet = false; console.log = _log;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FOOD_KEYS = ['food', 'fish', 'meat', 'cooked_food', ...Object.keys(econMod.FORAGE_FOOD_FACTOR || { fruit: 1, vegetable: 1, herb: 1 })];
const hits = [];
function instrument(vil) {
  const st = vil.econ.storage;
  for (const k of FOOD_KEYS) {
    let val = st[k] || 0;
    try {
      Object.defineProperty(st, k, {
        configurable: true, enumerable: true,
        get() { return val; },
        set(nv) {
          const d = nv - val;
          if (d < -0.5 || nv < -0.01) {
            const stack = new Error().stack.split('\n').slice(2, 6).map(s => s.trim()).join(' | ');
            hits.push({ day: vil.econ._world ? vil.econ._world.day : -1, k, from: +val.toFixed(2), to: +(+nv).toFixed(2), stack });
          }
          val = nv;
        },
      });
    } catch (e) { _log('instrument fail', k, e.message); }
  }
  return st;
}

(async () => {
  // 준비 대기 — foundPlayerVillage dryRun 이 "시뮬 꺼짐" 외 답을 줄 때까지
  let ready = false;
  for (let i = 0; i < 600 && !ready; i++) {
    const r = SV.foundPlayerVillage({ ccx: 500, ccy: 500, founder: 'probe', dryRun: true });
    if (!r.ok && /꺼져|없다$/.test(r.err || '') && /시뮬/.test(r.err || '')) { await sleep(1000); continue; }
    ready = true;
  }
  _log('[probe] villages ready');
  // 자리 찾기 — dryRun ok 나올 때까지 훑기
  let spot = null;
  outer: for (let cy = 300; cy < 900; cy += 17) for (let cx = 300; cx < 900; cx += 17) {
    const r = SV.foundPlayerVillage({ ccx: cx, ccy: cy, founder: 'probe', dryRun: true });
    if (r.ok) { spot = { cx, cy }; break outer; }
  }
  if (!spot) { _log('[probe] 자리 없음'); process.exit(1); }
  const f = SV.foundPlayerVillage({ ccx: spot.cx, ccy: spot.cy, founder: 'probe', founderName: '탐침', dryRun: false });
  _log('[probe] found:', JSON.stringify({ ok: f.ok, err: f.err, name: f.name }));
  const vil = SV.playerVillageAt(spot.cx, spot.cy);
  if (!vil) { _log('[probe] vil 조회 실패'); process.exit(1); }
  let st = instrument(vil);
  let econRef = vil.econ, stRef = vil.econ.storage;

  // 베리 투입(E2E 동형): 60일마다 200개
  const dayOf = () => (vil.econ._world && vil.econ._world.day) || 0;
  const FE = () => { try { return econMod.totalFoodEquivalent(vil.econ); } catch (e) { return NaN; } };
  let lastDay = dayOf(), lastDep = -999, samples = [];
  const t0 = Date.now();
  while (dayOf() < lastDayTarget()) {
    await sleep(200);
    const d = dayOf();
    // 정체성 감시 — storage/econ 이 통째로 바뀌면 접근자가 무력화된다(그 자체가 용의자)
    if (vil.econ !== econRef) { hits.push({ day: d, k: '__ECON_REPLACED__', stack: '(vil.econ 교체 감지)' }); econRef = vil.econ; stRef = vil.econ.storage; st = instrument(vil); }
    else if (vil.econ.storage !== stRef) { hits.push({ day: d, k: '__STORAGE_REPLACED__', stack: '(storage 교체 감지)' }); stRef = vil.econ.storage; st = instrument(vil); }
    if (d !== lastDay) {
      lastDay = d;
      if (d - lastDep >= 60) { lastDep = d; const inv = { berry: 200 }; const r = SV.playerVillageDeposit(vil, inv, { berry: 200 }); if (!r.ok) _log('[probe] deposit 실패:', r.err); }
      if (d % 20 === 0) samples.push({ d, fe: +FE().toFixed(1), pop: vil.econ.npcs.length });
    }
    if (Date.now() - t0 > 8 * 60 * 1000) break;
  }
  function lastDayTarget() { return 460; }
  _log('\n[probe] FE 궤적:', JSON.stringify(samples));
  _log('[probe] 감소/음수 쓰기 ' + hits.length + '건:');
  for (const h of hits.slice(0, 40)) _log(` day${h.day} ${h.k} ${h.from}→${h.to}\n   ${h.stack}`);
  process.exit(0);
})();
