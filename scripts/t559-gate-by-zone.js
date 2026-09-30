#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T559 ③ 표 기계 · 판정 0)
// =============================================================================
// T559 — 광산 게이트 K = 0.278025(재민 #78) + 간격 존별 유도(후보 최근접 p80) — **세 존 선별 표**.
//   정본 `pickSeedVillages` 를 자식에서 **그대로** 부른다(`t436-gate-trade.js` 문법 · 사본 0): 팔마다 env 만 다르다.
//     종전     — `T436_GATE_TRADE=0`(T559 전 그대로)
//     K만      — K 0.278025 · 게이트 켬 · 간격 12,000 = **T559 기본**
//     간격유도 — 위 + `T559_SPACING_DERIVE=1`(존 후보 최근접 p80 · 기본 끔)
//   존마다: 후보 수 · 하한 통과(`_land > 0`) · 선별 수(존 상한 · 전수 존은 전수 안 탄 판도 참고로) · 그중 광산 · 간격 px · 선별 이름.
//   ⚠선별 = 시딩 전 단계다 — 실제 시딩은 뒤에서 `findOpenCenter` 가 물 위 후보를 물리로 건너뛴다(닛폰 실제 수는 `test-nippon-boot`).
//   ⚠닛폰은 **지금 지형**이다 — T550(지형) 뒤 이 자를 다시 돌린다.
//
// 쓰는 법: node scripts/t559-gate-by-zone.js [out.json]        (자식 모드: T559_CHILD=<zone>)
// =============================================================================
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t559-${process.pid}.db`;
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const R = (p) => require(path.join(__dirname, '..', p));
const ZS = ['hanbando', 'jungwon_n', 'nippon'];

if (process.env.T559_CHILD) {
  // 자식 — 지형 어댑터는 `t436-gate-trade.js` 의 setup 과 같은 꼴(존 설정 · 해안 띠 · 물·바위 술어) · 정본 선별 그대로
  const Z = process.env.T559_CHILD;
  const { ZONES, findZoneAt } = R('server/zone-config');
  const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
  const P = R('server/villages').__labProbe;
  const ZONE = ZONES[Z], SZ = P.SZ; P.setZoneId(Z);
  const _inZone = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
  const _COAST = Z !== 'hanbando';
  const BAND = _COAST ? R('server/chunk').generateCoastlineWaterTiles({ ...ZONE, id: Z }, SZ, findZoneAt,
    Object.values(ZONES).filter((z) => z.isOcean).map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }))) : null;
  const isWaterTileLocal = (x, y) => { if (!_inZone(x, y)) return false; const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
    if (BAND && BAND.has(`${tx}_${ty}`)) return true; try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; } };
  const isRockTileLocal = (x, y) => { if (!_inZone(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
  const ta = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal: (x, y) => !_inZone(x, y) || isRockTileLocal(x, y) || isWaterTileLocal(x, y), isWaterTileLocal });
  const cands = T.siteCandidates(Z) || [];
  const _log = console.log; console.log = () => {};
  const sc = [], sp = {};
  const seedAll = !!ZONE.seedAllVillages;
  const real = P.pickSeedVillages(cands, ta, { seedAll, max: ZONE.villageMax || 0, _scoredOut: sc, _spacingOut: sp });
  const sc2 = [], sp2 = {};
  const gated = seedAll ? P.pickSeedVillages(cands, ta, { seedAll: false, max: 0, _scoredOut: sc2, _spacingOut: sp2 }) : real;   // 전수 존: 게이트 탄 판(참고)
  console.log = _log;
  const S = seedAll ? sc2 : sc;
  process.stdout.write('\n@@' + JSON.stringify({ Z, seedAll, cands: cands.length, pass: S.filter((v) => v._land > 0).length, K: P.T436_K,
    spacing: (seedAll ? sp2 : sp).px || null, real: real.map((v) => v.name), gated: gated.map((v) => v.name), mineGated: gated.filter((v) => v.type === 'mining').map((v) => v.name) }) + '\n');
  process.exit(0);
}

const ARMS = [
  ['종전', { T436_GATE_TRADE: '0' }],
  ['K만', {}],                                  // ★T559 기본(K 0.278025 · 게이트 켬 · 간격 12,000)
  ['간격유도', { T559_SPACING_DERIVE: '1' }],     // 식을 켠 판(기본 끔 · 보고 ②)
];
const OUT = process.argv[2] || '/tmp/t559/gate.json';
const child = (Z, env) => {
  const e = { ...process.env, ...env, T559_CHILD: Z }; for (const k of ['T436_GATE_TRADE', 'T559_SPACING_PX', 'T559_SPACING_DERIVE', 'T436_K_OVERRIDE']) if (!(k in env)) delete e[k];
  const s = execFileSync(process.execPath, [__filename], { env: e, maxBuffer: 64 << 20 }).toString();
  return JSON.parse(s.slice(s.lastIndexOf('\n@@') + 3));
};
const res = {};
for (const [arm, env] of ARMS) { res[arm] = {}; for (const Z of ZS) res[arm][Z] = child(Z, env); }
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
console.log('\n[T559 ③] 세 존 선별 — 게이트 K · 간격(선별 = 시딩 전 · 실제 시딩은 물 위 후보를 건너뛴다)\n');
console.log('| 팔 | 존 | K | 간격 px | 후보 | 하한 통과 | 선별(게이트 탄 판) | 그중 광산 | 실제 선별 |');
console.log('|---|---|---:|---:|---:|---:|---:|---|---:|');
for (const [arm] of ARMS) for (const Z of ZS) { const r = res[arm][Z];
  console.log(`| ${arm} | ${Z} | ${r.K} | ${r.spacing != null ? Math.round(r.spacing).toLocaleString() : '—'} | ${r.cands} | ${r.pass} | ${r.gated.length} | ${r.mineGated.join('·') || '0'} | ${r.real.length}${r.seedAll ? '(전수)' : ''} |`); }
// 팔 사이 선별 이름 차
console.log('');
for (const Z of ZS) { const a = new Set(res['종전'][Z].gated), b = new Set(res['간격유도'][Z].gated), k = new Set(res['K만'][Z].gated);
  const d = (x, y) => [...y].filter((n) => !x.has(n));
  console.log(`  ${Z}: 종전→K만 +[${d(a, k).join(',')}] −[${d(k, a).join(',')}] · K만→간격유도 +[${d(k, b).join(',')}] −[${d(b, k).join(',')}]`); }
console.log('\n→', OUT);
