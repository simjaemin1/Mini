#!/usr/bin/env node
// === scripts/t1417-table.js — T1417 손잡이 하나씩 켠 서버 판 표(러너 밖 · 판 자료만 읽는다 · 제품 무변) ===
//
// 읽는 것: $R/done.txt("팔-시드 rc 초") · $R/runs/<팔>-<시드>.json(server-baseline-check --make 출력 — 날 지문) ·
//          $R/runs/obs-<팔>-<시드>.json(계측/T1417_2026-11-21/t1417-observe.js — 100날마다 칸) · $R/runs/<팔>-<시드>.log(판 로그 — 죽은 판만 꼬리)
// 내는 것: ① 팔 × 시드 × 날(100 · 200 · 300 · 400) — 인구 · 끔비(인구 ÷ 끔 인구) · 마을 · 빈 마을 · 식량(하루치) · 떠난 사람 · 죽음 · 청동 누계 · CPU 초/날
//          ② 팔 × 시드 — 끔과 지문이 같은 날 수(경제 날 지문 · 생활층 마을 칸 지문 · 첫 갈림 날)
//          ③ 죽거나 멎은 판 — 죽은 날 · rc · 마지막 로그 스무 줄 · 다시 돌리는 한 줄
// 쓰는 법: R=<판 자료 폴더> node scripts/t1417-table.js [--json out.json]
'use strict';
const fs = require('fs');
const path = require('path');

const R = process.env.R || '/home/user/t1417/run';
const args = process.argv.slice(2);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const ARMS = [
  ['off', '끔(기본)', ''],
  ['hunt', 'T1393_HUNT_CHASE', 'T1393_HUNT_CHASE=1'],
  ['bronze', 'T1385_BRONZE_NOCAP + T1398_BRONZE_BAND', 'T1385_BRONZE_NOCAP=1 T1398_BRONZE_BAND=1'],
  ['firstlot', 'T1392_FIRST_LOT', 'T1392_FIRST_LOT=1'],
  ['work', 'T1365_WORK + T1399_TOK + T1399_FISH', 'T1365_WORK=1 T1399_TOK=1 T1399_FISH=1'],
];
const SEEDS = [1020, 7, 42];
const DAYS = [100, 200, 300, 400];
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const done = new Map();
try { for (const l of fs.readFileSync(path.join(R, 'done.txt'), 'utf8').split('\n')) { const [t, rc, sec] = l.trim().split(/\s+/); if (t) done.set(t, { rc: +rc, sec: +sec }); } } catch (e) {}

const runs = {};
for (const [arm] of ARMS) for (const s of SEEDS) {
  const tag = `${arm}-${s}`;
  const mk = rd(path.join(R, 'runs', `${tag}.json`));
  const ob = rd(path.join(R, 'runs', `obs-${tag}.json`));
  const d = done.get(tag) || null;
  const fp = mk && mk.seeds && mk.seeds[s] ? mk.seeds[s] : null;
  runs[tag] = { arm, seed: s, rc: d ? d.rc : null, sec: d ? d.sec : null, fp, ob, full: !!(d && d.rc === 0 && fp && fp.days && fp.days.length >= 400) };
}
const snapAt = (r, day) => (r && r.ob && r.ob.snaps ? r.ob.snaps.find((x) => x.day === day) : null) || null;
function same(a, b) {   // 경제 날 지문 · 생활층(마을 칸) 날 지문 — 같은 날 수 · 견준 날 수 · 첫 갈림
  const out = {};
  if (!a || !b) return null;
  const E = (x) => new Map((x.days || []).map((r) => [r[0], r[2]]));
  const S = (x) => new Map(((x.side && x.side.days) || []).map((r) => [r[0], r[1]]));
  for (const [k, f] of [['econ', E], ['side', S]]) {
    const ma = f(a), mb = f(b); let n = 0, eq = 0, first = null;
    for (const [d, h] of [...ma.entries()].sort((x, y) => x[0] - y[0])) { if (!mb.has(d)) continue; n++; if (mb.get(d) === h) eq++; else if (first == null) first = d; }
    out[k] = { eq, n, first };
  }
  return out;
}

const L = [];
const nRuns = Object.values(runs).filter((r) => r.rc != null).length, nFull = Object.values(runs).filter((r) => r.full).length;
const totSec = Object.values(runs).reduce((a, r) => a + (r.sec || 0), 0);
L.push(`# T1417 손잡이 하나씩 켠 서버 판 — 400날 × 3시드(1020 · 7 · 42) · 끝까지 돈 판 ${nFull}/${SEEDS.length * ARMS.length}(돌린 판 ${nRuns}) · 판 시간 합 ${(totSec / 3600).toFixed(1)}시간`);
L.push('');
L.push('- 판 자: `scripts/server-baseline-check.js --make … --days 400 --seeds <시드> --par 1 --vclock`(서버 기준선 판 조건 · 가상 시계) · 팔마다 env 만 얹음');
L.push('- `T1380_SPARE_EXPAND`: 없음(코드에 그 손잡이가 없다 — 건너뜀)');
L.push('');
L.push('## ① 100날마다 칸');
L.push('');
L.push('| 팔 | 시드 | 날 | 인구 | 끔비 | 마을 | 빈 마을 | 식량(하루치) | 떠난 사람 | 죽음 | 청동 누계 | CPU 초/날 |');
L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
const ratio = {};
for (const [arm, name] of ARMS) for (const s of SEEDS) for (const d of DAYS) {
  const r = runs[`${arm}-${s}`], x = snapAt(r, d), o = snapAt(runs[`off-${s}`], d);
  if (!x) { L.push(`| ${name} | ${s} | ${d} | (없음${r && r.ob ? ` · 마지막 날 ${r.ob.lastDay}` : ''}) | | | | | | | | |`); continue; }
  const k = o && o.pop ? x.pop / o.pop : null;
  if (k != null && d === 400) (ratio[arm] = ratio[arm] || []).push(k);
  L.push(`| ${name} | ${s} | ${d} | ${x.pop} | ${k == null ? '—' : k.toFixed(3)} | ${x.vills} | ${x.empty} | ${x.foodDays} | ${x.emig} | ${x.dead} | ${x.bronze} | ${x.cpuPerDay} |`);
}
L.push('');
L.push('## ② 끔과 지문이 같은 날 수(400날 판 · 경제 = 날 지문 scanDay · 생활층 = 마을 칸 지문 t740)');
L.push('');
L.push('| 팔 | 시드 | 경제 같은 날 | 첫 갈림(경제) | 생활층 같은 날 | 첫 갈림(생활층) | 400날 끔비 |');
L.push('|---|---|---|---|---|---|---|');
const sameRows = {};
for (const [arm, name] of ARMS.slice(1)) for (const s of SEEDS) {
  const a = runs[`${arm}-${s}`], b = runs[`off-${s}`];
  const q = same(a && a.fp, b && b.fp); const x = snapAt(a, 400), o = snapAt(b, 400);
  (sameRows[arm] = sameRows[arm] || []).push(q);
  L.push(`| ${name} | ${s} | ${q ? `${q.econ.eq}/${q.econ.n}` : '—'} | ${q && q.econ.first != null ? q.econ.first : (q ? '없음' : '—')} | ${q ? `${q.side.eq}/${q.side.n}` : '—'} | ${q && q.side.first != null ? q.side.first : (q ? '없음' : '—')} | ${x && o && o.pop ? (x.pop / o.pop).toFixed(3) : '—'} |`);
}
L.push('');
L.push('## 팔마다 띠(400날 끔비 · 시드 셋)');
L.push('');
for (const [arm, name] of ARMS.slice(1)) { const v = ratio[arm] || []; const q = (sameRows[arm] || []).filter(Boolean);
  L.push(`- ${name}: 끔비 ${v.length ? `${Math.min(...v).toFixed(3)} ~ ${Math.max(...v).toFixed(3)}(${v.length}시드)` : '—'} · 경제 지문 같은 날 ${q.map((z) => `${z.econ.eq}/${z.econ.n}`).join(' · ') || '—'}`); }
L.push('');
L.push('## ③ 죽거나 멎은 판');
L.push('');
const dead = Object.values(runs).filter((r) => r.rc != null && !r.full);
if (!dead.length) L.push('없음');
for (const r of dead) {
  const env = ARMS.find((a) => a[0] === r.arm)[2];
  L.push(`- **${r.arm}-${r.seed}** · rc ${r.rc}${r.rc === 124 ? '(상한 시간 넘김)' : ''} · ${r.sec}초 · 죽은 날 ${r.ob ? r.ob.lastDay : '?'}${r.ob && r.ob.err ? ` · 관찰기 오류 ${r.ob.err.slice(0, 120)}` : ''}`);
  L.push(`  - 다시: \`${env ? env + ' ' : ''}node scripts/server-baseline-check.js --make /tmp/${r.arm}-${r.seed}.json --days 400 --seeds ${r.seed} --par 1 --vclock\``);
  let tail = []; try { tail = fs.readFileSync(path.join(R, 'runs', `${r.arm}-${r.seed}.log`), 'utf8').split('\n').filter(Boolean).slice(-20); } catch (e) { tail = ['(판 로그 없음)']; }
  L.push('  ```'); for (const t of tail) L.push('  ' + t.slice(0, 200)); L.push('  ```');
}
console.log(L.join('\n'));
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ runs: Object.fromEntries(Object.entries(runs).map(([k, r]) => [k, { rc: r.rc, sec: r.sec, full: r.full, lastDay: r.ob ? r.ob.lastDay : null, snaps: r.ob ? r.ob.snaps : null }])),
  ratio, same: sameRows, nFull, nRuns, totSec }, null, 1));
