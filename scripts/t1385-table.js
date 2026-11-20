'use strict';
// (@regress 없음 — 러너 밖 · T1385 표 자 · 읽기만)
// === scripts/t1385-table.js — T1385 표: 상한 · 문턱 전수 · 드묾이 저절로 나오는가 · 쌓인 금속 · 곁 · 수출 주조 · 마을별 최악 · 두 해 랩 · 전쟁 창 ==========
//   쓰는 법: RUNS=<판 자리> [LAB=<랩 판 자리>] node scripts/t1385-table.js
//     전쟁 창(§8)은 `<판 자리>/war.jsonl`(`scripts/t1385-war.js` 가 판 로그에서 뽑은 줄)이 있을 때만
//     판 자리 = `<판>-<시드>/<판>-<시드>.<꼴>.json` (판 폴더) 또는 `<판>-<시드>.<꼴>.json[.gz]`(계측 납작 · 큰 것은 gz) — 둘 다 읽는다
//     판: 서버 자 400날 S<팔>-<시드>(1020 · 7 · 42) · 몸 세계 100날 B<팔>-<시드>(1020 · 7) · 랩 L<팔>-0/probe.json(econ-lab-real 100날) · Y<팔>-<시드>/{probe.json · farm.json}(t176-ab 800날)
//     팔: OFF · ARMORY(㉮) · TINGATE(㉯) · WS(㉰) · POOR(㉱) · NOCAP(넷 다) · NOCAPX(넷 다 + 수출 주조)
//   칸 · 셈은 다 판 JSON 에서(손 셈 0) · 끔비 = 같은 시드 끔 판 대비 · 가운데 = 시드 가운데
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const RUNS = process.env.RUNS || '/root/t1385runs', LAB = process.env.LAB || path.join(RUNS, 'lab');
const ARMS = ['OFF', 'ARMORY', 'TINGATE', 'WS', 'POOR', 'NOCAP', 'NOCAPX'];
const ANAME = { OFF: '끔', ARMORY: '㉮ 병기고 몫', TINGATE: '㉯ 상비 자격', WS: '㉰ 세계 몫', POOR: '㉱ 굶는 마을 칼', NOCAP: '걷음(넷 다)', NOCAPX: '걷음 + 수출' };
const SSEEDS = [1020, 7, 42], BSEEDS = [1020, 7];
const rdf = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f + '.gz')).toString('utf8')); } catch (e2) { return null; } } };
const head = (n) => (fs.existsSync(path.join(RUNS, n)) && fs.statSync(path.join(RUNS, n)).isDirectory()) ? path.join(RUNS, n, n) : path.join(RUNS, n);
const rd = (n, kind) => rdf(head(n) + (kind ? '.' + kind : '') + '.json');
const f0 = (x) => (x == null || !isFinite(x) ? '—' : Math.round(+x).toLocaleString('en-US'));
const f1 = (x) => (x == null || !isFinite(x) ? '—' : (+x).toFixed(1));
const f2 = (x) => (x == null || !isFinite(x) ? '—' : (+x).toFixed(2));
const f3 = (x) => (x == null || !isFinite(x) ? '—' : (+x).toFixed(3));
const pc = (x) => (x == null || !isFinite(x) ? '—' : (100 * x).toFixed(1) + '%');
const rat = (a, b) => (a == null || b == null || !(b > 0) ? null : a / b);
const med = (a) => { const s = a.filter((x) => x != null && isFinite(x)).sort((p, q) => p - q); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sum = (a) => a.reduce((s, x) => s + (+x || 0), 0);
const out = (s) => process.stdout.write(s + '\n');

// ── 한 판 요약(서버 · 몸 — t1385 관찰기 + 판 JSON + fd-deaths + t1333 짐 + t1344 교역) ──
function sumRun(n) {
  const O = rd(n, 't1385'); if (!O || !O.days || !O.days.length) return null;
  const J = rd(n), F = rd(n, 'fd-deaths'), A = rd(n, 't1333'), B = rd(n, 't1344');
  const C = O.dcols, I = (k) => C.indexOf(k), L = O.days[O.days.length - 1], day = L[I('day')];
  const days = O.days, col = (k) => days.map((r) => r[I(k)]);
  const snapDay = Math.max(...Object.keys(O.snaps || {}).map(Number)), per = (O.snaps || {})[snapDay] || [];
  const V = O.vcols, VI = (k) => V.indexOf(k);
  const vil = per.filter((r) => r[VI('pop')] > 0);
  const bs = vil.map((r) => r[VI('bronzeS')]), totBs = sum(bs), totMel = sum(vil.map((r) => r[VI('melee')]));
  const qs = vil.filter((r) => r[VI('melee')] >= 1).map((r) => r[VI('bronzeS')] / r[VI('melee')]);
  const top5 = [...bs].sort((a, b) => b - a).slice(0, 5);
  const bzCum = sum(vil.map((r) => r[VI('bronzeCum')])), stoneCum = sum(vil.map((r) => r[VI('stoneCum')]));
  const g = (k) => sum(col(k));
  const legs = A ? A.legs : [];
  const wLegs = legs.filter((x) => x[3] === 'weapon');
  const tin5by = {}; for (const x of legs) if (x[3] === 'tin' && x[1] === '광산5') tin5by[x[2]] = (tin5by[x[2]] || 0) + x[4];
  const food = B && B.trade ? sum(Object.values(B.trade).map((x) => (x[1] || 0) + (x[2] || 0))) : null;
  const casts = O.casts || [], over = casts.filter((c) => c[5] != null && c[5] >= 1);
  const k5 = O.k5 && O.k5.length ? O.k5[O.k5.length - 1] : null, K5 = O.k5cols || [];
  const fdBy = {}; if (VI('fdDead') >= 0) for (const r of vil) fdBy[r[0]] = r[VI('fdDead')];
  return {
    n, day, pop: J && J.eight ? J.eight.pop : sum(vil.map((r) => r[VI('pop')])), vill: vil.length, empty: 51 - vil.length,
    hold1: vil.filter((r) => r[VI('bronzeS')] >= 1).length, hold5: vil.filter((r) => r[VI('bronzeS')] >= 5).length,
    half: qs.filter((q) => q > 0.5).length, halfN: vil.filter((r) => r[VI('melee')] >= 1 && r[VI('bronzeS')] / r[VI('melee')] > 0.5).map((r) => `${r[0]} ${f1(r[VI('bronzeS')])}/${f1(r[VI('melee')])}`),
    qMed: med(qs), qMax: qs.length ? Math.max(...qs) : null, top5: totBs > 0 ? sum(top5) / totBs : null, worldQ: totMel > 0 ? totBs / totMel : null, bronzeS: totBs, melee: totMel,
    bzCum, stoneCum, stoneDay: g('stoneToday'), weapQ: L[I('weapQ')], smith: L[I('smith')], mason: L[I('mason')], warrior: L[I('warrior')],
    tin: L[I('tin')], cu: L[I('copper')], idleTin: L[I('idleTin')], idleCu: L[I('idleCu')],
    idleTinAvg: rat(sum(col('idleTin')), sum(col('tin'))), idleCuAvg: rat(sum(col('idleCu')), sum(col('copper'))),
    hold1Avg: sum(col('hold1')) / days.length,
    g1: g('g1'), g1o: g('g1o'), g2: g('g2'), g2s: g('g2s'), g3tin: g('g3tin'), g3cu: g('g3cu'), g3otin: g('g3otin'), g3ocu: g('g3ocu'), g3ok: g('g3ok'), g4: g('g4'), g4o: g('g4o'), xThick: g('xThick'),
    gHold: O.gHold, gVill: O.gVill, vd: sum(col('vill')),
    fdDead: F ? F.fdDeadTot : null, fdBy, food, wLegs: wLegs.length, wAmt: sum(wLegs.map((x) => x[4])), wBuyers: new Set(wLegs.map((x) => x[2])).size,   // t1333 짐 줄 = [날 · 판 마을 · 산 마을 · …] (귀로 짐도 판 · 산 차례로 적힌다)
    wSellers: [...new Set(wLegs.map((x) => x[1]))], tin5by, tin5n: legs.filter((x) => x[3] === 'tin' && x[1] === '광산5').length,
    casts: casts.length, castBz: sum(casts.map((c) => c[2] * c[3])), over: over.length, overBz: sum(over.map((c) => c[2] * c[3])),
    k5: k5 ? Object.fromEntries(K5.map((k, i) => [k, k5[i]])) : null, k5rows: O.k5 || [], K5,
    per: vil, V, met: A ? A.met : null, dayRows: A ? A.day : null, vcols33: A ? A.vcols : null, err: O.err,
  };
}
const S = {}; for (const a of ARMS) for (const s of SSEEDS) { const r = sumRun(`S${a}-${s}`); if (r) S[`${a}-${s}`] = r; }
const Bd = {}; for (const a of ARMS) for (const s of BSEEDS) { const r = sumRun(`B${a}-${s}`); if (r) Bd[`${a}-${s}`] = r; }

out('# T1385 표 — 청동 사슬의 명시적 상한 걷기\n');
out(`판 자리 \`${RUNS}\` · 서버 자 판 ${Object.keys(S).length} · 몸 판 ${Object.keys(Bd).length}\n`);

// ── §1 전수 — 끔 판 3시드 400날에 그 문이 닫은 마을-날 · 그날 곳간 ──
out('## 1. 상한 · 문턱 전수 — 끔 판(서버 자 400날)에서 그 문이 닫은 마을-날 · 그날 그 마을 곳간(마을-날 평균)\n');
out('| 문 | 1020 | 7 | 42 | 닫은 날 곳간 주석 · 구리 · 청동 근접검(1020 · 마을-날 평균) | 그 가운데 "걷으면 연다" |');
out('|---|---:|---:|---:|---|---|');
const off = (s) => S[`OFF-${s}`];
const gl = (k, sub) => SSEEDS.map((s) => (off(s) ? (sub ? `${f0(off(s)[k])}(${f0(off(s)[sub])})` : f0(off(s)[k])) : '—'));
const hold = (k, cnt) => { const o = off(1020); if (!o || !o.gHold || !o.gHold[k] || !(o[cnt] > 0)) return '—'; const h = o.gHold[k]; return `${f2(h[0] / o[cnt])} · ${f2(h[1] / o[cnt])} · ${f2(h[2] / o[cnt])}`; };
out(`| ㉮ 병기고 청동 몫 0.45(대장장이 · 청동 재료 · 잘 먹는 마을 · 근접검 ≥ 병기고 × 0.45) | ${gl('g1').join(' | ')} | ${hold('g1', 'g1')} | ${SSEEDS.map((s) => (off(s) ? f0(off(s).g1o) : '—')).join(' · ')} |`);
out(`| ㉯ 청동 상비 자격(산지 아님 · 주석 < max(13, 사람 × 0.95) · 청동 재료 있음 — 괄호 = 대장장이 있음) | ${gl('g2', 'g2s').join(' | ')} | ${hold('g2', 'g2')} | — |`);
const g3s = (s) => (off(s) ? `주석 ${f0(off(s).g3tin)} · 구리 ${f0(off(s).g3cu)} · 주석 원석 ${f0(off(s).g3otin)} · 구리 원석 ${f0(off(s).g3ocu)}` : '—');
out(`| ㉰ 세계 몫 상한(값표 목표가 상한에 깎인 마을-날 — 품목별) | ${SSEEDS.map(g3s).join(' | ')} | ${(() => { const o = off(1020); if (!o) return '—'; const n = Object.values(o.gVill).reduce((a, x) => a + x[4], 0); const h = o.gHold.g3; return n ? `${f2(h[0] / n)} · ${f2(h[1] / n)} · ${f2(h[2] / n)}` : '—'; })()} | — |`);
out(`| ㉱ 취약 갈래 칼 한도 max(2, 전사 × 1.2)(대장장이 · 청동 재료 · 굶는 마을 · 근접검 ≥ 한도) | ${gl('g4').join(' | ')} | ${hold('g4', 'g4')} | ${SSEEDS.map((s) => (off(s) ? f0(off(s).g4o) : '—')).join(' · ')} |`);
out(`| (수출 주조 문) 곳간 무기 ≥ 사람 × 0.8(대장장이 · 청동 재료 마을 — \`_weaponThin\` 거짓) | ${gl('xThick').join(' | ')} | — | — |`);
// 주석 수출 비축(v2 TIN_EXPORT_KEEP_PC 1.2 · SURPLUS 0.3) — t1333 금속 칸(곳간)과 사람(t1333 날 칸)
const keepRow = (o) => {
  if (!o || !o.met || !o.dayRows) return null;
  const VC = o.vcols33 || [], pi = VC.indexOf('pop');
  let n = 0, nNoCu = 0, tinSum = 0;
  for (const [d, M] of Object.entries(o.met)) {
    const D = o.dayRows[d] || {};
    for (const [vn, m] of Object.entries(M)) {
      const t = m.tin ? m.tin[0] : 0; if (!(t > 0.12)) continue;
      const N = D[vn] ? D[vn][pi] : 0; if (!(N > 0)) continue;
      const thresh = Math.max(3, N * 1.2) + N * 0.3;
      if (t <= thresh) { n++; tinSum += t; const cu = m.copper ? m.copper[0] : 0; if (cu < 0.3) nNoCu++; }
    }
  }
  return { n, nNoCu, tinAvg: n ? tinSum / n : null };
};
const kr = SSEEDS.map((s) => keepRow(off(s)));
out(`| (찾음) 주석 수출 비축 v2 \`TIN_EXPORT_KEEP_PC\` 1.2 · \`SURPLUS_PC\` 0.3 — 주석(> 0.12)을 쥔 마을-날 가운데 수출 문턱 max(3, 사람 × 1.2) + 사람 × 0.3 밑(괄호 = 구리 < 0.3 — 쥔 마을이 못 쓴다) | ${kr.map((k) => (k ? `${f0(k.n)}(${f0(k.nNoCu)})` : '—')).join(' | ')} | 주석 ${kr[0] ? f2(kr[0].tinAvg) : '—'} | — |`);
out('');
out('마을-날 합(1020 · 7 · 42): ' + SSEEDS.map((s) => (off(s) ? f0(off(s).vd) : '—')).join(' · ') + ' · ㉰ 값을 잰 마을-날(세계 공급 캐시가 그날 선 날): ' + SSEEDS.map((s) => (off(s) ? f0(off(s).g3ok) : '—')).join(' · '));
// 몸 · 랩 · 두 해 랩 끔 — 같은 문 셈(랩 곁 관찰기 칸 g1 · g2 · g3(품목 합) · g4)
{
  const gs = (P) => { if (!P || !P.days) return null; const C = P.dcols, I = (k) => C.indexOf(k), g = (k) => (I(k) < 0 ? null : sum(P.days.map((r) => r[I(k)]))); return { vd: g('vill'), g1: g('g1'), g2: g('g2'), g3: I('g3') >= 0 ? g('g3') : (I('g3tin') >= 0 ? g('g3tin') + g('g3cu') + g('g3otin') + g('g3ocu') : null), g4: g('g4') }; };
  const rowsG = [];
  for (const s of BSEEDS) { const O = rd(`BOFF-${s}`, 't1385'); const G = gs(O); if (G) rowsG.push([`몸 ${s} · 100날`, G]); }
  { const G = gs(rdf(path.join(LAB, 'LOFF-0', 'probe.json'))); if (G) rowsG.push(['랩 · 100날', G]); }
  for (const s of SSEEDS) { const G = gs(rdf(path.join(LAB, `YOFF-${s}`, 'probe.json'))); if (G) rowsG.push([`두 해 랩 ${s} · 800날`, G]); }
  if (rowsG.length) {
    out('');
    out('몸 · 랩 · 두 해 랩 끔 — 같은 문이 닫은 마을-날(㉰ = 품목 합):\n');
    out('| 판 | 마을-날 | ㉮ | ㉯ | ㉰ | ㉱ |');
    out('|---|---:|---:|---:|---:|---:|');
    for (const [n, G] of rowsG) out(`| ${n} | ${f0(G.vd)} | ${f0(G.g1)} | ${f0(G.g2)} | ${G.g3 == null ? '—' : f0(G.g3)} | ${f0(G.g4)} |`);
  }
}
out('');
out('문마다 많이 닫힌 마을(1020 · 끔 — [㉮ · ㉯ · ㉰ · ㉱ 닫은 날]):');
{ const o = off(1020); if (o) { const rows = Object.entries(o.gVill).map(([n, x]) => [n, x[0], x[2], x[4], x[5]]).sort((a, b) => (b[1] + b[2] + b[3] + b[4]) - (a[1] + a[2] + a[3] + a[4])).slice(0, 8); out(rows.map((r) => `${r[0]} ${r[1]} · ${r[2]} · ${r[3]} · ${r[4]}`).join(' / ')); } }
out('');

// ── §2 드묾 ──
const drow = (lab, R, base) => `| ${lab} | ${R.hold1}/${R.vill} (${R.hold5}) | ${f2(R.qMed)} · ${f2(R.qMax)} | ${R.half}${R.halfN && R.halfN.length ? ' (' + R.halfN.join(' · ') + ')' : ''} | ${pc(R.top5)} | ${pc(R.worldQ)} | ${f1(R.bzCum)} (${f2(rat(R.bzCum, base && base.bzCum))}) | ${f1(R.hold1Avg)} |`;
out('## 2. 드묾이 저절로 나오는가 — 끝 날 · 청동 근접검 = 근접검 곳간 × 청동 몫(곁 장부)\n');
out('| 판 · 팔 | 청동 검 ≥ 1 자루 마을 / 산 마을 (≥ 5 자루) | 마을 병기고 중 청동 몫 가운데 · 최대(근접검 ≥ 1) | 병기고 절반 넘게 청동인 마을(청동 / 근접검) | 청동 근접검 상위 다섯 마을 몫 | 세계 병기고 중 청동 | 세계 청동 생산 누계(끔비) | 판 평균 쥔 마을 |');
out('|---|---:|---|---|---:|---:|---|---:|');
for (const s of SSEEDS) for (const a of ARMS) { const R = S[`${a}-${s}`]; if (R) out(drow(`서버 ${s} · ${ANAME[a]}`, R, S[`OFF-${s}`])); }
for (const s of BSEEDS) for (const a of ARMS) { const R = Bd[`${a}-${s}`]; if (R) out(drow(`몸 ${s} · ${ANAME[a]}`, R, Bd[`OFF-${s}`])); }
// 랩 100날
const labSum = (P, at) => {
  if (!P || !P.snaps) return null;
  const d = at != null ? at : Math.max(...Object.keys(P.snaps).map(Number)), per = (P.snaps[d] || []).filter((r) => r[1] > 0), V = P.vcols, VI = (k) => V.indexOf(k);
  const bs = per.map((r) => r[VI('bronzeS')]), tot = sum(bs), mel = sum(per.map((r) => r[VI('melee')]));
  const qs = per.filter((r) => r[VI('melee')] >= 1).map((r) => r[VI('bronzeS')] / r[VI('melee')]), top5 = [...bs].sort((a, b) => b - a).slice(0, 5);
  const D = P.days, C = P.dcols, I = (k) => C.indexOf(k), last = D.filter((r) => r[I('day')] <= d).pop() || D[D.length - 1];
  return { day: d, vill: per.length, hold1: per.filter((r) => r[VI('bronzeS')] >= 1).length, hold5: per.filter((r) => r[VI('bronzeS')] >= 5).length, qMed: med(qs), qMax: qs.length ? Math.max(...qs) : null,
    half: qs.filter((q) => q > 0.5).length, halfN: per.filter((r) => r[VI('melee')] >= 1 && r[VI('bronzeS')] / r[VI('melee')] > 0.5).map((r) => `${r[0]} ${f1(r[VI('bronzeS')])}/${f1(r[VI('melee')])}`),
    top5: tot > 0 ? sum(top5) / tot : null, worldQ: mel > 0 ? tot / mel : null, bzCum: sum(per.map((r) => r[VI('bronzeCum')])), hold1Avg: sum(D.filter((r) => r[I('day')] <= d).map((r) => r[I('hold1')])) / Math.max(1, D.filter((r) => r[I('day')] <= d).length),
    pop: sum(per.map((r) => r[VI('pop')])), fd: sum(per.map((r) => r[VI('fdDead')] || 0)), stone: sum(per.map((r) => r[VI('stoneCum')])), weapQ: last[I('weapQ')],
    idleTin: last[I('idleTin')], tin: last[I('tin')], idleCu: last[I('idleCu')], cu: last[I('copper')], smith: last[I('smith')], mason: last[I('mason')], trade: P.trade, casts: P.casts, per, V };
};
const Lb = {}; for (const a of ARMS) { const P = rdf(path.join(LAB, `L${a}-0`, 'probe.json')); const r = labSum(P); if (r) Lb[a] = r; }
for (const a of ARMS) if (Lb[a]) out(drow(`랩 100날 · ${ANAME[a]}`, Lb[a], Lb.OFF));
out('');

// ── §3 쌓인 금속 ──
out('## 3. 쌓인 금속이 풀리는가 — 묵은 주석 · 구리(지난 30날 청동을 안 부은 마을이 쥔 몫) · 광산5 주석이 가는 곳\n');
out('| 판 · 팔 | 세계 주석 · 구리 곳간(끝) | 묵은 주석 · 구리(끝) | 묵은 몫 판 평균(주석 · 구리) | 광산5 끝(사람 · 식량 안보 · 주석 · 구리 · 청동 누계) | 광산5 에서 나간 주석(줄 · 받은 마을) |');
out('|---|---|---|---|---|---|');
const k5s = (R) => (R.k5 ? `${R.k5.pop} · ${f2(R.k5.secF)} · ${f2(R.k5.tin)} · ${f2(R.k5.copper)} · ${f2(R.k5.bronzeCum)}` : '—');
const t5s = (R) => `${R.tin5n} · ${Object.entries(R.tin5by).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => k + ' ' + f1(v)).join(' · ') || '—'}`;
for (const s of SSEEDS) for (const a of ARMS) { const R = S[`${a}-${s}`]; if (R) out(`| 서버 ${s} · ${ANAME[a]} | ${f2(R.tin)} · ${f2(R.cu)} | ${f2(R.idleTin)} · ${f2(R.idleCu)} | ${pc(R.idleTinAvg)} · ${pc(R.idleCuAvg)} | ${k5s(R)} | ${t5s(R)} |`); }
for (const s of BSEEDS) for (const a of ARMS) { const R = Bd[`${a}-${s}`]; if (R) out(`| 몸 ${s} · ${ANAME[a]} | ${f2(R.tin)} · ${f2(R.cu)} | ${f2(R.idleTin)} · ${f2(R.idleCu)} | ${pc(R.idleTinAvg)} · ${pc(R.idleCuAvg)} | ${k5s(R)} | ${t5s(R)} |`); }
for (const a of ARMS) { const R = Lb[a]; if (R) out(`| 랩 100날 · ${ANAME[a]} | ${f2(R.tin)} · ${f2(R.cu)} | ${f2(R.idleTin)} · ${f2(R.idleCu)} | — | — | ${Object.entries((R.trade && R.trade.tin5) || {}).map(([k, v]) => k + ' ' + f1(v)).join(' · ') || '—'} |`); }
out('');

// ── §4 곁 ──
out('## 4. 곁 — 돌검 · 무기 질 · 굶어 죽음 · 인구 · 식량 교역 · 대장장이 · 석공\n');
out('| 판 · 팔 | 인구(끔비) | 빈 마을 | 굶어 죽음 | 석검 누계 | 무기 질 | 식량 교역량(끔비) | 대장장이 · 석공 · 전사(끝) |');
out('|---|---|---:|---:|---:|---:|---|---|');
const srow = (lab, R, b) => `| ${lab} | ${f0(R.pop)} (${f3(rat(R.pop, b && b.pop))}) | ${R.empty != null ? R.empty : '—'} | ${f0(R.fdDead != null ? R.fdDead : R.fd)} | ${f1(R.stoneCum != null ? R.stoneCum : R.stone)} | ${f3(R.weapQ)} | ${R.food != null ? f0(R.food) + ' (' + f3(rat(R.food, b && b.food)) + ')' : '—'} | ${R.smith} · ${R.mason} · ${R.warrior != null ? R.warrior : '—'} |`;
for (const s of SSEEDS) for (const a of ARMS) { const R = S[`${a}-${s}`]; if (R) out(srow(`서버 ${s} · ${ANAME[a]}`, R, S[`OFF-${s}`])); }
for (const s of BSEEDS) for (const a of ARMS) { const R = Bd[`${a}-${s}`]; if (R) out(srow(`몸 ${s} · ${ANAME[a]}`, R, Bd[`OFF-${s}`])); }
for (const a of ARMS) { const R = Lb[a]; if (R) { R.food = R.trade ? R.trade.food : null; R.empty = 51 - R.vill; out(srow(`랩 100날 · ${ANAME[a]}`, R, Lb.OFF)); } }
out('');

// ── §5 수출 주조(할 일 6) ──
out('## 5. 수출 주조 — 끔 · 걷음 · 걷음 + 수출 (병기고를 채운 청동 위에 부은 주조 = 수출 몫)\n');
out('| 판 · 팔 | 주조(줄 · 청동) | 병기고를 넘겨 부은 주조(줄 · 청동 · 날 · 마을) | 마을 청동 ÷ 병기고(사람 × 0.72) 최대(50날 꾸러미) | 무기 교역 줄 · 양 · 산 마을 | 판 마을 굶어 죽음(끝 · 판 마을 합 — 끔 판 같은 마을) |');
out('|---|---|---|---|---|---|');
const armMax = (n) => { const O = rd(n, 't1385'); if (!O || !O.snaps) return '—'; const V = O.vcols, VI = (k) => V.indexOf(k); let mx = 0, who = ''; for (const [d, rows] of Object.entries(O.snaps)) for (const r of rows) { const p = r[VI('pop')]; if (!(p > 0)) continue; const q = r[VI('bronzeS')] / (p * 0.72); if (q > mx) { mx = q; who = `${r[0]} 날 ${d}`; } } return `${f2(mx)}${who ? ' (' + who + ')' : ''}`; };   // 0.72 = MELEE_ARMORY_PC(병기고 사람 × 0.72 — 걷은 판의 청동 수요 끝)
const overS = (R) => { const O = rd(R.n, 't1385'); const ov = ((O && O.casts) || []).filter((c) => c[5] != null && c[5] >= 1); return `${R.over} · ${f1(R.overBz)}${ov.length ? ' · 날 ' + [...new Set(ov.map((c) => c[0]))].join(' · ') + ' · ' + [...new Set(ov.map((c) => c[1]))].join(' · ') : ''}`; };
for (const [lab, M, seeds, arms, pre] of [['서버', S, SSEEDS, ['OFF', 'NOCAP', 'NOCAPX'], 'S'], ['몸', Bd, BSEEDS, ['OFF', 'NOCAPX'], 'B']]) for (const s of seeds) for (const a of arms) {
  const R = M[`${a}-${s}`]; if (!R) continue; const O0 = M[`OFF-${s}`];
  const sell = R.wSellers || [], fdS = sum(sell.map((n) => R.fdBy[n] || 0)), fdS0 = O0 ? sum(sell.map((n) => O0.fdBy[n] || 0)) : null;
  out(`| ${lab} ${s} · ${ANAME[a]} | ${R.casts} · ${f1(R.castBz)} | ${overS(R)} | ${armMax(`${pre}${a}-${s}`)} | ${R.wLegs} · ${f1(R.wAmt)} · ${R.wBuyers} | ${sell.length} 마을 · ${f0(fdS)} (끔 ${f0(fdS0)}) |`);
}
const labArmMax = (P) => { if (!P || !P.snaps) return '—'; let mx = 0, who = ''; const VI = (k) => P.vcols.indexOf(k); for (const [d, rows] of Object.entries(P.snaps)) for (const r of rows) { const p = r[VI('pop')]; if (!(p > 0)) continue; const q = r[VI('bronzeS')] / (p * 0.72); if (q > mx) { mx = q; who = `${r[0]} 날 ${d}`; } } return `${f2(mx)}${who ? ' (' + who + ')' : ''}`; };   // 꾸러미 전부(랩 100날 = 끝 하나 · 두 해 = 365 · 730 · 100날마다 · 끝)
for (const a of ['OFF', 'NOCAP', 'NOCAPX']) { const R = Lb[a]; if (!R) continue; const T = R.trade || {}, Cc = R.casts || {};
  out(`| 랩 100날 · ${ANAME[a]} | ${Cc.n} · ${f1(Cc.bz)} | ${Cc.over} · ${f1(Cc.overBz)} | ${labArmMax(rdf(path.join(LAB, `L${a}-0`, 'probe.json')))} | ${T.weaponRows} · ${f1(T.weaponAmt)} · ${Object.keys(T.weaponBuyers || {}).length} | ${Object.keys(T.weaponSellers || {}).length} 마을 |`); }
for (const s of SSEEDS) for (const a of ['OFF', 'NOCAPX']) { const P = rdf(path.join(LAB, `Y${a}-${s}`, 'probe.json')); if (!P || !P.snaps) continue; const R = labSum(P), T = R.trade || {}, Cc = R.casts || {};
  out(`| 두 해 랩 ${s} · ${ANAME[a]} | ${Cc.n} · ${f1(Cc.bz)} | ${Cc.over} · ${f1(Cc.overBz)} | ${labArmMax(P)} | ${T.weaponRows} · ${f1(T.weaponAmt)} · ${Object.keys(T.weaponBuyers || {}).length} | ${Object.keys(T.weaponSellers || {}).length} 마을 |`); }
out('');

// ── §6 마을별 최악(걷음 + 수출 ↔ 끔 · 서버 3시드) ──
out('## 6. 마을별 최악 — 팔 ↔ 끔(같은 시드 · 같은 마을 · 끝 날) · 두 쪽 다(진 마을 · 는 마을 — 갈래가 일찍 갈리면 마을마다 뒤섞인다)\n');
out('| 시드 · 팔 | 끔엔 사는데 켬엔 빈 마을(끔 끝 사람 · 굶어 죽음) | 거꾸로(끔엔 빈데 켬엔 산다) | 사람 비 < 0.8 · > 1.25 마을(끔 ≥ 10) | 잃은 사람 · 는 사람(마을 합) | 사람 비 최저(마을) | 굶어 죽음이 가장 는 마을(끔 → 켬) | 청동 근접검 가장 많은 마을(켬) |');
out('|---|---|---:|---|---|---|---|---|');
for (const s of SSEEDS) for (const a of ['TINGATE', 'WS', 'POOR', 'NOCAPX']) {
  const A = S[`${a}-${s}`], O0 = S[`OFF-${s}`]; if (!A || !O0) continue;
  const VI = (k) => A.V.indexOf(k), m0 = new Map(O0.per.map((r) => [r[0], r])), m1 = new Map(A.per.map((r) => [r[0], r]));
  const died = [...m0.keys()].filter((n) => !m1.has(n)), rev = [...m1.keys()].filter((n) => !m0.has(n));
  const ratios = [...m0.entries()].filter(([n, r]) => r[VI('pop')] >= 10 && m1.has(n)).map(([n, r]) => [n, m1.get(n)[VI('pop')] / r[VI('pop')], r[VI('pop')], m1.get(n)[VI('pop')]]).sort((x, y) => x[1] - y[1]);
  let lost = 0, gain = 0; for (const [n, r] of m0) { const p1 = m1.has(n) ? m1.get(n)[VI('pop')] : 0; if (p1 < r[VI('pop')]) lost += r[VI('pop')] - p1; else gain += p1 - r[VI('pop')]; }
  const fdInc = VI('fdDead') >= 0 ? [...m1.entries()].map(([n, r]) => [n, (r[VI('fdDead')] || 0) - ((m0.get(n) || [])[VI('fdDead')] || 0), (m0.get(n) || [])[VI('fdDead')] || 0, r[VI('fdDead')] || 0]).sort((x, y) => y[1] - x[1]) : [];
  const topB = [...A.per].sort((x, y) => y[VI('bronzeS')] - x[VI('bronzeS')])[0];
  out(`| ${s} · ${ANAME[a]} | ${died.length}${died.length ? ' (' + died.map((n) => `${n} ${m0.get(n)[VI('pop')]} · ${m0.get(n)[VI('fdDead')] || 0}`).join(' / ') + ')' : ''} | ${rev.length} | ${ratios.filter((x) => x[1] < 0.8).length} · ${ratios.filter((x) => x[1] > 1.25).length} | ${f0(lost)} · ${f0(gain)} | ${ratios.length ? `${f2(ratios[0][1])} (${ratios[0][0]} ${ratios[0][2]} → ${ratios[0][3]})` : '—'} | ${fdInc.length && fdInc[0][1] > 0 ? `${fdInc[0][0]} ${fdInc[0][2]} → ${fdInc[0][3]}` : '—'} | ${topB ? `${topB[0]} ${f1(topB[VI('bronzeS')])} / 근접검 ${f1(topB[VI('melee')])}` : '—'} |`);
}
out('');

// ── §7 두 해 랩(t176-ab 800날 · 3시드) ──
out('## 7. 두 해 랩(t176-ab 800날 · 해 끝 날 · 365 · 730 · 800) — 끔 ↔ 걷음 + 수출\n');
out('| 시드 · 팔 | 해 | 인구(끔비) | 산 마을 | 청동 검 쥔 마을 | 병기고 절반 넘게 청동 | 세계 병기고 중 청동 | 청동 상위 다섯 마을 몫 | 청동 누계(끔비) | 굶어 죽음 누계 | 묵은 주석 / 주석 | 무기 질 |');
out('|---|---|---|---:|---:|---:|---:|---:|---|---:|---|---:|');
const Y = {}; for (const s of SSEEDS) for (const a of ['OFF', 'NOCAPX']) { const P = rdf(path.join(LAB, `Y${a}-${s}`, 'probe.json')); if (P && P.snaps) Y[`${a}-${s}`] = P; }
const yDays = (P) => [365, 730, Math.max(...Object.keys(P.snaps).map(Number))].filter((d, i, A) => P.snaps[d] && A.indexOf(d) === i);
for (const s of SSEEDS) for (const a of ['OFF', 'NOCAPX']) {
  const P = Y[`${a}-${s}`]; if (!P) continue; const P0 = Y[`OFF-${s}`];
  for (const d of yDays(P)) { const R = labSum(P, d), R0 = P0 && P0.snaps[d] ? labSum(P0, d) : null; out(`| ${s} · ${ANAME[a]} | 날 ${d} | ${f0(R.pop)} (${f3(rat(R.pop, R0 && R0.pop))}) | ${R.vill} | ${R.hold1} | ${R.half} | ${pc(R.worldQ)} | ${pc(R.top5)} | ${f1(R.bzCum)} (${f2(rat(R.bzCum, R0 && R0.bzCum))}) | ${f0(R.fd)} | ${f2(R.idleTin)} / ${f2(R.tin)} | ${f3(R.weapQ)} |`); }
}
out('');
// 두 해 랩 마을별 최악(끝 날 · 걷음 + 수출 ↔ 끔)
out('두 해 랩 마을별 최악(끝 날 · 걷음 + 수출 ↔ 끔 · 끔 사람 ≥ 10):\n');
out('| 시드 | 끔엔 사는데 켬엔 빈 마을 | 거꾸로 | 사람 비 < 0.8 · > 1.25 | 사람 비 최저(마을) | 굶어 죽음이 가장 는 마을 |');
out('|---|---|---:|---|---|---|');
for (const s of SSEEDS) {
  const P1 = Y[`NOCAPX-${s}`], P0 = Y[`OFF-${s}`]; if (!P1 || !P0) continue;
  const d = Math.min(Math.max(...Object.keys(P1.snaps).map(Number)), Math.max(...Object.keys(P0.snaps).map(Number)));
  const A = labSum(P1, d), O0 = labSum(P0, d), VI = (k) => A.V.indexOf(k);
  const m0 = new Map(O0.per.map((r) => [r[0], r])), m1 = new Map(A.per.map((r) => [r[0], r]));
  const died = [...m0.keys()].filter((n) => !m1.has(n)), rev = [...m1.keys()].filter((n) => !m0.has(n));
  const ratios = [...m0.entries()].filter(([n, r]) => r[VI('pop')] >= 10 && m1.has(n)).map(([n, r]) => [n, m1.get(n)[VI('pop')] / r[VI('pop')], r[VI('pop')], m1.get(n)[VI('pop')]]).sort((x, y) => x[1] - y[1]);
  const fdInc = [...m1.entries()].map(([n, r]) => [n, (r[VI('fdDead')] || 0) - ((m0.get(n) || [])[VI('fdDead')] || 0), (m0.get(n) || [])[VI('fdDead')] || 0, r[VI('fdDead')] || 0]).sort((x, y) => y[1] - x[1]);
  out(`| ${s} (날 ${d}) | ${died.length}${died.length ? ' (' + died.join(' · ') + ')' : ''} | ${rev.length} | ${ratios.filter((x) => x[1] < 0.8).length} · ${ratios.filter((x) => x[1] > 1.25).length} | ${ratios.length ? `${f2(ratios[0][1])} (${ratios[0][0]} ${ratios[0][2]} → ${ratios[0][3]})` : '—'} | ${fdInc.length && fdInc[0][1] > 0 ? `${fdInc[0][0]} ${fdInc[0][2]} → ${fdInc[0][3]}` : '—'} |`);
}
out('');

// ── §8 전쟁 창(서버 자 400날 — 전쟁은 평형 뒤 365날부터 · `t1385-war.js` 줄) ──
const WAR = (() => { try { return fs.readFileSync(path.join(RUNS, 'war.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)); } catch (e) { return null; } })();
if (WAR) {
  out('## 8. 전쟁 창 — 서버 자 판 365 ~ 400날(누계 · 로그 전쟁 날 줄 · 긴급 소집 = 막는 마을 · ★ = 그날 앞 꾸러미 청동 근접검 ≥ 1)\n');
  out('| 판 · 팔 | 끝 날 | 선포 · 전투 | 공격 이김 / 막음 이김 | 사상 | 막은 마을(결과) | 판 끝 청동 쥔 마을 |');
  out('|---|---:|---|---|---:|---|---|');
  const W = new Map(WAR.map((r) => [r.tag, r]));
  for (const s of SSEEDS) for (const a of ARMS) { const r = W.get(`S${a}-${s}`); if (!r || !r.last) continue; const l = r.last;
    out(`| 서버 ${s} · ${ANAME[a]} | ${l.day} | ${l.decl} · ${l.battle} | ${l.atkWin} / ${l.defWin} | ${l.cas} | ${r.defs.map((d) => `${d.v}${d.bronze >= 1 ? '★' + f1(d.bronze) : ''} ${d.res}`).join(' · ') || '—'} | ${r.holders.join(' · ') || '—'} |`); }
  out('');
}
const errs = [...Object.values(S), ...Object.values(Bd)].filter((R) => R.err).map((R) => `${R.n}: ${R.err}`);
if (errs.length) out('관찰기 오류: ' + errs.join(' / '));
