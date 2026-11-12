'use strict';
// (@regress 없음 — 러너 밖 · T1277 표 자 · 읽기만)
// === scripts/t1277-table.js — T1277 관찰기 JSON(`t1277-observe.js`)에서 한 시간 값 갈래 표 · 몸이 하루 치는 셀 표 · 원석 재고 ÷ 목표 표 ==========
//   쓰는 법: node scripts/t1277-table.js <판 머리> [<판 머리> …] [--md 표.md] [--json 요약.json]   (머리 = 판 JSON 경로에서 `.json` 을 뗀 것)
//   ① 갈래(10날 칸 · 광산 마을 합): 물음 · 단위/물음 · W ÷ R(쓴 값) · W그림자 ÷ R · W수출 ÷ R · 수출이 이긴 물음 % · 그림자 값이면 닫힐 물음 % · 지금 닫힌 물음 % · λ · 그림자 값 · 순수출가 · best
//   ② 몸 셀(마을별 판 합): 몸-날(그날 '채광' 표본에 든 다른 몸) · 셀-날(그날 다른 셀) · 한 몸이 하루 치는 셀 = 셀-날 ÷ 몸-날 · 셀 하나 몸 수
//   ③ 원석(날 머리 · 마을별 끝 날): 곳간 합 · 흐름 목표 합(`_consEMA × 30`) · 재고 ÷ 목표 · 녹임 누계
const fs = require('fs');
const args = process.argv.slice(2), heads = [], opt = {};
for (let i = 0; i < args.length; i++) { if (args[i] === '--md' || args[i] === '--json') { opt[args[i].slice(2)] = args[++i]; } else heads.push(args[i]); }
if (!heads.length) { console.error('쓰는 법: node scripts/t1277-table.js <판 머리> … [--md 표.md] [--json 요약.json]'); process.exit(2); }
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const f2 = (x) => x == null || !isFinite(x) ? '—' : (+x).toFixed(2), f4 = (x) => x == null || !isFinite(x) ? '—' : (+x).toPrecision(3), pc = (x) => x == null || !isFinite(x) ? '—' : (100 * x).toFixed(1) + '%';
const out = [], SUM = {};
for (const h of heads) {
  const X = rd(h + '.t1277.json'); if (!X) { out.push(`(${h}: t1277 없음)`); continue; }
  const name = h.split('/').pop();
  out.push(`## ${name} (T1266 ${X.on ? '켬' : '끔'} · T1271 자리 ${X.cap ? '켬' : '끔'})`, '');
  // ① 갈래
  out.push('| 10날 칸 | 물음 | 단위/물음 | W÷R(쓴 값) | W그림자÷R | W수출÷R | 수출 이김 | 그림자면 닫힘 | 지금 닫힘 | 바닥 없으면 닫힘 | 곳간÷목표 | λ | λ 물건 목표 0 | λ 물건 값 | 그림자 값 | 순수출가 | best(물음 수) |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|');
  const S = { buckets: {} };
  for (const b of Object.keys(X.q).map(Number).sort((a, c) => a - c)) {
    const B = X.q[b]; const t = { n: 0, u: 0, w: 0, wOwn: 0, wNev: 0, r: 0, nevWin: 0, closeOwn: 0, closeNow: 0, closeFree: 0, lam: 0, pOwn: 0, pNev: 0, st: 0, stN: 0, bestT0: 0, bestN: 0, pBest: 0, best: {}, hOwn: {} };
    for (const Q of Object.values(B)) { for (const k of ['n', 'u', 'w', 'wOwn', 'wNev', 'r', 'nevWin', 'closeOwn', 'closeNow', 'closeFree', 'lam', 'pOwn', 'pNev', 'st', 'stN', 'bestT0', 'bestN', 'pBest']) t[k] += Q[k] || 0; for (const [g, c] of Object.entries(Q.best || {})) t.best[g] = (t.best[g] || 0) + c; for (const [h, c] of Object.entries(Q.hOwn || {})) t.hOwn[h] = (t.hOwn[h] || 0) + c; }
    const best = Object.entries(t.best).sort((a, c) => c[1] - a[1]).slice(0, 3).map(([g, c]) => `${g} ${c}`).join(' · ');
    out.push(`| 날 ${b - 9}~${b} | ${t.n} | ${f2(t.u / t.n)} | ${f2(t.w / t.r)} | ${f2(t.wOwn / t.r)} | ${f2(t.wNev / t.r)} | ${pc(t.nevWin / t.n)} | ${pc(t.closeOwn / t.n)} | ${pc(t.closeNow / t.n)} | ${t.stN ? pc(t.closeFree / t.n) : '—'} | ${t.stN ? f2(t.st / t.stN) : '—'} | ${f4(t.lam / t.n)} | ${t.bestN ? pc(t.bestT0 / t.bestN) : '—'} | ${t.bestN ? f4(t.pBest / t.bestN) : '—'} | ${f4(t.pOwn / t.n)} | ${f4(t.pNev / t.n)} | ${best} |`);
    S.buckets[b] = { n: t.n, uPer: t.u / t.n, wr: t.w / t.r, wOwnR: t.wOwn / t.r, wNevR: t.wNev / t.r, nevWin: t.nevWin / t.n, closeOwn: t.closeOwn / t.n, closeNow: t.closeNow / t.n, closeFree: t.stN ? t.closeFree / t.n : null, stOverT: t.stN ? t.st / t.stN : null, lam: t.lam / t.n, bestT0: t.bestN ? t.bestT0 / t.bestN : null, pBest: t.bestN ? t.pBest / t.bestN : null, pOwn: t.pOwn / t.n, pNev: t.pNev / t.n, best: t.best, hOwn: t.hOwn };
  }
  //   민감도 — log10(W그림자 ÷ R) 막대(판 합)에서: λ 가 c 분의 1 이면 닫힐 물음 몫(= W그림자 ÷ R ≤ c)
  { const H = {}; let n = 0; for (const B of Object.values(X.q)) for (const Q of Object.values(B)) for (const [h, c] of Object.entries(Q.hOwn || {})) { H[h] = (H[h] || 0) + c; n += c; }
    if (n) { const cs = [1, 3, 10, 30, 100, 300], row = cs.map((c) => { let k = 0; for (const [h, q] of Object.entries(H)) if (h === '-inf' || +h <= Math.log10(c) + 1e-9) k += q; return `÷${c} ${pc(k / n)}`; });
      out.push('', `λ 민감도(판 합 ${n} 물음 · W그림자 ÷ R 막대) — λ 가 c 분의 1 이면 그 시간 닫힐 물음: ` + row.join(' · ')); S.sens = Object.fromEntries(cs.map((c, i) => [c, row[i]])); } }
  // 마을별(판 합)
  const byV = {};
  for (const B of Object.values(X.q)) for (const [vn, Q] of Object.entries(B)) { const o = byV[vn] || (byV[vn] = { n: 0, u: 0, w: 0, wOwn: 0, wNev: 0, r: 0, closeOwn: 0, closeNow: 0, lam: 0, pOwn: 0, pNev: 0 }); for (const k in o) o[k] += Q[k] || 0; }
  out.push('', '| 마을(판 합) | 물음 | W÷R | W그림자÷R | W수출÷R | 그림자면 닫힘 | 지금 닫힘 | λ | 그림자 값 | 순수출가 |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const [vn, o] of Object.entries(byV).sort((a, c) => c[1].n - a[1].n)) out.push(`| ${vn} | ${o.n} | ${f2(o.w / o.r)} | ${f2(o.wOwn / o.r)} | ${f2(o.wNev / o.r)} | ${pc(o.closeOwn / o.n)} | ${pc(o.closeNow / o.n)} | ${f4(o.lam / o.n)} | ${f4(o.pOwn / o.n)} | ${f4(o.pNev / o.n)} |`);
  S.byV = byV;
  // ② 몸 셀
  const cv = {};
  for (const D of Object.values(X.cell || {})) for (const [vn, o] of Object.entries(D.v || {})) { const c = cv[vn] || (cv[vn] = { bd: 0, cd: 0, days: 0, perCell: 0, perCellN: 0 }); c.bd += o.pids; c.cd += o.cells; c.days++; for (const q of Object.values(o.perCell || {})) { c.perCell += q; c.perCellN++; } }
  let BD = 0, CD = 0; for (const c of Object.values(cv)) { BD += c.bd; CD += c.cd; }
  out.push('', '| 마을(몸이 친 날) | 날 | 몸-날 | 셀-날 | 한 몸이 하루 치는 셀 | 셀 하나에 선 몸 |', '|---|---:|---:|---:|---:|---:|');
  for (const [vn, c] of Object.entries(cv).sort((a, b) => b[1].bd - a[1].bd)) out.push(`| ${vn} | ${c.days} | ${c.bd} | ${c.cd} | ${f2(c.cd / c.bd)} | ${f2(c.perCell / c.perCellN)} |`);
  out.push(`| **합** | | ${BD} | ${CD} | **${f2(CD / BD)}** | |`);
  S.cells = { byV: cv, bodyDays: BD, cellDays: CD, k: BD ? CD / BD : null };
  // ③ 원석 재고 ÷ 목표(끝 날)
  const ds = Object.keys(X.ore || {}).map(Number).sort((a, b) => a - b), L = ds[ds.length - 1];
  if (L != null) {
    out.push('', `| 마을(날 ${L} 머리) | 원석 곳간 | 흐름 목표(30날 녹임) | 재고 ÷ 목표 | 녹임 누계 | 인구 | econ 광부 |`, '|---|---:|---:|---:|---:|---:|---:|');
    const R = {};
    for (const [vn, o] of Object.entries(X.ore[L])) { let st = 0, tg = 0; for (const q of Object.values(o.o || {})) { st += q[0]; tg += q[1]; } R[vn] = { st, tg, smelt: o.smelt, pop: o.pop, miner: o.miner }; out.push(`| ${vn} | ${f2(st)} | ${f2(tg)} | ${tg > 0 ? f2(st / tg) : '—'} | ${f2(o.smelt)} | ${o.pop} | ${o.miner} |`); }
    S.ore = { day: L, byV: R };
  }
  out.push('');
  SUM[name] = S;
}
const md = out.join('\n');
console.log(md);
if (opt.md) fs.writeFileSync(opt.md, md + '\n');
if (opt.json) fs.writeFileSync(opt.json, JSON.stringify(SUM, null, 1));
