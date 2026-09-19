#!/usr/bin/env node
// === scripts/t309-chunk-boundary-audit.js — 청크 경계 감사 (계측 · 러너 밖 · 제품 0) ===
//
// ★왜 [지시 T309 ① · T301 ⓘ]
//   T301 이 잡았다: **청크는 자기 밖에도 낳는다**(숲 그리드 지터가 경계를 넘는다 —
//   실측 `ft1020_0` @ x=1032.5 는 청크 (1,0) 땅인데 청크 (0,0) 이 낳는다).
//   그러면 "청크 경계로 가르거나 거르는" 코드마다 같은 결함이 있을 수 있다.
//   이 자는 **수를 낸다**: 얼마나 넘치나 · 어느 방향으로 · 무엇이.
//
// ⚠고치지 않는다. 표만 낸다(카드 규약 — 코드 0).
'use strict';
process.env.ZONE_ID = process.env.ZONE_ID || 'hanbando';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
const CH = R('server/chunk');
const { ZONES } = R('server/zone-config');
const T = R('server/terrain');
const Z = 'hanbando', ZONE = ZONES[Z], CS = CH.CHUNK_SIZE;

const W = Math.floor(ZONE.zoneWidth / CS), H = Math.floor(ZONE.zoneHeight / CS);
const N = parseInt(process.env.T309_N || '400', 10);

// 숲·들판이 섞이게 성기게 훑는다(빈 들판만 보면 숲 그리드를 한 번도 안 밟는다 — T301 의 교훈)
const chunks = [];
for (let cy = 0; cy < H && chunks.length < N; cy++)
  for (let cx = 0; cx < W && chunks.length < N; cx++)
    if (((cx * 7 + cy * 13) % 5) === 0) chunks.push([cx, cy]);

let ents = 0, over = 0, forest = 0, plain = 0;
const byDir = { E: 0, S: 0, SE: 0 };
const byType = {};
let maxOver = 0, sample = null;
for (const [cx, cy] of chunks) {
  const list = CH.generateChunkResources(Z, ZONE.biome, cx, cy, CS, null, undefined);
  const isF = T.getForestMultiplier(Z, cx * CS + CS / 2, cy * CS + CS / 2) > 1.5;
  if (isF) forest++; else plain++;
  for (const e of list) {
    ents++;
    const ox = Math.floor(e.x / CS) !== cx, oy = Math.floor(e.y / CS) !== cy;
    if (!ox && !oy) continue;
    over++;
    byDir[ox && oy ? 'SE' : (ox ? 'E' : 'S')]++;
    byType[e.type] = (byType[e.type] || 0) + 1;
    const d = Math.max(ox ? e.x - (cx + 1) * CS : 0, oy ? e.y - (cy + 1) * CS : 0);
    if (d > maxOver) { maxOver = d; sample = `${e.seedKey} @ ${e.x.toFixed(1)},${e.y.toFixed(1)} (청크 ${cx},${cy})`; }
  }
}
console.log(`\n=== T309 ⓐ 청크 경계 넘침 — 청크 ${chunks.length}개(숲 ${forest} · 들 ${plain}) ===`);
console.log(`  개체 ${ents.toLocaleString()} · 제 청크 밖 **${over.toLocaleString()}** (${(over / ents * 100).toFixed(2)}%)`);
console.log(`  방향: 동 ${byDir.E} · 남 ${byDir.S} · 동남 ${byDir.SE}   (서·북으로는 안 넘친다 — 격자가 0 에서 시작하므로)`);
console.log(`  종류: ${Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(' · ') || '(없음)'}`);
console.log(`  최대 넘침 ${maxOver.toFixed(1)}px (격자 간격 상한 96px 안) · 표본 ${sample || '-'}`);

// 넘침이 실제로 "사라질 수 있나" — 이웃 청크가 그 개체를 스스로 낳나 본다(안 낳으면 관측자 의존)
{
  let checked = 0, regen = 0, orphan = 0;
  for (const [cx, cy] of chunks.slice(0, 60)) {
    const list = CH.generateChunkResources(Z, ZONE.biome, cx, cy, CS, null, undefined);
    for (const e of list) {
      const qx = Math.floor(e.x / CS), qy = Math.floor(e.y / CS);
      if (qx === cx && qy === cy) continue;
      checked++;
      const nb = CH.generateChunkResources(Z, ZONE.biome, qx, qy, CS, null, undefined);
      if (nb.some((o) => o.id === e.id)) regen++; else orphan++;
    }
  }
  console.log(`\n  넘친 개체를 **이웃 청크가 스스로 낳나**: 검사 ${checked} · 낳는다 ${regen} · **안 낳는다 ${orphan}**`);
  console.log('  ⇒ 안 낳는 개체는 **낳은 청크가 꺼지면 사라진다** — deactivateChunk 는 그 개체가 든 **이웃 청크** 바구니에서 지운다.');
}
console.log('');
