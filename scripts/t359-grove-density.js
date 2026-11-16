#!/usr/bin/env node
// === scripts/t359-grove-density.js — 군락 **간격**을 필요 K 에서 유도한다 (T359 ①) ============
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음). **세계 무변**(읽기만).
//
// ★왜 — #58 ⓐ′(재민 09-23): 군락을 **나무처럼 지형이 낳게** 한다. 나무는 `forestSpacing(fCov)` 가
//   숲 덮임에서 간격을 낸다. 군락도 같은 꼴이어야 하고, 그 간격은 **지어내는 게 아니라 유도**다:
//     간격 = 셀변 ÷ √(셀당 밀도) · 셀당 밀도 = T357 필요 K ÷ 생활권의 쓸 수 있는 셀 수
//   ⇒ 마을별 값이 아니라 **지형별 값** 하나여야 하므로(청크 생성기는 마을을 모른다) 51마을의 **중앙값**을 쓴다.
//
// ★생활권의 자 — T347 의 채집 반경 그대로다: `걸음속도 × forage.CFG.WALK_SEC ÷ 셀` = 30셀(960px).
//   (T357 의 K 가 바로 그 반경 안에서 지속 채취를 대라고 낸 수다 — 자를 바꾸면 K 의 뜻이 바뀐다.)
//   비교용으로 나무 스캔 반경(`T325_R` 16셀)도 같이 낸다.
//
// ★쓸 수 있는 셀 = 물·바위가 아닌 셀(`terrain` 술어 정본). 나무가 선 셀은 **빼지 않는다** —
//   군락은 숲 가장자리에도 서고, 겹침은 생성기가 자리에서 가른다(②). 대신 숲 덮임 띠를 같이 센다.
//
// 실행: node scripts/t359-grove-density.js [out.json]
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || '/tmp/t359/density.json';
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const ZID = process.env.ZONE_ID || 'hanbando';
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const T = require(path.join(ROOT, 'server', 'terrain'));
if (T.setZonesMeta) T.setZonesMeta(ZONES);
const CH = require(path.join(ROOT, 'server', 'chunk'));
const F = require(path.join(ROOT, 'server', 'forage'));

const CELL = F.CFG.CELL_PX;                       // 32 — 채집 정본
const MOVE = 64;                                  // px/s — zone 정본(`MOVE_SPEED`)과 같은 수
const R_FORAGE = Math.ceil(MOVE * F.CFG.WALK_SEC / CELL);   // 30셀 — T347 이 쓰는 그 반경
const R_TREE = 16;                                // `T325_R` — 나무 스캔 반경(비교용)
const need = JSON.parse(fs.readFileSync(process.env.T357_JSON || '/tmp/t357/grove-need.json', 'utf8'));
const Kby = new Map(need.villages.map((v) => [v.n, v.A.K]));
const KbyB = new Map(need.villages.map((v) => [v.n, v.B.K]));

const villages = T.getZoneVillages(ZID) || [];
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const rows = [];
for (const v of villages) {
  const K = Kby.get(v.name); if (K == null) continue;       // T357 이 안 잰 마을(군락 0)은 뺀다
  const cx = Math.floor(v.x / CELL), cy = Math.floor(v.y / CELL);
  const count = (R) => {
    let land = 0, forestEdge = 0, grass = 0, water = 0;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R * R) continue;              // 원
      const x = (cx + dx) * CELL + CELL / 2, y = (cy + dy) * CELL + CELL / 2;
      if (T.isWaterCellLocal(ZID, x, y)) { water++; continue; }
      if (typeof T.isRockCellLocal === 'function' && T.isRockCellLocal(ZID, x, y)) continue;
      land++;
      const fm = T.getForestMultiplier(ZID, x, y);
      //   ★띠는 지형 술어가 이미 가른다 — `FOREST_MIN_COV`(숲 그리드가 깔리는 문턱) 아래/위로 나눈다(새 수 0).
      if (fm > CH.FOREST_MIN_COV) forestEdge++; else grass++;
    }
    return { land, forestEdge, grass, water };
  };
  const c30 = count(R_FORAGE), c16 = count(R_TREE);
  const sp = (K2, cells) => (cells > 0 && K2 > 0) ? CELL / Math.sqrt(K2 / cells) : 0;
  rows.push({ n: v.name, K, KB: KbyB.get(v.name),
    land30: c30.land, edge30: c30.forestEdge, grass30: c30.grass, land16: c16.land,
    spA30: +sp(K, c30.land).toFixed(1), spB30: +sp(KbyB.get(v.name), c30.land).toFixed(1),
    spA16: +sp(K, c16.land).toFixed(1) });
}
const out = { at: new Date().toISOString(), ZID, CELL, WALK_SEC: F.CFG.WALK_SEC, R_FORAGE, R_TREE,
  FOREST_MIN_COV: CH.FOREST_MIN_COV, treeSpacing: { min: CH.forestSpacing(1e9), max: CH.forestSpacing(CH.FOREST_MIN_COV) },
  rows,
  median: { spA30: med(rows.map((r) => r.spA30)), spB30: med(rows.map((r) => r.spB30)), spA16: med(rows.map((r) => r.spA16)),
            land30: med(rows.map((r) => r.land30)), edge30: med(rows.map((r) => r.edge30)), grass30: med(rows.map((r) => r.grass30)) } };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
const m = out.median;
console.log(`\n=== [T359 ①] 군락 간격 유도 · ${ZID} · 마을 ${rows.length} ===`);
console.log(`  생활권 = 채집 반경 ${R_FORAGE}셀(${R_FORAGE * CELL}px = 걸음 ${MOVE}px/s × 도보 ${F.CFG.WALK_SEC}초) · 셀 ${CELL}px`);
console.log(`  쓸 수 있는 셀 중앙 ${m.land30}(숲 띠 ${m.edge30} · 초지·물가 ${m.grass30}) · 숲 문턱 fCov ${out.FOREST_MIN_COV}`);
console.log(`\n  간격 = 셀 ÷ √(K ÷ 셀 수)`);
console.log(`    판 A(걷는 몫) 반경 30셀 → 중앙 **${m.spA30}px**`);
console.log(`    판 B(berry→fruit)      → 중앙 **${m.spB30}px**`);
console.log(`    판 A · 반경 16셀(나무 자) → 중앙 ${m.spA16}px  (비교용)`);
console.log(`    나무 간격(정본 `.concat('`forestSpacing`').concat(`) ${out.treeSpacing.min}~${out.treeSpacing.max}px`));
console.log('\n  [json]', OUT);
