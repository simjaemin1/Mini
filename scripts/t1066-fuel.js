'use strict';
// (@regress 없음 — 러너 밖 · T1066 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1066-fuel.js — 움집 화덕이 그날 탈 땔감이 있었나: 마을 땔감 충당률(`_fuelCov`) × 움집 화덕 수 ===
//   서버: NODE_OPTIONS="-r $PWD/scripts/t1066-fuel.js" node scripts/t577-server-run.js 365 1020   (아이 존만 · 판 JSON 곁 `<판>-<시드>.t1066.json`)
//   ① 날마다 마을마다 econ 이 이미 쥔 칸만 읽는다(장부 `scanDay`): 땔감 충당률 `_fuelCov`(연료 단계가 남긴 칸 — 짚 · 잔가지 · 통나무 ÷ 땔감 수요) · 인구
//   ② 판 끝 — 존 건물 목록에서 움집 캐리어(`hut-hearth.isCarrier`)를 마을(주인 `npc_simvil_<dbId>`)별로 센다 = 화덕 수 ÷ 2(마당 · 실내)
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1066.json' : '';
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const Ev = require(path.join(ROOT, 'server', 'events'));
const HH = require(path.join(ROOT, 'server', 'hut-hearth'));
const rec = { days: 0, vdays: 0, under: 0, zero: 0, underY1: 0, vdaysY1: 0, byV: {}, huts: null, err: null };
let last = -1;
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try {
      const d = day | 0;
      if (d !== last) {
        last = d; rec.days++;
        for (const v of world.villages || []) {
          if (!(v.npcs && v.npcs.length)) continue;
          const c = v._fuelCov === undefined ? 1 : v._fuelCov;
          rec.vdays++; if (d < 365) rec.vdaysY1++;
          const b = rec.byV[v.name] || (rec.byV[v.name] = { days: 0, under: 0, min: 1 });
          b.days++; if (c < b.min) b.min = +c.toFixed(4);
          if (c < 1) { rec.under++; b.under++; if (d < 365) rec.underY1++; }
          if (c <= 0) rec.zero++;
        }
      }
    } catch (e) { rec.err = String(e && e.message); }
    return sd.apply(this, arguments);
  };
  return L;
};
process.on('exit', () => {
  try {
    const Z = require.cache[require.resolve(path.join(ROOT, 'server', 'zone.js'))];
    const H = Z && Z.exports && Z.exports.__testBind ? Z.exports.__testBind() : null;
    if (H) {
      const huts = { total: 0, village: 0, other: 0, byOwner: {} };
      for (const b of H.buildings.values()) if (HH.isCarrier(b, H.BUILDING_SIZE)) {
        huts.total++; const o = String(b.ownerId || '');
        if (o.startsWith('npc_simvil_')) huts.village++; else huts.other++;
        huts.byOwner[o] = (huts.byOwner[o] || 0) + 1;
      }
      rec.huts = huts;
    }
  } catch (e) { rec.err = String(e && e.message); }
  try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {}
});
