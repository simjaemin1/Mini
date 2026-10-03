#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T574 표 짜는 기계)
// =============================================================================
// T574 — 경계 넘는 **꼬리**의 크기 표(추신2 ②): L(꼬리 길이 · 셀)마다
//   ⓐ 한반도 동쪽 끝 · 가운데 · 서쪽 끝에서 **닛폰 고유 품목**(광종)의 몫(%) · ⓑ 닛폰 서쪽 끝 · 가운데 · 동쪽 끝에서 **한반도 고유 품목**의 몫(대칭)
//   ⓒ 두 존 뭍 가운데 이웃 고유 몫이 1% 넘는 땅(%) · 뭍 평균 이웃 고유 몫 · ⓓ 이웃 고유 몫 ≥ 1% 인 마을(후보 · 값)
//   (관측 전용 · 세계 무변 · 새 수 0 — L 셋 250·500·1000 은 추신2 가 준 것 · s₀ 는 `region-profiles` 기본 0.5)
//
//   몫 = `region-profiles.mixAt('ore', …)` 의 이웃 고유 품목 몫 그대로(뽑기·굽기가 쓰는 그 함수 · 사본 0).
//   뭍 = T524 의 뜻 그대로 — 실셀(32px) 종류: 바다 띠(`chunk.generateCoastlineWaterTiles`) · 민물(`isWaterCellLocal`) ·
//        바위(`isRockCellLocal`) · 나머지 = 뭍(같은 세 술어를 같은 차례로 부른다).
//   마을 = 정본 후보(`terrain.getZoneVillages` — 한반도 51 · 닛폰 16) · `--seeds <dir>`(t525 시드 캐시 `seeds-<존>.json`)가 있으면 시딩 마을도.
//
// 쓰는 법: node scripts/t574-band-table.js [--out f.json] [--grid <dir>] [--seeds <dir>]
//   --grid <dir> : 그림용 낮춘 격자(8셀 칸 · 뭍 셀 수 · 섞이는 경계까지 거리)를 존마다 <dir>/<존>.grid.json 으로
// =============================================================================
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t574-band-${process.pid}.db`;
const path = require('path');
const fs = require('fs');
const R = (p) => require(path.join(__dirname, '..', p));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('--out', null), GRID = arg('--grid', null), SEEDS = arg('--seeds', null);

const { ZONES, findZoneAt } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const RP = R('server/region-profiles');
const SZ = 32;
const LS = [250, 500, 1000];
const ZS = Object.keys(RP.COLS);
const OTHER = { hanbando: 'nippon', nippon: 'hanbando' };
const OR = Object.values(ZONES).filter((z) => z.isOcean).map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }));
const say = (s) => process.stdout.write(s + '\n');
const pct = (v, d = 2) => (v * 100).toFixed(d);
// 그 자리의 이웃 고유 품목 몫(광종) — mixAt 그대로
function tailShare(Z, x, y, Lc) {
  const m = RP.mixAt('ore', Z, x, y, null, null, Lc);
  if (!m) return { tot: 0, by: {} };
  const uq = RP.uniqueOf('ore', OTHER[Z], Z), by = {}; let tot = 0;
  for (const k of uq) { const v = m.p[k] || 0; by[k] = v; tot += v; }
  return { tot, by };
}

const res = { L: LS, s0: RP.S0(), zones: {} };
// ── ⓐⓑ 끝·가운데·끝 — 존 가운데 줄(y = H/2)에서
say(`## ⓐⓑ 이웃 고유 품목(광종)의 몫 — s₀ ${RP.S0()} · 줄 = 존 높이 가운데`);
say('| L(셀) | 한반도 동쪽 끝 | 한반도 가운데 | 한반도 서쪽 끝 | 닛폰 서쪽 끝 | 닛폰 가운데 | 닛폰 동쪽 끝 |');
say('|---:|---:|---:|---:|---:|---:|---:|');
res.ends = [];
for (const Lc of LS) {
  const H = ZONES.hanbando, N = ZONES.nippon;
  const hy = H.zoneHeight / 2, ny = N.zoneHeight / 2;
  const hE = tailShare('hanbando', H.zoneWidth - SZ / 2, hy, Lc), hM = tailShare('hanbando', H.zoneWidth / 2, hy, Lc), hW = tailShare('hanbando', SZ / 2, hy, Lc);
  const nW = tailShare('nippon', SZ / 2, ny, Lc), nM = tailShare('nippon', N.zoneWidth / 2, ny, Lc), nE = tailShare('nippon', N.zoneWidth - SZ / 2, ny, Lc);
  const row = { L: Lc, hb: { east: hE, mid: hM, west: hW }, np: { west: nW, mid: nM, east: nE } };
  res.ends.push(row);
  const f = (t) => `${pct(t.tot)}%(${Object.entries(t.by).map(([k, v]) => k + ' ' + pct(v)).join(' · ')})`;
  say(`| ${Lc} | ${f(hE)} | ${f(hM)} | ${f(hW)} | ${f(nW)} | ${f(nM)} | ${f(nE)} |`);
}

// ── ⓒⓓ 뭍 · 마을
for (const Z of ZS) {
  const ZONE = ZONES[Z]; if (!ZONE) { say('모르는 존 ' + Z); continue; }
  const t0 = Date.now();
  const BAND = R('server/chunk').generateCoastlineWaterTiles({ ...ZONE, id: Z }, SZ, findZoneAt, OR);
  const NX = Math.floor(ZONE.zoneWidth / SZ), NY = Math.floor(ZONE.zoneHeight / SZ);
  let land = 0, rock = 0, fresh = 0, sea = 0;
  const over1 = LS.map(() => 0), mass = LS.map(() => 0);
  const G = 8, GX = Math.ceil(NX / G), GY = Math.ceil(NY / G);
  const gl = GRID ? new Uint16Array(GX * GY) : null, gd = GRID ? new Float32Array(GX * GY).fill(Infinity) : null;
  // 이웃 고유 몫은 경계까지 거리 d 만의 함수다(이웃이 한 존) — d(셀 정수) → 몫 표를 L 마다 한 번 만든다
  const maxD = Math.ceil(Math.max(NX, NY)) + 2;
  const tab = LS.map((Lc) => { const a = new Float64Array(maxD); for (let d = 0; d < maxD; d++) a[d] = NaN; return a; });
  for (let cy = 0; cy < NY; cy++) for (let cx = 0; cx < NX; cx++) {
    const x = cx * SZ + SZ / 2, y = cy * SZ + SZ / 2;
    let k;
    if (BAND.has(cx + '_' + cy)) k = 2; else if (T.isWaterCellLocal(Z, x, y)) k = 3; else if (T.isRockCellLocal(Z, x, y)) k = 4; else k = 1;
    if (k === 2) sea++; else if (k === 3) fresh++; else if (k === 4) rock++; else land++;
    const d = RP.borderDistCells(Z, x, y);
    if (gl) { const gi = ((cy / G) | 0) * GX + ((cx / G) | 0); if (k === 1) gl[gi]++; if (d < gd[gi]) gd[gi] = d; }
    if (k !== 1 || !isFinite(d)) continue;
    const di = Math.floor(d);
    for (let i = 0; i < LS.length; i++) {
      let s = tab[i][di];
      if (s !== s) { s = tab[i][di] = tailShare(Z, x, y, LS[i]).tot; }   // 같은 거리 칸이면 같은 몫(이웃 하나 · 셀 가운데)
      mass[i] += s; if (s >= 0.01) over1[i]++;
    }
  }
  const vil = (T.getZoneVillages(Z) || []).map((v) => ({ name: v.name, x: v.x, y: v.y, d: RP.borderDistCells(Z, v.x, v.y) }));
  let seeded = null;
  if (SEEDS) { try { const s = JSON.parse(fs.readFileSync(path.join(SEEDS, `seeds-${Z}.json`), 'utf8')); seeded = s.map((v) => ({ name: v.name, x: v.ccx * SZ + SZ / 2, y: v.ccy * SZ + SZ / 2 })); } catch (e) { seeded = null; } }
  const row = {
    cells: NX * NY, land, rock, fresh, sea, nx: NX, ny: NY, ms: Date.now() - t0,
    byL: LS.map((Lc, i) => {
      const vs = vil.map((v) => ({ name: v.name, s: tailShare(Z, v.x, v.y, Lc).tot })).filter((v) => v.s >= 0.01).sort((a, b) => b.s - a.s);
      const ss = seeded ? seeded.map((v) => ({ name: v.name, s: tailShare(Z, v.x, v.y, Lc).tot })).filter((v) => v.s >= 0.01) : null;
      return { L: Lc, over1Land: over1[i], over1Pct: +(over1[i] / land * 100).toFixed(2), meanPct: +(mass[i] / land * 100).toFixed(3),
        villages: vs.map((v) => `${v.name}(${pct(v.s, 1)}%)`), seeded: ss ? ss.map((v) => `${v.name}(${pct(v.s, 1)}%)`) : null };
    }),
    villagesTotal: vil.length, seededTotal: seeded ? seeded.length : null,
  };
  res.zones[Z] = row;
  if (GRID) { fs.mkdirSync(GRID, { recursive: true }); fs.writeFileSync(path.join(GRID, Z + '.grid.json'), JSON.stringify({ zone: Z, G, GX, GY, NX, NY, land: Array.from(gl), dist: Array.from(gd, (v) => (isFinite(v) ? +v.toFixed(1) : -1)) })); }
  say(`\n${Z}: 셀 ${row.cells.toLocaleString()} · 뭍 ${land.toLocaleString()} · 바위 ${rock.toLocaleString()} · 민물 ${fresh.toLocaleString()} · 바다 띠 ${sea.toLocaleString()} · ${(row.ms / 1000).toFixed(0)}초`);
}
say('\n## ⓒⓓ 뭍 · 마을 — 이웃 고유 품목 몫 ≥ 1% 인 땅 · 뭍 평균 몫 · 그런 마을(후보)');
say('| L(셀) | 한반도 뭍 중 ≥1% · 평균 | 닛폰 뭍 중 ≥1% · 평균 | **두 존 뭍 중 ≥1%** | ≥1% 마을(한반도 + 닛폰 / 후보 67) |');
say('|---:|---|---|---:|---|');
const Hz = res.zones.hanbando, Nz = res.zones.nippon;
res.both = [];
LS.forEach((Lc, i) => {
  const a = Hz.byL[i], b = Nz.byL[i];
  const bothPct = +((a.over1Land + b.over1Land) / (Hz.land + Nz.land) * 100).toFixed(2);
  res.both.push({ L: Lc, bothPct, villages: a.villages.length + b.villages.length });
  say(`| ${Lc} | ${a.over1Pct}% · ${a.meanPct}% | ${b.over1Pct}% · ${b.meanPct}% | **${bothPct}%** | ${a.villages.length} + ${b.villages.length} = **${a.villages.length + b.villages.length}** / ${Hz.villagesTotal + Nz.villagesTotal} |`);
});
say('');
for (const Z of ZS) for (const r of res.zones[Z].byL) say(`  ${Z} L ${r.L}: ${r.villages.join(' · ') || '없음'}` + (r.seeded ? ` | 시딩 ${r.seeded.join(' · ') || '없음'}` : ''));
if (OUT) { fs.writeFileSync(OUT, JSON.stringify(res, null, 1)); say('→ ' + OUT); }
