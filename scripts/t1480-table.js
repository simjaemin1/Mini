#!/usr/bin/env node
// (@regress 없음 — 러너 밖 표 입 · T1480)
// =============================================================================
// scripts/t1480-table.js — T1480 표 입. 세계를 안 띄운다 · 제품 코드 · 하네스를 안 부른다 · 판 요약 tsv 와 git 로그만 읽는다(손 셈 0).
//
// 쓰는 법
//   표   node scripts/t1480-table.js --md 계측/T1480_2026-11-24/table.md --json 계측/T1480_2026-11-24/table.json [--dir 계측/T1480_2026-11-24]
//   묶기 node scripts/t1480-table.js --pack <raw 디렉터리 · 하네스별 runs.tsv 가 든 곳들> <out 디렉터리>   (raw → 작은 요약만 · pos 줄은 gz 하나로)
//
// 읽는 것(`--dir` 안): commits.txt(first-parent 옛 → 새) · runs.<하네스>.tsv(커밋 하네스 판 G|R|Y|X rc 초 첫✗줄) · skipped.<하네스>.txt(건너뛴 번호)
//   · head20.runs.tsv · head20.pos.jsonl.gz(빨강 판 ⑦ 자리) · filled.txt(옛 커밋에 채운 보조 모듈).
// 판정 규칙(스크립트가 셈 — 손 0):
//   커밋 하나의 판정 = 앞 N 판(membership 5 · 흔들림 셋 10 · first30 3) 중 빨강(R) 수 ≥ 문턱 → 빨강(N 판 뒤에 더 잰 판은 따로 적고 판정엔 안 쓴다), 아니면 초록(못뜸 X 가 판 전부면 건너뜀). 문턱: membership 둘(카드 "셋 넘게" = 넷은 머리가 3/5 라 안 닿는다 · 둘째 열에 카드 문턱도 같이 적는다) · 흔들림 셋 하나("0 이던 마지막 → 처음 흔들린").
//   마지막 초록 = 판 잰 커밋 가운데 "빨강인 가장 이른 커밋" 바로 앞의 초록 중 가장 늦은 것 · 첫 빨강 = 빨강인 가장 이른 커밋. 이 뒤에 초록이 섞이면 "비단조" 표시.
//   카드 번호 = 커밋 제목의 `T숫자`(맨 끝 대괄호 우선) 또는 `land숫자` · 바꾼 파일 = first-parent 부모와의 차(`git diff --name-only <c>^1 <c>`) · 제목 = 파일 머리 5줄의 첫 " — " 앞뒤 글.
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const list = (f) => { const i = argv.indexOf(f); if (i < 0) return []; const o = []; for (let j = i + 1; j < argv.length && !argv[j].startsWith('--'); j++) o.push(argv[j]); return o; };
const git = (...a) => { try { return execFileSync('git', ['-c', 'core.quotepath=false', ...a], { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return ''; } };
const readTsv = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t')) : []);
const readLines = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean) : []);
const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

// ───────────────────────── 묶기 ─────────────────────────
if (argv.includes('--pack')) {
  const [rawDir, outDir] = list('--pack');
  fs.mkdirSync(outDir, { recursive: true });
  const pos = [];
  for (const sub of fs.readdirSync(rawDir).sort()) {
    const d = path.join(rawDir, sub);
    if (!fs.statSync(d).isDirectory()) continue;
    for (const f of fs.readdirSync(d).sort()) {
      const p = path.join(d, f);
      if (f === 'runs.tsv') {
        const rows = readTsv(p); const by = {};
        for (const r of rows) (by[r[1]] = by[r[1]] || []).push(r);
        for (const h of Object.keys(by)) {
          const name = sub === 'head20' ? 'head20.runs.tsv' : `runs.${h}.tsv`;
          const prev = fs.existsSync(path.join(outDir, name)) ? readTsv(path.join(outDir, name)) : [];
          const all = prev.concat(by[h]);
          const seen = new Set(); const uniq = [];
          for (const r of all) { const k = r.slice(0, 3).join('|'); if (!seen.has(k)) { seen.add(k); uniq.push(r); } }
          uniq.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : (+a[2]) - (+b[2])));
          fs.writeFileSync(path.join(outDir, name), uniq.map((r) => r.join('\t')).join('\n') + '\n');
        }
      } else if (/^pos\..*\.jsonl$/.test(f)) {
        const m = f.match(/^pos\.(.+)\.e2e-membership\.(\d+)\.jsonl$/);
        const first = readLines(p)[0];
        if (m && first && sub === 'head20') pos.push(JSON.stringify(Object.assign({ run: +m[2] }, JSON.parse(first))));
      } else if (/^skipped\./.test(f)) {
        const prev = new Set(readLines(path.join(outDir, f)));
        for (const l of readLines(p)) prev.add(l);
        fs.writeFileSync(path.join(outDir, f), [...prev].sort((a, b) => a - b).join('\n') + '\n');
      } else if (/^drive\..*\.log$/.test(f)) {
        fs.copyFileSync(p, path.join(outDir, f.replace(/^drive\./, 'drive.')));
      } else if (/^filled\./.test(f)) {
        const prev = new Set(readLines(path.join(outDir, 'filled.txt')));
        for (const l of readLines(p)) prev.add(l);
        fs.writeFileSync(path.join(outDir, 'filled.txt'), [...prev].sort().join('\n') + '\n');
      }
    }
  }
  if (pos.length) fs.writeFileSync(path.join(outDir, 'head20.pos.jsonl.gz'), zlib.gzipSync(pos.sort().join('\n') + '\n', { level: 9 }));
  process.exit(0);
}

// ───────────────────────── 표 ─────────────────────────
const DIR = val('--dir', path.join(__dirname, '..', '계측', 'T1480_2026-11-24'));
const MD = val('--md', null), JS = val('--json', null);
const commits = readLines(path.join(DIR, 'commits.txt'));
const idxOf = new Map(commits.map((c, i) => [c, i + 1]));
const HARN = [
  { h: 'e2e-membership', red: 2, card: 4, n: 5 },
  { h: 'e2e-blizzard', red: 1, card: 1, n: 10 },
  { h: 'e2e-rtt', red: 1, card: 1, n: 10 },
  { h: 'e2e-first30', red: 1, card: 1, n: 3 },
];
const info = {};
function commitInfo(c) {
  if (info[c]) return info[c];
  const full = git('rev-parse', c).trim();
  const subj = git('log', '-1', '--format=%s', full).trim();
  const date = git('log', '-1', '--format=%ad', '--date=format:%F %H:%M', full).trim();
  let card = null;
  const tail = subj.match(/\[([^\]]*)\]\s*$/); const pools = [tail ? tail[1] : '', subj];
  for (const s of pools) { const m = s.match(/(?<![A-Za-z0-9])T\d{3,5}(?!\d)/g); if (m) { card = [...new Set(m)].join('·'); break; } }
  const land = subj.match(/\bland\d{3,5}\b/); if (!card && land) card = land[0]; else if (land && card) card += '·' + land[0];
  const files = git('diff', '--name-only', `${full}^1`, full).split('\n').filter(Boolean);
  const merged = git('log', '--format=%h %s', `${full}^1..${full}^2`).split('\n').filter(Boolean);
  const title = (f) => {
    const t = git('show', `${full}:${f}`).split('\n').slice(0, 5).join('\n');
    const m = t.match(/(?:\/\/|#)\s*=*\s*[^\n]*?—\s*([^\n=]{3,60})/); return m ? m[1].trim() : '';
  };
  info[c] = { sha: c, date, subject: subj.slice(0, 160), card, nFiles: files.length, files: files.slice(0, 12).map((f) => ({ f, title: /\.(js|sh|md)$/.test(f) ? title(f) : '' })), merged: merged.length, mergedTop: merged.slice(0, 6).map((l) => l.slice(0, 110)) };
  return info[c];
}
const out = { harness: {}, head20: null, filled: readLines(path.join(DIR, 'filled.txt')) };
for (const H of HARN) {
  const rows = readTsv(path.join(DIR, `runs.${H.h}.tsv`));
  const per = new Map();
  for (const r of rows) {
    const c = per.get(r[0]) || { sha: r[0], n: 0, G: 0, R: 0, Y: 0, X: 0, lines: {}, secs: [], allN: 0, allR: 0 };
    c.allN++; if (r[3] === 'R') c.allR++;
    if (+r[2] > H.n) { per.set(r[0], c); continue; }   // 판정은 카드의 판 수(앞 N 판)만 — 더 잰 판은 따로 센다
    c.n++; c[r[3]]++; c.secs.push(+r[5]);
    if (r[3] === 'R') c.lines[r[6]] = (c.lines[r[6]] || 0) + 1;
    per.set(r[0], c);
  }
  const tested = [...per.values()].map((c) => {
    const i = idxOf.get(c.sha) || commits.findIndex((x) => x.startsWith(c.sha.slice(0, 7))) + 1;
    return Object.assign(c, { idx: i, v: c.X >= c.n ? 'X' : c.R >= H.red ? 'R' : 'G', medSec: med(c.secs) });
  }).sort((a, b) => a.idx - b.idx);
  const reds = tested.filter((c) => c.v === 'R');
  const firstRed = reds.length ? reds[0] : null;
  const greens = tested.filter((c) => c.v === 'G' && (!firstRed || c.idx < firstRed.idx));
  const lastGreen = greens.length ? greens[greens.length - 1] : null;
  const mono = !(firstRed && tested.some((c) => c.v === 'G' && c.idx > firstRed.idx));
  const gAfter = firstRed ? tested.filter((c) => c.v === 'G' && c.idx > firstRed.idx).map((c) => c.sha) : [];
  const skipped = readLines(path.join(DIR, `skipped.${H.h}.txt`)).map(Number).filter(Boolean);
  const skipSha = [...new Set(skipped)].sort((a, b) => a - b).map((i) => commits[i - 1]);
  const topLine = (c) => { if (!c) return null; const e = Object.entries(c.lines).sort((a, b) => b[1] - a[1]); return e.length ? { line: e[0][0], n: e[0][1], of: c.R } : null; };
    const adjacent = lastGreen && firstRed ? (firstRed.idx - lastGreen.idx) : null;
  out.harness[H.h] = {
    threshold: H.red, cardThreshold: H.card, testedCommits: tested.length,
    lastGreen: lastGreen && { sha: lastGreen.sha, idx: lastGreen.idx, red: `${lastGreen.R}/${lastGreen.n}`, info: commitInfo(lastGreen.sha) },
    firstRed: firstRed && { sha: firstRed.sha, idx: firstRed.idx, red: `${firstRed.R}/${firstRed.n}`, line: topLine(firstRed), info: commitInfo(firstRed.sha) },
    commitsBetween: adjacent == null ? null : adjacent - 1,
    monotone: mono, greenAfterFirstRed: gAfter, skipped: skipSha, skippedN: skipSha.length,
    perCommit: tested.map((c) => ({ idx: c.idx, sha: c.sha, red: `${c.R}/${c.n}`, all: c.allN > c.n ? `${c.allR}/${c.allN}` : null, X: c.X, v: c.v, medSec: c.medSec })),
  };
}
// head20 — 머리 스무 판(⑦ 빨강 줄 · 자리)
{
  const rows = readTsv(path.join(DIR, 'head20.runs.tsv')).sort((a, b) => +a[2] - +b[2]);
  const reds = rows.filter((r) => r[3] === 'R'), lines = {};
  for (const r of reds) lines[r[6]] = (lines[r[6]] || 0) + 1;
  const top = Object.entries(lines).sort((a, b) => b[1] - a[1]);
  const p = path.join(DIR, 'head20.pos.jsonl.gz');
  const pos = fs.existsSync(p) ? zlib.gunzipSync(fs.readFileSync(p)).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const dists = pos.map((q) => q.nearest && q.nearest.d).filter((d) => d != null);
  out.head20 = {
    runs: rows.length, red: reds.length, green: rows.filter((r) => r[3] === 'G').length, other: rows.filter((r) => !['R', 'G'].includes(r[3])).length,
    lines: top.map(([l, n]) => ({ line: l, n })), modal: top[0] ? { line: top[0][0], n: top[0][1] } : null, distinctLines: top.length,
    pos: pos.map((q) => ({ run: q.run, res: (rows.find((r) => +r[2] === q.run) || [])[3] || '?', nearVid: q.nearVid, x: q.x, y: q.y, nearest: q.nearest })),
    posRedNullNearVid: pos.filter((q) => q.nearVid == null).length, posRedN: pos.length,
    distMin: dists.length ? Math.min(...dists) : null, distMed: med(dists), distMax: dists.length ? Math.max(...dists) : null,
  };
}
const msgNum = (l) => { const m = String(l || '').match(/(\d+)\s*(?:px|칸)/); return m ? m[1] : null; };

const J = JSON.stringify(out, null, 1) + '\n';
if (JS) fs.writeFileSync(JS, J);
if (MD) {
  const L = [];
  const fmtFiles = (i) => (i ? i.files.map((x) => `\`${x.f}\`${x.title ? `(${x.title})` : ''}`).join(' · ') + (i.nFiles > i.files.length ? ` 외 ${i.nFiles - i.files.length}` : '') : '—');
  L.push('# T1480 표 — 마지막 초록 · 첫 빨강 · 카드 · 바꾼 파일 · 빨강 줄');
  L.push('');
  L.push('`node scripts/t1480-table.js --md 계측/T1480_2026-11-24/table.md --json 계측/T1480_2026-11-24/table.json` 으로 다시 낸다(손 셈 0).');
  L.push('');
  L.push('## 1. 하네스 × (마지막 초록 · 첫 빨강 · 카드 · 바꾼 파일 · 빨강 줄)');
  L.push('');
  L.push('| 하네스 | 문턱(빨강 판 수 ≥) | 마지막 초록 | 첫 빨강 | 둘 사이 커밋 | 카드 | 바꾼 파일 | 빨강 줄(첫 빨강 커밋 판) | 건너뜀 |');
  L.push('|---|---|---|---|---:|---|---|---|---:|');
  for (const H of HARN) {
    const d = out.harness[H.h], fr = d.firstRed, lg = d.lastGreen;
    const atStart = fr && fr.idx === 1;
    if (atStart) { L.push(`| ${H.h} | ${d.threshold} | (범위 앞 — 해당 없음) | \`${fr.sha}\` #1 ${fr.info.date} (${fr.red}) — **범위 첫 커밋부터 이미 빨강** | — | — | — | ${fr.line ? `${fr.line.line.replace(/\|/g, '/').slice(0, 160)} (${fr.line.n}/${fr.line.of})` : '—'} | ${d.skippedN} |`); continue; }
    L.push(`| ${H.h} | ${d.threshold} / ${d.cardThreshold}(카드) | ${lg ? `\`${lg.sha}\` #${lg.idx} ${lg.info.date} (${lg.red})` : '—'} | ${fr ? `\`${fr.sha}\` #${fr.idx} ${fr.info.date} (${fr.red})` : '—'}${d.monotone ? '' : ' ★비단조'} | ${d.commitsBetween == null ? '—' : d.commitsBetween} | ${fr ? (fr.info.card || '—') : '—'} | ${fr ? fmtFiles(fr.info) : '—'} | ${fr && fr.line ? `${fr.line.line.replace(/\|/g, '/').slice(0, 160)} (${fr.line.n}/${fr.line.of})` : '—'} | ${d.skippedN} |`);
  }
  L.push('');
  L.push('판정: 커밋의 판 가운데 빨강(R) 수 ≥ 문턱이면 빨강. 못뜸(X) = 하네스가 첫 줄도 못 찍은 판(건너뜀). 마지막 초록 = 첫 빨강 바로 앞에서 잰 초록 가운데 가장 늦은 것.');
  L.push('');
  for (const H of HARN) {
    const d = out.harness[H.h];
    L.push(`## 2. ${H.h} — 잰 커밋(first-parent 번호 순)`);
    L.push('');
    L.push(`잰 커밋 ${d.testedCommits} · 건너뜀 ${d.skippedN}${d.skipped.length ? ' (' + d.skipped.map((s) => `\`${s}\``).join(' ') + ')' : ''} · 단조 ${d.monotone ? '예' : '아니오 — 첫 빨강 뒤 초록: ' + d.greenAfterFirstRed.join(' ')}`);
    L.push('');
    L.push('| # | 커밋 | 빨강(앞 N 판) | 더 잰 판 포함 | 못뜸 | 판정 | 판 초(가운데) |');
    L.push('|---:|---|---:|---:|---:|---|---:|');
    for (const c of d.perCommit) L.push(`| ${c.idx} | \`${c.sha}\` | ${c.red} | ${c.all || '—'} | ${c.X} | ${c.v} | ${c.medSec == null ? '—' : c.medSec} |`);
    L.push('');
    if (d.firstRed && d.firstRed.idx > 1) {
      const i = d.firstRed.info;
      L.push(`첫 빨강 \`${d.firstRed.sha}\` — ${i.date} · ${i.subject}`);
      L.push(`* 카드 ${i.card || '—'} · 바꾼 파일 ${i.nFiles}개 · 합친 커밋 ${i.merged}개`);
      for (const m of i.mergedTop) L.push(`  * ${m}`);
      L.push('');
    }
  }
  const h = out.head20;
  L.push('## 3. 머리(`53a54a4f8`) `e2e-membership` 스무 판 — 빨강 줄 · 자리');
  L.push('');
  L.push(`판 ${h.runs} · 빨강 ${h.red} · 초록 ${h.green} · 그 밖 ${h.other} · 빨강 줄 갈래 ${h.distinctLines}`);
  L.push('');
  for (const l of h.lines) L.push(`* ${l.n}판 — ${l.line}`);
  L.push('');
  L.push(`거리 수(글 안): ${h.modal ? (msgNum(h.modal.line) || '없음 — 글에 거리 수가 안 든다("마을에서 너무 멉니다. 곳간 앞으로 가십시오." 는 `_memberNearVid` 가 비었을 때 나오는 문이고 거리를 재지 않는다)') : '—'}`);
  L.push('');
  L.push(`손님 자리 기록(읽기만 하는 귀 \`scripts/t1480-posdump.js\` — 판의 첫 \`/인출\` = ⑦ 직전): ${h.posRedN}판 · \`_memberNearVid\` 가 빈 판 ${h.posRedNullNearVid} · 가장 가까운 마을 앞자리까지 거리 가장 작음 ${h.distMin} · 가운데 ${h.distMed} · 가장 큼 ${h.distMax} (px · 근접 문턱 260)`);
  L.push('');
  L.push('| 판 | 결과 | 손님 (x,y) | `_memberNearVid` | 가장 가까운 마을 | 앞자리 (x,y) | 거리 px |');
  L.push('|---:|---|---|---|---|---|---:|');
  for (const q of h.pos) L.push(`| ${q.run} | ${q.res} | ${q.x},${q.y} | ${q.nearVid == null ? '비었음' : q.nearVid} | ${q.nearest ? `${q.nearest.vid} ${q.nearest.name || ''}` : '—'} | ${q.nearest ? `${q.nearest.ax},${q.nearest.ay}` : '—'} | ${q.nearest ? q.nearest.d : '—'} |`);
  L.push('');
  if (out.filled.length) { L.push(`옛 커밋에 없어서 지금 것으로 채운 보조 모듈: ${out.filled.map((x) => '`' + x + '`').join(' · ')}`); L.push(''); }
  fs.writeFileSync(MD, L.join('\n') + '\n');
}
