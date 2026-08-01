#!/usr/bin/env node
// === scripts/migrate-db-endowment.js — 기존 세계에 **부존만** 소급한다 ========
//
// ★[재민 확정 2026-08-02b] "DB 마이그레이션 (리셋 아님)"
//   문제: 시딩은 DB 가 빌 때 딱 한 번 돈다. 그래서 부유 시딩(1744e0e) + 땅맞춤 초기 부존(08-02)의
//   **소멸 −77% · 인구 +134%** 가 라이브에 하나도 안 먹는다(회부_시딩변경과_DB리셋.md 실측).
//
// ★이 스크립트가 하는 것 / 안 하는 것 — 경계를 분명히 한다
//   ✅ 한다: ① 옛 DB 의 `land` 에 **빠진 키만** 채운다(예: 다광종 도입 전 저장분엔 oreMix 가 없다).
//              ★덮어쓰지 않는다 — 여기서 쓸 수 있는 건 영토 없는 근사라, 시딩 때의 정본보다 나쁘다.
//              (전면 재추출은 --reland. 실측: 근사로 덮으면 18곳 전부 fertility 가 어긋난다.)
//            ② 땅맞춤 초기 부존(LANDFIT·BOOMFIT)이 줬을 양을 계산해 **부족한 만큼만 보충**
//   ❌ 안 한다: 마을을 옮기거나 지우지 않는다 · 인구·NPC·건물·사유지·플레이어를 **건드리지 않는다**
//            · **시딩 자체는 소급 불가**다(자리 선택은 마을이 이미 서 있는 이상 되돌릴 수 없다.
//              부유 시딩의 효과를 보려면 리셋뿐이다 — `DB리셋_절차.md` 참조)
//
// ★멱등: 두 번 돌려도 결과가 같다. "목표치까지 보충"이라 이미 채워져 있으면 아무 일도 안 한다.
//   그리고 마을마다 `_endowMigrated` 도장을 찍어 무엇이 언제 처리됐는지 남긴다.
//
// 사용:
//   node scripts/migrate-db-endowment.js                       # 미리보기(기본 — 아무것도 안 쓴다)
//   node scripts/migrate-db-endowment.js --apply               # 실제 적용(자동 백업 후)
//   node scripts/migrate-db-endowment.js --db=/path/world.db --zone=hanbando
//   node scripts/migrate-db-endowment.js --apply --no-backup   # 백업 생략(권장 안 함)
//   node scripts/migrate-db-endowment.js --reland              # land 를 전면 재추출(⚠아래 ① 주석 — 보통 불필요)
//
// ⚠실행은 재민만. 이 스크립트는 라이브 서버가 **꺼진 상태**에서 돌려야 한다
//   (켜진 채로 고치면 서버가 메모리 상태를 그 위에 덮어쓴다).
'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const m = argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : d; };
const flag = (k) => argv.includes(`--${k}`);

const ZONE = arg('zone', 'hanbando');
const DB_PATH = arg('db', path.join(ROOT, `world-${ZONE}.db`));
const APPLY = flag('apply');
const BACKUP = !flag('no-backup');
// ★land 전면 재추출 — 기본 OFF. 영토 없는 근사라 시딩 때의 정본보다 부정확할 수 있다(아래 ① 주석).
const RELAND = flag('reland');

if (!fs.existsSync(DB_PATH)) {
  console.error(`DB 가 없다: ${DB_PATH}\n  (새 DB 라면 마이그레이션이 필요 없다 — 부팅 시 새 시딩이 그대로 발효한다)`);
  process.exit(1);
}

// ── 지형·부존 추출은 **본 게임 함수**를 그대로 부른다(사본 금지) ────────────────
process.env.ZONE_ID = ZONE;
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const T = require(path.join(ROOT, 'server', 'terrain'));
if (T.setZonesMeta) T.setZonesMeta(ZONES);
const SimVillages = require(path.join(ROOT, 'server', 'villages'));
const econ = require(path.join(ROOT, 'sim', 'economy-sim.js'));
const P = SimVillages.__labProbe;
if (!P || !P.extractLandParamsApprox) { console.error('__labProbe 를 못 찾았다 — villages.js 훅 확인'); process.exit(1); }
const ZC = ZONES[ZONE];
if (!ZC) { console.error(`zone-config 에 ${ZONE} 없음`); process.exit(1); }
const SZ = P.SZ;
P.setZoneId(ZONE);
const _in = (x, y) => !(x < 0 || y < 0 || x >= ZC.zoneWidth || y >= ZC.zoneHeight);
const isWater = (x, y) => { if (!_in(x, y)) return false; const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ); try { return !!T.isWaterCellLocal(ZONE, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch (e) { return false; } };
const isRock = (x, y) => { if (!_in(x, y)) return false; try { return !!T.isRockCellLocal(ZONE, x, y); } catch (e) { return false; } };
const ta = P.makeTerrainAdapter(T, ZC, { isTerrainBlockedLocal: (x, y) => !_in(x, y) || isRock(x, y) || isWater(x, y), isWaterTileLocal: isWater });

// ── 목표 부존 = createVillage 가 **지금** 줄 값. 공식을 여기 베끼지 않는다 ──────
//   빈 마을을 하나 만들어 보고 그 초기 재고를 읽는다 → 엔진이 공식을 바꿔도 이 스크립트가 따라간다.
function targetStock(lp, pop) {
  const probe = econ.createVillage({ ...lp, initialPop: Math.max(1, Math.round(pop)), name: '__probe' });
  return { food: probe.storage.food || 0, stone: probe.storage.stone || 0, wood: probe.storage.wood || 0,
           tool: probe.storage.tool || 0, ore: probe.storage.ore || 0 };
}
//   ★"지금 인구"가 아니라 **창설 인구(INITIAL_POP)** 기준으로 잰다.
//     초기 부존은 "정착민이 지고 온 것"이라 인구에 비례해 계속 불어나는 물건이 아니다.
//     지금 300명인 마을에 300명분 초기 재고를 부으면 그건 마이그레이션이 아니라 치트다.
const INIT_POP = P.INITIAL_POP || 8;

// ── DB ────────────────────────────────────────────────────────────────────────
const { DatabaseSync } = require('node:sqlite');
if (APPLY && BACKUP) {
  const bak = `${DB_PATH}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(DB_PATH, bak);
  for (const sfx of ['-wal', '-shm']) if (fs.existsSync(DB_PATH + sfx)) fs.copyFileSync(DB_PATH + sfx, bak + sfx);
  console.log(`💾 백업: ${bak}`);
}
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA busy_timeout = 5000');
const rows = db.prepare('SELECT id, name, cx, cy, population, econ_state, day FROM villages WHERE zone = ? ORDER BY id').all(ZONE);
console.log(`\n=== 부존 소급 ${APPLY ? '적용' : '미리보기'} — ${DB_PATH}`);
console.log(`    zone=${ZONE} · 마을 ${rows.length}곳 · 창설 인구 기준 ${INIT_POP}명\n`);
if (!rows.length) { console.log('마을이 없다 — 할 일 없음.'); process.exit(0); }

const upd = db.prepare('UPDATE villages SET econ_state = ? WHERE id = ?');
let touched = 0, skipped = 0, added = { food: 0, stone: 0, wood: 0, tool: 0, ore: 0 }, landFixed = 0;
const W = (s, n) => String(s).padStart(n);

console.log('  마을        인구   보충(food/stone/wood/tool/ore)                land 갱신');
console.log('  ' + '─'.repeat(86));
for (const r of rows) {
  let v;
  try { v = JSON.parse(r.econ_state || 'null'); } catch (e) { v = null; }
  if (!v || !v.storage) { console.log(`  ${r.name.padEnd(10)} econ_state 없음/손상 — 건너뜀`); skipped++; continue; }

  // ① land — ★**기본은 빠진 키만 채운다.** 덮어쓰지 않는다.
  //   이유: 시딩 때의 추출은 **실제 영토(layout.territory)** 를 훑은 값이고, 여기서 쓸 수 있는 건
  //   영토 없는 **근사 폴백**(territory: [])뿐이다. 근사로 정본을 덮으면 **좋은 데이터를 나쁜 것으로
  //   바꾸는** 회귀가 된다(실측: 18곳 전부 fertility 가 달라졌다 — 마을이 변한 게 아니라 잣대가 다른 것).
  //   복원 경로(villages.js:1789)도 저장된 land 를 그대로 쓴다 — 여기서 손댈 이유가 없다.
  //   ⇒ 옛 DB 에 **아예 없는** 키(예: 다광종 도입 전의 oreMix)만 채운다. 전면 갱신은 --reland.
  let lp = null;
  try { lp = P.extractLandParamsApprox(ta, r.cx | 0, r.cy | 0, { territory: [] }); } catch (e) {}
  const oldLand = v.land || {};
  let landNote = '—';
  if (lp) {
    const keys = ['fertility', 'water', 'game', 'wood', 'stone', 'ore', 'tin', 'obsidian', 'jade', 'oreMix', 'oreP', 'oreDist'];
    if (RELAND) {
      const diffs = [];
      for (const k of keys) {
        if (lp[k] === undefined) continue;
        const a = oldLand[k], b = lp[k];
        const same = (typeof b === 'object') ? JSON.stringify(a) === JSON.stringify(b) : Math.abs((a || 0) - (b || 0)) < 1e-6;
        if (!same) diffs.push(k);
      }
      if (diffs.length) { landNote = '재추출:' + diffs.slice(0, 3).join(','); landFixed++; }
      if (APPLY) v.land = Object.assign({}, oldLand, lp);
    } else {
      const missing = keys.filter(k => lp[k] !== undefined && oldLand[k] === undefined);
      if (missing.length) {
        landNote = '보강:' + missing.slice(0, 3).join(',');
        landFixed++;
        if (APPLY) { v.land = Object.assign({}, oldLand); for (const k of missing) v.land[k] = lp[k]; }
      }
    }
  }

  // ② 부존 보충 — 목표까지 **부족한 만큼만**(멱등의 핵심)
  const want = targetStock((RELAND && lp) ? Object.assign({}, oldLand, lp) : (Object.keys(oldLand).length ? oldLand : lp), INIT_POP);
  const add = {};
  for (const k of Object.keys(want)) {
    const have = v.storage[k] || 0;
    const need = want[k] - have;
    if (need > 0.5) add[k] = +need.toFixed(2);
  }
  const addStr = ['food', 'stone', 'wood', 'tool', 'ore'].map(k => W(add[k] ? Math.round(add[k]) : '·', 6)).join(' ');
  console.log(`  ${r.name.padEnd(10)}${W(r.population, 5)}  ${addStr}    ${landNote}`);
  if (Object.keys(add).length) {
    touched++;
    for (const k in add) added[k] += add[k];
    if (APPLY) for (const k in add) v.storage[k] = +((v.storage[k] || 0) + add[k]).toFixed(3);
  }
  if (APPLY) {
    v._endowMigrated = { at: new Date().toISOString(), add, landFixed: landNote !== '—' };
    try { upd.run(JSON.stringify(v), r.id); } catch (e) { console.log(`  ⚠ ${r.name} 저장 실패: ${e.message}`); }
  }
}

console.log('  ' + '─'.repeat(86));
console.log(`  보충한 마을 ${touched} · 손상/건너뜀 ${skipped} · land 갱신 ${landFixed}`);
console.log(`  합계 보충 — food ${Math.round(added.food)} · stone ${Math.round(added.stone)} · wood ${Math.round(added.wood)} · tool ${Math.round(added.tool)} · ore ${Math.round(added.ore)}`);
console.log(`
★소급되지 않는 것 (중요):
   **시딩(마을 자리 선택) 자체는 되돌릴 수 없다.** 부유 시딩이 "이 자리엔 안 심는다"고 판정한
   나쁜 자리의 마을은 이미 서 있고, 이 스크립트는 그것을 지우지 않는다(플레이어 건축물·영토가 얹혀 있다).
   즉 소멸 −77% 중 **땅맞춤 부존 몫만** 소급되고, **자리 선별 몫은 리셋에서만** 발효한다.
   ⇒ 그래도 값이 있다: 도구 아사는 부존이 버티는 동안 인구가 임계를 넘느냐의 문제이고(경로 의존),
     이 보충이 바로 그 버팀목이다. 다만 이미 800일을 산 마을엔 "다시 출발선"이 아니라 "한 번의 구제"다.
`);
if (!APPLY) console.log('※ 미리보기였다. 실제로 쓰려면 --apply (서버를 **끈 상태**에서).');
else console.log('✅ 적용 완료. 서버를 다시 띄우면 복원 경로가 이 값을 읽는다.');
process.exit(0);
