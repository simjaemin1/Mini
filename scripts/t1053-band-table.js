#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1053 표 기계 · 관찰기 JSON 만 읽는다 · 세계 안 만짐 · 판정 0)
// === scripts/t1053-band-table.js — 판 자 띠(T837 갈림 대조)로 사냥 몫 · 고기 · 장부 칸: `t1053-observe.js` 가 남긴 `<판>-<시드>.t1053.json` ===
//   node scripts/t1053-band-table.js <판 뿌리> [--pair off:on] [--json out.json]
//     판 뿌리 아래 `run-<갈래>`(갈래 판) · `run-<갈래>~raidN`(갈림 대조 — `diverge-ctl.js` `DCTL_SKIP=raid:n`) — `t974-band-table.js` 와 같은 꼴
//   셈(판 하나 = 3시드 합 · 날 줄 [날 · Σ land.game · Σ 곳간 meat · 사냥꾼 · 인구 · 장부 칸 · T1053 지운 칸 · 지은 장부]):
//     그 날(1 · 100 · 200 · 400 · 600 · 800 — 그 날 줄이 없으면 그 앞 마지막 날 · 판이 그 날까지 안 갔으면 빈칸) 값 · 판 평균(1 ~ 끝 날 · 날마다 3시드 합의 평균)
//   띠 = 그 갈래 판들 최소 ~ 최대 · 견줌 = 같은 대조 판끼리 b − a(판정 0 — 무엇을 읽을지는 보고가 적는다)
'use strict';
const fs = require('fs');
const path = require('path');
const D = process.argv[2];
if (!D) { console.error('쓰는 법: node scripts/t1053-band-table.js <판 뿌리> [--pair off:on] [--json out.json]'); process.exit(2); }
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const PAIR = (arg('--pair') || 'off:on').split(':');
const JOUT = arg('--json');
const COLS = ['game', 'meat', 'hunters', 'pop', 'cells', 'del'];
const CI = { game: 1, meat: 2, hunters: 3, pop: 4, cells: 5, del: 6 };
const AT = [1, 100, 200, 400, 600, 800];
const dirs = fs.readdirSync(D).filter((n) => /^run-[^~]+(~raid\d+)?$/.test(n) && fs.statSync(path.join(D, n)).isDirectory()).sort();
const boards = {};
for (const dn of dirs) {
  const m = dn.match(/^run-([^~]+)(?:~(raid\d+))?$/);
  const arm = m[1], ctl = m[2] || '-';
  const files = fs.readdirSync(path.join(D, dn)).filter((f) => /\.t1053\.json$/.test(f)).sort();
  const seeds = {};
  for (const f of files) {
    try { const o = JSON.parse(fs.readFileSync(path.join(D, dn, f), 'utf8')); seeds[f.replace(/\.t1053\.json$/, '')] = o.days || []; } catch (e) {}
  }
  const names = Object.keys(seeds);
  if (!names.length) continue;
  // 날 → 3시드 합(그 날이 다 있는 시드만 — 셋 다 없으면 그 날은 뺀다)
  const byDay = new Map();
  for (const s of names) for (const r of seeds[s]) { const d = r[0]; if (!byDay.has(d)) byDay.set(d, { n: 0, v: COLS.map(() => 0) }); const e = byDay.get(d); e.n++; COLS.forEach((c, i) => { e.v[i] += +r[CI[c]] || 0; }); }
  const days = [...byDay.keys()].filter((d) => byDay.get(d).n === names.length).sort((a, b) => a - b);
  const last = days.length ? days[days.length - 1] : 0;
  const at = {};
  for (const d0 of AT) { if (last < d0) continue; const d = days.filter((x) => x <= d0).pop(); if (d == null) continue; at[d0] = Object.fromEntries(COLS.map((c, i) => [c, Math.round(byDay.get(d).v[i] * 100) / 100])); at[d0].day = d; }   // 그 날까지 안 간 판(멈춘 판 · 도는 중)은 그 칸이 빈다
  const mean = Object.fromEntries(COLS.map((c, i) => [c, days.length ? Math.round(days.reduce((a, d) => a + byDay.get(d).v[i], 0) / days.length * 100) / 100 : null]));
  boards[dn] = { arm, ctl, seeds: names, nDays: days.length, last, at, mean };
}
const arms = [...new Set(Object.values(boards).map((b) => b.arm))].sort();
const fmt = (x) => (x == null ? '—' : (Math.abs(x) >= 100 ? Math.round(x).toLocaleString('en-US') : String(Math.round(x * 100) / 100)));
const out = { root: D, boards, band: {}, pair: [] };
console.log(`# T1053 판 자 띠 — 사냥 몫(Σ land.game) · 고기(Σ 곳간 meat) · 사냥꾼 · 장부 칸 · T1053 지운 칸(3시드 합 · 판 ${Object.keys(boards).length})\n`);
for (const arm of arms) {
  const bs = Object.entries(boards).filter(([, b]) => b.arm === arm);
  console.log(`## 갈래 ${arm} — 판 ${bs.length}`);
  console.log(`| 판 | 날 | ${AT.map((d) => `${d}날 Σgame · meat · 사냥꾼 · 칸`).join(' | ')} | 평균 Σgame · meat · 사냥꾼 | 지운 칸(끝) |`);
  console.log(`|---|---:|${AT.map(() => '---:').join('|')}|---:|---:|`);
  for (const [dn, b] of bs) {
    console.log(`| ${dn} | ${b.last} | ${AT.map((d) => (b.at[d] ? `${fmt(b.at[d].game)} · ${fmt(b.at[d].meat)} · ${b.at[d].hunters} · ${fmt(b.at[d].cells)}` : '—')).join(' | ')} | ${fmt(b.mean.game)} · ${fmt(b.mean.meat)} · ${fmt(b.mean.hunters)} | ${b.at[800] ? fmt(b.at[800].del) : (b.at[600] ? fmt(b.at[600].del) : '—')} |`);
  }
  const band = {};
  for (const k of ['game', 'meat', 'hunters', 'cells']) {
    for (const d of [400, 800]) { const xs = bs.map(([, b]) => b.at[d] && b.at[d][k]).filter((x) => x != null); if (xs.length) band[`${k}@${d}`] = [Math.min(...xs), Math.max(...xs)]; }
    const ms = bs.map(([, b]) => b.mean[k]).filter((x) => x != null); if (ms.length) band[`${k}@mean`] = [Math.min(...ms), Math.max(...ms)];
  }
  out.band[arm] = band;
  console.log(`\n띠(${arm}): ${Object.entries(band).map(([k, [a, b2]]) => `${k} ${fmt(a)} ~ ${fmt(b2)}`).join(' · ')}\n`);
}
if (PAIR.length === 2 && arms.includes(PAIR[0]) && arms.includes(PAIR[1])) {
  console.log(`## 견줌 ${PAIR[0]} → ${PAIR[1]}(같은 대조 판끼리 · b − a)`);
  console.log('| 대조 | 400날 Δgame · Δmeat · Δ사냥꾼 · Δ칸 | 800날 Δgame · Δmeat · Δ사냥꾼 · Δ칸 | 평균 Δgame · Δmeat · Δ사냥꾼 |');
  console.log('|---|---:|---:|---:|');
  for (const ctl of ['-', 'raid1', 'raid2', 'raid3']) {
    const a = Object.values(boards).find((b) => b.arm === PAIR[0] && b.ctl === ctl), b = Object.values(boards).find((x) => x.arm === PAIR[1] && x.ctl === ctl);
    if (!a || !b) continue;
    const dd = (d) => (a.at[d] && b.at[d] ? ['game', 'meat', 'hunters', 'cells'].map((k) => fmt(b.at[d][k] - a.at[d][k])).join(' · ') : '—');
    const dm = ['game', 'meat', 'hunters'].map((k) => fmt(b.mean[k] - a.mean[k])).join(' · ');
    out.pair.push({ ctl, d400: a.at[400] && b.at[400] ? Object.fromEntries(COLS.map((k) => [k, b.at[400][k] - a.at[400][k]])) : null, d800: a.at[800] && b.at[800] ? Object.fromEntries(COLS.map((k) => [k, b.at[800][k] - a.at[800][k]])) : null, mean: Object.fromEntries(COLS.map((k) => [k, b.mean[k] - a.mean[k]])) });
    console.log(`| ${ctl} | ${dd(400)} | ${dd(800)} | ${dm} |`);
  }
}
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(out, null, 1));
