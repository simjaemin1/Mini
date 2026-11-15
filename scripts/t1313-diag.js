'use strict';
// (@regress 없음 — 러너 밖 · T1313 진단 자 · 읽기만)
// === scripts/t1313-diag.js — 마을별 원석 종류 × (제 마을 녹임 목표 · 이웃이 녹이는 양 · 잠긴 재고 · 교역으로 나간 몫) · 청동 길 ==========
//   쓰는 법: node scripts/t1313-diag.js <머리> [--min ore_tin] [--md 진단.md]
//     머리 = 판 JSON 경로에서 `.json` 을 뗀 것(곁 t1256 · t1293 · t1313)
//   ① 광산 마을 × 원석 품목(판 동안 캔 것 > 0 이거나 끝 날 곳간 > 0):
//      캔 단위(t1256 `bodyInY` 날 2 ~ 끝) · 제 마을 흐름 목표(`_consEMA × 30` — 끝 날 · 날 11 ~ 끝 가운데) · 값표 목표(끝 날) · 곳간(끝 날) · 넘은 곳간(곳간 − 값표 목표 · 끝 날) ·
//      이웃이 녹이는 양(다른 마을 흐름 목표 합 · 끝 날 · t1313 ① 온 마을) · 교역 나간 몫 · 들어온 몫(t1313 ② · 판 합) · 나간 몫 ÷ 캔 단위
//   ② 청동 길(--min 광물 · 기본 주석): 그 원석을 캔 마을 → 교역으로 간 곳(받은 마을별 합) · 청동 무기를 만든 마을의 끝 날 청동 · 구리 · 주석 곳간 · 그 마을 그 원석 · 구리 원석 들어온 몫
//   ③ 금속 · 원석 짐(판 로그 `<머리>.log.gz` 또는 `<머리>.log` — 있으면): 캐러밴 출발 · 귀환 출발 줄 가운데 구리 · 주석 · 원석 짐(날 · 보낸 → 받은 · 품목 × 수 · ↩ = 귀로에 산 짐 · 그 날은 도착 예정 날) · 줄 수
//   ④ 마을 날별(--v 마을 · 여럿 가능 · 기본 광산5 · 어촌1): 5날마다 청동 무기 누계 / 구리 / 주석 곳간(t1256 — 광산 마을만)
//   ⑤ 온 세계 빈자리(품목별 · 10날마다 — 값표 목표 − 곳간 > 0 인 마을 수 · 합) · ⑥ 녹이는 마을-날의 값표 목표가 바닥(0.2)인 몫 · 흐름 목표 반 밑인 몫 · 값표 ÷ 흐름 합(t1313 ① — ① ② 와 같이 t1313 판만)
const fs = require('fs');
const zlib = require('zlib');
const args = process.argv.slice(2); const opt = { min: 'ore_tin', v: [] }; let H = null;
for (let i = 0; i < args.length; i++) { if (args[i] === '--min') opt.min = args[++i]; else if (args[i] === '--md') opt.md = args[++i]; else if (args[i] === '--v') opt.v.push(args[++i]); else if (!H) H = args[i]; }
if (!opt.v.length) opt.v = ['광산5', '어촌1'];
if (!H) { console.error('쓰는 법: node scripts/t1313-diag.js <머리> [--min ore_tin] [--v 마을 …] [--md 진단.md]'); process.exit(2); }
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const A = rd(H + '.t1256.json'), S = rd(H + '.t1293.json'), Q = rd(H + '.t1313.json');
if (!A) { console.error('관찰기 JSON 없음(t1256)'); process.exit(2); }
const f1 = (x) => x == null ? '—' : (+x).toFixed(1), f2 = (x) => x == null ? '—' : (+x).toFixed(2), pc = (x) => x == null ? '—' : (100 * x).toFixed(0) + ' %';
const I = (n) => A.dcols.indexOf(n), L = Math.max(...Object.keys(A.day).map(Number));
const dug = {}; for (let d = 2; d <= L; d++) for (const r of (A.day[d] || [])) { const b = r[I('bodyInY')] || {}; for (const k in b) { const o = dug[r[0]] || (dug[r[0]] = {}); o[k] = (o[k] || 0) + b[k]; } }
const out = [];
if (!S || !Q) out.push(`(${H.replace(/.*\//, '')} — t1293 · t1313 관찰기 JSON 없음: ① ② 건너뜀)`);
else {   // ① ② — t1293 · t1313 관찰기가 있는 판만
const Lq = Math.max(...Object.keys(Q.ore).map(Number));
const flowMed = (vn, k) => { const xs = []; for (const d of Object.keys(Q.ore).map(Number)) { if (d < 11) continue; const o = Q.ore[d] && Q.ore[d][vn] && Q.ore[d][vn][k]; if (o) xs.push(o[1]); } xs.sort((a, b) => a - b); return xs.length ? xs[xs.length >> 1] : 0; };
const endO = Q.ore[Lq] || {};
const nbFlow = (vn, k) => { let s = 0; for (const [n, o] of Object.entries(endO)) if (n !== vn && o[k]) s += o[k][1]; return s; };
const F = Q.flow || {};
out.push(`## ① 광산 마을 × 원석 — ${H.replace(/.*\//, '')} · 끝 날 ${Lq}`, '',
  '| 마을 · 원석 | 캔 단위 | 제 흐름 목표 끝 · 가운데 | 값표 목표 | 곳간 | 넘은 곳간 | 이웃 흐름 목표 합 | 나간 몫 · 들어온 몫 | 나간 ÷ 캔 |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|');
const mines = S.mines || Object.keys(dug);
for (const vn of mines) {
  const ks = new Set([...Object.keys(dug[vn] || {}), ...Object.keys((endO[vn] || {}))].filter((k) => /^ore/.test(k)));
  for (const k of [...ks].sort()) {
    const dg = (dug[vn] || {})[k] || 0, o = (endO[vn] || {})[k] || [0, 0, null], fl = F[vn] && F[vn][k] ? F[vn][k] : { out: 0, in: 0 };
    if (!(dg > 0) && !(o[0] > 0)) continue;
    out.push(`| ${vn} ${k.replace('ore_', '')} | ${f1(dg)} | ${f1(o[1])} · ${f1(flowMed(vn, k))} | ${f1(o[2])} | ${f1(o[0])} | ${f1(o[2] == null ? null : Math.max(0, o[0] - o[2]))} | ${f1(nbFlow(vn, k))} | ${f1(fl.out)} · ${f1(fl.in)} | ${dg > 0 ? pc(fl.out / dg) : '—'} |`);
  }
}
//   ② 청동 길
const m = opt.min, D = Q.day[Lq] || {}, c = (n) => Q.vcols.indexOf(n);
const tr = (Q.trade || []).filter((t) => t[3] === m), byPair = {};
for (const [d, from, to, k, a] of tr) { const key = from + ' → ' + to; byPair[key] = (byPair[key] || 0) + a; }
out.push('', `## ② ${m.replace('ore_', '')} 길 — 캔 마을 · 교역 · 청동`, '');
out.push('* 캔 마을: ' + (Object.entries(dug).filter(([v, o]) => (o[m] || 0) > 0).map(([v, o]) => `${v} ${f1(o[m])}`).join(' · ') || '없음'));
out.push('* 교역(보낸 → 받은 · 판 합): ' + (Object.entries(byPair).sort((a, b) => b[1] - a[1]).map(([k, a]) => `${k} ${f1(a)}`).join(' · ') || '없음'));
const smiths = Object.entries(D).filter(([v, r]) => (r[c('bronzeW')] || 0) > 0).sort((a, b) => b[1][c('bronzeW')] - a[1][c('bronzeW')]);
out.push('', '| 청동 만든 마을 | 청동 무기 | 구리 · 주석 곳간 | 녹임 누계 | 대장장이 | ' + m.replace('ore_', '') + ' 원석 곳간 · 들어온 몫 | 구리 원석 곳간 · 들어온 몫 |', '|---|---:|---:|---:|---:|---:|---:|');
for (const [v, r] of smiths) {
  const om = (endO[v] || {})[m], oc = (endO[v] || {}).ore_copper, fm = (F[v] || {})[m] || { in: 0 }, fc = (F[v] || {}).ore_copper || { in: 0 };
  out.push(`| ${v} | ${f2(r[c('bronzeW')])} | ${f1(r[c('copper')])} · ${f1(r[c('tin')])} | ${f1(r[c('smelt')])} | ${r[c('smith')]} | ${f1(om ? om[0] : 0)} · ${f1(fm.in)} | ${f1(oc ? oc[0] : 0)} · ${f1(fc.in)} |`);
}
out.push('', `(교역 장부 줄 ${Q.rows} · 원석 교역 줄 ${(Q.trade || []).length} · 관찰기 오류 ${Q.err ? '있음' : '없음'})`);
//   ⑤ 온 세계 빈자리 — 품목별 · 10날마다: 빈자리(값표 목표 − 곳간 > 0) 마을 수 / 빈자리 합 / 값표 목표 > 0 마을 수(t1313 ① 온 마을)
const K5 = ['ore_tin', 'ore_lead', 'ore_silver', 'ore_copper', 'ore_gold', 'ore_obsidian'];
const qd = Object.keys(Q.ore).map(Number).sort((a, b) => a - b), pick = qd.filter((d) => d % 10 === 0 || d === Lq);
out.push('', '## ⑤ 온 세계 빈자리 — 날:빈자리 마을 수/빈자리 합/값표 목표 > 0 마을 수', '');
for (const k of K5) {
  const o = [];
  for (const d of pick) { let n = 0, s = 0, t = 0; for (const V of Object.values(Q.ore[d] || {})) { const q = V[k]; if (!q || q[2] == null) continue; if (q[2] > 0) t++; const r = q[2] - q[0]; if (r > 0) { n++; s += r; } } o.push(`${d}:${n}/${f1(s)}/${t}`); }
  out.push(`* ${k.replace('ore_', '')}: ${o.join(' ')}`);
}
//   ⑥ 값표 목표 바닥 — 녹이는 마을-날(흐름 목표 ≥ 1 · 날 11 ~ 끝) 가운데 값표 목표 ≤ 0.2(세계 몫 상한의 바닥)인 몫 · 흐름 목표 반 밑인 몫 · 값표 목표 합 ÷ 흐름 목표 합
const st6 = {};
for (const d of qd) { if (d < 11) continue; for (const V of Object.values(Q.ore[d] || {})) for (const [k, q] of Object.entries(V)) {
  if (!(q[1] >= 1) || q[2] == null) continue; const o = st6[k] || (st6[k] = { n: 0, floor: 0, half: 0, f: 0, t: 0 }); o.n++; if (q[2] <= 0.2 + 1e-9) o.floor++; if (q[2] < q[1] / 2) o.half++; o.f += q[1]; o.t += q[2]; } }
out.push('', '## ⑥ 값표 목표 ↔ 녹임 흐름 목표 — 녹이는 마을-날(흐름 목표 ≥ 1 · 날 11 ~ 끝)', '', '| 원석 | 마을-날 | 값표 목표 바닥(0.2) | 흐름 목표 반 밑 | 값표 목표 합 ÷ 흐름 목표 합 |', '|---|---:|---:|---:|---:|');
for (const [k, o] of Object.entries(st6).sort((a, b) => b[1].n - a[1].n)) out.push(`| ${k.replace('ore_', '')} | ${o.n} | ${pc(o.floor / o.n)} | ${pc(o.half / o.n)} | ${f2(o.t / o.f)} |`);
}
//   ③ 금속 · 원석 짐(판 로그)
let LOG = null;
try { LOG = zlib.gunzipSync(fs.readFileSync(H + '.log.gz')).toString('utf8'); } catch (e) { try { LOG = fs.readFileSync(H + '.log', 'utf8'); } catch (e2) { LOG = null; } }
if (LOG) {
  const go = /캐러밴#\d+ 출발: (\S+)→(\S+) (\S+)×(\d+(?:\.\d+)?) .*?\(econ d(\d+)→/, back = /캐러밴#\d+ 귀환 출발: (\S+)→(\S+) (\S+)×(\d+(?:\.\d+)?) — econ d(\d+) /;
  let n = 0; const rows = [];
  for (const ln of LOG.split('\n')) {
    if (ln.indexOf('캐러밴#') < 0 || ln.indexOf('출발: ') < 0) continue;
    const r = ln.indexOf(' 귀환 출발: ') >= 0, m = (r ? back : go).exec(ln); if (!m) continue; n++;
    if (/^(copper|tin|bronze)$|^ore_/.test(m[3])) rows.push(`d${m[5]} ${m[1]}→${m[2]} ${m[3]}×${m[4]}${r ? '↩' : ''}`);
  }
  out.push('', `## ③ 금속 · 원석 짐 — 캐러밴 출발 · 귀환 출발 ${n} 줄 가운데 구리 · 주석 · 원석 ${rows.length}`, '', rows.length ? rows.join(' · ') : '없음');
}
//   ④ 마을 날별
out.push('', '## ④ 마을 날별 — 날:청동 무기 누계/구리/주석 곳간(5날마다)', '');
for (const vn of opt.v) {
  const o = []; for (let d = 5; d <= L; d += 5) { const r = (A.day[d] || []).find((q) => q[0] === vn); if (r) o.push(`${d}:${f1(r[I('bronzeW')])}/${f1(r[I('copper')])}/${f1(r[I('tin')])}`); }
  out.push(`* ${vn}: ${o.join(' ') || '광산 마을 아님(t1256 밖)'}`);
}
const md = out.join('\n'); console.log(md); if (opt.md) fs.writeFileSync(opt.md, md + '\n');
