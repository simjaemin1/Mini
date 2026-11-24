#!/usr/bin/env node
// === scripts/t1434-table.js — T1434 끔 세계 네 해 판 표(러너 밖 · 판 자료만 읽는다 · 제품 무변) ===
//
// 읽는 것: $R/done.txt("<판> rc 초") · $R/jobs.txt("태그 시드 날 힙 [cuts]") ·
//          $R/<판>/obs/obs-<시드>.jsonl(계측/T1434_2026-11-22/t1434-observe.js — 100날마다 한 줄) · $R/<판>/obs/last-<시드>.json(날마다 덮어씀) ·
//          $R/<판>/progress.json(t1308-long-run — 마디 · code) · $R/<판>/seg-*.log(죽은 판만 — grep 으로 첫 오류 자리 · 그 뒤 15줄)
// 내는 것: ① 판 × (끝 / 죽은 날 · 까닭 · rc · 시간)  ② 판마다 100날 곡선(인구 · 산 마을 · RSS · 힙 · DB · 하루 초 · 하루 최대 초 · 틱 최대)
//          ③ 죽은 자리(그날 RSS · 힙 · 스택 15줄 · 다시 돌리는 한 줄)  ④ 첫 줄 칸(RSS 400 · 800 · 1200 · 1460날 · DB · 하루 초 처음 → 끝)
// 쓰는 법: R=<판 폴더> node scripts/t1434-table.js [--json out.json]
'use strict';
const fs = require('fs');
const path = require('path');

const R = process.env.R || '/home/user/t1434/run';
const args = process.argv.slice(2);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const lines = (f) => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean); } catch (e) { return []; } };

const done = new Map();
for (const l of lines(path.join(R, 'done.txt'))) { const [id, rc, sec] = l.trim().split(/\s+/); if (id) done.set(id, { rc: +rc, sec: +sec }); }
const jobs = [];
for (const l of lines(path.join(R, 'jobs.txt'))) {
  const [tag, seed, days, heap, cuts] = l.trim().split(/\s+/); if (!tag) continue;
  jobs.push({ id: `${tag}-${seed}${cuts ? `-c${cuts}` : ''}`, tag, seed: +seed, days: +days, heap, cuts: cuts || null });
}

// 죽은 판 로그에서 첫 오류 자리와 그 뒤 15줄(통째로 읽지 않는다 — 오류 줄 근처만)
const ERR = /FATAL ERROR|JavaScript heap out of memory|^\s*(Uncaught |)[A-Za-z]*Error\b|RangeError|TypeError|ReferenceError|Segmentation fault|Aborted|Killed/;
function stackOf(dir) {
  let segs = []; try { segs = fs.readdirSync(dir).filter((f) => /^seg-\d+\.log$/.test(f)).sort((a, b) => parseInt(a.slice(4)) - parseInt(b.slice(4))); } catch (e) {}
  for (const f of segs.reverse()) {
    const L = lines(path.join(dir, f)); const i = L.findIndex((x) => ERR.test(x));
    if (i >= 0) return { file: f, at: i + 1, lines: L.slice(i, i + 15).map((x) => x.slice(0, 220)) };
  }
  return null;
}
function causeOf(st, rc) {
  if (!st) return rc === 0 ? null : `rc ${rc}(오류 줄 없음)`;
  const t = st.lines.join('\n');
  if (/heap out of memory|Reached heap limit|Ineffective mark-compacts/.test(t)) return '힙 넘침(OOM)';
  if (/Killed/.test(t)) return 'SIGKILL';
  const m = t.match(/([A-Za-z]*Error)[: ]/); return m ? m[1] : st.lines[0].slice(0, 60);
}

const runs = [];
for (const j of jobs) {
  const D = path.join(R, j.id);
  const obs = lines(path.join(D, 'obs', `obs-${j.seed}.jsonl`)).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
  const last = rd(path.join(D, 'obs', `last-${j.seed}.json`));
  const prog = rd(path.join(D, 'progress.json'));
  const d = done.get(j.id) || null;
  const full = !!(d && d.rc === 0 && prog && prog.done);
  const st = d && !full ? stackOf(D) : null;
  const lastDay = obs.length ? Math.max(obs[obs.length - 1].day, last ? last.day : 0) : (last ? last.day : null);
  runs.push({ ...j, rc: d ? d.rc : null, sec: d ? d.sec : null, running: !d, full, lastDay, last, obs, stack: st, cause: d && !full ? causeOf(st, d.rc) : null });
}

const at = (r, day) => r.obs.find((x) => x.day === day) || null;
const L = [];
const main = runs.filter((r) => r.tag === 'h6g');
const nFull = main.filter((r) => r.full).length;
L.push(`# T1434 끔 세계 네 해 판 — 1460날 × 시드 1020 · 7 · 42(힙 6 GB) + 1020 기본 힙 · 끝까지 ${nFull}/${main.length}`);
L.push('');
L.push('- 판 자: `scripts/t1308-long-run.js 1460 <시드> --every 1460`(한 마디 = 존 프로세스 하나) · 끔 세계 `T400_BUILD_ACT=0 VILLAGE_CARAVAN_MAX=0 T745_VCLOCK=1` · 한 번에 한 판');
L.push('- 칸: 곁 관찰기 `계측/T1434_2026-11-22/t1434-observe.js`(읽기만) — 100날마다 한 줄 · 하루 초 = /proc/uptime 벽시계(그 100날 평균 · 최대)');
L.push('- ★틱 최대 ms(`monitorEventLoopDelay` 최대)는 가상 시계 판에서 하루 최대 초보다 큰 값이 찍힌다(믿지 못함 — 참고로만 둔다). 막힘의 위 끝은 "하루 최대 초"로 읽는다.');
L.push('');
L.push('## ① 판');
L.push('');
L.push('| 판 | 시드 | 힙 | 끝 / 죽은 날 | 까닭 | rc | 걸린 시간 |');
L.push('|---|---|---|---|---|---|---|');
for (const r of runs) {
  const end = r.running ? `(도는 중 · ${r.lastDay}날)` : r.full ? `끝 ${r.days}날` : `**죽음 ${r.lastDay + 1}날**(${r.lastDay}날 마침)`;
  L.push(`| ${r.id} | ${r.seed} | ${r.heap === 'def' ? '기본' : r.heap + ' MB'} | ${end} | ${r.cause || '—'} | ${r.rc == null ? '—' : r.rc} | ${r.sec == null ? '—' : (r.sec / 3600).toFixed(2) + '시간'} |`);
}
L.push('');
L.push('## ② 100날마다 곡선');
for (const r of runs) {
  L.push('');
  L.push(`### ${r.id}`);
  L.push('');
  L.push('| 날 | 인구 | 산 마을 | RSS MB | 힙 MB(쓴 것 / 한도) | DB MB | 하루 초(평균) | 하루 최대 초 | 틱 최대 ms(참고) |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const x of r.obs) L.push(`| ${x.day} | ${x.pop} | ${x.live}/${x.vills} | ${x.rssMB} | ${x.heapMB} / ${x.heapLimitMB} | ${x.dbMB} | ${x.secPerDay} | ${x.secDayMax} | ${x.tickMaxMs} |`);
  if (r.last && (!r.obs.length || r.last.day > r.obs[r.obs.length - 1].day)) L.push(`| ${r.last.day}(마지막 날) | | | ${r.last.rssMB} | ${r.last.heapMB} / | | | | |`);
}
L.push('');
L.push('## ③ 죽은 자리');
L.push('');
const dead = runs.filter((r) => r.rc != null && !r.full);
if (!dead.length) L.push('없음');
for (const r of dead) {
  L.push(`- **${r.id}** · 죽은 날 ${r.lastDay + 1}(${r.lastDay}날 마침 — last-<시드>.json 은 마친 날을 적는다) · ${r.cause} · rc ${r.rc} · 그날 RSS ${r.last ? r.last.rssMB : '?'} MB · 힙 ${r.last ? r.last.heapMB : '?'} MB`);
  const NO = `${r.heap === 'def' ? '' : `--max-old-space-size=${r.heap} `}-r 계측/T1434_2026-11-22/t1434-observe.js`;
  L.push(`  - 다시: \`T400_BUILD_ACT=0 VILLAGE_CARAVAN_MAX=0 T745_VCLOCK=1 T1434_OBS=/tmp/o NODE_OPTIONS="${NO}" node scripts/t1308-long-run.js ${r.days} ${r.seed} --every ${r.days}${r.cuts ? ` --cuts ${r.cuts}` : ''} --dir /tmp/r --tag ${r.tag}\``);
  // 같은 시드 · 같은 힙의 다른 판과 견줌(결정적인가 — 죽은 날 · 100날 칸 인구)
  for (const o of runs.filter((x) => x !== r && x.seed === r.seed && x.heap === r.heap)) {
    const same = r.obs.filter((x) => { const y = at(o, x.day); return y && y.pop === x.pop; }).length;
    const both = r.obs.filter((x) => at(o, x.day)).length;
    L.push(`  - 견줌 ${o.id}: ${o.full ? `끝 ${o.days}날` : o.rc == null ? '도는 중' : `죽음 ${o.lastDay + 1}날`} · 100날 칸 인구 같음 ${same}/${both}${o.cuts ? ` · (${o.cuts}날 저장본에서 다시 띄운 판)` : ''}`);
  }
  if (r.stack) { L.push(`  - ${r.stack.file} ${r.stack.at}줄부터 15줄:`); L.push('  ```'); for (const t of r.stack.lines) L.push('  ' + t); L.push('  ```'); }
}
L.push('');
L.push('## ⑤ 산 교전이 있던 날 수와 하루 초(100날 칸 · 판 로그 `⚔️ 전쟁 day N: … 교전 K` 줄에서 K ≥ 1 인 날)');
L.push('');
const fights = {};
for (const r of runs) {
  const m = new Map();
  for (const f of (() => { try { return fs.readdirSync(path.join(R, r.id)).filter((x) => /^seg-\d+\.log$/.test(x)); } catch (e) { return []; } })()) {
    for (const l of lines(path.join(R, r.id, f))) { const q = l.match(/전쟁 day (\d+):.*교전 (\d+)/); if (q && !m.has(+q[1])) m.set(+q[1], +q[2]); }
  }
  const win = {}; for (const [d, k] of m) { const b = Math.min(Math.ceil(d / 100) * 100, r.days); win[b] = win[b] || { n: 0, f: 0 }; win[b].n++; if (k > 0) win[b].f++; }
  fights[r.id] = win;
  const cells = r.obs.map((x) => `${x.day}날 ${win[x.day] ? win[x.day].f : '—'}일 · ${x.secPerDay}초`);
  if (cells.length) L.push(`- ${r.id}: ${cells.join(' | ')}`);
}
L.push('');
L.push('## ④ 첫 줄 칸');
L.push('');
const head = {};
for (const r of runs) {
  const rss = [400, 800, 1200, 1460].map((d) => { const x = at(r, d); return x ? x.rssMB : '—'; });
  const xs = r.obs.filter((x) => x.secPerDay != null);
  const s0 = xs.length ? xs[0].secPerDay : null, s1 = xs.length ? xs[xs.length - 1].secPerDay : null;
  const db = r.obs.length ? r.obs[r.obs.length - 1].dbMB : null;
  head[r.id] = { rss, db, s0, s1, lastDay: r.lastDay, full: r.full };
  L.push(`- ${r.id}: RSS 400 · 800 · 1200 · 1460날 ${rss.join(' · ')} MB · DB ${db} MB · 하루 ${s0} → ${s1}초`);
}
console.log(L.join('\n'));
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ runs: runs.map((r) => ({ id: r.id, seed: r.seed, heap: r.heap, rc: r.rc, sec: r.sec, full: r.full, lastDay: r.lastDay, cause: r.cause, last: r.last, obs: r.obs, stack: r.stack })), head, fights, nFull }, null, 1));
