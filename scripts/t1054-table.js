#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1054 표 기계 · 관찰기 `t1054-wood-sites.js` 판 JSON 만 읽는다 · 산수 = 합 · 빼기뿐)
// === scripts/t1054-table.js — 곳간 목재를 바꾸는 코드 자리별 첫해 합: 서버 ↔ 랩 · 틱 안 ↔ 틱 밖 · 마을별 ===
//   node scripts/t1054-table.js --srv <run 디렉터리>(base-<시드>.t1054.json) --lab <뿌리>:<접두>(<접두>-<시드>.t1054.json) [--top 12] [--vil 2] [--json <파일>]
//   자리 이름 = 파일:줄 + 그 줄을 감싼 함수 이름(소스를 거꾸로 읽어 찾는다 — 표가 줄 번호에 손으로 묶이지 않게) + 그 줄 글자 · 부른 자리는 곁에 모은다.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const get = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SEEDS = [1020, 7, 42];
const J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const SRC = new Map();
function fnAt(fileLine, withText) {
  const m = fileLine.match(/^(.*):(\d+)$/); if (!m) return fileLine;
  const [, f, ln] = m;
  if (/^scripts\/(t\d+-observe|t\d+-house|lib-day-deaths|lab-diverge-ctl|diverge-ctl)\.js$/.test(f)) return '(관찰기 겹)';   // 앞 판 관찰기가 감싼 겹 — 부른 자리를 모른다
  if (!SRC.has(f)) { try { SRC.set(f, fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n')); } catch (e) { SRC.set(f, null); } }
  const L = SRC.get(f); if (!L) return fileLine;
  let fn = '?';
  for (let i = +ln - 1; i >= 0; i--) { const x = L[i].match(/^(?:async\s+)?function\*?\s+([\w$]+)\s*\(/); if (x) { fn = x[1]; break; } }   // 감싼 맨 바깥 함수(모듈 머리 칸의 function)
  const t = withText ? ' ‹' + L[+ln - 1].trim().replace(/\s+/g, ' ').slice(0, 60) + '›' : '';
  return `${fn}@${path.basename(f)}:${ln}${t}`;
}
const label = (k) => fnAt(k, true);
const callersOf = (k) => { const m = {}; for (const X of [A, Bl]) if (X && X.S[k]) for (const [c, d] of Object.entries(X.S[k].callers)) m[c] = (m[c] || 0) + Math.abs(d); return Object.entries(m).sort((x, y) => y[1] - x[1]).map(([c]) => c).join(' · '); };
function load(files) {
  const S = {}, V = {}; let n = 0, unseen = 0, wood364 = 0;
  for (const f of files) {
    const o = J(f); if (!o) continue; n++; unseen += o.y1.unseen || 0; wood364 += (o.snap && o.snap['364'] && o.snap['364'].wood) || 0;
    //   자리 = 쓴 줄(첫 칸) — 부른 줄은 곁에 모은다(같은 줄을 여러 문이 부르면 — 관찰기 겹 포함 — 한 행)
    for (const [k0, r] of Object.entries(o.y1.sites)) { const [k, c] = k0.split(' ← '); const a = S[k] || (S[k] = { tickP: 0, tickN: 0, outP: 0, outN: 0, n: 0, callers: {} }); for (const x of ['tickP', 'tickN', 'outP', 'outN', 'n']) a[x] += r[x]; const cl = c ? fnAt(c, false) : '—'; a.callers[cl] = (a.callers[cl] || 0) + r.tickP + r.tickN + r.outP + r.outN; }
    for (const [vn, m] of Object.entries(o.y1.byV)) { const b = V[vn] || (V[vn] = {}); for (const [k0, d] of Object.entries(m)) { const k = k0.split(' ← ')[0]; b[k] = (b[k] || 0) + d; } }
  }
  return { n, S, V, unseen, wood364 };
}
const srvDir = get('--srv'), labArg = get('--lab');
const A = srvDir ? load(SEEDS.map((s) => path.join(srvDir, `base-${s}.t1054.json`))) : null;
const [lr, lp] = (labArg || ':').split(':');
const Bl = labArg ? load(SEEDS.map((s) => path.join(lr, `${lp}-${s}.t1054.json`))) : null;
const TOP = +get('--top', 14);
const keys = [...new Set([...(A ? Object.keys(A.S) : []), ...(Bl ? Object.keys(Bl.S) : [])])];
const net = (r) => r ? r.tickP + r.tickN + r.outP + r.outN : 0;
const rows = keys.map((k) => { const a = A && A.S[k], b = Bl && Bl.S[k];
  return { k, lab: label(k), srvTick: a ? a.tickP + a.tickN : 0, srvOut: a ? a.outP + a.outN : 0, labTick: b ? b.tickP + b.tickN : 0, labOut: b ? b.outP + b.outN : 0, srvN: a ? a.n : 0, labN: b ? b.n : 0 }; });
rows.forEach((r) => { r.d = (r.srvTick + r.srvOut) - (r.labTick + r.labOut); });
rows.sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
const f0 = (x) => Math.round(x).toLocaleString('en-US');
const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
console.log(`\n서버 ${A ? A.n : 0}/3 · 랩 ${Bl ? Bl.n : 0}/3 — 첫해(날 < 365) 3시드 합 · 못 센 몫(하루 끝 곳간 차 − 센 차) 서버 ${A ? A.unseen.toFixed(3) : '—'} · 랩 ${Bl ? Bl.unseen.toFixed(3) : '—'}`);
console.log(`틱 안 순변화 합 서버 ${f0(sum((r) => r.srvTick))} · 랩 ${f0(sum((r) => r.labTick))} · 차 ${f0(sum((r) => r.srvTick - r.labTick))} | 틱 밖 순변화 합 서버 ${f0(sum((r) => r.srvOut))} · 랩 ${f0(sum((r) => r.labOut))} · 차 ${f0(sum((r) => r.srvOut - r.labOut))} | 날 364 곳간 서버 ${A ? f0(A.wood364) : '—'} · 랩 ${Bl ? f0(Bl.wood364) : '—'}`);
console.log(`\n| # | 자리(쓴 줄 ‹그 줄 글자› ← 부른 자리) | 서버 틱 안 | 서버 틱 밖 | 랩 틱 안 | 랩 틱 밖 | 서버 − 랩 | 쓰기 수 서버 · 랩 |`);
console.log(`|---:|---|---:|---:|---:|---:|---:|---|`);
rows.slice(0, TOP).forEach((r, i) => console.log(`| ${i + 1} | \`${r.lab}\` ← ${callersOf(r.k)} | ${f0(r.srvTick)} | ${f0(r.srvOut)} | ${f0(r.labTick)} | ${f0(r.labOut)} | **${f0(r.d)}** | ${r.srvN.toLocaleString('en-US')} · ${r.labN.toLocaleString('en-US')} |`));
const rest = rows.slice(TOP); if (rest.length) console.log(`| — | 나머지 ${rest.length} 자리 | ${f0(rest.reduce((a, r) => a + r.srvTick, 0))} | ${f0(rest.reduce((a, r) => a + r.srvOut, 0))} | ${f0(rest.reduce((a, r) => a + r.labTick, 0))} | ${f0(rest.reduce((a, r) => a + r.labOut, 0))} | ${f0(rest.reduce((a, r) => a + r.d, 0))} | |`);
// 마을별 — 차 1 · 2 위 자리(같은 마을 · 첫해)
const VT = +get('--vil', 2), vrows = {};
for (const r of rows.slice(0, VT)) {
  const vs = [...new Set([...Object.keys((A && A.V) || {}), ...Object.keys((Bl && Bl.V) || {})])];
  const t = vs.map((vn) => ({ vn, s: (A && A.V[vn] && A.V[vn][r.k]) || 0, l: (Bl && Bl.V[vn] && Bl.V[vn][r.k]) || 0 })).map((x) => ({ ...x, d: x.s - x.l })).sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
  vrows[r.k] = t;
  console.log(`\n### 마을별 — \`${r.lab}\`(3시드 합 · 차 큰 열 · 51곳 중)\n`);
  console.log(`| 마을 | 서버 | 랩 | 서버 − 랩 |\n|---|---:|---:|---:|`);
  for (const x of t.slice(0, 10)) console.log(`| ${x.vn} | ${f0(x.s)} | ${f0(x.l)} | ${f0(x.d)} |`);
  console.log(`| (51곳 합) | ${f0(t.reduce((a, x) => a + x.s, 0))} | ${f0(t.reduce((a, x) => a + x.l, 0))} | ${f0(t.reduce((a, x) => a + x.d, 0))} |`);
}
const JO = get('--json'); if (JO) fs.writeFileSync(JO, JSON.stringify({ rows, vrows, srv: A && { n: A.n, unseen: A.unseen, wood364: A.wood364 }, lab: Bl && { n: Bl.n, unseen: Bl.unseen, wood364: Bl.wood364 } }));
