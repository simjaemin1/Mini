#!/usr/bin/env node
// === scripts/t1472-table.js — T1472 "몸이 한 일만 곳간에" 손잡이 다섯 하나씩 켠 서버 판 표(판 자료만 읽는다 · 제품 무변) ===
// 읽는 것: $R/done.txt("팔-시드 rc 초") · $R/runs/obs-<팔>-<시드>.json(계측/T1472_2026-11-24/t1472-observe.js) · $R/runs/<팔>-<시드>.json(판 자 --make 출력)
// 내는 것: ① 팔 × 시드 칸(인구 100·200·300·400 · 빈 마을 · 굶어 죽음 `_fdDeadTot` · 그 직업 사람 수 · 그 품목 곳간 · rc · 초) ② 팔 평균 ③ 죽은 판
// 쓰는 법: R=<판 자료 폴더> OUTDIR=<표 폴더> node scripts/t1472-table.js     (OUTDIR 에 table.txt · table.json)
'use strict';
const fs = require('fs'), path = require('path');
const R = process.env.R || '/home/user/t1472/run';
const OUTDIR = process.env.OUTDIR || path.join(__dirname, '..', '계측', 'T1472_2026-11-24');
// [팔, 이름, env, 직업, 품목(food|wood), 켜지는 것]
const ARMS = [
  ['off', '끔(기본)', '', null, null, '없음'],
  ['farm', '농부', 'T1243_FARM_ON=1', 'farmer', 'food', '묶음: T100_FIELD_YIELD · T368_FARM_ACT · T1221_FARM_LABOR · T1215_FIELD_M2 · T1201_BRONZE_CROPS'],
  ['fish', '어부', 'T312_FISH_ACT=1', 'fisher', 'food', '어부 몸 행위(낚시 · 귀환 입고)'],
  ['wood', '나무꾼', 'T325_WOOD_ACT=1', 'lumberjack', 'wood', '나무꾼 몸 행위(벌채 · 귀환 입고)'],
  ['forage', '채집', 'T347_FORAGE_ACT=1', 'forager', 'food', '채집꾼 몸 행위(군락 로지스틱)'],
  ['hunt', '사냥꾼', 'T1195_HUNT_REAL=1', 'hunter', 'food', '사냥꾼 몸 행위(잡은 마리만 입고)'],
  ['all5', '다섯 다', '다섯 env 모두', null, null, '위 다섯 전부'],
];
const SEEDS = [1020, 7, 42], DAYS = [100, 200, 300, 400];
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const done = new Map();
try { for (const l of fs.readFileSync(path.join(R, 'done.txt'), 'utf8').split('\n')) { const [t, rc, sec] = l.trim().split(/\s+/); if (t) done.set(t, { rc: +rc, sec: +sec }); } } catch (e) {}
const runs = {};
for (const [arm] of ARMS) for (const s of SEEDS) {
  const tag = `${arm}-${s}`, ob = rd(path.join(R, 'runs', `obs-${tag}.json`)), mk = rd(path.join(R, 'runs', `${tag}.json`)), d = done.get(tag) || null;
  const snaps = (ob && ob.snaps) || [];
  runs[tag] = { arm, seed: s, rc: d ? d.rc : null, sec: d ? d.sec : null, snaps, lastDay: ob ? ob.lastDay : null, err: ob ? ob.err : null,
    full: !!(d && d.rc === 0 && snaps.some((x) => x.day === 400)),
    bodyDays: mk && mk.byseed && mk.byseed[s] && mk.byseed[s].bodyDays != null ? mk.byseed[s].bodyDays : null };   // 판 JSON 에 일한 몸-날이 있으면만(없으면 계측 없음)
}
const at = (r, d) => r.snaps.find((x) => x.day === d) || null;
const last = (r) => r.snaps.length ? r.snaps[r.snaps.length - 1] : null;
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const f0 = (x) => x == null ? '—' : Math.round(x).toLocaleString('en-US');
const L = [], J = { arms: {}, runs: {} };
const nFull = Object.values(runs).filter((r) => r.full).length, nRun = Object.values(runs).filter((r) => r.rc != null).length;
L.push(`# T1472 몸이 한 일만 곳간에 — 손잡이 다섯 하나씩 · 서버 400날 · 가상 시계 · 시드 ${SEEDS.join(' · ')} · 끝까지 돈 판 ${nFull}/${ARMS.length * SEEDS.length}(돌린 판 ${nRun})`);
L.push('');
L.push('팔이 켜는 것:');
for (const [, name, env, , , what] of ARMS) L.push(`- ${name}: ${env || '(env 없음)'} → ${what}`);
L.push('- 굶어 죽음 = econ 마을 장부 `_fdDeadTot`(굶어 죽음 누계 · 마을 합) · 그 직업 사람 수 = 그 직업 npc 수(마을 합) · 곳간 = 식량 등가 합 ÷ 사람(하루치 · 농부 · 어부 · 채집 · 사냥꾼) / 나무꾼은 `storage.wood`(통나무 · 마을 합)');
L.push('- 일한 몸-날 / 일터에 못 닿은 몸-날: ' + (Object.values(runs).some((r) => r.bodyDays != null) ? '판 JSON 칸 있음' : '계측 없음'));
L.push('');
L.push('## ① 팔 × 시드');
L.push('');
L.push('| 팔 | 시드 | 인구 100 | 200 | 300 | 400 | 빈 마을(400) | 굶어 죽음(400) | 그 직업 사람(400) | 곳간(400) | rc | 초 |');
L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const [arm, name, , job, item] of ARMS) {
  for (const s of SEEDS) {
    const r = runs[`${arm}-${s}`], x = at(r, 400) || last(r);
    const stale = x && x.day !== 400 ? `(${x.day}날)` : '';
    const jb = !x ? '—' : job ? f0(x.jobs && x.jobs[job]) : (arm === 'all5' ? `다섯 직업 합 ${f0(Object.values(x.jobs || {}).reduce((a, b) => a + b, 0))}` : '—');
    const gr = !x ? '—' : item === 'wood' ? `통나무 ${f0(x.wood)}` : item === 'food' ? `${x.foodDays}일치` : `${x.foodDays == null ? '사람 0' : x.foodDays + '일치'} · 통나무 ${f0(x.wood)}`;
    const st = r.rc == null ? '안 끝남/미착수' : r.rc === 0 ? 'ok' : r.rc === 124 ? '안 끝남(124)' : `죽음 ${r.rc}`;
    L.push(`| ${name} | ${s} | ${DAYS.slice(0, 3).map((d) => f0((at(r, d) || {}).pop)).join(' | ')} | ${x ? f0(x.pop) + stale : '—'} | ${x ? x.empty : '—'} | ${x ? x.fd : '—'} | ${jb} | ${gr} | ${st} | ${r.sec == null ? '—' : r.sec} |`);
    J.runs[`${arm}-${s}`] = { rc: r.rc, sec: r.sec, lastDay: r.lastDay, snaps: r.snaps };
  }
}
L.push('');
L.push('## ② 팔 평균(세 시드 · 400날 칸)');
L.push('');
L.push('| 팔 | 400날 인구 평균 | 끔비 | 빈 마을 평균 | 굶어 죽음 평균 | 끝까지 |');
L.push('|---|---|---|---|---|---|');
const offM = mean(SEEDS.map((s) => (at(runs[`off-${s}`], 400) || {}).pop).filter((v) => v != null));
for (const [arm, name] of ARMS) {
  const xs = SEEDS.map((s) => at(runs[`${arm}-${s}`], 400)).filter(Boolean);
  const pm = mean(xs.map((x) => x.pop)), em = mean(xs.map((x) => x.empty)), fm = mean(xs.map((x) => x.fd));
  J.arms[arm] = { n: xs.length, pop: pm, ratio: offM && pm != null ? pm / offM : null, empty: em, fd: fm };
  L.push(`| ${name} | ${f0(pm)} | ${pm != null && offM ? (pm / offM).toFixed(3) : '—'} | ${em == null ? '—' : em.toFixed(1)} | ${fm == null ? '—' : f0(fm)} | ${xs.length}/${SEEDS.length} |`);
}
const ranked = ARMS.slice(1, 6).map(([arm, name]) => [name, J.arms[arm].ratio]).filter((x) => x[1] != null).sort((a, b) => b[1] - a[1]);
if (ranked.length) { L.push(''); L.push(`- 가장 덜 무너진 것: ${ranked[0][0]}(끔비 ${ranked[0][1].toFixed(3)}) · 가장 크게 무너진 것: ${ranked[ranked.length - 1][0]}(끔비 ${ranked[ranked.length - 1][1].toFixed(3)}) · 순서: ${ranked.map((x) => `${x[0]} ${x[1].toFixed(3)}`).join(' > ')}`); }
L.push('');
L.push('## ③ 죽거나 멎은 판');
L.push('');
const bad = Object.values(runs).filter((r) => r.rc != null && r.rc !== 0);
if (!bad.length) L.push('없음');
for (const r of bad) {
  const env = ARMS.find((a) => a[0] === r.arm)[2];
  L.push(`- ${r.arm}-${r.seed} · rc ${r.rc}${r.rc === 124 ? '(상한 12시간 — 안 끝남)' : ''} · ${r.sec}초 · 마지막 날 ${r.lastDay}${r.err ? ' · 관찰기 오류 ' + r.err.slice(0, 100) : ''}`);
  let t = []; try { t = fs.readFileSync(path.join(R, 'runs', `${r.arm}-${r.seed}.log`), 'utf8').split('\n').filter(Boolean).slice(-5); } catch (e) { t = ['(판 로그 없음)']; }
  for (const x of t) L.push('    ' + x.slice(0, 160));
}
const txt = L.join('\n');
console.log(txt);
fs.mkdirSync(OUTDIR, { recursive: true });
fs.writeFileSync(path.join(OUTDIR, 'table.txt'), txt + '\n');
fs.writeFileSync(path.join(OUTDIR, 'table.json'), JSON.stringify(J, null, 1));
