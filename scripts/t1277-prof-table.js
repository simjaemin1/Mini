'use strict';
// (@regress 없음 — 러너 밖 · T1277 표 자 · 읽기만)
// === scripts/t1277-prof-table.js — 두 날의 CPU 프로파일(`t1277-prof.js`)을 견준다: 함수별 자기 시간 · 포함 시간(초) · 차 ==========
//   쓰는 법: node scripts/t1277-prof-table.js <앞 날 .cpuprofile> <뒷 날 .cpuprofile> [줄 수 30] [표.md]
//   자기 시간 = 그 함수가 맨 위에 있던 표본 몫 · 포함 시간 = 그 함수가 스택 어디에든 있던 표본 몫(한 표본에 한 번만 — 되부름 이중 셈 0).
//   함수 열쇠 = 이름 · 파일 이름 · 줄(1 부터). 표본 시간 = 표본 사이 시간(`timeDeltas` — 다음 표본까지).
const fs = require('fs'), path = require('path');
const [fa, fb, nArg, outMd] = process.argv.slice(2);
if (!fa || !fb) { console.error('쓰는 법: node scripts/t1277-prof-table.js <앞 .cpuprofile> <뒤 .cpuprofile> [줄 수] [표.md]'); process.exit(2); }
const N = parseInt(nArg || '30', 10);
function load(f) {
  const P = JSON.parse(fs.readFileSync(f, 'utf8'));
  const byId = new Map(), parent = new Map();
  for (const n of P.nodes) byId.set(n.id, n);
  for (const n of P.nodes) for (const c of (n.children || [])) parent.set(c, n.id);
  const key = (n) => { const cf = n.callFrame || {}; return (cf.functionName || '(anon)') + ' ' + (cf.url ? path.basename(cf.url) : '') + ':' + ((cf.lineNumber | 0) + 1); };
  const self = new Map(), incl = new Map(); let tot = 0;
  const S = P.samples || [], D = P.timeDeltas || [];
  for (let i = 0; i < S.length; i++) {
    const dt = ((i + 1 < D.length ? D[i + 1] : 0) || 0) / 1e6; tot += dt;
    let id = S[i]; const n0 = byId.get(id); if (!n0) continue;
    const k0 = key(n0); self.set(k0, (self.get(k0) || 0) + dt);
    const seen = new Set();
    while (id != null) { const n = byId.get(id); if (!n) break; const k = key(n); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + dt); } id = parent.get(id); }
  }
  return { self, incl, tot, sec: ((P.endTime || 0) - (P.startTime || 0)) / 1e6 };
}
const A = load(fa), B = load(fb);
const keys = new Set([...A.incl.keys(), ...B.incl.keys()]);
const rows = [...keys].map((k) => ({ k, sa: A.self.get(k) || 0, sb: B.self.get(k) || 0, ia: A.incl.get(k) || 0, ib: B.incl.get(k) || 0 }));
const f2 = (x) => (+x).toFixed(2);
const out = [];
out.push(`표본 합 ${f2(A.tot)} 초 → ${f2(B.tot)} 초 (프로파일 벽 ${f2(A.sec)} → ${f2(B.sec)} 초)`);
out.push('', '### 자기 시간 차 위 ' + N, '', '| 함수 | 앞 | 뒤 | 차 |', '|---|---:|---:|---:|');
for (const r of rows.slice().sort((x, y) => (y.sb - y.sa) - (x.sb - x.sa)).slice(0, N)) out.push(`| \`${r.k}\` | ${f2(r.sa)} | ${f2(r.sb)} | ${f2(r.sb - r.sa)} |`);
out.push('', '### 포함 시간 차 위 ' + N, '', '| 함수 | 앞 | 뒤 | 차 |', '|---|---:|---:|---:|');
for (const r of rows.slice().sort((x, y) => (y.ib - y.ia) - (x.ib - x.ia)).slice(0, N)) out.push(`| \`${r.k}\` | ${f2(r.ia)} | ${f2(r.ib)} | ${f2(r.ib - r.ia)} |`);
const md = out.join('\n');
console.log(md);
if (outMd) fs.writeFileSync(outMd, md + '\n');
