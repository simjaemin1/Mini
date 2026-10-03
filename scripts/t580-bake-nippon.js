#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T580 ③ 닛폰 광종 다시 굽기 **준비** · 기본은 표만 · 정본 무변)
// =============================================================================
// T550 이 닛폰 광맥(옛 55 + 대·중·소 29 + 자잘 406 = 490)을 **옛 picker**(T551 고증표 · 존 무관)로 구웠다.
// T550 추신2: 광종은 `region-profiles` 의 혼용 몫으로 뽑는다(T574 가 넣은 함수 그대로 · 사본 0) — 그 함수가 `bakeOre` 다.
//   이 스크립트는 **부르기만** 한다(T574 무접촉): 닛폰 광맥 하나하나에
//     `RP.bakeOre('nippon', x, y, hash2(⌊x/32⌋, ⌊y/32⌋, 731), !minor, L)`
//   — 씨 731 = 계획기 `plan-ore-clusters.js` 의 광종 씨 · 주요/자잘 = 그 광맥의 `minor` 칸 · L = 꼬리 길이(셀).
//   광종이 바뀐 광맥만 pk 를 정본 식(`orePeakFor(광종, 0.30, hash2(⌊x/32⌋, ⌊y/32⌋, 500))` — `t574-ore-table.js` repk 와 같은 규약)
//   으로 다시 매기고 `minerals`(다광종 POLY)를 갈아 단다. 안 바뀐 광맥은 한 글자도 안 바뀐다.
// 쓰는 법:
//   node scripts/t580-bake-nippon.js                    → L 250 · 500 · 1,000 세 판의 닛폰 광종 면적 표(정본 무변)
//   node scripts/t580-bake-nippon.js --L 500 --apply    → 그 L 로 정본 nippon `ores` 만 갈아 쓴다(★재민이 L 을 고른 뒤 PM 이 돌린다)
//   [--json 표.json]
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const GAME = path.join(ROOT, 'server', 'hanbando-terrain.json');
const RP = require(path.join(ROOT, 'server', 'region-profiles'));
const SP = require(path.join(ROOT, 'server', 'specialty'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const APPLY = process.argv.includes('--apply');
const hash2 = (ix, iy, s) => { let h = (ix | 0) * 374761393 + (iy | 0) * 668265263 + (s | 0) * 1274126177; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const cell = (v) => Math.floor(v / 32);
const raw = fs.readFileSync(GAME, 'utf8');
const doc = JSON.parse(raw);
const ORES = doc.nippon.ores;

function bake(Lc) {
  let changed = 0, chMaj = 0;
  const out = ORES.map((o) => {
    const b = RP.bakeOre('nippon', o.center[0], o.center[1], hash2(cell(o.center[0]), cell(o.center[1]), 731), !o.minor, Lc);
    if (!b || b.mineral === o.mineral) return o;
    changed++; if (!o.minor) chMaj++;
    const e = Object.assign({}, o, { mineral: b.mineral, pk: SP.orePeakFor(b.mineral, 0.30, hash2(cell(o.center[0]), cell(o.center[1]), 500)) });
    if (b.minerals) e.minerals = b.minerals; else delete e.minerals;
    return e;
  });
  return { out, changed, chMaj };
}
// 지배 광종 면적 몫(원판 πr²) — `t574-ore-table.js` ⓐ 와 같은 자
function share(ores, sel) {
  const c = {}; let t = 0;
  for (const o of ores) { if (!sel(o)) continue; const a = Math.PI * Math.pow(o.radius / 32, 2); c[o.mineral] = (c[o.mineral] || 0) + a; t += a; }
  for (const k in c) c[k] = c[k] / t;
  return c;
}
const fmt = (d) => Object.entries(d).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v * 100).toFixed(1)}`).join(' · ');
const MAJ = (o) => !o.minor, MIN = (o) => !!o.minor, ALL = () => true;
const res = { now: { maj: share(ORES, MAJ), min: share(ORES, MIN), all: share(ORES, ALL) }, L: {} };
console.log(`닛폰 광맥 ${ORES.length}(주요 ${ORES.filter(MAJ).length} · 자잘 ${ORES.filter(MIN).length}) — 광종 지배 면적 몫(%)`);
console.log(`| 판 | 바뀐 광맥(주요) | 주요(대·중·소) | 자잘 | 전체 |`);
console.log(`|---|---:|---|---|---|`);
console.log(`| 지금(옛 picker) | — | ${fmt(res.now.maj)} | ${fmt(res.now.min)} | ${fmt(res.now.all)} |`);
for (const Lc of [250, 500, 1000]) {
  const b = bake(Lc);
  const r = { changed: b.changed, chMaj: b.chMaj, maj: share(b.out, MAJ), min: share(b.out, MIN), all: share(b.out, ALL), tvVsNow: +RP.tv(res.now.all, share(b.out, ALL)).toFixed(4) };
  res.L[Lc] = r;
  console.log(`| L ${Lc} | ${b.changed}/${ORES.length}(${b.chMaj}) | ${fmt(r.maj)} | ${fmt(r.min)} | ${fmt(r.all)} |`);
}
if (arg('--json')) fs.writeFileSync(arg('--json'), JSON.stringify(res, null, 1));
if (!APPLY) { console.log('표만 — 정본 무변(적용은 --L <값> --apply · 재민이 L 을 고른 뒤)'); process.exit(0); }
const Lc = +arg('--L', 'NaN');
if (!(Lc > 0)) { console.error('--apply 에는 --L <셀> 이 있어야 한다'); process.exit(2); }
const b = bake(Lc);
const fresh = JSON.parse(fs.readFileSync(GAME, 'utf8'));   // 새로 읽어 닛폰 광맥 칸만 갈아 끼운다(다른 존 바이트 동일)
fresh.nippon.ores = b.out;
fs.writeFileSync(GAME, raw.includes('\n') ? JSON.stringify(fresh, null, 1) : JSON.stringify(fresh));
console.log(`기록: 닛폰 광맥 ${b.changed}/${ORES.length} 다시 구움(주요 ${b.chMaj}) · L ${Lc}`);
