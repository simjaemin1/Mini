#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T663 표 기계 · 판정 0) T652 켤지 — 결정론 서버 판 자(T650 `VILLAGE_CARAVAN_MAX=0`) 3시드 표
//   입력: <root>/<판>/<판>-<시드>.json(t577 판 JSON) + 같은 이름 `.t663.json`(scripts/t663-wood.js 날마다 통나무 줄)
//   ① 바이트: 두 판의 판 JSON(env 칸 뺌) · t663 줄 · 여덟 수가 같은가
//   ② 표: 인구(여덟 수) · 소멸 · 해체 · 빈 마을 · 통나무 0 마을(곳간 < 1 — T581 · T644 · T652 와 같은 문 · d30/100/200/400)
//        · 첫 나무꾼 날 − 곳간 0 날(중앙 · 음수 = 먼저) · 0 전에 나무꾼이 선 마을 · 400일 나무꾼 0 마을
//   쓰는 법: node scripts/t663-table.js <root> <판…> [--seeds 1020,7,42] [--same a:b …]
'use strict';
const fs = require('fs');
const path = require('path');
const A = process.argv.slice(2);
const ROOTD = A[0];
const si = A.indexOf('--seeds');
const SEEDS = si >= 0 ? A[si + 1].split(',').map(Number) : [1020, 7, 42];
const ARMS = A.slice(1).filter((x, i, a) => !x.startsWith('--') && a[i - 1] !== '--seeds' && a[i - 1] !== '--same');
const SAME = []; A.forEach((x, i) => { if (x === '--same') SAME.push(A[i + 1].split(':')); });
const J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const runOf = (arm, s) => J(path.join(ROOTD, arm, `${arm}-${s}.json`));
const woodOf = (arm, s) => J(path.join(ROOTD, arm, `${arm}-${s}.json.t663.json`));
const med = (a) => { const b = a.filter((x) => x != null).sort((x, y) => x - y); return b.length ? b[b.length >> 1] : null; };
const out = { same: [], arms: {} };

// ① 바이트
for (const [a, b] of SAME) for (const s of SEEDS) {
  const ra = runOf(a, s), rb = runOf(b, s), wa = woodOf(a, s), wb = woodOf(b, s);
  if (!ra || !rb) { console.log(`① ${a} ↔ ${b} · ${s}: 판 없음`); continue; }
  const strip = (o) => { const c = Object.assign({}, o); delete c.env; return JSON.stringify(c); };
  const r = { a, b, seed: s, run: strip(ra) === strip(rb), wood: !!(wa && wb) && JSON.stringify(wa) === JSON.stringify(wb), eight: JSON.stringify(ra.eight) === JSON.stringify(rb.eight) };
  if (wa && wb && !r.wood) { const n = Math.min(wa.days.length, wb.days.length); for (let i = 0; i < n; i++) if (wa.days[i].h !== wb.days[i].h) { r.firstDiff = wa.days[i].d; break; } }
  out.same.push(r);
  console.log(`① ${a} ↔ ${b} · 시드 ${s}: 판 JSON(env 뺌) ${r.run ? '같음 ○' : '다름 ✗'} · 날마다 통나무 줄 ${r.wood ? '같음 ○' : `다름 ✗(첫 다른 날 ${r.firstDiff})`} · 여덟 수 ${r.eight ? '같음' : '다름'}`);
}

// ② 표
console.log('\n| 판 | 시드 | 인구(여덟 수) | 소멸 | 해체 | 빈 마을 | 통나무 0 마을 d30 · d100 · d200 · d400 | 곳간 0 중앙 날 | 첫 나무꾼 − 0 날 중앙 · 0 전에 선 마을 | 400일 나무꾼 0 마을 | 나무꾼 d100 · d400 |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const arm of ARMS) {
  out.arms[arm] = {};
  for (const s of SEEDS) {
    const r = runOf(arm, s), w = woodOf(arm, s);
    if (!r || !w) { console.log(`| ${arm} | ${s} | (없음) |`); continue; }
    const D = w.days;
    const at = (d) => D.find((x) => x.d >= d) || D[D.length - 1];
    const w0 = (x) => x.vil.filter((v) => v[2] < 1).length;
    const ljs = (x) => x.vil.reduce((a, v) => a + v[3], 0);
    const names = D[0].vil.map((v) => v[0]);
    const zero = {}, lj1 = {};
    D.forEach((x) => x.vil.forEach((v) => { if (zero[v[0]] == null && v[2] < 1) zero[v[0]] = x.d; if (lj1[v[0]] == null && v[3] > 0) lj1[v[0]] = x.d; }));
    const hit = names.filter((n) => zero[n] != null);
    const lead = hit.map((n) => (lj1[n] == null ? null : lj1[n] - zero[n]));
    const row = { pop: r.eight.pop, dead: r.eight.dead, ever: r.eight.ever, dissolved: r.dissolved, empty: r.empty, firstEmpty: r.firstEmpty,
      wood0: [30, 100, 200, 400].map((d) => w0(at(d))), zeroMed: med(hit.map((n) => zero[n])), hit: hit.length,
      ljLeadMed: med(lead), ljBefore: lead.filter((x) => x != null && x < 0).length, ljNever: names.filter((n) => lj1[n] == null).length,
      lj: [ljs(at(100)), ljs(at(400))], popDay: [30, 100, 400].map((d) => at(d).vil.reduce((a, v) => a + v[1], 0)), eight: r.eight };
    out.arms[arm][s] = row;
    console.log(`| ${arm} | ${s} | ${row.pop.toLocaleString()} | ${row.dead}/${row.ever} | ${row.dissolved} | ${row.empty} | ${row.wood0.join(' · ')} /${names.length} | ${row.zeroMed}(${row.hit}) | ${row.ljLeadMed} · ${row.ljBefore}/${row.hit} | ${row.ljNever} | ${row.lj.join(' · ')} |`);
  }
}
// ③ 짝 Δ(인구) — 끔 판 대비(첫 판을 끔으로 읽는다)
if (ARMS.length > 1) {
  const base = ARMS[0];
  console.log(`\n③ 인구 짝 Δ(${base} 대비 · 공통 §T252 읽기: 부호 3/3 ∧ |평균| > 폭 → 가름 · 부호만 → 방향만 · 갈림 → 못 가름)`);
  for (const arm of ARMS.slice(1)) {
    const ds = SEEDS.map((s) => (out.arms[arm][s] && out.arms[base][s]) ? (out.arms[arm][s].pop - out.arms[base][s].pop) / out.arms[base][s].pop * 100 : null).filter((x) => x != null);
    if (!ds.length) continue;
    const mean = ds.reduce((a, b) => a + b, 0) / ds.length, width = Math.max(...ds) - Math.min(...ds);
    const pos = ds.filter((x) => x > 0).length, neg = ds.filter((x) => x < 0).length;
    const sign = pos === ds.length || neg === ds.length;
    const read = sign ? (Math.abs(mean) > width ? '가름' : '방향만') : '못 가름';
    out.arms[arm]._delta = { ds, mean, width, read };
    console.log(`  ${arm}: ${ds.map((x) => (x >= 0 ? '+' : '') + x.toFixed(1) + '%').join(' / ')} · 평균 ${mean.toFixed(1)}% · 폭 ${width.toFixed(1)}p → ${read}`);
  }
}
fs.writeFileSync(path.join(ROOTD, 't663-table.json'), JSON.stringify(out, null, 1));
console.log('\n→', path.join(ROOTD, 't663-table.json'));
