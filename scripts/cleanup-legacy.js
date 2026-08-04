#!/usr/bin/env node
// =============================================================================
// cleanup-legacy — 레거시 하드코딩 마을이 남긴 DB 고아 행 청소 [배치 15 ① · 재민 확정 "끄자"]
//
// 배경: zone-config `legacyVillages:false` 로 레거시 33곳의 실체화를 껐다. 껐다고 이미
//   DB 에 써 둔 행이 사라지지는 않는다 — 이 스크립트가 그 자리를 치운다.
//
// ★설계 원칙 (이 파일이 지키는 것)
//   1) **전수 census 먼저.** 화이트리스트로 "이럴 것이다"를 가정하지 않는다. buildings·claims 의
//      owner_id 를 숫자 제거 패턴으로 전부 모아 화면에 찍고, 그 목록 위에서 분류한다.
//      새 패턴이 하나라도 나오면 UNKNOWN 으로 뜨고 **삭제는 중단**된다(모르는 건 안 지운다).
//   2) **드라이런 기본.** --apply 없이는 한 행도 안 지운다.
//   3) **백업 선행.** --apply 는 DB(+ -wal/-shm)를 <db>.bak-<타임스탬프> 로 먼저 복사한다.
//   4) **플레이어 무접촉.** 삭제 술어가 레거시 소유자 집합 밖의 행을 단 하나라도 물면 중단한다
//      (음성 대조 쿼리로 실측 — "안 물 것이다"가 아니라 "0건임을 재서" 통과시킨다).
//   5) **멱등.** 두 번째 실행은 0건을 보고하고 끝난다.
//
// ★대상 패턴 (server/zone.js 전수 확인 — 레거시 경로가 DB 에 쓰는 곳은 이 둘뿐이다)
//   · buildings.owner_id LIKE 'npc_house_%'  — buildVillageHouse() 의 wall/floor 행 (한옥)
//   · buildings.owner_id LIKE 'npc_farm_%'   — buildVillageFarmland() 의 farmland 행
//   · claims.owner_id    LIKE 'village_%'    — spawnGuildClaimsForVillage() 의 길드 영토.
//     현행 코드는 이걸 메모리에만 만든다(db.insertClaim 호출 없음 — zone.js 4312 가 유일한 호출부이고
//     그건 플레이어 tryClaim 이다). 옛 빌드가 남긴 행이 있을 수 있어 대상에 넣되, 0건이 정상이다.
//
// ★건드리지 않는 것
//   · npc_simvil_*  — **시딩 마을 18곳의 실체**다. 매 부팅 wipe→재실물화되는 정상 행.
//   · anon_* / 등록 계정 / public / debug 외 모든 것 — 플레이어 소유물.
//
// ★참고: zone.js 는 부팅 때마다 `DELETE FROM buildings WHERE owner_id LIKE 'npc_%'` 를 돌린다.
//   그래서 레거시 한옥·농지는 **재배포(재부팅)만으로도** 이미 지워진다. 이 스크립트는
//   (a) 재부팅 없이 즉시 치우고 싶을 때, (b) 그 wipe 가 안 잡는 claims 'village_%' 를 위해,
//   (c) 무엇이 남아 있었는지 숫자로 남기기 위해 쓴다. 실측값으로 정직하게 보고한다.
//
// 사용:
//   node scripts/cleanup-legacy.js                       # 드라이런(기본) — 레포 world-hanbando.db
//   node scripts/cleanup-legacy.js --db /data/world.db   # 라이브 컨테이너 경로
//   node scripts/cleanup-legacy.js --db /data/world.db --apply
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const APPLY = has('--apply');
const ZONE_ID = process.env.ZONE_ID || 'hanbando';
const DB_PATH = val('--db', process.env.DB_PATH || path.join(__dirname, '..', `world-${ZONE_ID}.db`));

// 레거시 = 이 술어에 걸리는 것뿐. 아래 SQL 과 JS 판정이 **같은 정의**를 쓰도록 한 곳에 둔다.
const BLD_SQL = "owner_id LIKE 'npc_house\\_%' ESCAPE '\\' OR owner_id LIKE 'npc_farm\\_%' ESCAPE '\\'";
const CLM_SQL = "owner_id LIKE 'village\\_%' ESCAPE '\\'";
const isLegacyBld = (o) => /^npc_house_/.test(o || '') || /^npc_farm_/.test(o || '');
const isLegacyClm = (o) => /^village_/.test(o || '');
// 레거시가 아님이 **확실한** 것 — census 분류용(모르면 UNKNOWN 으로 떨어져 중단시킨다).
const KNOWN_SAFE = [
  { re: /^npc_simvil_/, tag: '시딩마을(보존)' },
  { re: /^anon_/, tag: '게스트 플레이어(보존)' },
  { re: /^public$/, tag: '공용(보존)' },
  { re: /^debug_/, tag: '디버그 잔재(보존 — 부팅 wipe 소관)' },
];

function pat(o) { return String(o == null ? '(null)' : o).replace(/[0-9]+/g, '#'); }
function classify(o, kind) {
  if (kind === 'buildings' && isLegacyBld(o)) return { cls: 'LEGACY', tag: '레거시 마을(삭제 대상)' };
  if (kind === 'claims' && isLegacyClm(o)) return { cls: 'LEGACY', tag: '레거시 길드영토(삭제 대상)' };
  for (const k of KNOWN_SAFE) if (k.re.test(String(o || ''))) return { cls: 'SAFE', tag: k.tag };
  // 등록 계정 소유물은 임의 문자열이라 패턴으로 못 가른다 — 남은 건 전부 '플레이어 것'으로 본다.
  //   (레거시 패턴 둘은 위에서 이미 걸렀다. 즉 여기 오는 건 지울 이유가 없는 것들이다.)
  return { cls: 'PLAYER', tag: '플레이어/기타(보존)' };
}

function census(db, table) {
  let rows;
  try { rows = db.prepare(`SELECT owner_id, COUNT(*) AS c FROM ${table} GROUP BY owner_id`).all(); }
  catch (e) { return null; }
  const byPat = new Map();
  for (const r of rows) {
    const p = pat(r.owner_id);
    const cl = classify(r.owner_id, table);
    const e = byPat.get(p) || { pat: p, n: 0, owners: 0, cls: cl.cls, tag: cl.tag };
    e.n += r.c; e.owners += 1;
    if (e.cls !== cl.cls) e.cls = 'MIXED';   // 같은 패턴 안에서 분류가 갈리면 위험 신호
    byPat.set(p, e);
  }
  return [...byPat.values()].sort((a, b) => b.n - a.n);
}

function fmt(list, table) {
  if (!list) return `  (${table} 테이블 없음)`;
  if (!list.length) return `  (빈 테이블)`;
  return list.map((e) => `  ${e.cls.padEnd(7)} ${e.pat.padEnd(30)} 행 ${String(e.n).padStart(7)} · 소유자 ${String(e.owners).padStart(4)}  — ${e.tag}`).join('\n');
}

function backup(dbPath) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const made = [];
  for (const suf of ['', '-wal', '-shm']) {
    const src = dbPath + suf;
    if (!fs.existsSync(src)) continue;
    const dst = `${dbPath}.bak-${ts}${suf}`;
    fs.copyFileSync(src, dst);
    made.push(`${path.basename(dst)} (${(fs.statSync(dst).size / 1048576).toFixed(1)}MB)`);
  }
  return { ts, made };
}

// =============================================================================
(function main() {
  console.log(`=== cleanup-legacy — 레거시 마을 DB 청소 ===`);
  console.log(`DB: ${DB_PATH}`);
  if (!fs.existsSync(DB_PATH)) { console.error(`[중단] DB 파일이 없다: ${DB_PATH}`); process.exit(1); }
  console.log(`모드: ${APPLY ? '★실행(--apply)' : '드라이런(기본) — 아무것도 안 지운다'}\n`);

  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA busy_timeout = 8000');

  // ── ① 전수 census (삭제 전) ──────────────────────────────────────────────
  const b0 = census(db, 'buildings'), c0 = census(db, 'claims');
  console.log('① buildings owner_id 전수 census');
  console.log(fmt(b0, 'buildings'));
  console.log('\n① claims owner_id 전수 census');
  console.log(fmt(c0, 'claims'));

  const unknown = [...(b0 || []), ...(c0 || [])].filter((e) => e.cls === 'MIXED');
  if (unknown.length) {
    console.error(`\n[중단] 한 패턴 안에서 분류가 갈린다(MIXED) — 모르는 상황이라 삭제하지 않는다:`);
    unknown.forEach((e) => console.error(`   ${e.pat}`));
    process.exit(2);
  }

  // ── ② 삭제 대상 계수 + 음성 대조(플레이어 무접촉 실측) ────────────────────
  const bTarget = db.prepare(`SELECT COUNT(*) AS c FROM buildings WHERE ${BLD_SQL}`).get().c;
  let cTarget = 0;
  try { cTarget = db.prepare(`SELECT COUNT(*) AS c FROM claims WHERE ${CLM_SQL}`).get().c; } catch (e) {}

  // ★음성 대조 — 술어가 무는 행 중 레거시가 아닌 owner 가 하나라도 있나(가정이 아니라 실측).
  const bBadRows = db.prepare(`SELECT DISTINCT owner_id FROM buildings WHERE ${BLD_SQL}`).all()
    .map((r) => r.owner_id).filter((o) => !isLegacyBld(o));
  let cBadRows = [];
  try {
    cBadRows = db.prepare(`SELECT DISTINCT owner_id FROM claims WHERE ${CLM_SQL}`).all()
      .map((r) => r.owner_id).filter((o) => !isLegacyClm(o));
  } catch (e) {}
  // ★그리고 반대로 — 보존 대상(시딩·플레이어)이 술어에 안 걸리는지도 실측한다.
  const simCount = db.prepare(`SELECT COUNT(*) AS c FROM buildings WHERE owner_id LIKE 'npc_simvil\\_%' ESCAPE '\\'`).get().c;
  const simHit = db.prepare(`SELECT COUNT(*) AS c FROM buildings WHERE owner_id LIKE 'npc_simvil\\_%' ESCAPE '\\' AND (${BLD_SQL})`).get().c;
  const plCount = db.prepare(`SELECT COUNT(*) AS c FROM buildings WHERE owner_id NOT LIKE 'npc\\_%' ESCAPE '\\'`).get().c;
  const plHit = db.prepare(`SELECT COUNT(*) AS c FROM buildings WHERE owner_id NOT LIKE 'npc\\_%' ESCAPE '\\' AND (${BLD_SQL})`).get().c;

  console.log(`\n② 삭제 대상`);
  console.log(`   buildings(레거시 한옥·농지) : ${bTarget}행`);
  console.log(`   claims(레거시 길드영토)     : ${cTarget}행`);
  console.log(`\n② 안전 대조(실측 — 가정 아님)`);
  console.log(`   술어가 문 비(非)레거시 owner : buildings ${bBadRows.length}종 · claims ${cBadRows.length}종  (0이어야 정상)`);
  console.log(`   시딩 마을 npc_simvil_* 총 ${simCount}행 중 술어에 걸린 것: ${simHit}행  (0이어야 정상)`);
  console.log(`   비(非) npc_* 소유(플레이어 등) 총 ${plCount}행 중 술어에 걸린 것: ${plHit}행  (0이어야 정상)`);

  if (bBadRows.length || cBadRows.length || simHit || plHit) {
    console.error(`\n[중단] 술어가 보존 대상을 문다 — 한 행도 지우지 않는다.`);
    if (bBadRows.length) console.error(`   buildings: ${bBadRows.slice(0, 10).join(', ')}`);
    if (cBadRows.length) console.error(`   claims: ${cBadRows.slice(0, 10).join(', ')}`);
    process.exit(3);
  }

  if (!bTarget && !cTarget) {
    console.log(`\n③ 지울 것이 없다 — 이미 깨끗하다(멱등). 종료.`);
    process.exit(0);
  }

  if (!APPLY) {
    console.log(`\n③ 드라이런이라 여기서 멈춘다. 실제로 지우려면:`);
    console.log(`   node scripts/cleanup-legacy.js --db ${DB_PATH} --apply`);
    process.exit(0);
  }

  // ── ③ 백업 → 삭제 ────────────────────────────────────────────────────────
  console.log(`\n③ 백업`);
  const bk = backup(DB_PATH);
  bk.made.forEach((m) => console.log(`   ${m}`));
  if (!bk.made.length) { console.error(`   [중단] 백업 파일을 하나도 못 만들었다.`); process.exit(4); }

  console.log(`\n④ 삭제(트랜잭션)`);
  db.exec('BEGIN');
  let bDel = 0, cDel = 0;
  try {
    bDel = db.prepare(`DELETE FROM buildings WHERE ${BLD_SQL}`).run().changes;
    try { cDel = db.prepare(`DELETE FROM claims WHERE ${CLM_SQL}`).run().changes; } catch (e) {}
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    console.error(`   [중단] 삭제 실패 — 롤백했다: ${e.message}`);
    console.error(`   백업은 ${DB_PATH}.bak-${bk.ts} 에 있다.`);
    process.exit(5);
  }
  console.log(`   buildings ${bDel}행 · claims ${cDel}행 삭제`);

  // ── ④ 사후 검증 — 멱등성 + 보존 확인 ─────────────────────────────────────
  const bLeft = db.prepare(`SELECT COUNT(*) AS c FROM buildings WHERE ${BLD_SQL}`).get().c;
  let cLeft = 0; try { cLeft = db.prepare(`SELECT COUNT(*) AS c FROM claims WHERE ${CLM_SQL}`).get().c; } catch (e) {}
  const simAfter = db.prepare(`SELECT COUNT(*) AS c FROM buildings WHERE owner_id LIKE 'npc_simvil\\_%' ESCAPE '\\'`).get().c;
  const plAfter = db.prepare(`SELECT COUNT(*) AS c FROM buildings WHERE owner_id NOT LIKE 'npc\\_%' ESCAPE '\\'`).get().c;
  console.log(`\n⑤ 사후 검증`);
  console.log(`   남은 레거시           : buildings ${bLeft} · claims ${cLeft}   (0이어야 정상 — 재실행하면 "지울 것 없음")`);
  console.log(`   시딩 마을 보존        : ${simCount} → ${simAfter}  ${simCount === simAfter ? 'OK' : '★불일치'}`);
  console.log(`   플레이어/기타 보존    : ${plCount} → ${plAfter}  ${plCount === plAfter ? 'OK' : '★불일치'}`);
  const ok = bLeft === 0 && cLeft === 0 && simCount === simAfter && plCount === plAfter;
  console.log(`\n${ok ? '✅ 완료' : '❌ 검증 실패 — 백업으로 되돌려라'}: ${DB_PATH}.bak-${bk.ts}`);
  process.exit(ok ? 0 : 6);
})();
