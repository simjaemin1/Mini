#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1187 이름 표 기계 · 세계 안 만짐 · 판정 0)
// === scripts/t1187-names.js — 마을 이름 표(한반도 · 닛폰 후보 전부) ===
//   node scripts/t1187-names.js [--seeded] [--json <파일>] [--md <파일>]
//   이름 = `server/village-names.js` 정본(시딩이 부르는 그 함수 · 사본 0) · 자원권 반경 = villages `LAND_SCAN_R`.
//   --seeded: 정본 자리 고르기(`pickSeedVillages` — 시딩이 부르는 그 함수 · farm-metrics 와 같은 지형 어댑터)로 그 존에 실제로 서는 칸을 표시한다.
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
const N = R('server/village-names');
const TJ = R('server/hanbando-terrain.json');
const Villages = R('server/villages');
const SCAN_R = Villages.LAND_SCAN_R;   // villages 정본(내보냄 · T135)
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
function seededSet(Z) {
  const { ZONES } = R('server/zone-config');
  const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
  const P = Villages.__labProbe, ZONE = ZONES[Z], SZ = P.SZ;
  P.setZoneId(Z);
  const _in = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
  const isWater = (x, y) => { if (ZONE.isOcean) return true; if (!_in(x, y)) return false; const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ); try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; } };
  const isRock = (x, y) => { if (!_in(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
  const ta = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal: (x, y) => (!_in(x, y)) ? true : (isRock(x, y) || isWater(x, y)), isWaterTileLocal: isWater });
  const hard = T.siteCandidates ? T.siteCandidates(Z) : (T.getZoneVillages(Z) || []);
  const picked = P.pickSeedVillages(hard, ta, { seedAll: !!ZONE.seedAllVillages, max: ZONE.villageMax || 0 });
  return new Set(picked.map((h) => h.name));
}
const out = { scanR: SCAN_R, zones: {} };
for (const Z of ['hanbando', 'nippon']) {
  const rows = N.nameZone(Z, TJ[Z], SCAN_R);
  let seeded = null;
  if (process.argv.includes('--seeded')) { const _l = console.log; console.log = () => {}; try { seeded = seededSet(Z); } finally { console.log = _l; } }
  for (const r of rows) r.seeded = seeded ? seeded.has(r.old) : null;
  const names = rows.map((r) => r.name), featNames = new Set();
  for (const k of ['rivers', 'ridges', 'lakes', 'forests', 'valleys', 'passes']) for (const f of (TJ[Z][k] || [])) featNames.add(f.name);
  out.zones[Z] = { n: rows.length, seeded: seeded ? seeded.size : null, uniq: new Set(names).size, clashFeature: names.filter((n) => featNames.has(n)).length,
    inRange: rows.filter((r) => r.inRange).length, pre: rows.filter((r) => r.pre).length, kept: rows.filter((r) => r.name === r.old).length, rows };
}
const md = [];
for (const [Z, o] of Object.entries(out.zones)) {
  md.push(`### ${Z === 'nippon' ? '닛폰' : '한반도'} — 후보 ${o.n}${o.seeded != null ? ` · 시딩 ${o.seeded}` : ''} · 겹침 ${o.n - o.uniq} · 지형 이름과 같음 ${o.clashFeature} · 자원권(${SCAN_R}칸) 안 지형 딴 이름 ${o.inRange} · 앞붙이 ${o.pre}`);
  md.push('');
  md.push('| 옛 이름 | 새 이름 | 갈래 | 뜻(줄기 + 꼬리) | 근거 지형 | 거리(칸) | 시딩 |');
  md.push('|---|---|---|---|---|---:|---|');
  for (const r of o.rows) md.push(`| ${r.old} | **${r.name}** | ${r.type} | ${r.mean} | ${r.feature ? r.feature + '(' + r.kind + ')' : '—'} | ${r.distCells != null ? r.distCells + (r.inRange ? '' : ' ⚠자원권 밖') : '—'} | ${r.seeded == null ? '—' : r.seeded ? '○' : '·'} |`);
  md.push('');
}
const J = arg('--json'), M = arg('--md');
if (J) fs.writeFileSync(J, JSON.stringify(out, null, 1));
if (M) fs.writeFileSync(M, md.join('\n'));
for (const [Z, o] of Object.entries(out.zones)) console.log(Z, JSON.stringify({ n: o.n, seeded: o.seeded, uniq: o.uniq, clashFeature: o.clashFeature, inRange: o.inRange, pre: o.pre, kept: o.kept }));
if (!M) console.log(md.join('\n'));
