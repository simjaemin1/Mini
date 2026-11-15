#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1333 계측 읽개 · 제품 무변)
// === scripts/t1333-diag.js — 청동 길 진단: 구리가 광산5(주석 마을)로 가나 · 왜 안 가나 ==========
//   쓰는 법: node scripts/t1333-diag.js <판 머리>… [--dist <다른 판 .t1333.json>]   (판 머리 = `<폴더>/<판>-<시드>` — `.t1256.json` · `.log.gz`(또는 `.log`) · 있으면 `.t1333.json`)
//   ① 판마다 광산5 줄(t1256 날 줄 — 대장장이 · 청동 무기 누계 · 구리 · 주석 · 무기 곳간) — 구리가 처음 바닥(< 0.05)난 날 · 그 앞 10날 청동 증가(주조가 돌던 중인가)
//      · 광산5 로 든 구리 짐(로그 — 출발 짐 X→광산5 · 귀로 짐 X→광산5(광산5 캐러밴이 사 온 것)) 첫 날 · 수 · 보낸 마을 곳간
//   ② t1333 관찰기가 있으면: 광산5 구리 [곳간 · 흐름 목표 · 파생(발주) · 값표 목표 · 유효 재고 · 값] 10날마다 · 구리 쥔 마을 값 · 거리(villageDist) ·
//      한 단위 몫 어림(닿은 값 × 0.95 × (1 − TAU) − 떠난 값 × (1 + TAU) − 운반비 × 거리/1000 — 기대 손실 · 기회비용 관문 전)
//   ③ 판 사이 — 같은 시드 판끼리 광산5 구리 줄이 처음 갈리는 날 · 그날 구리 · 청동 · 무기
const fs = require('fs');
const zlib = require('zlib');
const argv = process.argv.slice(2), di = argv.indexOf('--dist'), DIST = di >= 0 ? (JSON.parse(fs.readFileSync(argv[di + 1], 'utf8')).dist || {}) : null;   // --dist <t1333.json> — 거리 칸을 그 판에서 빌린다(같은 지도 · 판 끝에 적히므로 도는 판엔 아직 없다)
const heads = argv.filter((a, i) => !a.startsWith('--') && !(di >= 0 && i === di + 1));
if (!heads.length) { console.error('쓰는 법: node scripts/t1333-diag.js <판 머리>…'); process.exit(2); }
const f2 = (x) => (x == null ? '·' : (+x).toFixed(2)), f1 = (x) => (x == null ? '·' : (+x).toFixed(1));
const VIL = '광산5';
function readJ(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } }
function readLog(h) { try { return zlib.gunzipSync(fs.readFileSync(h + '.log.gz')).toString('utf8'); } catch (e) { try { return fs.readFileSync(h + '.log', 'utf8'); } catch (e2) { return null; } } }
function line5(h) {   // t1256 날 줄 → 날: { sm, bz, cu, sn, w }
  const A = readJ(h + '.t1256.json'); if (!A) return null;
  const I = (k) => A.dcols.indexOf(k), out = {};
  for (const [d, rows] of Object.entries(A.day)) { const r = (rows || []).find((q) => q[0] === VIL); if (r) out[d] = { sm: r[I('eSmith')], bz: r[I('bronzeW')], cu: r[I('copper')], sn: r[I('tin')], w: r[I('weapon')] }; }
  const hold = {};   // 구리 쥔 광산 마을(광산6 · 어촌1 …) 날별 구리
  for (const [d, rows] of Object.entries(A.day)) for (const r of rows || []) if (r[0] !== VIL) (hold[r[0]] || (hold[r[0]] = {}))[d] = r[I('copper')];
  return { L: out, hold };
}
function legs(h) {
  const LOG = readLog(h); if (!LOG) return null;
  const go = /캐러밴#\d+ 출발: (\S+)→(\S+) (\S+)×(\d+(?:\.\d+)?) .*?\(econ d(\d+)→/, back = /캐러밴#\d+ 귀환 출발: (\S+)→(\S+) (\S+)×(\d+(?:\.\d+)?) — econ d(\d+) /;
  const rows = []; let n = 0;
  for (const ln of LOG.split('\n')) {
    if (ln.indexOf('캐러밴#') < 0 || ln.indexOf('출발: ') < 0) continue;
    const r = ln.indexOf(' 귀환 출발: ') >= 0, m = (r ? back : go).exec(ln); if (!m) continue; n++;
    if (m[3] === 'copper' || m[3] === 'tin') rows.push({ d: +m[5], from: m[1], to: m[2], res: m[3], n: +m[4], back: r });
  }
  return { n, rows };
}
const all = {};
for (const h of heads) {
  const name = h.split('/').pop(), seed = name.split('-').pop();
  const T = line5(h), G = legs(h), O = readJ(h + '.t1333.json');
  all[name] = { seed, T, G, O };
  console.log(`\n## ① ${name}`);
  if (!T) { console.log('t1256 없음'); continue; }
  const days = Object.keys(T.L).map(Number).sort((a, b) => a - b), last = days[days.length - 1];
  const had = days.find((d) => T.L[d].cu > 0.05), out0 = had == null ? null : days.find((d) => d > had && T.L[d].cu < 0.05);   // 처음 구리가 든 뒤 바닥
  const bzGain = out0 ? (T.L[out0].bz - ((T.L[out0 - 10] || T.L[days[0]]).bz)) : null;
  const cuIn = G ? G.rows.filter((r) => r.res === 'copper' && r.to === VIL) : [];
  const snOut = G ? G.rows.filter((r) => r.res === 'tin' && r.from === VIL) : [];
  const first = cuIn[0] || null;
  const P13 = readJ(h + '.t1313.json'), popOf = (d) => { if (!P13) return null; const r = (P13.day[d] || {})[VIL]; return r ? r[P13.vcols.indexOf('pop')] : null; };
  const capOf = (d) => { const n = popOf(d); return n == null ? null : n * 0.72 * 0.45; };   // 청동 병기고 몫(잘 먹는 마을 · 근접검 = 무기 × 칼 몫 ≤ 무기)
  const full = days.filter((d) => d >= 10 && capOf(d) != null && T.L[d].w >= capOf(d)).length, nd = days.filter((d) => d >= 10 && capOf(d) != null).length;
  console.log(`광산5 구리 처음 든 날 ${had == null ? '없음' : had} · 처음 바닥 날 ${out0 || '없음'}${out0 ? `(그 앞 10날 청동 +${f2(bzGain)} — ${bzGain > 0 ? '주조 중에 바닥' : '주조 멈춘 채 바닥'} · 대장장이 ${T.L[out0].sm} · 주석 ${f1(T.L[out0].sn)} · 무기 ${f1(T.L[out0].w)})` : ''} · 날 ${last} 청동 ${f2(T.L[last].bz)} · 구리 ${f1(T.L[last].cu)} · 주석 ${f1(T.L[last].sn)}` + (nd ? ` · 무기 곳간 ≥ 청동 병기고 몫(사람 × 0.72 × 0.45) 날 ${full}/${nd}` : ''));
  console.log(`광산5 로 든 구리 짐 ${cuIn.length}${cuIn.length ? ': ' + cuIn.map((r) => `d${r.d} ${r.from}→${VIL}×${r.n}${r.back ? '↩' : ''}${T.hold[r.from] && T.hold[r.from][r.d] != null ? `(그날 ${r.from} 구리 ${f1(T.hold[r.from][r.d])})` : ''}`).join(' · ') : ''} · 광산5 에서 나간 주석 짐 ${snOut.length}${snOut.length ? ': ' + snOut.map((r) => `d${r.d} →${r.to}×${r.n}${r.back ? '↩' : ''}`).join(' · ') : ''} · 로그 짐 줄 ${G ? G.n : '·'}`);
  const tl = []; for (let d = 5; d <= last; d += 5) if (T.L[d]) tl.push(`${d}:${f2(T.L[d].bz)}/${f1(T.L[d].cu)}/${f1(T.L[d].sn)}/${f1(T.L[d].w)}`);
  console.log('날:청동/구리/주석/무기 — ' + tl.join(' '));
  if (O) {
    console.log(`\n### ② ${name} — t1333 관찰기(손잡이 ${JSON.stringify(O.knobs)} · 교역 상수 ${JSON.stringify(O.consts)})`);
    const md = Object.keys(O.met).map(Number).sort((a, b) => a - b);
    const TC = (O.consts && O.consts.TC1000) || 2, TAU = (O.consts && O.consts.TAU) || 0.03;
    const holders = ['광산6', '어촌1', '광산4', '농촌1', '농촌10'];
    const dist = (a) => { const D = (O.dist && Object.keys(O.dist).length) ? O.dist : (DIST || {}); return D[a + '→' + VIL] || D[VIL + '→' + a] || null; };
    console.log('| 날 | 광산5 구리 곳간 | 흐름 목표 | 발주 | 값표 목표 | 유효 재고 | 광산5 구리 값 | ' + holders.map((n) => `${n} 구리 · 값 · 몫/단위(거리 ${dist(n) || '·'})`).join(' | ') + ' |');
    console.log('|---:|---:|---:|---:|---:|---:|---:|' + holders.map(() => '---').join('|') + '|');
    for (const d of md) {
      if (d % 10 && d !== md[md.length - 1]) continue;
      const m5 = (O.met[d][VIL] || {}).copper || [], p5 = m5[5];
      const hs = holders.map((n) => {
        const c = (O.met[d][n] || {}).copper; if (!c) return '·';
        const ds = dist(n), per = (p5 != null && c[5] != null && ds) ? (p5 * 0.95 * (1 - TAU) - c[5] * (1 + TAU) - TC * ds / 1000) : null;
        return `${f1(c[0])} · ${f2(c[5])} · ${per == null ? '·' : f2(per)}`;
      });
      console.log(`| ${d} | ${f2(m5[0])} | ${f2(m5[1])} | ${f2(m5[2])} | ${f2(m5[3])} | ${f2(m5[4])} | ${f2(p5)} | ${hs.join(' | ')} |`);
    }
    const L = O.legs.filter((x) => (x[3] === 'copper' || x[3] === 'tin') && (x[2] === VIL || x[1] === VIL));
    console.log(`광산5 를 낀 구리 · 주석 짐(관찰기 장부) ${L.length}: ` + L.slice(0, 30).map((x) => `d${x[0]} ${x[1]}→${x[2]} ${x[3]}×${f1(x[4])}${x[8] ? '↩' : ''}`).join(' · '));
  }
}
// ③ 같은 시드 판끼리 처음 갈리는 날(광산5 구리 · 청동 · 무기 · 주석)
console.log('\n## ③ 같은 시드 판끼리 광산5 줄이 처음 갈리는 날');
const bySeed = {}; for (const [n, o] of Object.entries(all)) if (o.T) (bySeed[o.seed] || (bySeed[o.seed] = [])).push(n);
for (const [s, ns] of Object.entries(bySeed)) {
  for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) {
    const A = all[ns[i]].T.L, B = all[ns[j]].T.L; let dd = null;
    for (let d = 1; d <= 100; d++) { const a = A[d], b = B[d]; if (!a || !b) break; if (Math.abs(a.cu - b.cu) > 1e-6 || Math.abs(a.bz - b.bz) > 1e-6 || Math.abs(a.sn - b.sn) > 1e-6 || Math.abs(a.w - b.w) > 1e-6) { dd = d; break; } }
    console.log(`시드 ${s} · ${ns[i]} ↔ ${ns[j]}: ${dd == null ? '날 1 ~ 끝 같음' : `날 ${dd} — 구리 ${f2(A[dd].cu)} ↔ ${f2(B[dd].cu)} · 청동 ${f2(A[dd].bz)} ↔ ${f2(B[dd].bz)} · 주석 ${f1(A[dd].sn)} ↔ ${f1(B[dd].sn)} · 무기 ${f1(A[dd].w)} ↔ ${f1(B[dd].w)}`}`);
  }
}
