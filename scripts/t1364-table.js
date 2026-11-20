#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1364 흔들림 표 · 제품 무변 · 판정 0)
// === scripts/t1364-table.js — 러너 로그만 읽어 하네스마다 흔들림을 가른다 [T1364 · 재민 11-18] ==========
//   읽는 것: `run-regress.sh` 의 로그(판 하나당 한 파일) — `##### <하네스> #####` 머리 · `[소요] N초` · `✓ RC=0` / `✗ RC=<n>`.
//     나란히 판(-j 4)과 혼자 판(-j 1)을 따로 받는다. 하네스를 띄우지 않는다 · 제품 파일을 안 읽는다.
//   가름(카드 T1364 ③):
//     ㉮ 늘 빨강        — 혼자 다섯 판 모두 빨강(5/5)
//     ㉯ 혼자도 흔들림  — 혼자 1 ~ 4/5 빨강
//     ㉰ 나란히만 흔들림 — 나란히 판에서 한 번이라도 빨강 · 혼자 0/5
//     ㉱ 초록           — 나란히 판 모두 초록(혼자 판에 안 든다)
//     (혼자 판이 다섯에 못 미치면 "혼자 판 n" 을 적고 n 기준으로 가른다 · 혼자 판에 하나도 없으면 "가름 못 함")
//   ㉮ 는 상시 목록(`scripts/nightly-known.txt` — 정본 · 이 스크립트는 읽기만)과 견준다.
//   쓰는 법: node scripts/t1364-table.js --par A.log,B.log,C.log --solo S1.log,…,S5.log [--known scripts/nightly-known.txt] [--json]
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const list = (s) => (s ? s.split(',').filter(Boolean) : []);

// 로그 하나 → [{ f, rc, sec }] (러너가 하네스 하나를 끝낼 때마다 한 덩어리를 찍는다)
function readLog(file) {
  const out = [];
  let cur = null;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const h = /^##### (\S+\.js) #####$/.exec(line);
    if (h) { cur = { f: h[1], rc: null, sec: null }; out.push(cur); continue; }
    if (!cur) continue;
    const s = /^\s+\[소요\] (\d+)초$/.exec(line);
    if (s) { cur.sec = +s[1]; continue; }
    if (/^\s+✓ RC=0\b/.test(line)) { cur.rc = 0; continue; }
    const r = /^\s+✗ RC=(\d+)/.exec(line);
    if (r) cur.rc = +r[1];
  }
  return out.filter((x) => x.rc != null);   // 끝맺지 못한 덩어리(판이 끊김)는 안 센다
}
function readKnown(file) {
  const m = new Map();
  if (!fs.existsSync(file)) return m;
  for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!l.trim() || l.trim().startsWith('#')) continue;
    const [n, why] = l.split('|').map((x) => x.trim());
    if (n) m.set(n.endsWith('.js') ? n : n + '.js', why || '');
  }
  return m;
}

const PAR = list(arg('--par')), SOLO = list(arg('--solo'));
if (!PAR.length) { console.error('쓰는 법: --par A.log,B.log,C.log --solo S1.log,… [--known 목록] [--json]'); process.exitCode = 2; return; }
const KNOWN = readKnown(arg('--known', path.join(__dirname, 'nightly-known.txt')));
const par = PAR.map(readLog), solo = SOLO.map(readLog);
const H = new Map();
const get = (f) => { if (!H.has(f)) H.set(f, { f, par: [], solo: [], parSec: [], soloSec: [] }); return H.get(f); };
par.forEach((run) => run.forEach((x) => { const r = get(x.f); r.par.push(x.rc); if (x.sec != null) r.parSec.push(x.sec); }));
solo.forEach((run) => run.forEach((x) => { const r = get(x.f); r.solo.push(x.rc); if (x.sec != null) r.soloSec.push(x.sec); }));
const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const KIND = { A: '㉮ 늘 빨강', B: '㉯ 혼자도 흔들림', C: '㉰ 나란히만 흔들림', D: '㉱ 초록', X: '가름 못 함' };
const rows = [...H.values()].map((r) => {
  const pr = r.par.filter((x) => x !== 0).length, sr = r.solo.filter((x) => x !== 0).length, sn = r.solo.length;
  let k;
  if (!pr && !sr) k = 'D';
  else if (!sn) k = 'X';
  else if (sr === sn) k = 'A';
  else if (sr > 0) k = 'B';
  else k = 'C';
  return { f: r.f, parRed: pr, parN: r.par.length, parRc: r.par, soloRed: sr, soloN: sn, soloRc: r.solo, parSec: med(r.parSec), soloSec: med(r.soloSec), kind: k, known: KNOWN.has(r.f) ? KNOWN.get(r.f) : null };
}).sort((a, b) => a.kind.localeCompare(b.kind) || b.parRed - a.parRed || a.f.localeCompare(b.f));
const by = (k) => rows.filter((r) => r.kind === k);
const wall = (files) => files.map((f) => { const m = /rc=\d+ 벽 (\d+)초/.exec(fs.readFileSync(f, 'utf8')); return m ? +m[1] : 0; });
const parWall = wall(PAR), soloWall = wall(SOLO);
const sum = { kinds: rows.length, parRuns: PAR.length, soloRuns: SOLO.length, A: by('A').length, B: by('B').length, C: by('C').length, D: by('D').length, X: by('X').length,
  parWall, soloWall, hours: +((parWall.concat(soloWall).reduce((s, x) => s + x, 0)) / 3600).toFixed(1),
  knownNotA: [...KNOWN.keys()].filter((n) => !by('A').some((r) => r.f === n)), aNotKnown: by('A').filter((r) => r.known == null).map((r) => r.f) };
if (process.argv.includes('--json')) { process.stdout.write(JSON.stringify({ sum, rows }) + '\n'); return; }

const L = [];
const rc = (a) => a.map((x) => (x === 0 ? '○' : x === 124 ? '⏱' : '✗')).join('');
L.push(`# T1364 흔들림 표 — 러너 로그만 읽는다(\`node scripts/t1364-table.js\`)`, '');
L.push(`· 나란히 판(-j 4) ${PAR.length} · 혼자 판(-j 1 · 나란히 판에서 한 번이라도 빨강인 것만) ${SOLO.length} · 하네스 ${sum.kinds}종`);
L.push(`· 벽 시간: 나란히 ${parWall.map((s) => (s / 3600).toFixed(2) + '시간').join(' · ')} · 혼자 ${soloWall.map((s) => (s / 3600).toFixed(2)).join(' · ')}시간 · 합 **${sum.hours}시간**`);
L.push(`· ㉮ 늘 빨강 **${sum.A}** · ㉯ 혼자도 흔들림 **${sum.B}** · ㉰ 나란히만 흔들림 **${sum.C}** · ㉱ 초록 **${sum.D}**${sum.X ? ` · 가름 못 함 ${sum.X}` : ''}`);
L.push(`· 칸: 판마다 ○ 초록 · ✗ 빨강 · ⏱ 상한 넘김(RC=124) · 걸린 초 = 판들의 가운데 값`, '');
L.push('| 가름 | 하네스 | 나란히 빨강 | 나란히 판 | 혼자 빨강 | 혼자 판 | 걸린 초(나란히 · 혼자) | 상시 목록 |', '|---|---|---:|---|---:|---|---|---|');
for (const r of rows.filter((x) => x.kind !== 'D')) L.push(`| ${KIND[r.kind]} | \`${r.f}\` | ${r.parRed}/${r.parN} | ${rc(r.parRc)} | ${r.soloN ? `${r.soloRed}/${r.soloN}` : '—'} | ${rc(r.soloRc) || '—'} | ${r.parSec ?? '?'} · ${r.soloSec ?? '—'} | ${r.known != null ? '있음' : ''} |`);
L.push('', `## 후보 목록(표지 · 고침 0 — 회부만)`, '');
L.push(`* ㉰ \`@regress-alone\` 후보 ${sum.C}: ${by('C').map((r) => `\`${r.f}\``).join(' · ') || '없음'}`);
L.push(`* ㉯ 고칠 카드 후보 ${sum.B}: ${by('B').map((r) => `\`${r.f}\`(${r.soloRed}/${r.soloN})`).join(' · ') || '없음'}`);
L.push(`* ㉮ main 빨강 ${sum.A}: ${by('A').map((r) => `\`${r.f}\`${r.known != null ? '(상시)' : ''}`).join(' · ') || '없음'}`);
L.push(`  * 상시 목록에 없는 ㉮ ${sum.aNotKnown.length}: ${sum.aNotKnown.map((f) => `\`${f}\``).join(' · ') || '없음'}`);
L.push(`  * 상시 목록에 있으나 ㉮ 가 아닌 것 ${sum.knownNotA.length}: ${sum.knownNotA.map((f) => { const r = rows.find((x) => x.f === f); return `\`${f}\`(${r ? KIND[r.kind] : '판에 없음'})`; }).join(' · ') || '없음'}`);
L.push('', `## ㉱ 초록 ${sum.D}`, '', by('D').map((r) => `\`${r.f}\``).join(' · ') || '없음');
console.log(L.join('\n'));
