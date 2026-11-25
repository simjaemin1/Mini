#!/usr/bin/env node
// === scripts/t1473-table.js — T1473 손잡이 하나씩 켠 서버 판 표(판 자료만 읽는다 · 제품 무변) ===
// 읽는 것: $R/done.txt("팔-시드 rc 초") · $R/runs/<팔>-<시드>.json(판 JSON byseed 지문) · $R/runs/obs-<팔>-<시드>.json(t1473-observe.js)
// 내는 것: 표 파일 $R/table.txt(마크다운) · $R/table.json · $R/fp-days.json.gz(날 지문 — 판 JSON 대신 올린다)
// 쓰는 법: R=<판 자료 폴더> node scripts/t1473-table.js
//   등급(판 하나): 죽은 판 = rc ≠ 0 이거나 400날을 못 채움 · 안 돎 = 끔과 판 지문(runHash · 경제 날 지문 · 생활층 지문)이 바이트 같음 ·
//     다) 무너짐 = 빈 마을이 끔보다 늘거나 인구 끔비 0.90 밑 · 가) 거의 같음 = 인구 끔비 ±2 % 안이고 빈 마을이 끔보다 안 늚 · 나) 달라짐 = 그 밖.
//   팔 등급 = 시드 셋 가운데 가장 나쁜 것(다 > 나 > 가) · 시드가 다 안 돎이면 안 돎 · 안 돎 섞이면 도는 시드끼리.
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const R = process.env.R || path.join(__dirname, '..', '계측', 'T1473_2026-11-24');
const SEEDS = [1020, 7, 42];
const ARMS = [
  ['off', '끔(기본)', ''],
  ['food', 'T1419_FOOD_NEED=seen (T1419 · T1437)', 'T1419_FOOD_NEED=seen'],
  ['side', 'T1422_SIDE_WORK=1', 'T1422_SIDE_WORK=1'],
  ['nobuild', 'T1423_NO_BUILD=1', 'T1423_NO_BUILD=1'],
  ['react', 'T1423_BLOCK_REACT=1', 'T1423_BLOCK_REACT=1'],
  ['bandit', '도적 묶음 넷(T1404) — 기준 팔', 'T1404_DEN_ROUTE=1 T1404_GANG_FORAGE=1 T1404_GANG_SIZE=1 T1404_RAID_LURK=1'],
  ['raid', '도적 묶음 넷 + T1431_RAID_BATTLE=1', 'T1404 넷 + T1431_RAID_BATTLE=1'],
  ['npcdeath', 'T1432_NPC_DEATH=1', 'T1432_NPC_DEATH=1'],
  ['terrseq', 'T1433_TERR_SEQ=1', 'T1433_TERR_SEQ=1'],
  ['decay', 'T1438_DECAY=1', 'T1438_DECAY=1'],
  ['road', 'T1440_ROAD_RULE=1', 'T1440_ROAD_RULE=1'],
];
// 몸 세계 팔(body-arms.txt 가 있으면 읽는다): 이름|env|인자 — 이름 앞 `b` = 몸 세계(--bodies all)
const BODY = []; try { for (const l of fs.readFileSync(path.join(R, 'body-arms.txt'), 'utf8').split('\n')) { const [n, e] = l.split('|'); if (n) BODY.push([n, `몸 세계(--bodies all) · ${e || '끔'}`, e || '']); } } catch (e) {}
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {} try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f + '.gz')).toString('utf8')); } catch (e) { return null; } };   // 판 JSON 은 .gz 로 올린다
const done = new Map();
try { for (const l of fs.readFileSync(path.join(R, 'done.txt'), 'utf8').split('\n')) { const [t, rc, sec] = l.trim().split(/\s+/); if (t) done.set(t, { rc: +rc, sec: +sec }); } } catch (e) {}
function load(arm, s) {
  const tag = `${arm}-${s}`, d = done.get(tag) || null;
  const mk = rd(path.join(R, 'runs', `${tag}.json`)), ob = rd(path.join(R, 'runs', `obs-${tag}.json`));
  const fp = mk && mk.byseed && mk.byseed[s] ? mk.byseed[s] : null;
  const last = ob && ob.snaps && ob.snaps.length ? ob.snaps[ob.snaps.length - 1] : null;
  const full = !!(d && d.rc === 0 && last && last.day >= 400 && fp && fp.days && fp.days.length >= 400);
  return { tag, arm, seed: s, d, fp, ob, last, full };
}
const same = (a, b) => {
  if (!a || !b || !a.fp || !b.fp) return null;
  const j = (x) => JSON.stringify([x.runHash, x.days, x.side && x.side.days]);
  return j(a.fp) === j(b.fp);
};
function firstDiff(a, b) {   // 경제 날 지문 첫 갈림 날
  if (!a || !b || !a.fp || !b.fp) return null;
  const mb = new Map((b.fp.days || []).map((r) => [r[0], r[2]]));
  for (const r of (a.fp.days || [])) if (mb.has(r[0]) && mb.get(r[0]) !== r[2]) return r[0];
  return null;
}
const pct = (x, y) => (y > 0 ? (100 * x / y) : null);
const all = [...ARMS, ...BODY];
const runs = {};
for (const [arm] of all) for (const s of (BODY.find((b) => b[0] === arm) ? [1020] : SEEDS)) runs[`${arm}-${s}`] = load(arm, s);
const rows = [];
for (const [arm, name, env] of all) {
  const isBody = !!BODY.find((b) => b[0] === arm);
  const offArm = isBody ? 'boff' : 'off';
  for (const s of (isBody ? [1020] : SEEDS)) {
    const r = runs[`${arm}-${s}`], o = runs[`${offArm}-${s}`];
    const x = r.last, y = o && o.last;
    const row = { arm, name, seed: s, rc: r.d ? r.d.rc : null, sec: r.d ? r.d.sec : null, lastDay: x ? x.day : null, full: r.full };
    if (x) Object.assign(row, { pop: x.pop, vills: x.vills, empty: x.empty, fdDead: x.fdDead, housing: x.housing, lj0pct: pct(x.lj0, x.vd), rssMB: Math.round(x.rssMax / 1048576), secPerDay: r.d && x.day ? +(r.d.sec / x.day).toFixed(2) : null });
    if (x && y && y.pop) { row.ratio = x.pop / y.pop; row.emptyOff = y.empty; row.dEmpty = x.empty - y.empty; }
    if (arm === offArm) row.grade = r.full ? '(끔)' : '죽은 판';
    else if (!r.full) row.grade = '죽은 판';
    else if (!(o && o.full)) row.grade = '끔 판 없음';
    else {
      row.identical = same(r, o); row.firstDiff = firstDiff(r, o);
      if (row.identical) row.grade = '안 돎';
      else if (row.dEmpty > 0 || row.ratio < 0.90) row.grade = '다';
      else if (Math.abs(row.ratio - 1) <= 0.02 && row.dEmpty <= 0) row.grade = '가';
      else row.grade = '나';
    }
    rows.push(row);
  }
}
const f = (v, n) => (v == null || !isFinite(v) ? '—' : v.toFixed(n));
const L = [];
const nFull = rows.filter((r) => r.full).length;
const totSec = rows.reduce((a, r) => a + (r.sec || 0), 0);
L.push(`# T1473 끔 기본 손잡이 하나씩 켠 서버 판 — 400날 · 가상 시계 · 시드 1020 · 7 · 42 · 끝까지 돈 판 ${nFull}/${rows.length} · 판 시간 합 ${(totSec / 3600).toFixed(1)}시간`);
L.push('');
L.push('판 자: `scripts/server-baseline-check.js --make … --days 400 --seeds <시드> --par 1 --vclock`(판 조건 cond 그대로) · 칸은 날 400 값(빈 마을 · 굶어 죽음 · 주거는 누계 아닌 그날 값/누계 — 굶어 죽음 = `_fdDeadTot` 누계) · 하루 걸린 초 = 판 벽시계 ÷ 400 · RSS 꼭대기 = 존 아이 프로세스');
L.push('');
L.push('## ① 팔 × 시드');
L.push('');
L.push('| 팔 | 시드 | 인구(날 400) | 인구 끔비 | 빈 마을(끔) | 굶어 죽음 | 주거 | 나무꾼 0 마을-날 % | 하루 걸린 초 | RSS 꼭대기 MB | 죽은 판 | 첫 갈림 날 | 등급 |');
L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  const dead = r.full ? '—' : `rc ${r.rc == null ? '안 돎(미실행)' : r.rc} · 마지막 날 ${r.lastDay == null ? '—' : r.lastDay}`;
  L.push(`| ${r.arm} | ${r.seed} | ${r.pop == null ? '—' : r.pop} | ${f(r.ratio, 3)} | ${r.empty == null ? '—' : r.empty}(${r.emptyOff == null ? '—' : r.emptyOff}) | ${r.fdDead == null ? '—' : r.fdDead} | ${r.housing == null ? '—' : r.housing} | ${f(r.lj0pct, 1)} | ${f(r.secPerDay, 2)} | ${r.rssMB == null ? '—' : r.rssMB} | ${dead} | ${r.firstDiff == null ? (r.identical ? '없음(같음)' : '—') : r.firstDiff} | ${r.grade} |`);
}
L.push('');
L.push('## ② 팔 하나씩(시드 셋 묶음)');
L.push('');
L.push('| 팔 | 켠 것 | 등급 | 인구 끔비(세 시드) | 빈 마을 끔 대비(세 시드) | 시드 등급 |');
L.push('|---|---|---|---|---|---|');
const armSum = {};
const rank = { '다': 3, '나': 2, '가': 1 };
for (const [arm, name, env] of all) {
  if (arm === 'off' || arm === 'boff') continue;
  const rs = rows.filter((r) => r.arm === arm);
  const live = rs.filter((r) => r.grade && rank[r.grade]);
  let g;
  if (rs.some((r) => r.grade === '죽은 판') && !live.length) g = '죽은 판';
  else if (!live.length) g = rs.every((r) => r.grade === '안 돎') ? '안 돎' : '—';
  else g = live.reduce((a, r) => (rank[r.grade] > rank[a] ? r.grade : a), '가');
  const rr = rs.filter((r) => r.ratio != null);
  const mean = rr.length ? rr.reduce((a, r) => a + r.ratio, 0) / rr.length : null;
  const dE = rs.filter((r) => r.dEmpty != null);
  armSum[arm] = { name, env, grade: g, ratios: rs.map((r) => r.ratio), dEmpty: rs.map((r) => r.dEmpty), meanRatio: mean, meanDEmpty: dE.length ? dE.reduce((a, r) => a + r.dEmpty, 0) / dE.length : null, perSeed: rs.map((r) => r.grade), dead: rs.filter((r) => r.grade === '죽은 판').length };
  L.push(`| ${arm} | ${env} | ${g} | ${rs.map((r) => f(r.ratio, 3)).join(' · ')} | ${rs.map((r) => (r.dEmpty == null ? '—' : (r.dEmpty > 0 ? '+' : '') + r.dEmpty)).join(' · ')} | ${rs.map((r) => r.grade).join(' · ')} |`);
}
L.push('');
L.push('등급: 가) 끔과 거의 같음(인구 ±2 % · 빈 마을 안 늚) · 나) 달라짐 · 다) 무너짐(빈 마을 늚 또는 인구 −10 % 넘음) · 안 돎 = 끔과 판 지문 바이트 같음 · 팔 등급은 시드 셋 가운데 가장 나쁜 것');
L.push('');
const deadRows = rows.filter((r) => r.grade === '죽은 판');
L.push('## ③ 죽은 판');
L.push('');
if (!deadRows.length) L.push('없음');
for (const r of deadRows) {
  L.push(`- **${r.arm}-${r.seed}** · rc ${r.rc} · ${r.sec}초 · 마지막 날 ${r.lastDay}`);
  let tail = []; try { tail = fs.readFileSync(path.join(R, 'runs', `${r.arm}-${r.seed}.log`), 'utf8').split('\n').filter(Boolean).slice(-5); } catch (e) { tail = ['(판 로그 없음)']; }
  for (const t of tail) L.push('  - ' + t.slice(0, 200));
}
fs.writeFileSync(path.join(R, 'table.txt'), L.join('\n') + '\n');
// 첫 줄 셈
const base = ARMS.filter((a) => a[0] !== 'off' && a[0] !== 'bandit');   // 손잡이 팔(도적 묶음 기준 팔은 손잡이가 아니다)
const cnt = { '가': 0, '나': 0, '다': 0, '안 돎': 0, '죽은 판': 0 };
for (const [arm] of base) { const g = armSum[arm] && armSum[arm].grade; if (g in cnt) cnt[g]++; }
const biggest = base.map(([arm]) => armSum[arm]).filter((a) => a && a.meanRatio != null && a.grade !== '안 돎').sort((a, b) => (Math.abs(b.meanRatio - 1) + 0.0001 * Math.abs(b.meanDEmpty || 0)) - (Math.abs(a.meanRatio - 1) + 0.0001 * Math.abs(a.meanDEmpty || 0)))[0] || null;
fs.writeFileSync(path.join(R, 'table.json'), JSON.stringify({ rows, armSum, cnt, biggest: biggest && biggest.name, nFull, totSec, deadRuns: deadRows.map((r) => `${r.arm}-${r.seed}`) }, null, 1));
const fpo = {}; for (const [k, r] of Object.entries(runs)) if (r.fp) fpo[k] = { econ: (r.fp.days || []).map((x) => [x[0], x[2]]), runHash: r.fp.runHash, empty: r.fp.empty, dissolved: r.fp.dissolved };
fs.writeFileSync(path.join(R, 'fp-days.json.gz'), zlib.gzipSync(JSON.stringify(fpo)));
console.log(L.join('\n'));
