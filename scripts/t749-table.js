#!/usr/bin/env node
// === scripts/t749-table.js — T749 표 만들기(계측 · 읽기만) ===================================================
//
// 판 파일(t17 JSON · t749-decay 장부 `*.t749.json.gz`)을 읽어 보고 표를 낸다. 세계를 돌리지 않는다.
//   ① 부패 식의 항 — 생선 부패 = 곳간 × 율 · 율 = min(0.95, 기본 × (1 + 5 × 과잉) × 옹기) · 과잉 = 곳간 ÷ max(1, 목표 × 2) − 1.
//      끔 ↔ 켬 목표(같은 상태의 두 식 · 어느 항이 묶나) · 첫 60일 부패를 기본 항 · 과잉 항 · 0.95 바닥으로 나눈다.
//   ② 물리 대조 — 곳간 로트 장부(T732 · 관측자)로 같은 날 같은 곳간에서 보관일(생선 2.5 · 둘째 읽기 건어물 45)을 넘긴 몫 ↔ econ 부패.
//   ③ 갈래 판 — 끔 · 켬 · 부패 자리만(D) · 켬 · 생선·고기 부패만 종전(t739-arms `T739_DEXCEPT`) · 식단 흐름(T263) · T263 + 켬 의
//      여덟 수(3시드 · T252 자).
//   §7 생선 흐름 — T739 하루 장부(`*.tr.json` · 같은 세계 — t17 바이트 같음)의 문별 흐름(산출 · 먹음 · 갈무리 · 부패 · 출발 · 캐러밴 · 장).
//
// 쓰는 법: node scripts/t749-table.js <판 폴더> [시드,…] [T739 장부 폴더]
//   판 이름: A-off · B-on · C-D · F-onxfm · D-fc · E-fcon(+ `-<시드>.json` t17 · `-<시드>.t749.json.gz` 장부) — 보고 §0 판 표 그대로.
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const DIR = process.argv[2] || '/tmp/t749/r';
const SEEDS = (process.argv[3] || '1020,7,42').split(',');
const ex = (f) => fs.existsSync(path.join(DIR, f));
const rdj = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const rdz = (f) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIR, f))));
const f0 = (x) => (x == null || !isFinite(x)) ? '—' : Math.round(x).toLocaleString('en-US');
const f1 = (x, d = 1) => (x == null || !isFinite(x)) ? '—' : (Math.abs(x) < 1e-12 ? '0' : x.toFixed(d));
const sg = (x, d = 1) => (x == null || !isFinite(x)) ? '—' : ((x > 0 ? '+' : '') + x.toFixed(d));
const pct = (a, b) => (b > 0 ? a / b * 100 : null);
const mean = (a) => { const b = a.filter((x) => x != null && isFinite(x)); return b.length ? b.reduce((p, q) => p + q, 0) / b.length : null; };
const out = []; const P = (s) => out.push(s);
const verdict = (d) => { const pos = d.filter((x) => x > 0).length, neg = d.filter((x) => x < 0).length, m = d.reduce((a, b) => a + b, 0) / d.length, w = Math.max(...d) - Math.min(...d);
  return (pos === d.length || neg === d.length) ? (Math.abs(m) > w ? '가름' : '방향만') : '못 가름'; };
const g8 = (j) => ({ 인구: j.base.pop, 소멸: j.base.dead, 무기Q: j.base.weapQ, 확장: j.base.expand, 게시: j.board.emitted, 도구Q: j.tool.q, 보존: j.preserve.stock, 곡물: j.eight.grain });
const M8 = ['인구', '무기Q', '확장', '게시', '도구Q', '보존', '곡물'];
const RUN = { A: 'A-off', B: 'B-on', C: 'C-D', D: 'D-fc', E: 'E-fcon', F: 'F-onxfm' };
const RUNKO = { A: '끔', B: '켬(T726)', C: '부패 자리만(D)', D: '식단 흐름(T263)', E: 'T263 + 켬', F: '켬 · 생선·고기 부패만 종전' };
const TRDIR = process.argv[4] || '/tmp/t739/r';   // T739 하루 장부(같은 세계 — t17 바이트 같음)
const TT = {}, JJ = {};
for (const k of Object.keys(RUN)) for (const s of SEEDS) {
  if (ex(`${RUN[k]}-${s}.t749.json.gz`)) TT[`${k}:${s}`] = rdz(`${RUN[k]}-${s}.t749.json.gz`);
  if (ex(`${RUN[k]}-${s}.json`)) JJ[`${k}:${s}`] = rdj(`${RUN[k]}-${s}.json`);
}
const C = {}; { const t = Object.values(TT)[0]; t.meta.vcols.forEach((n, i) => { C[n] = i; }); }
const BOFF = ['자급', '보유 수요 N×0.72', '흐름', '파생'], BON = { 0: '자급', 2: '흐름(소비 EMA×30)', 3: '파생', 4: '다양성 0.6N', 5: '0 → 바닥 1', 6: '그 밖' };
// 마을 × 날 줄을 돈다 — cb(k, day, row)
function each(T, g, cb, d0 = 1, d1 = 1e9) {
  const V = T.v[g];
  for (let k = 0; k < V.length; k++) { const rows = V[k], f = T.meta.first[k];
    for (let i = 0; i < rows.length; i++) { const row = rows[i], d = f + i; if (!row || d < d0 || d > d1) continue; cb(k, d, row); } }
}
const WGi = (T, g) => T.meta.WG.indexOf(g);
function wsum(T, g, col, d0, d1) { const i = WGi(T, g); let s = 0; for (const w of T.w) if (w[0] >= d0 && w[0] <= d1) s += w[1 + i * 5 + col] || 0; return s; }

// ── §0 검산 ──
P('## §0 검산');
for (const s of SEEDS) {
  const t = TT[`A:${s}`]; if (!t) continue;
  const line = Object.keys(RUN).map((k) => { const x = TT[`${k}:${s}`]; return x ? `${RUNKO[k]} 장부 칸 ${x.ledgerCheck.cells} 어긋남 ${x.ledgerCheck.bad} · drift ${x.ledgerStats.drift} · 빚 ${f1(x.ledgerStats.debtU, 2)}` : ''; }).filter(Boolean).join(' / ');
  P(`* ${s}: ${line}`);
  // 장부 합 = econ 곳간(부패 앞) — 생선 줄의 LU ↔ s
  let n = 0, bad = 0; each(t, 'fish', (k, d, r) => { n++; if (Math.abs(r[C.LU] - r[C.s]) > 1e-3 * Math.max(1, r[C.s])) bad++; });
  P(`  · 끔 판 생선 줄 장부 합 ↔ 곳간(부패 앞) 어긋난 마을-날 ${bad}/${n}`);
}

// ── §1 첫날 — 같은 상태의 두 목표 ──
P('\n## §1 ① 날 1 — 같은 곳간 · 두 목표(끔 판 = 켬 판 · 날 1 부패 앞까지 같다)');
for (const s of SEEDS) {
  const A = TT[`A:${s}`], B = TT[`B:${s}`]; if (!A || !B) continue;
  const cls = {}, clsOn = {}; let dA = 0, dB = 0, sS = 0, n = 0, rA = [], rB = [], tO = [], tN = [];
  each(A, 'fish', (k, d, r) => { n++; cls[r[C.bOff]] = (cls[r[C.bOff]] || 0) + 1; clsOn[r[C.bOn]] = (clsOn[r[C.bOn]] || 0) + 1; dA += r[C.dec]; sS += r[C.s]; rA.push(r[C.rate]); tO.push(r[C.tOff]); tN.push(r[C.tOn]); }, 1, 1);
  each(B, 'fish', (k, d, r) => { dB += r[C.dec]; rB.push(r[C.rate]); }, 1, 1);
  const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
  P(`* ${s}: 마을 ${n} · 생선 곳간 합 ${f1(sS)} · 끔 목표가 묶는 항 ${Object.entries(cls).map(([b, c]) => `${BOFF[b]} ${c}`).join(' · ')} · 켬 목표 ${Object.entries(clsOn).map(([b, c]) => `${BON[b]} ${c}`).join(' · ')} · 목표 중앙 끔 ${f1(med(tO), 2)} → 켬 ${f1(med(tN), 2)} · 율 중앙 끔 ${med(rA).toExponential(2)} → 켬 ${med(rB).toExponential(2)} · 날 1 부패 합 끔 ${f1(dA, 3)} → 켬 ${f1(dB, 3)}(×${f1(dB / dA, 1)})`);
}

// ── §2 켬 목표가 무엇을 읽나 — 마을-날 몫(생선) ──
P('\n## §2 ① 켬 목표가 무엇을 읽나 — 생선 마을-날(3시드 합)');
for (const [lab, d0, d1] of [['날 1~60', 1, 60], ['날 1~800', 1, 800]]) {
  for (const k of ['B', 'A', 'E']) {
    const cnt = {}, dec = {}, tsum = {}; let N = 0, D = 0;
    for (const s of SEEDS) { const T = TT[`${k}:${s}`]; if (!T) continue;
      each(T, 'fish', (kk, d, r) => { const b = r[C.bOn]; N++; cnt[b] = (cnt[b] || 0) + 1; dec[b] = (dec[b] || 0) + r[C.dec]; D += r[C.dec]; tsum[b] = (tsum[b] || 0) + (r[C.tOn] / Math.max(1e-9, r[C.tOff])); }, d0, d1); }
    if (!N) continue;
    P(`* ${lab} · ${RUNKO[k]} 판 상태에서 켬 식: ` + Object.keys(cnt).sort().map((b) => `${BON[b]} ${f1(cnt[b] / N * 100)} %(그 판 부패의 ${f1(dec[b] / D * 100)} % · 켬÷끔 목표 평균 ${f1(tsum[b] / cnt[b], 2)})`).join(' · '));
  }
}

// ── §3 마을 × 날 — 끔 목표 ↔ 켬 목표(시드 1020 · 첫 60일 생선 부패가 가장 많이 는 마을) ──
P('\n## §3 ① 마을 × 날 — 생선 목표 · 곳간 · 율(시드 ' + SEEDS[0] + ' · 끔 판 ↔ 켬 판 · 실제 값)');
{
  const s = SEEDS[0], A = TT[`A:${s}`], B = TT[`B:${s}`];
  const inc = {};
  each(A, 'fish', (k, d, r) => { inc[k] = (inc[k] || 0) - r[C.dec]; }, 1, 60);
  each(B, 'fish', (k, d, r) => { inc[k] = (inc[k] || 0) + r[C.dec]; }, 1, 60);
  const top = Object.entries(inc).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => +k);
  const DAYS = [1, 2, 5, 10, 30, 60, 100, 200, 400, 800];
  const at = (T, k, d) => { const f = T.meta.first[k], r = T.v.fish[k][d - f]; return r || null; };
  P('| 마을(60일 부패 증가) | 날 | 끔 N | 끔 곳간 | 끔 목표(묶는 항) | 끔 율 | 켬 N | 켬 곳간 | 켬 목표(묶는 항) | 켬 율 | 켬 부패/일 |');
  P('|---|---:|---:|---:|---|---:|---:|---:|---|---:|---:|');
  for (const k of top) for (const d of DAYS) {
    const a = at(A, k, d), b = at(B, k, d);
    P(`| ${d === 1 ? `**${A.meta.names[k]}**(+${f0(inc[k])})` : ''} | ${d} | ${a ? a[C.N] : '—'} | ${a ? f1(a[C.s]) : '—'} | ${a ? `${f1(a[C.tUsed], 2)}(${BOFF[a[C.bOff]]})` : '—'} | ${a ? a[C.rate].toExponential(2) : '—'} | ${b ? b[C.N] : '—'} | ${b ? f1(b[C.s]) : '—'} | ${b ? `${f1(b[C.tUsed], 2)}(${BON[b[C.bOn]]})` : '—'} | ${b ? f1(b[C.rate], 3) : '—'} | ${b ? f1(b[C.dec], 2) : '—'} |`);
  }
}

// ── §4 부패량 = 식의 어느 항 — 생선 · 고기 · 창별 · 3시드 ──
P('\n## §4 ① 부패량의 항 — 기본 항(곳간 × 0.0005 × 옹기) · 과잉 항(× 5 × 과잉) · 0.95 바닥');
P('| 품목 | 창 | 판 | 부패 합(3시드 평균) | 기본 항 | 과잉 항 | 과잉 몫 | 0.95 에 닿은 마을-날 | 그 마을-날 부패 몫 | 끔 대비 |');
P('|---|---|---|---:|---:|---:|---:|---:|---:|---:|');
for (const g of ['fish', 'meat']) for (const [lab, d0, d1] of [['날 1~60', 1, 60], ['날 1~800', 1, 800]]) {
  let base0 = null;
  for (const k of ['A', 'B', 'C', 'F', 'D', 'E']) {
    const dec = [], bas = [], exc = [], cl = [], cld = [], vd = [];
    for (const s of SEEDS) { const T = TT[`${k}:${s}`]; if (!T) continue;
      dec.push(wsum(T, g, 0, d0, d1)); bas.push(wsum(T, g, 1, d0, d1)); exc.push(wsum(T, g, 2, d0, d1));
      let nCl = 0, nAll = 0, dCl = 0, dAll = 0; each(T, g, (kk, d, r) => { nAll++; dAll += r[C.dec]; if (r[C.rate] >= 0.95) { nCl++; dCl += r[C.dec]; } }, d0, d1);
      cl.push(nAll ? nCl / nAll * 100 : 0); cld.push(dAll ? dCl / dAll * 100 : 0); }
    if (!dec.length) continue;
    const m = mean(dec); if (k === 'A') base0 = m;
    P(`| ${g === 'fish' ? '생선' : '고기'} | ${lab} | ${RUNKO[k]} | ${f0(m)}(${dec.map(f0).join(' · ')}) | ${f0(mean(bas))} | ${f0(mean(exc))} | ${f1(pct(mean(exc), m))} % | ${f1(mean(cl))} % | ${f1(mean(cld))} % | ${k === 'A' ? '—' : '×' + f1(m / base0, 2)} |`);
  }
}

// ── §5 ② 물리 대조 — 곳간 로트 장부(T732 관측자) ──
P('\n## §5 ② 물리 대조 — 같은 곳간 · 같은 날: 보관일을 넘긴 몫(장부) ↔ econ 부패(생선 · 3시드 평균)');
P('| 판 | 창 | econ 부패 합 | 보관일 2.5 넘김(그 창에 넘은 몫) | 넘김 ÷ 부패 | 서 있는 상한 몫(곳간 대비 · 마을-날 평균) | 곳간 단위 가중 나이(날) | 건어물 45 넘김 | 45 서 있는 몫 |');
P('|---|---|---:|---:|---:|---:|---:|---:|---:|');
const PHYS = {};
for (const k of ['A', 'B', 'C', 'F', 'E']) for (const [lab, d0, d1] of [['날 1~60', 1, 60], ['날 61~200', 61, 200], ['날 201~800', 201, 800], ['날 1~800', 1, 800]]) {
  const dec = [], cr = [], sp = [], age = [], cr2 = [], sp2 = [];
  for (const s of SEEDS) { const T = TT[`${k}:${s}`]; if (!T) continue;
    let a = 0, b = 0, U = 0, S = 0, AG = 0, b2 = 0, S2 = 0;
    each(T, 'fish', (kk, d, r) => { a += r[C.dec]; b += r[C.Lcross] || 0; U += r[C.LU] || 0; S += r[C.Lspoiled] || 0; AG += (r[C.Lage] || 0) * (r[C.LU] || 0); b2 += r[C.Lcross2] || 0; S2 += r[C.Lspoiled2] || 0; }, d0, d1);
    dec.push(a); cr.push(b); sp.push(U > 0 ? S / U * 100 : null); age.push(U > 0 ? AG / U : null); cr2.push(b2); sp2.push(U > 0 ? S2 / U * 100 : null); }
  if (!dec.length) continue;
  PHYS[`${k}:${lab}`] = { dec: mean(dec), cr: mean(cr), sp: mean(sp), age: mean(age) };
  P(`| ${RUNKO[k]} | ${lab} | ${f0(mean(dec))} | ${f0(mean(cr))} | ${f1(mean(cr) / mean(dec), 2)} | ${f1(mean(sp))} % | ${f1(mean(age), 1)} | ${f0(mean(cr2))} | ${f1(mean(sp2))} % |`);
}
// 보관일을 넘긴 뒤 곳간을 떠난 몫(먹음 · 갈무리 · 교역 · 세금 — 장부는 오래된 것부터 뗀다)의 아래 한계 = Σ넘김 − Σecon 부패 − 날 800 서 있는 몫
P('\n보관일(2.5)을 넘긴 뒤 부패 아닌 길로 곳간을 떠난 몫 ≥ Σ넘김 − Σecon 부패 − 날 800 서 있는 상한 몫(3시드 평균):');
for (const k of ['A', 'B', 'C', 'F', 'E']) {
  const v = [];
  for (const s of SEEDS) { const T = TT[`${k}:${s}`]; if (!T) continue; let cr = 0, dec = 0, end = 0;
    each(T, 'fish', (kk, d, r) => { cr += r[C.Lcross] || 0; dec += r[C.dec]; if (d === 800) end += r[C.Lspoiled] || 0; });
    v.push(cr - dec - end); }
  if (v.length) P(`* ${RUNKO[k]}: ${f0(mean(v))}(${v.map(f0).join(' · ')})`);
}
P('\n날마다(3시드 평균 · 마을 합 · 생선):');
P('| 날 | 끔 곳간 | 끔 econ 부패 | 끔 2.5 넘김 | 끔 상한 몫 % | 끔 나이 | 켬 곳간 | 켬 econ 부패 | 켬 2.5 넘김 | 켬 상한 몫 % | 켬 나이 |');
P('|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const d of [1, 2, 3, 4, 5, 7, 10, 20, 30, 60, 100, 200, 400, 800]) {
  const row = (k) => { const U = [], D = [], X = [], S = [], G = [];
    for (const s of SEEDS) { const T = TT[`${k}:${s}`]; if (!T) continue; let u = 0, dd = 0, x = 0, sp = 0, ag = 0;
      each(T, 'fish', (kk, dy, r) => { u += r[C.LU] || 0; dd += r[C.dec]; x += r[C.Lcross] || 0; sp += r[C.Lspoiled] || 0; ag += (r[C.Lage] || 0) * (r[C.LU] || 0); }, d, d);
      U.push(u); D.push(dd); X.push(x); S.push(u > 0 ? sp / u * 100 : null); G.push(u > 0 ? ag / u : null); }
    return [f0(mean(U)), f1(mean(D), 1), f1(mean(X), 1), f1(mean(S)), f1(mean(G), 1)]; };
  P(`| ${d} | ${row('A').join(' | ')} | ${row('B').join(' | ')} |`);
}
P('\n고기(같은 자 · 날 1~800 · 3시드 평균):');
P('| 판 | econ 부패 합 | 보관일 2.5 넘김 | 서 있는 상한 몫 | 나이 | 훈제육 40 서 있는 몫 |');
P('|---|---:|---:|---:|---:|---:|');
for (const k of ['A', 'B', 'C', 'F']) {
  const dec = [], cr = [], sp = [], age = [], sp2 = [];
  for (const s of SEEDS) { const T = TT[`${k}:${s}`]; if (!T) continue; let a = 0, b = 0, U = 0, S = 0, AG = 0, S2 = 0;
    each(T, 'meat', (kk, d, r) => { a += r[C.dec]; b += r[C.Lcross] || 0; U += r[C.LU] || 0; S += r[C.Lspoiled] || 0; AG += (r[C.Lage] || 0) * (r[C.LU] || 0); S2 += r[C.Lspoiled2] || 0; });
    dec.push(a); cr.push(b); sp.push(U > 0 ? S / U * 100 : null); age.push(U > 0 ? AG / U : null); sp2.push(U > 0 ? S2 / U * 100 : null); }
  P(`| ${RUNKO[k]} | ${f0(mean(dec))} | ${f0(mean(cr))} | ${f1(mean(sp))} % | ${f1(mean(age))} | ${f1(mean(sp2))} % |`);
}

// ── §6 ③ 갈래 판 — 여덟 수 ──
P('\n## §6 ③ 갈래 판 — 여덟 수(끔 대비 Δ% · 3시드 · T252 자)');
P('| 판 | ' + M8.join(' | ') + ' | 소멸 | 생선 부패 첫 60일 |');
P('|---|' + M8.map(() => '---').join('|') + '|---|---:|');
for (const k of ['B', 'C', 'F', 'D', 'E']) {
  const cells = M8.map((m) => { const d = SEEDS.map((s) => { const a = JJ[`A:${s}`], b = JJ[`${k}:${s}`]; return (a && b) ? (g8(b)[m] - g8(a)[m]) / g8(a)[m] * 100 : null; });
    if (d.some((x) => x == null)) return '—'; return `${sg(mean(d))}(${d.map((x) => sg(x)).join(' · ')}) ${verdict(d)}`; });
  const dead = SEEDS.map((s) => JJ[`${k}:${s}`] ? g8(JJ[`${k}:${s}`]).소멸 : '—').join(' · ');
  const fd = mean(SEEDS.map((s) => TT[`${k}:${s}`] ? wsum(TT[`${k}:${s}`], 'fish', 0, 1, 60) : null));
  P(`| ${RUNKO[k]} | ${cells.join(' | ')} | ${dead} | ${f0(fd)} |`);
}
P(`* 끔 판 값(${SEEDS.join(' · ')}): ` + M8.map((m) => `${m} ${SEEDS.map((s) => JJ[`A:${s}`] ? g8(JJ[`A:${s}`])[m] : '—').join('/')}`).join(' · ') + ` · 소멸 ${SEEDS.map((s) => JJ[`A:${s}`] ? g8(JJ[`A:${s}`]).소멸 : '—').join('/')}`);

// ── §7 생선 흐름 — 첫 60일(T739 하루 장부 · 같은 세계) ──
P('\n## §7 ① 생선이 어디로 갔나 — 첫 60일 마을 합(T739 하루 장부 · 같은 세계 · 3시드 평균)');
P('| 판 | 산출 | 먹음 | 마을 하루 그 밖(요리 곁들이 · 갈무리) | 그중 갈무리(건어물 산출 ÷ 0.4) | 부패 | 교역 출발 | 캐러밴 귀환·도착 | 장 정산 | 날 60 곳간 |');
P('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const [lab, f] of [['끔', 'tr-none'], ['켬(T726)', 'tr-DSP'], ['부패 자리만(D)', 'tr-D']]) {
  const acc = {}; let n = 0;
  for (const s of SEEDS) {
    const fn = path.join(TRDIR, `${f}-${s}.tr.json`); if (!fs.existsSync(fn)) continue;
    const T = JSON.parse(fs.readFileSync(fn, 'utf8')); n++;
    const iF = T.meta.G.indexOf('fish'), iD = T.meta.G.indexOf('dried_fish');
    const a = { prod: 0, eat: 0, oth: 0, dry: 0, dec: 0, tr: 0, ca: 0, h: 0, end: 0 };
    for (const d of T.day) { if (d.d > 60) break;
      a.prod += d.prod[iF] || 0; a.eat += d.eat[iF] || 0; a.oth += (d.ph.V1[iF] || 0) - (d.prod[iF] || 0) + (d.eat[iF] || 0); a.dry += (d.prod[iD] || 0) / 0.4;
      a.dec += d.ph.DEC[iF] || 0; a.tr += d.ph.TR[iF] || 0; a.ca += d.ph.CA[iF] || 0; a.h += d.ph.H[iF] || 0; }
    const vi = T.meta.VG.indexOf('fish'); for (const rows of T.vday) { const r = rows[59]; if (r) a.end += r[17 + vi] || 0; }
    for (const k in a) acc[k] = (acc[k] || 0) + a[k];
  }
  if (!n) continue;
  const m = (k) => acc[k] / n;
  P(`| ${lab} | ${f0(m('prod'))} | ${f0(m('eat'))} | ${f0(m('oth'))} | ${f0(m('dry'))} | ${f0(m('dec'))} | ${f0(m('tr'))} | ${f0(m('ca'))} | ${f0(m('h'))} | ${f0(m('end'))} |`);
}
P('\n같은 장부 · 날 1~800 합(3시드 평균):');
for (const [lab, f] of [['끔', 'tr-none'], ['켬(T726)', 'tr-DSP'], ['부패 자리만(D)', 'tr-D']]) {
  const acc = { prod: 0, eat: 0, oth: 0, dry: 0, dec: 0, tr: 0 }; let n = 0;
  for (const s of SEEDS) { const fn = path.join(TRDIR, `${f}-${s}.tr.json`); if (!fs.existsSync(fn)) continue;
    const T = JSON.parse(fs.readFileSync(fn, 'utf8')); n++; const iF = T.meta.G.indexOf('fish'), iD = T.meta.G.indexOf('dried_fish');
    for (const d of T.day) { acc.prod += d.prod[iF] || 0; acc.eat += d.eat[iF] || 0; acc.oth += (d.ph.V1[iF] || 0) - (d.prod[iF] || 0) + (d.eat[iF] || 0); acc.dry += (d.prod[iD] || 0) / 0.4; acc.dec += d.ph.DEC[iF] || 0; acc.tr += d.ph.TR[iF] || 0; } }
  if (n) P(`* ${lab}: 산출 ${f0(acc.prod / n)} · 먹음 ${f0(acc.eat / n)} · 마을 하루 그 밖 ${f0(acc.oth / n)}(갈무리 ${f0(acc.dry / n)}) · 부패 ${f0(acc.dec / n)} · 교역 출발 ${f0(acc.tr / n)}`);
}

const body = out.join('\n') + '\n';
process.stdout.write(body);
try { fs.writeFileSync(path.join(DIR, 't749-tables.md'), body); } catch (e) {}
