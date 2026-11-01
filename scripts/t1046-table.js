#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1046 표 기계 · 읽기만 · 판정 0)
// === scripts/t1046-table.js — 출생 배정이 어느 문으로 답했나(`t1046-probe` 판) — 서버 띠 · 갈래 ↔ 랩 띠 ===
//   node scripts/t1046-table.js --srv <띠 뿌리> --lab <랩 뿌리> [--json <파일>]
//     서버 판 = <띠 뿌리>/run-<갈래>/<판>-<시드>.t1046.json · 랩 판 = <랩 뿌리>/t17-<갈래>-<시드>.t1046.json
//   문 이름 = 탐침이 감싼 return 줄의 **차례**(`wrapped` — 줄 번호는 트리마다 다르지만 차례는 같다 · 함수 몸통 위에서 아래로):
//     석공(도구) · 채집(석재 0) · 광부(부얼) · 광부(풍부광맥) · 나무꾼(기근 땔감 문 T717) · 식량직(기근 문) · 채집(석재 안전망 STONE_NET) · 석공 · 대장장이 · 갑옷장 · 요리사 · 전사 · 재봉사 ·
//     **나무꾼(주거 목재 안전망)** · 채집(석재) · 전사(호위) · **한계가치 후보**(직업은 그날 1위) · 없음
//   셈(366일~ · 출생 배정만 — 탐침 `birth` 칸): 출생 고르기 수 · 나무꾼 몫 · 그중 안전망 · 한계가치 · 안전망 줄에 닿은 몫 · 문별 몫
'use strict';
const fs = require('fs');
const path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SRV = arg('--srv', null), LAB = arg('--lab', null), OUTJ = arg('--json', null);
const GATES = ['석공(도구)', '채집(석재 0)', '광부(부얼)', '광부(풍부광맥)', '나무꾼(기근 땔감 문)', '식량직(기근 문)', '채집(석재 안전망)', '석공', '대장장이', '갑옷장', '요리사', '전사', '재봉사',
  '나무꾼(주거 목재 안전망)', '채집(석재)', '전사(호위)', '한계가치 후보', '없음'];
const NET = 13, MARG = 16;
const J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
function perFile(o) {
  if (!o || !o.cols || !Array.isArray(o.wrapped) || o.wrapped.length !== GATES.length) return null;
  const F = {}; o.cols.forEach((k, i) => { F[k] = i; }); const idx = new Map(o.wrapped.map((l, i) => [l, i]));
  const S = { b: 0, lj: 0, ljNet: 0, ljMarg: 0, reach: 0, gate: new Array(GATES.length).fill(0) };
  for (const rows of Object.values(o.v)) for (const x of rows) {
    if (x[F.day] < 366 || !x[F.birth]) continue;
    const g = idx.get(x[F.line]); if (g == null) continue;
    S.b++; S.gate[g]++; if (g >= NET) S.reach++;
    if (x[F.job] === 'lumberjack') { S.lj++; if (g === NET) S.ljNet++; if (g === MARG) S.ljMarg++; }
  }
  return S;
}
function load(root, kind) {
  const R = {}; if (!root || !fs.existsSync(root)) return R;
  const add = (tag, s) => { if (!s) return; const A = R[tag] || (R[tag] = { b: 0, lj: 0, ljNet: 0, ljMarg: 0, reach: 0, gate: new Array(GATES.length).fill(0) });
    for (const k of ['b', 'lj', 'ljNet', 'ljMarg', 'reach']) A[k] += s[k]; s.gate.forEach((n, i) => { A.gate[i] += n; }); };
  if (kind === 'srv') { for (const dn of fs.readdirSync(root).filter((x) => x.startsWith('run-')).sort()) for (const fn of fs.readdirSync(path.join(root, dn)).filter((x) => /\.t1046\.json$/.test(x))) add(dn.slice(4), perFile(J(path.join(root, dn, fn)))); }
  else { const re = /^t17-(.+)-(\d+)\.t1046\.json$/; for (const fn of fs.readdirSync(root).filter((x) => re.test(x)).sort()) add(fn.match(re)[1], perFile(J(path.join(root, fn)))); }
  return R;
}
const S = load(SRV, 'srv'), L = load(LAB, 'lab');
const P = (s) => console.log(s);
const pc = (a, b) => b ? (100 * a / b).toFixed(1) : '—';
const runs = [...Object.entries(S).map(([t, a]) => [`서버 ${t}`, a]), ...Object.entries(L).map(([t, a]) => [`랩 ${t}`, a])];
const COL = [['출생 고르기', (a) => a.b, 0], ['나무꾼 %', (a) => a.b ? 100 * a.lj / a.b : null, 1], ['안전망 나무꾼 %', (a) => a.b ? 100 * a.ljNet / a.b : null, 1],
  ['한계가치 나무꾼 %', (a) => a.b ? 100 * a.ljMarg / a.b : null, 1], ['안전망 줄에 닿음 %', (a) => a.b ? 100 * a.reach / a.b : null, 1], ['기근 문 %', (a) => a.b ? 100 * a.gate[5] / a.b : null, 1]];
const fx = (x, d) => x == null ? '—' : d === 0 ? Number(x).toLocaleString('en-US') : x.toFixed(d);
P('## 출생 배정 — 문별(366일~ · 3시드 합)');
P('');
P(`| 판 | ${COL.map((c) => c[0]).join(' | ')} |`);
P(`|---|${COL.map(() => '---:').join('|')}|`);
const out = { gates: GATES, runs: {} };
for (const [lbl, a] of runs) { const v = COL.map(([, f]) => f(a)); out.runs[lbl] = { ...a, cols: v }; P(`| ${lbl} | ${v.map((x, i) => fx(x, COL[i][2])).join(' | ')} |`); }
const band = (pref) => COL.map((c, i) => { const xs = runs.filter(([n]) => n.startsWith(pref)).map(([, a]) => c[1](a)).filter((x) => x != null); return xs.length ? [Math.min(...xs), Math.max(...xs)] : null; });
const bands = { s: band('서버 s'), k: band('서버 k'), lab: band('랩 ') };
for (const [nm, B] of [['서버 띠(s)', bands.s], ['서버 띠(k — 손잡이 켬)', bands.k], ['랩 띠', bands.lab]]) if (B.some((b) => b)) P(`| **${nm}** | ${B.map((b, i) => b ? `${fx(b[0], COL[i][2])} ~ ${fx(b[1], COL[i][2])}` : '—').join(' | ')} |`);
const ov = (A, B) => A.map((b, i) => b && B[i] ? (b[0] <= B[i][1] && B[i][0] <= b[1] ? '겹침' : '**안 겹침**') : '—').join(' | ');
if (bands.s.some((b) => b) && bands.lab.some((b) => b)) P(`| 겹침 s ↔ 랩 | ${ov(bands.s, bands.lab)} |`);
if (bands.k.some((b) => b) && bands.lab.some((b) => b)) P(`| 겹침 k ↔ 랩 | ${ov(bands.k, bands.lab)} |`);
P('');
P('## 문별 몫(출생 고르기 중 % · 판 넷 합)');
P('');
const grp = [['서버 s 띠', (n) => n.startsWith('서버 s')], ['서버 k 띠', (n) => n.startsWith('서버 k')], ['서버 h', (n) => n === '서버 h'], ['랩 띠', (n) => n.startsWith('랩 ')]];
P(`| 문 | ${grp.map((g) => g[0]).join(' | ')} |`);
P(`|---|${grp.map(() => '---:').join('|')}|`);
const G = grp.map(([, f]) => { const A = { b: 0, gate: new Array(GATES.length).fill(0) }; for (const [n, a] of runs) if (f(n)) { A.b += a.b; a.gate.forEach((x, i) => { A.gate[i] += x; }); } return A; });
GATES.forEach((g, i) => P(`| ${g} | ${G.map((A) => pc(A.gate[i], A.b)).join(' | ')} |`));
out.bands = bands; out.groups = Object.fromEntries(grp.map(([n], i) => [n, G[i]]));
if (OUTJ) fs.writeFileSync(OUTJ, JSON.stringify(out, null, 1));
