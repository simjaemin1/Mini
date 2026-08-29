#!/usr/bin/env node
// === scripts/plan-village-forage.js — 마을 어귀 채집 군락 배치 [재민 확정 2026-08-29] ====
//
// ★[감사 → 처방] `scripts/audit-village-forage.js` 가 도보 15초 안에 시작 재료가 없는 마을을 잡는다.
//   재민 판정: **의도된 마찰이 아니라 배산임수 캐논 위반**이다 — 마을은 물가와 숲 옆에 선다.
//   처방은 **스캐터가 아니라**(기각) 마을 인근 **자연물 배치 보정**이다.
//
// ★심는 것은 **이미 있는 개체 종류 셋**뿐이다(새 스프라이트·새 지형장 0):
//     덤불 `berry_bush` → 풀 + 잔가지 + 열매      (부족: 풀)
//     바위 `rock`       → 석재 + 자갈             (부족: 자갈)
//     웅덩이 `water_pool` → 식수(E 로 마심 · hp 안 깎임)  (부족: 식수)
//
// ★배치 캐논 (전부 지킨다)
//   · **광장 말고 어귀 바깥 링** — 안쪽 700px(21.9셀) ~ 바깥 840px(26.3셀).
//     마을 기하 정본(`village-layout.js`)의 골목 반경 12.5셀·회관 여유 16.5셀 **밖**이고,
//     감사 기준 반경 960px **안**이다. 링을 넓히면 기준을 못 넘고, 좁히면 마당을 침범한다.
//   · **균일 간격 금지** — 군락은 극좌표 `r·√u` 로 흩는다(중심 촘촘·가장자리 성김). 실체화는 `chunk.js`.
//   · **소품 밀도 낮게** — 부족한 재료당 군락 **하나**, 점 **3개**(기준 2 + 여유 1). 웅덩이는 1개.
//   · **지형 정합** — 자갈(바위)은 **물가·들에만**(숲 한복판 금지) · 웅덩이는 **물이 먼 곳에만**(있는데 또 파지 않는다) ·
//     덤불은 들·숲 가장자리(물 위 금지).
//   · **회귀 장면 보호** — `e2e-nature`·`e2e-terrain` 이 셀 (1490,2477)·(965,1919) 두 자리를
//     "물 127/뭍 162"·"순수 초원(물 0)" 반례로 박아 뒀다. 그 둘 반경 900px 안에는 아무것도 안 심는다.
//
// ★데이터 손편집 금지 — 이 스크립트가 `server/<zone>-terrain.json` 의 `groves` 를 통째로 다시 쓴다
//   (`--apply`). 다시 돌리면 같은 결과가 나온다(결정론 · 재현 가능).
//
// 실행: node scripts/plan-village-forage.js [--zone hanbando] [--apply]
'use strict';
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const ZID = val('--zone', 'hanbando');
const APPLY = has('--apply');

const ROOT = path.join(__dirname, '..');
process.env.ZONE_ID = process.env.ZONE_ID || ZID;
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const T = require(path.join(ROOT, 'server', 'terrain'));
if (T.setZonesMeta) T.setZonesMeta(ZONES);
const F = require(path.join(ROOT, 'server', 'forage'));
const CH = require(path.join(ROOT, 'server', 'chunk'));

const GAMEJSON = path.join(ROOT, 'server', ZID + '-terrain.json');
const doc = JSON.parse(fs.readFileSync(GAMEJSON, 'utf8'));
const d = doc[ZID];

const CELL = 32;
const MOVE_SPEED = 64;
const WALK_SEC = parseFloat(process.env.AUDIT_WALK_SEC || '15');
const R_AUDIT = Math.round(MOVE_SPEED * WALK_SEC);      // 960
const RING_IN = 700, RING_OUT = 840;   // ★바깥 840 + 군락 반경 110 = 950 < 감사 반경 960 — 군락이 통째로 기준 안에 든다
const NEED_EACH = 2, GROVE_N = 3, GROVE_R = 110;
const KINDS = ['twig', 'pebble', 'fiber'];
const KO = { twig: '잔가지', pebble: '자갈', fiber: '풀' };
const KIND_ENT = { pebble: 'rock', fiber: 'berry_bush', twig: 'berry_bush' };
const ENT_KO = { rock: '자갈밭', berry_bush: '덤불', water_pool: '둠벙' };
// 회귀 장면 보호구 — e2e-nature · e2e-terrain 이 반례로 박아 둔 두 자리
const SCENE_GUARD = [[1490, 2477], [965, 1919]].map(([cx, cy]) => [cx * 32 + 16, cy * 32 + 16]);
const GUARD_R = 900;

const ctx = {
  forestMult: (x, y) => T.getForestMultiplier(ZID, x, y),
  isRock: (x, y) => T.isRockCellLocal(ZID, x, y),
  isWater: (x, y) => T.isWaterCellLocal(ZID, x, y),
};
const padr = (s, n) => { s = String(s); let w = 0; for (const c of s) w += (c.charCodeAt(0) > 0x2000 ? 2 : 1); return s + ' '.repeat(Math.max(0, n - w)); };

// ── 지금 상태를 잰다 — 감사와 **같은 셈**(사본이 아니라 같은 정본 호출) ────────
const _cc = new Map();
const chunkList = (cx, cy) => {
  const k = cx + ',' + cy; let v = _cc.get(k);
  if (!v) { try { v = CH.generateChunkResources(ZID, ZONES[ZID].biome, cx, cy, CH.CHUNK_SIZE, null) || []; } catch (e) { v = []; } _cc.set(k, v); }
  return v;
};
const ENT_GIVES = { tree: ['twig'], rock: ['pebble'], berry_bush: ['twig', 'fiber'] };
function measure(v) {
  const cnt = { twig: 0, pebble: 0, fiber: 0 };
  for (let dy = -R_AUDIT; dy <= R_AUDIT; dy += CELL) for (let dx = -R_AUDIT; dx <= R_AUDIT; dx += CELL) {
    if (Math.hypot(dx, dy) > R_AUDIT) continue;
    const x = v.x + dx, y = v.y + dy;
    if (ctx.isWater(x, y) || ctx.isRock(x, y)) continue;
    const s = F.sourceAt(x, y, ctx);
    if (s) cnt[s.kind]++;
  }
  let water = Infinity;
  const CS = CH.CHUNK_SIZE;
  for (let cy = Math.floor((v.y - R_AUDIT) / CS); cy <= Math.floor((v.y + R_AUDIT) / CS); cy++)
    for (let cx = Math.floor((v.x - R_AUDIT) / CS); cx <= Math.floor((v.x + R_AUDIT) / CS); cx++)
      for (const e of chunkList(cx, cy)) {
        const dd = Math.hypot(e.x - v.x, e.y - v.y);
        if (dd > R_AUDIT) continue;
        if (e.type === 'water_pool') { water = Math.min(water, dd); continue; }
        for (const k of (ENT_GIVES[e.type] || [])) cnt[k]++;
      }
  if (!Number.isFinite(water)) {
    for (let r = CELL; r <= R_AUDIT && !Number.isFinite(water); r += CELL)
      for (let a = 0; a < 48; a++) { const th = a * Math.PI / 24; if (ctx.isWater(v.x + Math.cos(th) * r, v.y + Math.sin(th) * r)) { water = r; break; } }
  }
  return { cnt, water };
}

// ── 군락 자리 고르기 ────────────────────────────────────────────────────────
//   결정론: 마을 이름 해시로 시작 각도를 정하고 링을 한 바퀴 돈다(마을마다 다른 방향).
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
function fits(kind, x, y, relaxForest) {
  if (ctx.isWater(x, y) || ctx.isRock(x, y)) return false;
  for (const [gx, gy] of SCENE_GUARD) if (Math.hypot(x - gx, y - gy) < GUARD_R) return false;
  // ★지형 정합
  if (kind === 'rock') {
    // 자갈은 **물가·들에만** — 숲 한복판에 자갈밭을 두지 않는다.
    // ⚠단 임업 마을 6곳은 반경 960px 이 **전부 숲**이라(실측: 임업3 은 2,821/2,821 칸이 숲) 들이 아예 없다.
    //   그 여섯에만 완화한다 — 숲이 가장 성긴 자리에 **너덜겅**으로 놓는다(산기슭 화강암 노두는 고증에 맞다).
    //   ★이건 규칙을 조용히 어긴 게 아니라 **예외를 보고하는 것**이다 — 보고서·회부에 그대로 적는다.
    if (!relaxForest && ctx.forestMult(x, y) > 1.5) return false;
  } else if (kind === 'water_pool') {
    // 둠벙은 물이 이미 가까우면 안 판다 — 반경 안에 물 셀이 있으면 기각
    for (let r = CELL; r <= 480; r += CELL * 2)
      for (let a = 0; a < 24; a++) { const th = a * Math.PI / 12; if (ctx.isWater(x + Math.cos(th) * r, y + Math.sin(th) * r)) return false; }
  }
  // 군락이 통째로 물/바위에 잠기지 않게 — 반경 안 표본 절반 이상이 설 수 있어야
  let good = 0, tot = 0;
  for (let a = 0; a < 8; a++) { const th = a * Math.PI / 4, px = x + Math.cos(th) * GROVE_R * 0.7, py = y + Math.sin(th) * GROVE_R * 0.7;
    tot++; if (!ctx.isWater(px, py) && !ctx.isRock(px, py)) good++; }
  return good / tot >= 0.6;
}
function pickSite(v, kind, taken) {
  const a0 = hash(v.name + kind) * Math.PI * 2;
  for (const relax of [false, true]) {              // ★엄격 먼저, 자리가 없을 때만 완화(그리고 표시한다)
    if (relax && kind !== 'rock') break;
    let best = null;
    for (let ri = 0; ri < 5; ri++) {
      const rr = RING_OUT - (RING_OUT - RING_IN) * (ri / 4);      // 바깥부터 — 마당에서 멀수록 좋다
      for (let ai = 0; ai < 24; ai++) {
        const th = a0 + (ai % 2 ? 1 : -1) * Math.ceil(ai / 2) * (Math.PI / 12);
        const x = v.x + Math.cos(th) * rr, y = v.y + Math.sin(th) * rr;
        if (!fits(kind, x, y, relax)) continue;
        if (taken.some((t) => Math.hypot(t[0] - x, t[1] - y) < GROVE_R * 2.2)) continue;   // 군락끼리 겹치지 않게
        if (!relax) return [Math.round(x), Math.round(y), Math.round(rr), false];
        const fm = ctx.forestMult(x, y);            // 완화 모드: **숲이 가장 성긴 자리**를 고른다
        if (!best || fm < best[4]) best = [Math.round(x), Math.round(y), Math.round(rr), true, fm];
      }
    }
    if (best) return best;
  }
  return null;
}

// ── 실행 ────────────────────────────────────────────────────────────────────
const villages = T.getZoneVillages(ZID) || [];
console.log(`\n=== 마을 어귀 채집 군락 배치 · ${ZID} · 마을 ${villages.length}곳 ===`);
console.log(`  링 ${RING_IN}~${RING_OUT}px(감사 반경 ${R_AUDIT}px 안 · 골목 400px·회관 여유 528px 밖) · 군락 반경 ${GROVE_R}px · 점 ${GROVE_N}개`);
console.log(`  회귀 장면 보호구 ${SCENE_GUARD.length}곳 반경 ${GUARD_R}px (e2e-nature·e2e-terrain 반례 자리)\n`);

const groves = [];
const taken = [];
const report = [];
for (const v of villages) {
  const m = measure(v);
  const need = KINDS.filter((k) => m.cnt[k] < NEED_EACH);
  const needWater = !(m.water <= R_AUDIT);
  if (!need.length && !needWater) continue;
  const made = [];
  // 잔가지·풀은 덤불 하나로 같이 채워진다 — 군락을 두 번 심지 않는다(밀도 낮게)
  const wantEnt = new Set(need.map((k) => KIND_ENT[k]));
  for (const ent of wantEnt) {
    const site = pickSite(v, ent, taken);
    if (!site) { made.push(`${ENT_KO[ent]}✗자리없음`); continue; }
    taken.push(site);
    const nm = site[3] ? `${v.name} 너덜겅` : `${v.name} ${ENT_KO[ent]}`;
    groves.push({ name: nm, vil: v.name, kind: ent, center: [site[0], site[1]], r: GROVE_R, n: GROVE_N,
                  ...(site[3] ? { forestException: true } : {}) });
    made.push(`${site[3] ? '너덜겅(숲예외)' : ENT_KO[ent]}@${site[2]}px`);
  }
  if (needWater) {
    const site = pickSite(v, 'water_pool', taken);
    if (!site) made.push('둠벙✗자리없음');
    else {
      taken.push(site);
      groves.push({ name: `${v.name} 둠벙`, vil: v.name, kind: 'water_pool',
                    center: [site[0], site[1]], r: 40, n: 1 });
      made.push(`둠벙@${site[2]}px`);
    }
  }
  report.push({ v, need, needWater, made, m });
}
console.log(`  ${padr('마을', 10)}│ ${padr('부족', 22)}│ 심은 것`);
for (const r of report) {
  console.log(`  ${padr(r.v.name, 10)}│ ${padr(r.need.map((k) => `${KO[k]}(${r.m.cnt[k]})`).join(' ') + (r.needWater ? ' 식수' : ''), 22)}│ ${r.made.join(' · ')}`);
}
const byKind = {};
for (const g of groves) byKind[g.kind] = (byKind[g.kind] || 0) + 1;
console.log(`\n── 군락 ${groves.length}개 · ` + Object.entries(byKind).map(([k, n]) => `${ENT_KO[k]} ${n}`).join(' · ') +
            ` · 개체 총 ${groves.reduce((a, g) => a + g.n, 0)}개 (지도 전역 자연물 대비 무시 가능한 밀도)`);
if (APPLY) {
  d.groves = groves;
  fs.writeFileSync(GAMEJSON, JSON.stringify(doc));
  console.log(`  → 적용: ${path.relative(ROOT, GAMEJSON)} 의 groves = ${groves.length}개`);
} else {
  console.log('  (미적용 — 쓰려면 --apply)');
}
console.log('');
