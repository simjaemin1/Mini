'use strict';
// (@regress 없음 — 러너 밖 · T1344 합금 표 자 · 읽기만)
// === scripts/t1344-alloy.js — 판의 주조(t1344 관찰기 `casts` · `noAg`)를 배합 꼴로 가른 한 장 — 은을 빼면 등급 · 산출 · 청동이 어떻게 되나 ==========
//   쓰는 법: node scripts/t1344-alloy.js <이름=머리> [<이름=머리> …]   (머리 = 판 JSON 에서 `.json` 을 뗀 것 · 곁 `.t1344.json`(.gz))
//   배합 꼴: 넣은 재료(구리 · 주석 · 납 · 은 · 금 — 0.0001 넘는 것) · 칸: 주조 수 · 마을 수 · 등급 가운데 · 산출 합 · 청동 합(산출 × 청동도) ·
//            은 든 꼴은 은 뺀 배합(같은 주조 앞 곳간 · 같은 값 함수 · 같은 탐색)의 등급 가운데 · 산출 합 · 청동 합 · 그 꼴(가장 많은 것)
const fs = require('fs');
const zlib = require('zlib');
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f + '.gz')).toString('utf8')); } catch (e2) { return null; } } };
const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
const f2 = (x) => x == null ? '—' : (+x).toFixed(2), f3 = (x) => x == null ? '—' : (+x).toFixed(3);
const NM = { copper: '구리', tin: '주석', lead: '납', silver: '은', gold: '금' };
for (const a of process.argv.slice(2)) {
  const k = a.indexOf('='), name = a.slice(0, k), h = a.slice(k + 1);
  const X = rd(h + '.t1344.json'); if (!X) { console.log(`## ${name} — 관찰기 없음`); continue; }
  const cc = X.ccols, ci = (n) => cc.indexOf(n), MET = ['copper', 'tin', 'lead', 'silver', 'gold'];
  const alt = new Map(); for (let i = 0; i < (X.noAg || []).length; i += 2) alt.set(X.noAg[i], X.noAg[i + 1]);
  const G = new Map();
  X.casts.forEach((c, i) => {
    const key = MET.filter((m) => c[ci(m)] > 1e-4).map((m) => NM[m]).join(' + ') || '—';
    let g = G.get(key); if (!g) { g = { n: 0, vs: new Set(), gr: [], amt: 0, bz: 0, an: 0, agr: [], aamt: 0, abz: 0, akind: new Map() }; G.set(key, g); }
    g.n++; g.vs.add(c[ci('v')]); g.gr.push(c[ci('grade')]); g.amt += c[ci('amt')]; g.bz += c[ci('amt')] * c[ci('bz')];
    const x = alt.get(i);
    if (x) { g.an++; g.agr.push(x[0]); g.aamt += x[3]; g.abz += x[3] * x[1]; const ak = ['구리', x[5] > 1e-4 ? '주석' : '', x[6] > 1e-4 ? '납' : '', x[7] > 1e-4 ? '금' : ''].filter(Boolean).join(' + '); g.akind.set(ak, (g.akind.get(ak) || 0) + 1); }
  });
  const rows = [...G.entries()].sort((p, q) => q[1].n - p[1].n);
  const tot = rows.reduce((s, [, g]) => s + g.n, 0), agN = rows.filter(([k2]) => k2.includes('은')).reduce((s, [, g]) => s + g.n, 0);
  console.log(`## ${name} — 주조 ${tot} · 은 든 주조 ${agN}(${tot ? (100 * agN / tot).toFixed(1) : '—'} %)`); console.log();
  console.log('| 배합 꼴 | 주조 · 마을 | 등급 가운데 | 산출 합 | 청동 합 | 은 뺀 배합 — 꼴 · 등급 가운데 · 산출 합 · 청동 합 |');
  console.log('|---|---:|---:|---:|---:|---|');
  for (const [key, g] of rows) {
    const ak = [...g.akind.entries()].sort((p, q) => q[1] - p[1]).map(([x, n]) => `${x} ${n}`).join(' · ');
    console.log(`| ${key} | ${g.n} · ${g.vs.size} | ${f3(med(g.gr))} | ${f2(g.amt)} | ${f2(g.bz)} | ${g.an ? `${ak} · ${f3(med(g.agr))} · ${f2(g.aamt)} · ${f2(g.abz)}` : '—'} |`);
  }
  console.log();
}
