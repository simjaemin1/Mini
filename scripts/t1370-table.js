#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1370 표 자 · 판 JSON 만 읽는다 · 제품 손 0)
// === scripts/t1370-table.js — 끔 기본 손잡이 하나씩 켠 판 표 [T1370 · S13 · 2026-11-18] ===
//
// 읽는 것: <dir>/knobs.tsv(차례) · <dir>/runs/<이름>-<시드>.json(t577 판 JSON — server-baseline-check 가 남긴 sbc-<시드>.json) · .done(rc · 초 · 까닭 · 끝 날)
// 칸: 인구(끔 대비 %) · 굶어 죽음(몸 꼬리표 bodyExit.died.starve · 도적 굶음 bandit_starve) · 죽음 누계(deadTot) · 빈 마을 · 해체 ·
//     무기Q · 도구Q · 게시 · 끝까지 돌았나 · 걸린 초 · 끔과 같은가(판 JSON 지문 `lib-run-hash` — env 칸 밖 · 같으면 "판에서 안 탐").
// 쓰는 법: node scripts/t1370-table.js 계측/T1370_2026-11-18 [--seed 1020] [--off OFF] [--list 계측/T1370_2026-11-18/seed742-list.txt] > 표.md
const fs = require('fs'), path = require('path');
const RH = require('./lib-run-hash');
const A = process.argv.slice(2);
const dir = A.find((x) => !x.startsWith('--')) || '계측/T1370_2026-11-18';
const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const SEED = opt('--seed', '1020'), OFFN = opt('--off', 'OFF');
let names = fs.readFileSync(path.join(dir, 'knobs.tsv'), 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
// --list <파일>: 이 이름만(7 · 42 는 ±5% 넘은 손잡이 + 짝만 돈다 — 안 돈 줄을 표에 안 깐다)
const LIST = opt('--list', null);
if (LIST) { const keep = new Set(fs.readFileSync(LIST, 'utf8').split(/\s+/).filter(Boolean)); names = names.filter(([n]) => keep.has(n)); }
const rd = (n) => { const b = path.join(dir, 'runs', `${n}-${SEED}`); let run = null, done = null;
  try { done = JSON.parse(fs.readFileSync(b + '.done', 'utf8')); } catch (e) {}
  try { run = JSON.parse(fs.readFileSync(b + '.json', 'utf8')); } catch (e) {}
  return { run, done }; };
const hashOf = (run) => { const r = Object.assign({}, run); delete r.env; return RH.runHashOf(r); };
const off = rd(OFFN);
if (!off.run) { console.error(`끔 판(${OFFN}-${SEED}) 판 JSON 없음`); process.exit(2); }
const offPop = off.run.eight.pop, offHash = hashOf(off.run);
const rows = [];
for (const [n, env] of names) {
  const { run, done } = rd(n);
  if (!done) { rows.push({ n, env, pend: true }); continue; }
  const full = !!(run && done.rc === 0 && String(done.lastDay) === String(run.days || done.lastDay));
  if (!run) { rows.push({ n, env, done, fail: true }); continue; }
  const e = run.eight, d = (run.bodyExit && run.bodyExit.died) || {};
  rows.push({ n, env, done, full, pop: e.pop, pct: (e.pop / offPop - 1) * 100, starve: d.starve || 0, bstarve: d.bandit_starve || 0, deadTot: run.deadTot,
    empty: run.empty, diss: run.dissolved, weapQ: e.weapQ, toolQ: e.toolQ, board: e.board, hash: hashOf(run), same: n !== OFFN && hashOf(run) === offHash });
}
// 짝 판 — 짝에 기대는 손잡이(env 가 둘 이상)는 "제 env 하나를 뺀 env" 를 가진 줄(짝만 켠 판)과도 견준다
//   (끔 대비 % 는 짝의 몫까지 든다 — 짝 대비 % 와 지문 같음이 이 손잡이 하나의 몫)
const envOf = (n) => (names.find((x) => x[0] === n) || [])[1] || '';
// 짝 판(refs.tsv — 11-01 앞 끔 손잡이 · 손잡이 수 밖)도 짝으로 쓴다
let refs = []; try { refs = fs.readFileSync(path.join(dir, 'refs.tsv'), 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t')); } catch (e) {}
const refRows = refs.map(([n, env]) => { const { run } = rd(n); return run ? { n, env, pop: run.eight.pop, hash: hashOf(run), pct: (run.eight.pop / offPop - 1) * 100, same: hashOf(run) === offHash } : { n, env }; });
const byEnv = new Map([...refRows, ...rows].filter((r) => r.pop != null).map((r) => [(r.env || '').split(' ').filter(Boolean).sort().join(' '), r]));
for (const r of rows) {
  const parts = (r.env || '').split(' ').filter(Boolean); if (parts.length < 2 || r.pop == null) continue;
  const own = parts.find((x) => x.startsWith(r.n + '=')) || parts[parts.length - 1];
  const pe = parts.filter((x) => x !== own).sort().join(' '), p = byEnv.get(pe);
  r.par = p ? { n: p.n, pct: (r.pop / p.pop - 1) * 100, same: r.hash === p.hash } : { n: null };
}
const f1 = (x) => (x == null ? '—' : (Math.round(x * 10) / 10).toLocaleString('en-US'));
const fp = (x) => (x == null ? '—' : `${x >= 0 ? '+' : ''}${x.toFixed(1)}%`);
const cnt = (v) => (Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : (v || 0)));
const doneRows = rows.filter((r) => r.done && r.n !== OFFN);
const up = doneRows.filter((r) => r.pct > 5), dn = doneRows.filter((r) => r.pct < -5), same = doneRows.filter((r) => r.same);
const bad = doneRows.filter((r) => r.fail || !r.full);
const parSame = doneRows.filter((r) => r.par && r.par.same);
const secs = rows.filter((r) => r.done).reduce((s, r) => s + (r.done.sec || 0), 0);
const out = [];
out.push(`# T1370 — 끔 기본 손잡이 하나씩 켠 판 · 시드 ${SEED} · 400날 · 가상 시계 (server-baseline-check 판 조건)`, '');
out.push(`손잡이 ${names.length - 1} · 돈 판 ${doneRows.length} · 인구 +5% 넘음 ${up.length}(${up.map((r) => r.n).join(' · ') || '—'}) · −5% 밑 ${dn.length}(${dn.map((r) => r.n).join(' · ') || '—'}) · 판에서 안 타는 것(끔과 판 JSON 지문 같음) ${same.length} · 짝 판과 같음(짝만 켠 판과 판 JSON 지문 같음 — 제 몫 안 탐) ${parSame.length}(${parSame.map((r) => r.n).join(' · ') || '—'}) · 못 끝난 판 ${bad.length} · 판 초 합 ${secs}(${(secs / 3600).toFixed(1)}시간 · 두 판 나란히라 벽시계는 대략 절반)`, '');
out.push(`끔(${OFFN}): 인구 ${offPop.toLocaleString('en-US')} · 판 JSON 지문 \`${offHash}\``, '');
out.push('| 손잡이 | 켠 env | 인구 | 끔 대비 | 굶음(몸 · 도적) | 죽음 누계 | 빈 마을 | 해체 | 무기Q | 도구Q | 게시 | 끝까지 | 초 | 끔과 같음 | 짝 판 대비 |');
out.push('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---|---|');
for (const r of rows) {
  if (r.pend) { out.push(`| ${r.n} | \`${r.env || '—'}\` | 안 돎 |  |  |  |  |  |  |  |  |  |  |  |  |`); continue; }
  if (r.fail) { out.push(`| ${r.n} | \`${r.env || '—'}\` | 판 JSON 없음 |  |  |  |  |  |  |  |  | ✗ rc ${r.done.rc} · ${r.done.why || '—'} · 끝 날 ${r.done.lastDay || '—'} | ${r.done.sec} |  |  |`); continue; }
  out.push(`| ${r.n} | \`${r.env || '—'}\` | ${r.pop.toLocaleString('en-US')} | ${r.n === OFFN ? '—' : fp(r.pct)} | ${r.starve} · ${r.bstarve} | ${r.deadTot} | ${cnt(r.empty)} | ${cnt(r.diss)} | ${f1(r.weapQ)} | ${f1(r.toolQ)} | ${r.board} | ${r.full ? '○' : `✗ rc ${r.done.rc} · ${r.done.why || '—'} · 끝 날 ${r.done.lastDay || '—'}`} | ${r.done.sec} | ${r.n === OFFN ? '—' : (r.same ? '★같음(안 탐)' : '다름')} | ${!r.par ? '' : !r.par.n ? '짝 판 없음' : `${r.par.n} ${fp(r.par.pct)}${r.par.same ? ' ★짝과 같음(제 몫 안 탐)' : ''}`} |`);
}
if (refs.length) {
  out.push('', '짝 판(11-01 앞 끔 손잡이 — 위 손잡이의 짝 대비 견줌용 · 손잡이 수 밖):', '', '| 짝 판 | 켠 env | 인구 | 끔 대비 | 끔과 같음 |', '|---|---|---:|---:|---|');
  for (const r of refRows) out.push(r.pop == null ? `| ${r.n} | \`${r.env}\` | 안 돎 |  |  |` : `| ${r.n} | \`${r.env}\` | ${r.pop.toLocaleString('en-US')} | ${fp(r.pct)} | ${r.same ? '★같음(안 탐)' : '다름'} |`);
}
process.stdout.write(out.join('\n') + '\n');
