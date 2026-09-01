#!/usr/bin/env node
// @regress
// === scripts/test-imsu.js — 임수(臨水) 판정식 + 마을 샘 회귀 [재민 확정 2026-09-01 · T14] ====
//
// 무엇을 지키나 (셋):
//   ① **판정식이 떨어질 줄 안다** — 야생 웅덩이는 임수의 증거가 아니다.
//      (종전 감사는 야생 웅덩이를 세서 강에서 10.8km 떨어진 마을을 통과시켰다 — 자명 통과.)
//   ② **심은 물은 민물이다** — 마을 샘이 바다 위(또는 반경이 바다에 걸치는 자리)에 없다.
//      T3 자염의 바다 술어와 같은 식으로 잰다. 짠물을 "샘"이라 부르면 갈증 시스템이 거짓말을 한다.
//   ③ **51마을 전수 임수 합격** · 그리고 군락 배열의 **접두 불변**(seedKey 는 배열 인덱스다).
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const ZID = process.env.ZONE_ID || 'hanbando';
process.env.ZONE_ID = ZID;

const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const T = require(path.join(ROOT, 'server', 'terrain'));
if (T.setZonesMeta) T.setZonesMeta(ZONES);
const CH = require(path.join(ROOT, 'server', 'chunk'));
const IMSUC = require(path.join(__dirname, 'imsu-core'));
const IMSU = IMSUC.create({ ZID, ZONES, terrain: T, chunk: CH });

let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log(`  ✓ ${msg}${extra ? '  — ' + extra : ''}`); } else { fail++; console.log(`  ✗ ${msg}${extra ? '  — ' + extra : ''}`); } };
const say = (s) => console.log(s);

const villages = T.getZoneVillages(ZID) || [];
const terr = T.ZONE_TERRAIN[ZID];
const groves = terr.groves || [];
const springs = groves.filter((g) => (g.kind || 'berry_bush') === 'water_pool');

say(`\n=== 임수 회귀 · ${ZID} · 마을 ${villages.length}곳 · 군락 ${groves.length}개(샘 ${springs.length}) ===`);
say(`반경 R = ${IMSU.R}px (도보 ${IMSUC.walkSec()}초)`);

// ═══ ① 판정식이 떨어질 줄 안다 ═════════════════════════════════════════════
say('\n① 판정식 — 야생 웅덩이는 임수의 증거가 아니다');
{
  // ★자명 통과 금지: 먼저 **떨어지는 상황을 만들어** 판정식이 실제로 ✗ 를 낼 수 있음을 보인다.
  //   지도 한복판의 마른 자리를 찾아(민물도 샘도 먼 곳) 거기서 판정이 ✗ 인지 본다.
  let dry = null;
  const Z = ZONES[ZID];
  for (let i = 1; i < 400 && !dry; i++) {
    const x = (Z.zoneWidth * ((i * 7919) % 977) / 977), y = (Z.zoneHeight * ((i * 104729) % 991) / 991);
    const r = IMSU.imsuOf({ x, y }, { far: 2000 });
    if (!r.ok) dry = { x, y, r };
  }
  ok(!!dry, '★판정식이 ✗ 를 낼 수 있는 자리가 지도에 있다(자명 통과 아님)',
     dry ? `(${Math.round(dry.x)},${Math.round(dry.y)}) 민물 ${Number.isFinite(dry.r.fresh) ? Math.round(dry.r.fresh) : '>2000'}px · 샘 ${Number.isFinite(dry.r.spring) ? Math.round(dry.r.spring) : '없음'}` : '');

  // 야생 웅덩이가 반경 안에 있어도 임수는 ✗ 일 수 있다 — 그 사례를 실제로 찾아 보인다.
  const CS = CH.CHUNK_SIZE;
  const cc = new Map();
  const chunkList = (cx, cy) => { const k = cx + ',' + cy; let v = cc.get(k);
    if (!v) { try { v = CH.generateChunkResources(ZID, ZONES[ZID].biome, cx, cy, CS, null) || []; } catch (e) { v = []; } cc.set(k, v); } return v; };
  function wildPoolNear(x0, y0, rad) {
    let best = Infinity;
    for (let cy = Math.floor((y0 - rad) / CS); cy <= Math.floor((y0 + rad) / CS); cy++)
      for (let cx = Math.floor((x0 - rad) / CS); cx <= Math.floor((x0 + rad) / CS); cx++)
        for (const e of chunkList(cx, cy)) {
          if (e.type !== 'water_pool') continue;
          if (String(e.seedKey || '').startsWith('gv')) continue;     // 마을 샘은 제외 — 야생만
          const d = Math.hypot(e.x - x0, e.y - y0); if (d <= rad && d < best) best = d;
        }
    return best;
  }
  // 마른 자리 근처를 훑어 "야생 웅덩이는 있는데 임수는 ✗" 인 표본을 하나 찾는다
  let witness = null;
  if (dry) {
    for (let k = 0; k < 240 && !witness; k++) {
      const th = k * 2.399963, rr = 200 + k * 90;
      const x = dry.x + Math.cos(th) * rr, y = dry.y + Math.sin(th) * rr;
      if (!IMSU.inBounds(x, y)) continue;
      const im = IMSU.imsuOf({ x, y }, { far: 1200 });
      if (im.ok) continue;
      const wp = wildPoolNear(x, y, IMSU.R);
      if (Number.isFinite(wp)) witness = { x, y, wp, im };
    }
  }
  ok(!!witness, '★"야생 웅덩이는 반경 안 · 임수는 ✗" 인 자리가 실제로 있다(판정이 웅덩이를 안 센다는 증거)',
     witness ? `야생 웅덩이 ${Math.round(witness.wp)}px · 민물 ${Number.isFinite(witness.im.fresh) ? Math.round(witness.im.fresh) : '>1200'}px` : '못 찾음');
}

// ═══ ② 심은 물은 민물이다 ═══════════════════════════════════════════════════
say('\n② 마을 샘은 민물이다 — 바다 위도, 반경이 바다에 걸치지도 않는다');
{
  let seaHit = 0, seaRing = 0, waterHit = 0;
  const bad = [];
  for (const g of springs) {
    const [x, y] = g.center, rr = g.r || 40;
    if (IMSU.isSea(x, y)) { seaHit++; bad.push(`${g.name} 중심이 바다`); continue; }
    let ring = false;
    for (let a = 0; a < 16; a++) {
      const th = a * Math.PI / 8;
      if (IMSU.isSea(x + Math.cos(th) * rr, y + Math.sin(th) * rr)) { ring = true; break; }
    }
    if (ring) { seaRing++; bad.push(`${g.name} 반경이 바다에 걸침`); }
    if (IMSU.isFresh(x, y)) waterHit++;   // 강·호수 위에 파는 건 무의미(있는데 또 판 것)
  }
  ok(seaHit === 0, `★샘 ${springs.length}개 중 **중심이 바다인 것 0개**`, seaHit ? bad.join(' · ') : '');
  ok(seaRing === 0, `★샘 반경이 바다에 걸치는 것 0개`, seaRing ? bad.join(' · ') : '');
  ok(waterHit === 0, `샘이 이미 강·호수 위인 것 0개(있는데 또 파지 않는다)`, `${waterHit}개`);
  // ★자명 통과 금지 — isSea 가 정말 무언가를 true 로 내는지 확인한다(항상 false 면 위 셋은 공짜다)
  let seaSeen = 0;
  const Z = ZONES[ZID];
  for (let i = 0; i < 4000 && seaSeen < 1; i++) {
    const x = (i * 2654435761 % Z.zoneWidth), y = (i * 40503 % Z.zoneHeight);
    if (IMSU.isSea(x, y)) seaSeen++;
  }
  ok(seaSeen > 0, '★바다 술어가 실제로 바다를 찾는다(위 판정이 공짜가 아니다)');
}

// ═══ ③ 전수 합격 + 배열 접두 불변 ═══════════════════════════════════════════
say('\n③ 51마을 전수 임수 + 군락 배열 규약');
{
  const bad = [];
  for (const v of villages) { const r = IMSU.imsuOf(v, { far: 4000 }); if (!r.ok) bad.push(`${v.name}(민물 ${Number.isFinite(r.fresh) ? Math.round(r.fresh) : '>4000'}px)`); }
  ok(bad.length === 0, `★마을 ${villages.length}곳 전수 임수 합격`, bad.length ? bad.join(' · ') : '');

  // seedKey 는 배열 인덱스다(`chunk.js` gv<gi>_<i>) — 군락을 중간에 끼우면 채집 기록이 어긋난다.
  const src = fs.readFileSync(path.join(ROOT, 'server', 'chunk.js'), 'utf8');
  ok(/const seedKey = `gv\$\{gi\}_\$\{i\}`/.test(src),
     '★seedKey 가 여전히 배열 인덱스 기반이다 — 그래서 군락은 **뒤에만** 붙일 수 있다');
  const planSrc = fs.readFileSync(path.join(__dirname, 'plan-village-forage.js'), 'utf8');
  ok(/function keepOrder\(/.test(planSrc) && /접두 검사/.test(planSrc),
     '★처방 스크립트에 순서 보존과 접두 검사가 들어 있다');
  // 마을당 샘은 최대 1개(중복 배치 방지)
  const perVil = {};
  for (const g of springs) perVil[g.vil] = (perVil[g.vil] || 0) + 1;
  const dup = Object.entries(perVil).filter(([, n]) => n > 1);
  ok(dup.length === 0, '마을당 샘은 하나뿐', dup.map(([k, n]) => `${k}×${n}`).join(' '));
}

say(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
process.exit(fail ? 1 : 0);
