#!/usr/bin/env node
// === scripts/audit-village-forage.js — 마을 인근 채집 감사 (배산임수 정합) ==========
//
// ★[재민 확정 2026-08-29] 빈손 배치가 실측으로 잡은 문제: **스폰 광장 300px 안에 주울 게 없고
//   잔가지까지 2,400px, 51마을 중 20곳이 채집 사막.** 재민 판정: 의도된 마찰이 아니라
//   **배산임수 캐논 위반**이다 — 마을은 원래 물가와 숲 옆에 선다(`설계_마을_배산임수_레이아웃.md`).
//
// ★★기준(시작점 · env 손잡이):
//   마을 중심에서 **도보 15초** 안에 시작 재료 3종(잔가지·자갈·풀) 각각 **소스 ≥ 2개**
//   + **식수 접근 1개** + ★**임수(臨水) 1개**.  15초 = MOVE_SPEED(64px/s) × 15 = **960px = 30셀**.
//
// ★★[T14 2026-09-01] **항목이 하나 늘었다 — 임수(臨水).** 기존 ④ 식수는 그대로 두고 ⑤를 더한다.
//   왜: 식수는 반경 안의 `water_pool` **개체**를 세는데 그 개체는 마을 둠벙만이 아니다 —
//   `chunk.pickResourceType` 이 **모든 biome 에서 굴림 상위 1~5%** 로 야생 웅덩이를 깐다.
//   그래서 **강에서 10.8km 떨어진 광산1 이 식수 합격**으로 통과했다(실측). 못 떨어지는 판정은
//   판정이 아니다(`인계/공통.md` §2 자명 통과 금지). ⇒ 임수는 **야생 웅덩이를 증거로 안 센다**:
//   지형 민물(강·호수) 또는 **마을 샘**(`groves` 의 물 군락)만. 판정식 정본은 `scripts/imsu-core.js`.
//   ⚠직선거리 대리다(실제 보행은 지형을 돈다) — 그래서 이건 **합격선이지 체감 시간이 아니다**.
//
// ★소스를 하네스가 다시 정의하지 않는다 — **정본 둘에게 물어본다**:
//   ① 지형 소스: `server/forage.js` 의 `sourceAt`(갈대 군락·숲 바닥·자갈 지형)
//   ② 개체 소스: `server/chunk.js` 의 `generateChunkResources`(덤불 = 열매·풀·**잔가지**)
//   ★덤불은 `forage.sourceAt` 이 모른다(파괴형 채집은 `zone.tryGather` 소관) — 그래서 따로 센다.
//   ★`clearTreesInCells` 는 **나무만** 지운다(실측) — 덤불은 마을 영토 안에서도 산다.
//
// ⚠계측기다. PASS/FAIL 을 세지만 **러너에 넣지 마라**(수리 전후 짝을 사람이 읽는 표다).
//
// 실행: node scripts/audit-village-forage.js [--zone hanbando] [--json out.json] [--full]
'use strict';
const path = require('path');
const fs = require('fs');
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const ZID = val('--zone', 'hanbando');
const OUT = val('--json', '');
const FULL = has('--full');

process.env.ZONE_ID = process.env.ZONE_ID || ZID;
const ROOT = path.join(__dirname, '..');
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const T = require(path.join(ROOT, 'server', 'terrain'));
if (T.setZonesMeta) T.setZonesMeta(ZONES);
const F = require(path.join(ROOT, 'server', 'forage'));
const CH = require(path.join(ROOT, 'server', 'chunk'));
// ★[T14] 임수 판정 정본 — 감사·처방·하네스 셋이 **같은 함수**를 부른다(사본 금지).
const IMSU = require(path.join(__dirname, 'imsu-core')).create({ ZID, ZONES, terrain: T, chunk: CH });

const CELL = F.CFG.CELL_PX;                 // 32
const MOVE_SPEED = 64;                      // px/s — zone.js 정본과 같은 수(빈손이라 배수 1.0)
const WALK_SEC = parseFloat(process.env.AUDIT_WALK_SEC || '15');
const R = Math.round(MOVE_SPEED * WALK_SEC);            // 960px
const NEED_EACH = parseInt(process.env.AUDIT_NEED_EACH || '2', 10);
const KINDS = ['twig', 'pebble', 'fiber'];
const KO = { twig: '잔가지', pebble: '자갈', fiber: '풀' };
const FAR = Math.round(MOVE_SPEED * 60);                // 최근접 탐색 한계 = 도보 1분

const ctx = {
  forestMult: (x, y) => T.getForestMultiplier(ZID, x, y),
  isRock: (x, y) => T.isRockCellLocal(ZID, x, y),
  isWater: (x, y) => T.isWaterCellLocal(ZID, x, y),
};
const pad = (s, n) => String(s).padStart(n);
const padr = (s, n) => { s = String(s); let w = 0; for (const c of s) w += (c.charCodeAt(0) > 0x2000 ? 2 : 1); return s + ' '.repeat(Math.max(0, n - w)); };

// ── 개체(덤불) — 정본 청크 생성기에게 물어본다 ──────────────────────────────
const _chunkCache = new Map();
function chunkList(cx, cy) {
  const k = cx + ',' + cy;
  let v = _chunkCache.get(k);
  if (!v) {
    try { v = CH.generateChunkResources(ZID, ZONES[ZID].biome, cx, cy, CH.CHUNK_SIZE, null) || []; }
    catch (e) { v = []; }
    _chunkCache.set(k, v);
  }
  return v;
}
function entsNear(x0, y0, rad) {
  const CS = CH.CHUNK_SIZE, out = [];
  for (let cy = Math.floor((y0 - rad) / CS); cy <= Math.floor((y0 + rad) / CS); cy++)
    for (let cx = Math.floor((x0 - rad) / CS); cx <= Math.floor((x0 + rad) / CS); cx++)
      for (const r of chunkList(cx, cy))
        if (Math.hypot(r.x - x0, r.y - y0) <= rad) out.push(r);
  return out;
}
// ★개체가 무엇을 주는지도 **하네스가 다시 정하지 않는다** — `zone.lootOfResource` 정본에게 물어본다.
//   (zone.js 는 require 만으로 서버를 깨우므로 조용한 적재 규약을 쓴다 — `test-emptystart` 와 같은 방식.)
const ZoneLoot = (() => {
  process.env.PORT = process.env.PORT || String(36600 + (process.pid % 120));
  process.env.DB_PATH = process.env.DB_PATH || `/tmp/audit-vf-${process.pid}.db`;
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0';
  process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  const _l = console.log, _w = console.warn, _e = console.error;
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  let f = null;
  try { f = require(path.join(ROOT, 'server', 'zone.js')).__testBind().lootOfResource; } catch (e) {}
  console.log = _l; console.warn = _w; console.error = _e;
  if (!f) { console.log('  ⚠ zone.lootOfResource 를 못 읽었다 — 개체 전리품을 셀 수 없다'); process.exit(1); }
  return f;
})();
// 개체 **종류**가 어떤 시작 재료를 주는가 — 종류당 한 번만 정본에 묻고 캐시한다.
//   (`lootOfResource` 는 덤불 씨앗에만 난수를 쓴다. 우리가 세는 3종은 전부 확정 항목이라 1회면 충분하다.)
const _kindCache = new Map();
function kindsFromType(t) {
  let v = _kindCache.get(t);
  if (!v) {
    const l = ZoneLoot({ type: t, r: 8 });
    v = new Set(KINDS.filter((k) => (l[k] || 0) > 0));
    _kindCache.set(t, v);
  }
  return v;
}

// ── 한 마을 재기 ────────────────────────────────────────────────────────────
function auditVillage(v) {
  const cnt = { twig: 0, pebble: 0, fiber: 0 };
  const near = { twig: Infinity, pebble: Infinity, fiber: Infinity };
  let stand = 0;
  // ① 반경 안 지형 소스
  for (let dy = -R; dy <= R; dy += CELL) for (let dx = -R; dx <= R; dx += CELL) {
    const d = Math.hypot(dx, dy);
    if (d > R) continue;
    const x = v.x + dx, y = v.y + dy;
    if (ctx.isWater(x, y) || ctx.isRock(x, y)) continue;   // 설 수 없는 칸
    stand++;
    const s = F.sourceAt(x, y, ctx);
    if (!s) continue;
    cnt[s.kind]++;
    if (d < near[s.kind]) near[s.kind] = d;
  }
  // ② 반경 안 **개체** — 무엇을 주는지는 `zone.lootOfResource` 정본이 답한다
  const ents = entsNear(v.x, v.y, R);
  let pools = 0;
  for (const b of ents) {
    if (b.type === 'water_pool') { pools++; continue; }
    const d = Math.hypot(b.x - v.x, b.y - v.y);
    for (const k of kindsFromType(b.type)) { cnt[k]++; if (d < near[k]) near[k] = d; }
  }
  const bushes = ents.filter((e) => e.type === 'berry_bush').length;
  // ③ 반경 밖까지 최근접(불합격 마을이 "얼마나 멀리 나가야 하나") — **한 번만 넓게 훑는다**
  const want = KINDS.filter((k) => !Number.isFinite(near[k]));
  if (want.length) {
    for (const b of entsNear(v.x, v.y, FAR)) {
      if (b.type === 'water_pool') continue;
      const ks = kindsFromType(b.type);
      const d = Math.hypot(b.x - v.x, b.y - v.y);
      for (const k of want) if (ks.has(k) && d < near[k]) near[k] = d;
    }
    for (let r = R + CELL; r <= FAR; r += CELL * 2) {
      const left = want.filter((k) => !Number.isFinite(near[k]) || near[k] > r);
      if (!left.length) break;
      for (let a = 0; a < 32; a++) {
        const th = a * Math.PI / 16, x = v.x + Math.cos(th) * r, y = v.y + Math.sin(th) * r;
        if (ctx.isWater(x, y) || ctx.isRock(x, y)) continue;
        const sc = F.sourceAt(x, y, ctx);
        if (sc && left.includes(sc.kind) && r < near[sc.kind]) near[sc.kind] = r;
      }
    }
  }
  // ④ 식수 — 물 셀 **또는 웅덩이 개체**까지 최근접
  //   ★웅덩이(`water_pool`)도 식수다 — `zone.tryGather` 가 hp 를 안 깎고 갈증만 채워 준다(특수 처리).
  let water = Infinity;
  for (const b of ents) if (b.type === 'water_pool') water = Math.min(water, Math.hypot(b.x - v.x, b.y - v.y));
  for (let r = CELL; r <= FAR && !Number.isFinite(water); r += CELL) {
    for (let a = 0; a < 48; a++) {
      const th = a * Math.PI / 24;
      if (ctx.isWater(v.x + Math.cos(th) * r, v.y + Math.sin(th) * r)) { water = r; break; }
    }
  }
  void pools;
  // ⑤ ★임수 — 마을이 물가에 섰는가. 야생 웅덩이는 증거가 아니다(머리말 참조).
  const im = IMSU.imsuOf(v, { far: 4000 });
  const okKind = {}; for (const k of KINDS) okKind[k] = cnt[k] >= NEED_EACH;
  const okWater = water <= R;
  return { name: v.name, type: v.type, x: v.x, y: v.y, cnt, near, bushes,
           stand, water, okKind, okWater,
           imsuFresh: im.fresh, imsuSpring: im.spring, okImsu: im.ok,
           pass: KINDS.every((k) => okKind[k]) && okWater && im.ok };
}

// ── 실행 ────────────────────────────────────────────────────────────────────
const villages = T.getZoneVillages(ZID) || [];
console.log(`\n=== 마을 인근 채집 감사 · ${ZID} · 마을 ${villages.length}곳 ===`);
console.log(`  기준: 도보 ${WALK_SEC}초(= ${MOVE_SPEED}px/s × ${WALK_SEC}s = **${R}px = ${R / CELL}셀**) 안에`);
console.log(`        시작 재료 3종 각각 소스 ≥ ${NEED_EACH}개 + 식수 1개 + ★임수 1개.  (직선거리 대리 — 합격선이지 체감 시간이 아니다)`);
console.log(`        ★임수 = 지형 민물(강·호수) 또는 마을 샘. **야생 웅덩이는 안 센다** — 정본 scripts/imsu-core.js`);
console.log(`  소스 정본: 지형 = forage.sourceAt · 개체 = chunk.generateChunkResources(덤불 = 잔가지+풀)\n`);

const rows = villages.map(auditVillage);
const fail = rows.filter((r) => !r.pass);
const dist6 = (n) => pad(Number.isFinite(n) ? Math.round(n) : '없음', 6);
const head = `  ${padr('마을', 10)}${padr('종', 5)}│ ${pad('잔가지', 7)}${pad('자갈', 6)}${pad('풀', 5)} │ ${pad('덤불', 5)} │ ${pad('식수', 6)} │ ${pad('민물', 6)}${pad('샘', 6)} 임수 │ 최근접(잔가지/자갈/풀)`;
const line = (r) => `  ${padr(r.name, 10)}${padr(r.type || '', 5)}│ ${pad(r.cnt.twig, 7)}${pad(r.cnt.pebble, 6)}${pad(r.cnt.fiber, 5)} │ ${pad(r.bushes, 5)} │ ${dist6(r.water)} │ ${dist6(r.imsuFresh)}${dist6(r.imsuSpring)} ${r.okImsu ? ' ○ ' : ' ✗ '} │ ` +
  KINDS.map((k) => (Number.isFinite(r.near[k]) ? Math.round(r.near[k]) : '>' + FAR)).join(' / ') + (r.pass ? '' : '   ✗');
console.log(head);
for (const r of (FULL ? rows : fail)) console.log(line(r));
if (!FULL && fail.length) console.log(`  (합격 ${rows.length - fail.length}곳은 생략 — 전부 보려면 --full)`);

// ── 사막의 원인을 가른다 ────────────────────────────────────────────────────
console.log(`\n── 판정: 합격 ${rows.length - fail.length}/${rows.length} · 불합격 ${fail.length}`);
if (fail.length) {
  const missing = { twig: 0, pebble: 0, fiber: 0, water: 0, imsu: 0 };
  for (const r of fail) { for (const k of KINDS) if (!r.okKind[k]) missing[k]++; if (!r.okWater) missing.water++; if (!r.okImsu) missing.imsu++; }
  console.log(`   부족한 재료: ` + KINDS.map((k) => `${KO[k]} ${missing[k]}곳`).join(' · ') + ` · 식수 ${missing.water}곳 · ★임수 ${missing.imsu}곳`);
  // ★원인 갈래 — "자연물이 아예 없다" vs "있는데 채집 판정 대상이 아니다"
  console.log(`\n── 원인 갈래 (불합격 ${fail.length}곳)`);
  console.log(`  ${padr('마을', 10)}│ ${pad('반경 안 개체', 12)} │ 개체 내역 · 진단`);
  for (const r of fail) {
    const CS = CH.CHUNK_SIZE, tally = {};
    for (let cy = Math.floor((r.y - R) / CS); cy <= Math.floor((r.y + R) / CS); cy++)
      for (let cx = Math.floor((r.x - R) / CS); cx <= Math.floor((r.x + R) / CS); cx++)
        for (const e of chunkList(cx, cy))
          if (Math.hypot(e.x - r.x, e.y - r.y) <= R) tally[e.type] = (tally[e.type] || 0) + 1;
    const total = Object.values(tally).reduce((a, b) => a + b, 0);
    const lack = KINDS.filter((k) => !r.okKind[k]).map((k) => KO[k]);
    if (!r.okWater) lack.push('식수');
    if (!r.okImsu) lack.push('임수');
    // ★원인은 **부족한 재료마다** 다르다 — 지형 소스 수와 개체 수를 같이 놓고 갈라야 한다.
    const dx = total === 0 ? '반경에 자연물이 아예 없다(배치 문제)'
      : `개체 ${total}개가 있는데도 ${lack.join('·')} 부족 — 개체가 그 재료를 안 낸다면 판정 목록, 수가 모자라면 배치`;
    console.log(`  ${padr(r.name, 10)}│ ${pad(total, 12)} │ ` +
      Object.entries(tally).map(([k, n]) => `${k} ${n}`).join(' ') + `  → ${dx}`);
  }
}
if (OUT) { fs.writeFileSync(OUT, JSON.stringify({ zone: ZID, R, NEED_EACH, rows }, null, 1)); console.log(`\n  → ${OUT}`); }
console.log('');
process.exit(0);   // ★zone.js 를 조용히 적재하면 HTTP 서버가 같이 뜬다 — 계측기는 스스로 내려간다
