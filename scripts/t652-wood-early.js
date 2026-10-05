#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T652 표 기계 · 판정 0) 나무꾼 배정이 늦다 — 곳간 0 날 · 그날까지 나무꾼 · 그림자가격 궤적 · 수출 · 배정 기록
//   입력: T644 자(`t581-rehearsal.js run … ` + `T581_WOOD=1`)가 남긴 `wood_<표지>_<존>.jsonl`(마을마다 하루 한 줄 · T652 칸 pw · ema · fd · sw)
//         + 존 로그 `z_<표지>_<존>.log`(캐러밴 출발 줄 `통나무 wood×` — T644 와 같은 셈)
//   "오른다" = 그림자가격이 제 닻(`BASE_VALUE_V2.wood` — econ v2 의 그 수 · 새 수 0)을 넘은 첫날(희소도 adj > 1).
//   "남은 날" = 곳간 ÷ 하루 소비 EMA(`_consEMA.wood`) — 30 은 v2 가 흐름 수요를 재는 그 창(`flowT = _consEMA × 30`)이다.
//   쓰는 법: node scripts/t652-wood-early.js <dir> <표지> [존…]   (표지 예: s1020_off)
'use strict';
const fs = require('fs');
const path = require('path');
const [DIR, TAG, ...ZA] = process.argv.slice(2);
const ZS = ZA.length ? ZA : ['hanbando', 'nippon'];
if (!DIR || !TAG) { console.error('쓰는 법: node scripts/t652-wood-early.js <dir> <표지> [존…]'); process.exit(2); }
const BASE = 1.67;   // = sim/economy-sim-v2.js BASE_VALUE_V2.wood(읽기 확인은 아래)
try { const src = fs.readFileSync(path.join(__dirname, '..', 'sim', 'economy-sim-v2.js'), 'latin1'); if (!/wood: 1\.67, stone: 1\.67/.test(src)) console.log('⚠ BASE_VALUE_V2.wood 가 1.67 이 아니다 — 표의 닻을 다시 보라'); } catch (e) {}
const FLOW_WIN = 30;
const med = (a) => { const b = a.filter((x) => x != null).sort((x, y) => x - y); return b.length ? b[b.length >> 1] : null; };
const out = { tag: TAG, zones: {} };
for (const z of ZS) {
  const wf = path.join(DIR, `wood_${TAG}_${z}.jsonl`);
  if (!fs.existsSync(wf)) { console.log(`${z}: 입력 없음`); continue; }
  const days = fs.readFileSync(wf, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).sort((a, b) => a.day - b.day);
  // 수출 — 출발 줄(econ 출발 날 · 통나무만)
  const exp = new Map();   // name → [[day, amt]]
  try {
    const L = fs.readFileSync(path.join(DIR, `z_${TAG}_${z}.log`), 'utf8').split('\n');
    const re = /캐러밴#\S+ 출발(?:\(경계 너머\))?: (\S+)→(\S+) wood×(\d+).*econ d(\d+)/;
    for (const l of L) { const m = re.exec(l); if (!m) continue; const a = exp.get(m[1]) || []; a.push([+m[4], +m[3]]); exp.set(m[1], a); }
  } catch (e) {}
  const V = new Map();
  for (const d of days) for (const r of d.vils) { const a = V.get(r.v) || []; a.push(Object.assign({ day: d.day }, r)); V.set(r.v, a); }
  const rows = [];
  for (const [name, s] of V) {
    const s0 = s[0];
    const zi = s.findIndex((r) => r.wood < 1);   // T581 wood0 칸과 같은 문(< 1)
    const zeroDay = zi >= 0 ? s[zi].day : null;
    const upTo = zi >= 0 ? s.slice(0, zi + 1) : s;
    const pRise = s.find((r) => r.pw != null && r.pw > BASE);
    const left = s.find((r) => r.ema > 0 && r.wood / r.ema < FLOW_WIN);
    const ljMax = Math.max(0, ...upTo.map((r) => r.lj || 0));
    const lj1 = s.find((r) => (r.lj || 0) > 0);   // 첫 나무꾼이 선 날(출생 배정 · 전환 어느 쪽이든 — 픽커 정본이 고른 것)
    const ex = (exp.get(name) || []).filter(([d]) => zeroDay == null || d <= zeroDay).reduce((a, [, q]) => a + q, 0);
    const sw = upTo.filter((r) => r.sw).map((r) => r.sw);
    const swLJ = sw.filter((x) => x[1] === 'lumberjack');
    const needTally = {}; for (const x of sw) needTally[x[1] || '∅'] = (needTally[x[1] || '∅'] || 0) + 1;
    rows.push({ name, n0: s0.n, wood0: s0.wood, ema0: s0.ema, pw0: s0.pw, zeroDay, ljAtZero: zi >= 0 ? s[zi].lj : null, ljMax,
      priceDay: pRise ? pRise.day : null, leadPrice: pRise && zeroDay != null ? zeroDay - pRise.day : null,
      ljDay: lj1 ? lj1.day : null, leadLJ: lj1 && zeroDay != null ? zeroDay - lj1.day : null,
      leftDay: left ? left.day : null, leadLeft: left && zeroDay != null ? zeroDay - left.day : null,
      fdAtPrice: pRise ? pRise.fd : null, exported: ex, picks: sw.length, picksLJ: swLJ.length, picksLJdone: swLJ.filter((x) => x[2] === 'lumberjack').length,
      picksLJhold: swLJ.filter((x) => /^hold/.test(String(x[2]))).length, needs: needTally,
      // 곳간 0 날까지 그림자가격 궤적(0 · 5 · 10 … 날 표본)
      trace: upTo.filter((r, i) => i % 5 === 0 || i === upTo.length - 1).map((r) => [r.day, r.wood, r.pw, r.ema, r.lj, r.fd]) });
  }
  rows.sort((a, b) => (a.zeroDay == null ? 1e9 : a.zeroDay) - (b.zeroDay == null ? 1e9 : b.zeroDay));
  const hit = rows.filter((r) => r.zeroDay != null);
  const at = (D) => { const d = days.find((x) => x.day >= D); if (!d) return null; return { day: d.day, wood0: d.vils.filter((r) => r.wood < 1).length, vils: d.vils.length, pop: d.vils.reduce((a, r) => a + r.n, 0), lj: d.vils.reduce((a, r) => a + (r.lj || 0), 0), wood: Math.round(d.vils.reduce((a, r) => a + r.wood, 0)) }; };
  const needAll = {}; for (const r of hit) for (const k in r.needs) needAll[k] = (needAll[k] || 0) + r.needs[k];
  const Z = { vils: rows.length, hit: hit.length, zeroMed: med(hit.map((r) => r.zeroDay)), ljZeroAtZero: hit.filter((r) => !r.ljMax).length,
    priceBefore: hit.filter((r) => r.leadPrice != null && r.leadPrice >= 0).length, leadPriceMed: med(hit.map((r) => r.leadPrice)),
    ljBefore: hit.filter((r) => r.leadLJ != null && r.leadLJ > 0).length, ljNever: rows.filter((r) => r.ljDay == null).length, leadLJMed: med(hit.map((r) => r.leadLJ == null ? null : r.leadLJ)),
    leftBefore: hit.filter((r) => r.leadLeft != null && r.leadLeft >= 0).length, leadLeftMed: med(hit.map((r) => r.leadLeft)),
    exported: hit.reduce((a, r) => a + r.exported, 0), seeded: Math.round(rows.reduce((a, r) => a + r.wood0, 0)),
    picks: hit.reduce((a, r) => a + r.picks, 0), picksLJ: hit.reduce((a, r) => a + r.picksLJ, 0), picksLJdone: hit.reduce((a, r) => a + r.picksLJdone, 0), picksLJhold: hit.reduce((a, r) => a + r.picksLJhold, 0), needAll,
    fdAtPriceMed: med(hit.map((r) => r.fdAtPrice)), famineAtPrice: hit.filter((r) => r.fdAtPrice != null && r.fdAtPrice < 30).length,
    snap: [0, 30, 100, 200, 400].map(at).filter(Boolean), rows };
  out.zones[z] = Z;
  console.log(`\n[${z} · ${TAG}] 마을 ${Z.vils} · 곳간 0 이 된 마을 ${Z.hit}(중앙 ${Z.zeroMed}일) · 그날까지 나무꾼 0 ${Z.ljZeroAtZero} · 시딩 ${Z.seeded} · 0 날까지 수출 ${Z.exported}`);
  console.log(`  그림자가격이 닻(${BASE})을 넘은 날 — 곳간 0 보다 먼저 ${Z.priceBefore}/${Z.hit} · 앞섬 중앙 ${Z.leadPriceMed}일 · 그날 식량 날수 중앙 ${Z.fdAtPriceMed}(기근 문 < 30 인 마을 ${Z.famineAtPrice})`);
  console.log(`  남은 날 < ${FLOW_WIN}(곳간 ÷ 소비 EMA) — 곳간 0 보다 먼저 ${Z.leftBefore}/${Z.hit} · 앞섬 중앙 ${Z.leadLeftMed}일`);
  console.log(`  첫 나무꾼이 곳간 0 보다 먼저 선 마을 ${Z.ljBefore}/${Z.hit} · 첫 나무꾼 − 0 날 중앙 ${Z.leadLJMed == null ? "—" : -Z.leadLJMed}일(음수 = 먼저) · 끝까지 나무꾼 0 ${Z.ljNever}`);
  console.log(`  0 날까지 배정 ${Z.picks}번 — 나무꾼을 고른 번 ${Z.picksLJ}(옮김 ${Z.picksLJdone} · 보류 ${Z.picksLJhold}) · 고른 직업 ${JSON.stringify(Z.needAll)}`);
  for (const s of Z.snap) console.log(`  d${s.day}: 통나무 0 마을 ${s.wood0}/${s.vils} · 곳간 ${s.wood} · 나무꾼 ${s.lj} · 인구 ${s.pop}`);
  console.log('  | 마을 | 인구 | 시딩 | 0 날 | 나무꾼(0 날 · 최대) | 값 오른 날(앞섬) | 남은 날<30(앞섬) | 수출 | 배정(나무꾼/전체) |');
  for (const r of hit.slice(0, 12)) console.log(`  | ${r.name} | ${r.n0} | ${r.wood0} | ${r.zeroDay} | ${r.ljAtZero} · ${r.ljMax} | ${r.priceDay}(${r.leadPrice}) | ${r.leftDay}(${r.leadLeft}) | ${r.exported} | ${r.picksLJ}/${r.picks} |`);
}
fs.writeFileSync(path.join(DIR, `t652_${TAG}.json`), JSON.stringify(out, null, 1));
console.log('\n→', path.join(DIR, `t652_${TAG}.json`));
