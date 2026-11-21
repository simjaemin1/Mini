#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1387 표 · 읽기만 · `.done` · 날 줄 · mem 줄만 읽는다 — 손으로 세지 않는다)
// === scripts/t1387-table.js — 긴 판(끔 세계 1,200날 · 전쟁 판 800날) × T1349 손잡이 끔 · 켬 표 [T1387 · S13 · 2026-11-21] ===
//   쓰는 법: node scripts/t1387-table.js [<판 폴더>=계측/T1387_2026-11-21] > 표.md
//   읽는 것(`<폴더>/runs/<태그>.*` — `scripts/t1387-run.sh` 가 남긴 것):
//     .done(rc · 초 · 까닭 · 끝 날 · 지킴이 봉우리 RSS) · .t1371.jsonl.gz(날 줄 — `t1371-observe.js`: [날, econ 날, 사람[], 굶음 누계[], 자연사 누계[], 죽음 누계[], 도구Q, 무기Q] ·
//     이름 줄 {names}) · .mem.jsonl.gz(`t1349-mem-hook.js` 날마다 rss · heap) · .zone-tail200.log.gz(멎은 판 — 까닭 글자 "heap out of memory" 만 찾는다).
//   판 칸: 끝까지(판 JSON 있음 · 끝 날 = 판 날) · 멎은 날(날 줄 마지막 날) · 까닭(OOM = 존 로그에 heap out of memory · 멈춤 · 시한 = 지킴이) ·
//     봉우리 RSS(지킴이 15초 표본 — 프로세스 묶음 합 · mem 줄 존 rss 최댓값 · 산 힙 live 최댓값) · 판 시간.
//   해 칸(365날 토막 · 날 줄이 있는 날까지 · * = 토막): 해 끝 인구(사람 합) · 굶어 죽음(굶음 누계 증분 합) · 죽음 전체(죽음 누계 증분 합) · 빈 마을(해 끝 사람 0) ·
//     마을별 최악(그 해 한 마을 굶음 증분 최댓값 · 마을).
//   켬 팔: 같은 종류 · 시드의 끔 판과 날 줄이 처음 갈리는 날(줄 글자 그대로 견줌).
//   결정성: 태그 끝이 `-다시` 인 판 — 다시 돌린 원판과 날 줄 전부 · 날 지문(.sbc.json days) 같음.
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const A = process.argv.slice(2);
const DIR = A.find((x) => !x.startsWith('--')) || path.join(__dirname, '..', '계측', 'T1387_2026-11-21');
const R = path.join(DIR, 'runs');
const rd = (f) => { try { let b = fs.readFileSync(path.join(R, f)); if (/\.gz$/.test(f)) b = zlib.gunzipSync(b); return b.toString('utf8'); } catch (e) { return null; } };
const queue = fs.readFileSync(path.join(DIR, 'queue.tsv'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => { const [tag, kind, seed, days, env] = l.split('\t'); return { tag, kind, seed: +seed, days: +days, env: env || '' }; });
const lines = (tag) => { const t = rd(`${tag}.t1371.jsonl.gz`); return t ? t.split('\n').filter(Boolean) : []; };
const dayRows = (ls) => { let names = []; const out = []; for (const l of ls) { const j = JSON.parse(l); if (!Array.isArray(j)) { names = j.names || names; continue; } out.push({ d: j[0], names, pop: j[2], fd: j[3], nat: j[4], dead: j[5], l }); } return out; };
const sum = (a) => a.reduce((s, x) => s + (x || 0), 0);
const fmt = (x) => (x == null ? '—' : Number(x).toLocaleString('en-US'));
const out = [];
const runs = [];
for (const q of queue) {
  let done = null; try { done = JSON.parse(rd(`${q.tag}.done`)); } catch (e) {}
  const ls = lines(q.tag), rows = dayRows(ls);
  const mem = (rd(`${q.tag}.mem.jsonl.gz`) || '').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
  const last = rows.length ? rows[rows.length - 1].d : null;
  const full = !!(done && done.json === 1 && last === q.days);
  let why = done ? done.why : '';
  if (done && !full && !why) { const zt = rd(`${q.tag}.zone-tail200.log.gz`) || '', ck = rd(`${q.tag}.check-tail.log`) || ''; why = /heap out of memory/i.test(zt + ck) ? 'OOM(힙 넘침)' : `존 끝남 rc ${done.rc}`; }
  runs.push({ ...q, done, rows, ls, last, full, why, rssMem: mem.length ? Math.max(...mem.map((m) => m.rss || 0)) : null, live: mem.length ? Math.max(...mem.map((m) => m.live || 0)) : null });
}
const fin = runs.filter((r) => r.done && !r.tag.endsWith('-다시'));
const byKind = (k) => fin.filter((r) => r.kind === k);
out.push('# T1387 — 긴 판: 끔 세계 1,200날 · 전쟁 판 800날 × T1349_WAR_PATH_SHARE 끔 · 켬', '');
out.push(`끔 세계 1,200날 끝까지 ${byKind('off').filter((r) => r.full).length}/${byKind('off').length}(줄 ${queue.filter((q) => q.kind === 'off' && !q.tag.endsWith('-다시')).length}) · 전쟁 800날 끝까지 ${byKind('war').filter((r) => r.full).length}/${byKind('war').length}(줄 ${queue.filter((q) => q.kind === 'war' && !q.tag.endsWith('-다시')).length})`, '');
out.push('## 판', '', '| 판 | env | 끝까지 | 멎은 날 | 까닭 | 봉우리 RSS(묶음 · 존 · 산 힙 MB) | 판 시간(초) | 켬: 끔과 처음 갈리는 날 |', '|---|---|---|---:|---|---|---:|---|');
for (const r of runs) {
  if (!r.done) { out.push(`| ${r.tag} | \`${r.env || '—'}\` | 안 돎 |  |  |  |  |  |`); continue; }
  let split = '';
  if (r.env && !r.tag.endsWith('-다시')) {
    const off = runs.find((x) => x.kind === r.kind && x.seed === r.seed && !x.env && x.done);
    if (!off) split = '끔 판 없음';
    else { const n = Math.min(off.rows.length, r.rows.length); let i = 0; while (i < n && off.rows[i].l === r.rows[i].l) i++;
      split = i < n ? `날 ${r.rows[i].d}` : (off.rows.length === r.rows.length ? `안 갈림(${n}날 같음)` : `${n}날까지 같음(한쪽이 먼저 멎음)`); }
  }
  out.push(`| ${r.tag} | \`${r.env || '—'}\` | ${r.full ? '○' : '✗'} | ${r.full ? '—' : fmt(r.last)} | ${r.full ? '—' : (r.why || '—')} | ${fmt(r.done.peakRssMB)} · ${fmt(r.rssMem && Math.round(r.rssMem))} · ${fmt(r.live && Math.round(r.live))} | ${fmt(r.done.sec)} | ${split} |`);
}
out.push('', '## 해마다(365날 토막 · * = 토막 해 · 날 줄이 있는 날까지)', '', '| 판 | 해(날) | 해 끝 인구 | 굶어 죽음 | 죽음 전체 | 빈 마을 | 마을별 최악(굶음 · 마을) |', '|---|---|---:|---:|---:|---:|---|');
for (const r of runs) {
  if (!r.rows.length || r.tag.endsWith('-다시')) continue;
  const ny = Math.ceil(r.days / 365);
  let prev = null;
  for (let y = 1; y <= ny; y++) {
    const lo = 365 * (y - 1) + 1, hi = Math.min(365 * y, r.days);
    const yr = r.rows.filter((x) => x.d >= lo && x.d <= hi); if (!yr.length) break;
    const e = yr[yr.length - 1], cut = e.d < hi;
    const fdPrev = prev ? sum(prev.fd) : 0, deadPrev = prev ? sum(prev.dead) : 0;
    let worst = 0, wn = '—';
    e.names.forEach((nm, i) => { const p = prev ? (prev.fd[prev.names.indexOf(nm)] || 0) : 0, v = (e.fd[i] || 0) - p; if (v > worst) { worst = v; wn = nm; } });
    out.push(`| ${r.tag} | ${y}${cut ? '*' : ''}(${lo}~${e.d}) | ${fmt(sum(e.pop))} | ${fmt(sum(e.fd) - fdPrev)} | ${fmt(sum(e.dead) - deadPrev)} | ${e.pop.filter((x) => !x).length} | ${worst ? `${worst} · ${wn}` : '0 · —'} |`);
    prev = e;
  }
}
const re = runs.filter((r) => r.tag.endsWith('-다시') && r.done);
if (re.length) {
  out.push('', '## 결정성(다시 돌린 판)', '', '| 판 | 원판 | 날 줄 | 날 지문 |', '|---|---|---|---|');
  for (const r of re) {
    const o = runs.find((x) => x.tag === r.tag.replace(/-다시$/, ''));
    const same = o && o.ls.length === r.ls.length && o.ls.every((l, i) => l === r.ls[i]);
    let fp = '없음'; try { const a = JSON.parse(rd(`${o.tag}.sbc.json.gz`)).days, b = JSON.parse(rd(`${r.tag}.sbc.json.gz`)).days; fp = JSON.stringify(a) === JSON.stringify(b) ? `○ ${b.length}날 같음` : '✗ 다름'; } catch (e) {}
    out.push(`| ${r.tag} | ${o ? o.tag : '—'} | ${same ? `○ ${r.ls.length}줄 같음` : '✗ 다름'} | ${fp} |`);
  }
}
process.stdout.write(out.join('\n') + '\n');
