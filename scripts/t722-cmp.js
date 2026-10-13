#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T722 계측기 · 제품 무변)
// === scripts/t722-cmp.js — 두 판 `*.t650.json` 을 날마다 견준다(첫 갈림 · 날마다 다른 마을 수 · 끝 날 인구) + 멈춤/다시 뜸 덤프 견줌 ==========
//   node scripts/t722-cmp.js <기준.t650.json> <견줄.t650.json> [--from S] [--dump <판 디렉터리>]
'use strict';
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const [fa, fb] = args.filter((x) => !x.startsWith('--') && !/^\d+$/.test(x) && !fs.existsSync(x + '/stop.json'));
const opt = (k) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const FROM = parseInt(opt('from') || '0', 10);
const A = JSON.parse(fs.readFileSync(fa, 'utf8')), B = JSON.parse(fs.readFileSync(fb, 'utf8'));
const MA = new Map(A.days.map((r) => [r.d, r])), MB = new Map(B.days.map((r) => [r.d, r]));
const ds = [...MA.keys()].filter((d) => MB.has(d) && d >= FROM).sort((x, y) => x - y);
let first = null, seedFirst = null; const per = [];
for (const d of ds) {
  const a = MA.get(d), b = MB.get(d);
  let n = 0; const names = [];
  for (let i = 0; i < Math.max(a.vil.length, b.vil.length); i++) {
    const x = a.vil[i] || [], y = b.vil[i] || [];
    if (JSON.stringify([x[1], x[2], x[3], x[5], x[6], x[8]]) !== JSON.stringify([y[1], y[2], y[3], y[5], y[6], y[8]])) { n++; if (names.length < 6) names.push(x[0] || y[0]); }
  }
  if (a.seed !== b.seed && seedFirst == null) seedFirst = d;
  if ((n || a.seed !== b.seed) && first == null) first = { d, n, names, seedA: a.seed, seedB: b.seed };
  const popA = a.vil.reduce((s, v) => s + (v[2] || 0), 0), popB = b.vil.reduce((s, v) => s + (v[2] || 0), 0);
  per.push({ d, n, popA, popB, seed: a.seed === b.seed });
}
console.log(`견준 날 ${ds.length}(${ds[0]}~${ds[ds.length - 1]})`);
if (!first) console.log('★갈림 없음 — 모든 날 econ 난수 · 마을 지문(곳간 · 인구 · 주민 · 주거 · 확장 · 금고) 같다');
else {
  console.log(`★첫 갈림 날 ${first.d} · 다른 마을 ${first.n}(${first.names.join('·')}) · econ 난수 ${first.seedA === first.seedB ? '같음' : '다름'} · 난수 첫 다름 날 ${seedFirst ?? '—'}`);
  const pick = (d) => per.find((p) => p.d >= d);
  const marks = [first.d, first.d + 1, first.d + 5, first.d + 20, first.d + 50, first.d + 100, ds[ds.length - 1]];
  const seen = new Set();
  for (const m of marks) { const p = pick(m); if (!p || seen.has(p.d)) continue; seen.add(p.d); console.log(`  날 ${p.d}: 다른 마을 ${p.n}/51 · 인구 ${p.popA} / ${p.popB} (${p.popB - p.popA >= 0 ? '+' : ''}${p.popB - p.popA}) · 난수 ${p.seed ? '같음' : '다름'}`); }
}
const DUMPDIR = args.find((x) => fs.existsSync(path.join(x, 'stop.json')));
if (DUMPDIR) {
  const S = JSON.parse(fs.readFileSync(path.join(DUMPDIR, 'stop.json'), 'utf8'));
  const R = JSON.parse(fs.readFileSync(path.join(DUMPDIR, 'resume.json'), 'utf8'));
  console.log(`\n멈춤 → 다시 뜸(${DUMPDIR})`);
  console.log(`  econ 날 ${S.worldDay} → ${R.worldDay} · 앵커 lastGameDay ${S.lastGameDay} → ${R.lastGameDay} · 벽시계 날 ${S.gameDayNow} → ${R.gameDayNow} (버린 경계 ${R.lastGameDay - S.lastGameDay})`);
  console.log(`  econ 전역: 난수 ${S.econG && S.econG.seed} → ${R.econG && R.econG.seed} · 다음 주민 번호 ${S.econG && S.econG.npc} → ${R.econG && R.econG.npc} · 다음 마을 번호 ${S.econG && S.econG.vil} → ${R.econG && R.econG.vil}`);
  console.log(`  캐러밴 ${S.caravans}(짐 ${S.caravanGoods && S.caravanGoods.toFixed ? S.caravanGoods.toFixed(1) : S.caravanGoods}) → ${R.caravans} · 사건 ${S.events} → ${R.events} · 교역 기록 ${S.tradeLog} → ${R.tradeLog} · 중복 주민 번호 ${S.dupIds} → ${R.dupIds}`);
  const wk = [...new Set([...Object.keys(S.worldH || {}), ...Object.keys(R.worldH || {})])].filter((k) => (S.worldH || {})[k] !== (R.worldH || {})[k]);
  console.log(`  world 칸 다름 ${wk.length}: ${wk.join(' · ')}`);
  const kc = {}; let vDiff = 0;
  const byN = new Map(R.vil.map((v) => [v.name, v]));
  for (const v of S.vil) { const r = byN.get(v.name); if (!r) continue; let d = 0;
    for (const k of new Set([...Object.keys(v.kh), ...Object.keys(r.kh)])) if (v.kh[k] !== r.kh[k]) { kc[k] = (kc[k] || 0) + 1; d++; }
    if (d) vDiff++; }
  const top = Object.entries(kc).sort((x, y) => y[1] - x[1]);
  console.log(`  econ 마을 칸이 다른 마을 ${vDiff}/${S.vil.length} · 칸(마을 수): ${top.map(([k, n]) => `${k}(${n})`).join(' · ')}`);
  const crop = S.vil.filter((v) => { const r = byN.get(v.name); return r && v.crop !== r.crop; }).length;
  console.log(`  서버 마을 작물(_crop) 다름 ${crop}/${S.vil.length}`);
  if (fs.existsSync(path.join(DUMPDIR, 'resume.json.catch'))) console.log(`  따라잡기: ${fs.readFileSync(path.join(DUMPDIR, 'resume.json.catch'), 'utf8')}`);
}
