#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T766 표 · 판 JSON 만 읽는다 · 세계를 안 세운다)
// === scripts/t766-table.js — T766 판 다섯(ⓐ main · ⓑ 도적 끔 · ⓒ 해체 문 + 오는 식량 · ⓓ ⓑ+ⓒ · ⓑ′ 길 훅만 끔) 표 ===
//
// 읽는 것(판 자 `t577-server-run.js` 가 `T577_DIR` 에 남긴 셋 · 판 이름 = 러너 TAG):
//   `<판>-<시드>.json`(t577 훅 — 여덟 수 · 해체 · 빈 마을 · 마을별 인구 줄) · `<판>-<시드>.t766.json`(t766 관찰기 — 곳간 · 오는 식량 · 셈) ·
//   `<판>-<시드>.log`(아이 로그 — 도적 층 해체 줄 · T766 보류 줄)
// 쓰는 법: node scripts/t766-table.js <판 디렉터리> [--json out.json]
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = process.argv[2];
if (!DIR) { console.error('쓰는 법: node scripts/t766-table.js <판 디렉터리> [--json out.json]'); process.exit(2); }
const JOUT = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const SEEDS = [1020, 7, 42];
const RUNS = [
  ['ⓐ', 'base', '지금 main'], ['ⓑ', 'enable_bandits0', '도적 층 끔'], ['ⓑ′', 't766_raid_off1', '길 훅만 끔(습격 · 길 위험 0)'],
  ['ⓒ', 't766_dissolve_incoming1', '해체 문 + 오는 식량'], ['ⓓ', 'enable_bandits0-t766_dissolve_incoming1', 'ⓑ + ⓒ'],
];
const rd = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch (e) { return null; } };
const rl = (f) => { try { return fs.readFileSync(path.join(DIR, f), 'utf8'); } catch (e) { return ''; } };
const popAt = (o, d) => { let best = null; for (const r of o.rows) { if (r[0] <= d) best = r; else break; } return best ? best[1].reduce((a, x) => a + x, 0) : null; };

const R = {};
for (const [k, tag] of RUNS) for (const s of SEEDS) {
  const o = rd(`${tag}-${s}.json`); if (!o) continue;
  const ob = rd(`${tag}-${s}.t766.json`), log = rl(`${tag}-${s}.log`);
  const obRow = new Map(); if (ob) for (const r of ob.rows) obRow.set(r[0], r[1]);
  // 해체 줄 — `D<날> <마을> 해체(순감 X일·잔존 N명·피크 P) → 도적단#id S명 결성`
  const dis = [];
  for (const m of log.matchAll(/\[도적\] D(\d+) (\S+) 해체\(순감 (\d+)일·잔존 (\d+)명·피크 (\d+)\) → 도적단#\d+ (\d+)명 결성/g)) {
    const day = +m[1], name = m[2], i = o.names.indexOf(name), row = obRow.get(day);
    const v = row && i >= 0 ? row[i] : null;
    dis.push({ day, name, n: +m[4], peak: +m[5], gang: +m[6], fe: v ? v[1] : null, inc: v ? v[2] : null, need: +m[4] * 3, emptyEnd: o.rows[o.rows.length - 1][1][i] === 0 });
  }
  const held = [...log.matchAll(/\[도적\] D(\d+) (\S+) 해체 보류 — 곳간 ([\d.]+) \+ 오는 식량 ([\d.]+)/g)].map((m) => ({ day: +m[1], name: m[2], fe: +m[3], inc: +m[4] }));
  const last = o.rows[o.rows.length - 1][1];
  const empties = o.names.map((n, i) => (last[i] === 0 ? { name: n, day: o.emptyDay[i], dis: o.bdtDay[i] } : null)).filter(Boolean);
  const st = (ob && ob.stats) || {};
  const lastOb = ob && ob.rows.length ? ob.rows[ob.rows.length - 1][1] : [];
  R[`${k}|${s}`] = { k, s, o, dis, held, empties, st,
    pop400: popAt(o, 400), pop800: popAt(o, 800),
    cargoLost: lastOb.reduce((a, v) => a + (v[9] || 0), 0), tradersKilled: o.tradersKilled };
}

console.log(`\n### 판 줄 — ${DIR}\n`);
console.log('| 판 | 시드 | 빈 마을(끝 날) | 해체 | 첫 빈 날 | 도적 전환 | 절망 이탈 | 약탈 | 잃은 화물 | 행상 피살 | 원정 전사 | 보류(마을·날) | 인구 400일 | 인구 800일 | 여덟 수(소멸/있던 · 무기Q · 확장 · 게시 · 도구Q · 보존식 · 생곡) |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const [k, , lab] of RUNS) for (const s of SEEDS) {
  const r = R[`${k}|${s}`]; if (!r) { console.log(`| ${k} ${lab} | ${s} | (판 없음) |||||||||||||`); continue; }
  const e = r.o.eight, b = r.o.bandit;
  const heldV = new Set(r.held.map((h) => h.name)).size;
  console.log(`| ${k} ${lab} | ${s} | **${r.o.empty}** | ${r.o.dissolved} | ${r.o.firstEmpty ?? '—'} | ${b ? b.conv : '—'} | ${b ? b.exo : '—'} | ${b ? b.loot : '—'} | ${r.cargoLost.toFixed(0)} | ${r.tradersKilled} | ${r.st.supDead ?? '—'} | ${r.held.length ? `${heldV}·${r.held.length}` : '—'} | ${r.pop400} | ${r.pop800}`
    + ` | ${e.dead}/${e.ever} · ${e.weapQ} · ${e.expand} · ${e.board} · ${e.toolQ} · ${e.preserve} · ${e.grain} |`);
}

console.log('\n### 합(3시드)\n');
console.log('| 판 | 빈 마을 | 해체 | 첫 빈 날(최소) | 도적 전환 | 인구 800일 |');
console.log('|---|---|---|---|---|---|');
const SUM = {};
for (const [k, , lab] of RUNS) {
  const rs = SEEDS.map((s) => R[`${k}|${s}`]).filter(Boolean); if (!rs.length) continue;
  const f = (g) => rs.map(g);
  SUM[k] = { empty: f((r) => r.o.empty), dis: f((r) => r.o.dissolved), first: f((r) => r.o.firstEmpty), conv: f((r) => (r.o.bandit ? r.o.bandit.conv : 0)), pop: f((r) => r.pop800) };
  const S = SUM[k], j = (a) => a.join(' / ');
  console.log(`| ${k} ${lab} | ${j(S.empty)} (${S.empty.reduce((a, x) => a + x, 0)}) | ${j(S.dis)} (${S.dis.reduce((a, x) => a + x, 0)}) | ${j(S.first.map((x) => x ?? '—'))} | ${j(S.conv)} | ${j(S.pop)} |`);
}

console.log('\n### 해체된 마을 — 그날 곳간 · 인구 · 오는 식량(문턱 = 인구 × 3)\n');
console.log('| 판 | 시드 | 날 | 마을 | 잔존 | 피크 | 단 | 곳간 | 오는 식량 | 문턱 | 곳간+오는 ≥ 문턱? | 끝 날 빈 마을? |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const [k] of RUNS) for (const s of SEEDS) {
  const r = R[`${k}|${s}`]; if (!r) continue;
  for (const d of r.dis) console.log(`| ${k} | ${s} | ${d.day} | ${d.name} | ${d.n} | ${d.peak} | ${d.gang} | ${d.fe ?? '—'} | ${d.inc ?? '—'} | ${d.need} | ${d.fe != null ? (d.fe + d.inc >= d.need ? '넘음' : '모자람') : '—'} | ${d.emptyEnd ? '빔' : ''} |`);
}

console.log('\n### 빈 마을(끝 날 0명) — 비운 날 · 해체 날\n');
console.log('| 판 | 시드 | 마을(빈 날 · 해체 날) |');
console.log('|---|---|---|');
for (const [k] of RUNS) for (const s of SEEDS) {
  const r = R[`${k}|${s}`]; if (!r) continue;
  console.log(`| ${k} | ${s} | ${r.empties.map((x) => `${x.name}(${x.day ?? '—'} · ${x.dis ?? '해체 없음'})`).join(' · ') || '—'} |`);
}

// ── ⓒ 가 살린 마을 / 못 살린 마을 — 시드마다 ⓐ 의 해체 마을을 ⓒ 에서 찾는다(판은 바이트 결정론이 아니다 — 같은 시드 다른 판) ──
console.log('\n### ⓒ 가 살린 마을 / 못 살린 마을(시드마다 ⓐ 해체 마을 기준)\n');
console.log('| 시드 | ⓐ 해체 마을 | ⓒ 에서 해체 안 됨(살림 · 보류 날 수) | ⓒ 에서도 해체(못 살림 · 까닭) | ⓒ 에서만 해체 |');
console.log('|---|---|---|---|---|');
const SAVE = [];
for (const s of SEEDS) {
  const A = R[`ⓐ|${s}`], C = R[`ⓒ|${s}`]; if (!A || !C) continue;
  const aN = new Set(A.dis.map((d) => d.name)), cN = new Map(C.dis.map((d) => [d.name, d]));
  const heldBy = {}; for (const h of C.held) heldBy[h.name] = (heldBy[h.name] || 0) + 1;
  const saved = [...aN].filter((n) => !cN.has(n)), not = [...aN].filter((n) => cN.has(n)), onlyC = [...cN.keys()].filter((n) => !aN.has(n));
  const why = (d) => (d.inc > 0 ? `오는 ${d.inc} — ${d.fe}+${d.inc} < ${d.need}` : `오는 식량 0(곳간 ${d.fe} < ${d.need})`);
  SAVE.push({ seed: s, saved, not: not.map((n) => ({ name: n, why: why(cN.get(n)) })), onlyC });
  console.log(`| ${s} | ${[...aN].join(' · ')} (${aN.size}) | ${saved.map((n) => `${n}${heldBy[n] ? `(보류 ${heldBy[n]}일)` : ''}`).join(' · ') || '—'} (${saved.length}) | ${not.map((n) => `${n}(${why(cN.get(n))})`).join(' · ') || '—'} (${not.length}) | ${onlyC.map((n) => `${n}(${why(cN.get(n))})`).join(' · ') || '—'} (${onlyC.length}) |`);
}
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify({ dir: DIR, runs: Object.fromEntries(Object.entries(R).map(([key, r]) => [key, { empty: r.o.empty, dissolved: r.o.dissolved, firstEmpty: r.o.firstEmpty, bandit: r.o.bandit, eight: r.o.eight, pop400: r.pop400, pop800: r.pop800, dis: r.dis, held: r.held.length, heldVillages: [...new Set(r.held.map((h) => h.name))], empties: r.empties, cargoLost: +r.cargoLost.toFixed(1), tradersKilled: r.tradersKilled, supDead: r.st.supDead ?? null, t766Held: r.st.t766Held ?? null }])), sum: SUM, save: SAVE }, null, 1));
