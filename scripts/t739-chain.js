#!/usr/bin/env node
// === scripts/t739-chain.js — T739 표 만들기(계측 · 읽기만) ===================================================
//
// 판 파일(t17 JSON · t739-trace 장부)을 읽어 보고 표를 낸다. 세계를 돌리지 않는다.
//   ① 갈림 첫 고리 — 끔(none) ↔ 켬(D,S,P) 장부의 마을 × 날 지문(곳간 · 값 · 띄운 캐러밴 · 먹은 것 · 인구 식 dP · 인구)이
//      처음 갈리는 날 · 날마다 갈린 마을 수 · 날별 차(인구 · 곳간 · 인구 식 항 · K 분해 · 확장 · 금고) · 마을별 인구 Δ 순위
//   ② 자리별 몫 — 여덟 판(∅ · D · S · P · DS · DP · SP · DSP)의 여덟 수로 Shapley 몫(셋이 서로 얽힌 몫을 고르게 나눈다)
//   ③ 곡물 길 — 장부의 문별 곳간 흐름(장 정산 · 마을 하루 · 산출 · 먹기 · 자급 · 부패 · 출발 · 캐러밴 · 꼬리)을 판 전체로 더한 끔 ↔ 켬
//   ④ 수출 유보 — 곡물 곳간이 교역 문 보유 목표(수출 문턱)를 넘은 마을-날 몫 · 곡물 leg
//
// 쓰는 법: node scripts/t739-chain.js <판 폴더> [시드,…]   (판 이름은 보고 §0 의 판 표 그대로)
'use strict';
const fs = require('fs'), path = require('path');
const DIR = process.argv[2] || '/tmp/t739/r';
const SEEDS = (process.argv[3] || '1020,7,42').split(',');
const rd = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const ex = (f) => fs.existsSync(path.join(DIR, f));
const f1 = (x, d = 1) => (x == null || !isFinite(x)) ? '—' : (Math.abs(x) < 1e-12 ? '0' : x.toFixed(d));
const sg = (x, d = 1) => (x == null || !isFinite(x)) ? '—' : ((x > 0 ? '+' : '') + x.toFixed(d));
const out = [];
const P = (s) => out.push(s);
const g8 = (j) => ({ 인구: j.base.pop, 소멸: j.base.dead, 무기Q: j.base.weapQ, 확장: j.base.expand, 게시: j.board.emitted, 도구Q: j.tool.q, 보존: j.preserve.stock, 곡물: j.eight.grain });
const M8 = ['인구', '무기Q', '확장', '게시', '도구Q', '보존', '곡물'];
const verdict = (d) => { const pos = d.filter((x) => x > 0).length, neg = d.filter((x) => x < 0).length, m = d.reduce((a, b) => a + b, 0) / d.length, w = Math.max(...d) - Math.min(...d);
  return (pos === d.length || neg === d.length) ? (Math.abs(m) > w ? '가름' : '방향만') : '못 가름'; };

// ── 판 이름 — 여덟 칸 ──
const CFG = { '∅': 'tr-none', D: 'tr-D', S: 'ar-S', P: 'ar-P', DS: 'ar-DS', DP: 'ar-DP', SP: 'tr-SP', DSP: 'tr-DSP' };
const J = {};
for (const [k, f] of Object.entries(CFG)) for (const s of SEEDS) if (ex(`${f}-${s}.json`)) J[`${k}:${s}`] = g8(rd(`${f}-${s}.json`));
const plain = {}; for (const a of ['off', 'on']) for (const s of SEEDS) if (ex(`plain-${a}-${s}.json`)) plain[`${a}:${s}`] = rd(`plain-${a}-${s}.json`);

// ── §0 검산 — 훅 · 갈래 문 판 = 맨 판 ──
P('## 검산 — 갈래 문 · 장부 훅이 세계를 안 건드렸나(t17 JSON 바이트)');
for (const s of SEEDS) {
  const same = (a, b) => ex(a) && ex(b) ? fs.readFileSync(path.join(DIR, a)).equals(fs.readFileSync(path.join(DIR, b))) : null;
  P(`* ${s}: 맨 끔 = 장부 none ${same(`plain-off-${s}.json`, `tr-none-${s}.json`)} · 맨 켬(손잡이) = 장부 D,S,P ${same(`plain-on-${s}.json`, `tr-DSP-${s}.json`)}`);
}

// ── ② 여덟 수 · Shapley ──
P('\n## 여덟 수 — 끔 ↔ 켬(3시드 · T252 자)');
P('| 수 | 끔 ' + SEEDS.join(' · ') + ' | 켬 ' + SEEDS.join(' · ') + ' | 짝 Δ% | 평균 | T252 |');
P('|---|---|---|---|---:|---|');
for (const m of M8) {
  const A = SEEDS.map((s) => J[`∅:${s}`] && J[`∅:${s}`][m]), B = SEEDS.map((s) => J[`DSP:${s}`] && J[`DSP:${s}`][m]);
  if (A.some((x) => x == null) || B.some((x) => x == null)) { P(`| ${m} | (미완) |`); continue; }
  const d = A.map((a, i) => (B[i] - a) / a * 100);
  P(`| ${m} | ${A.join(' · ')} | ${B.join(' · ')} | ${d.map((x) => sg(x)).join(' · ')} | ${sg(d.reduce((a, b) => a + b, 0) / 3)} | ${verdict(d)} |`);
}
P(`| 소멸 | ${SEEDS.map((s) => J[`∅:${s}`] ? J[`∅:${s}`].소멸 : '—').join(' · ')} | ${SEEDS.map((s) => J[`DSP:${s}`] ? J[`DSP:${s}`].소멸 : '—').join(' · ')} | | | |`);
P('\n## 자리별 몫 — Shapley(정산 S · 부패 D · 출발 직후 P · 여덟 판 · 시드마다 Δ% 를 나눈 뒤 평균)');
P('| 수 | 켬 Δ%(평균) | 부패 D 몫 | 정산 S 몫 | 출발 직후 P 몫 | D 만 | S 만 | P 만 | D 빼고(SP) | S 빼고(DP) | P 빼고(DS) |');
P('|---|---:|---|---|---|---:|---:|---:|---:|---:|---:|');
const SHAP = {};
for (const m of M8.concat(['소멸'])) {
  const per = [];
  for (const s of SEEDS) {
    const v = (k) => J[`${k}:${s}`] ? J[`${k}:${s}`][m] : null;
    const base = v('∅'); if (base == null || ['D', 'S', 'P', 'DS', 'DP', 'SP', 'DSP'].some((k) => v(k) == null)) { per.push(null); continue; }
    const q = m === '소멸' ? ((k) => v(k) - base) : ((k) => (v(k) - base) / base * 100);
    const val = { '': 0, D: q('D'), S: q('S'), P: q('P'), DS: q('DS'), DP: q('DP'), SP: q('SP'), DSP: q('DSP') };
    const key = (set) => ['D', 'S', 'P'].filter((x) => set.includes(x)).join('');
    const phi = {};
    for (const i of ['D', 'S', 'P']) {
      const others = ['D', 'S', 'P'].filter((x) => x !== i);
      const subs = [[], [others[0]], [others[1]], others];
      const w = [1 / 3, 1 / 6, 1 / 6, 1 / 3];
      phi[i] = subs.reduce((a, S0, j) => a + w[j] * (val[key(S0.concat([i]))] - val[key(S0)]), 0);
    }
    per.push({ tot: val.DSP, phi, val });
  }
  if (per.some((x) => x == null)) { P(`| ${m} | (미완) |`); continue; }
  const av = (f) => per.reduce((a, x) => a + f(x), 0) / per.length;
  const tot = av((x) => x.tot), pD = av((x) => x.phi.D), pS = av((x) => x.phi.S), pP = av((x) => x.phi.P);
  SHAP[m] = { tot, D: pD, S: pS, P: pP, per };
  const sh = (x) => (Math.abs(tot) > 1e-9 ? ` (${f1(x / tot * 100, 0)}%)` : '');
  const u = m === '소멸' ? '' : '';
  P(`| ${m} | ${sg(tot)}${u} | ${sg(pD)}${sh(pD)} | ${sg(pS)}${sh(pS)} | ${sg(pP)}${sh(pP)} | ${sg(av((x) => x.val.D))} | ${sg(av((x) => x.val.S))} | ${sg(av((x) => x.val.P))} | ${sg(av((x) => x.val.SP))} | ${sg(av((x) => x.val.DP))} | ${sg(av((x) => x.val.DS))} |`);
}

// ── ① 갈림 첫 고리 ──
const LAY = ['곳간', '값', '띄운 캐러밴', '먹은 것', '인구 식 dP', '인구'];
const TR = {};
for (const s of SEEDS) for (const k of ['none', 'DSP', 'D', 'SP']) if (ex(`tr-${k}-${s}.tr.json`)) TR[`${k}:${s}`] = rd(`tr-${k}-${s}.tr.json`);
P('\n## ① 갈림 첫 고리 — 끔(none) ↔ 켬(D,S,P) 지문이 처음 갈리는 날 · 그날 갈린 마을 수');
P('| 시드 | ' + LAY.map((l) => l).join(' | ') + ' |');
P('|---|' + LAY.map(() => '---').join('|') + '|');
const firstDiv = {};
for (const s of SEEDS) {
  const A = TR[`none:${s}`], B = TR[`DSP:${s}`]; if (!A || !B) { P(`| ${s} | (미완) |`); continue; }
  const cells = [];
  const fd = {};
  for (let li = 0; li < LAY.length; li++) {
    let first = null, cnt = 0;
    for (let d = 0; d < Math.min(A.fp.length, B.fp.length) && first == null; d++) {
      const a = A.fp[d], b = B.fp[d]; let c = 0;
      for (let k = 0; k < Math.min(a.length, b.length); k++) { if (li === 1 && (a[k][1] === '' || b[k][1] === '')) continue; if (a[k][li] !== b[k][li]) c++; }
      if (c > 0) { first = A.day[d].d; cnt = c; }
    }
    fd[LAY[li]] = first; cells.push(first == null ? '안 갈림' : `날 ${first} · ${cnt} 마을`);
  }
  firstDiv[s] = fd;
  P(`| ${s} | ${cells.join(' | ')} |`);
}
// 날마다 갈린 마을 수(앞 열흘 · 시드 1020)
{
  const s = SEEDS[0], A = TR[`none:${s}`], B = TR[`DSP:${s}`];
  if (A && B) {
    P(`\n시드 ${s} — 날마다 갈린 마을 수(51 중):`);
    P('| 날 | ' + LAY.join(' | ') + ' |'); P('|---:|' + LAY.map(() => '---:').join('|') + '|');
    for (const dd of [1, 2, 3, 4, 5, 7, 10, 20, 30, 60, 100]) {
      const d = dd - 1; if (!A.fp[d]) continue;
      const row = LAY.map((_, li) => { let c = 0; for (let k = 0; k < A.fp[d].length; k++) { if (li === 1 && (A.fp[d][k][1] === '' || B.fp[d][k][1] === '')) return '—'; if (A.fp[d][k][li] !== B.fp[d][k][li]) c++; } return c; });
      P(`| ${dd} | ${row.join(' | ')} |`);
    }
  }
}
// 날별 차 — 세계 합(켬 − 끔 · 3시드 평균)
const VCOL = ['N', 'K', 'logi', 'hunger', 'health', 'happy', 'prestige', 'housing', 'gated', 'dP', 'kSlot', 'kProd', 'kFuel', 'expansions', 'size', 'cash', 'foodEq'];
const vcol = (T, name) => { const i = VCOL.indexOf(name); if (i >= 0) return i; const j = T.meta.VG.indexOf(name); return j >= 0 ? VCOL.length + j : -1; };
const worldAt = (T, d, name) => { const i = vcol(T, name); let s = 0; for (const rows of T.vday) { const r = rows[d]; if (r && r[i] != null) s += r[i]; } return s; };
P('\n## 날별 차 — 세계 합(켬 − 끔) · 3시드 평균');
const COLS = ['N', 'foodEq', 'food', 'wheat', 'fish', 'meat', 'wood', 'stone', 'tool', 'weapon', 'clothes', 'herb', 'logi', 'hunger', 'health', 'happy', 'gated', 'kSlot', 'kProd', 'kFuel', 'expansions', 'cash'];
P('| 날 | ' + COLS.join(' | ') + ' | 캐러밴(누적) |'); P('|---:|' + COLS.map(() => '---:').join('|') + '|---:|');
for (const dd of [1, 2, 3, 5, 10, 20, 30, 60, 100, 200, 400, 600, 800]) {
  const vals = COLS.map((c) => { const xs = SEEDS.map((s) => { const A = TR[`none:${s}`], B = TR[`DSP:${s}`]; if (!A || !B || !A.vday[0][dd - 1]) return null; return worldAt(B, dd - 1, c) - worldAt(A, dd - 1, c); }).filter((x) => x != null); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; });
  const legs = SEEDS.map((s) => { const A = TR[`none:${s}`], B = TR[`DSP:${s}`]; if (!A || !B) return null; let a = 0, b = 0; for (let d = 0; d < dd && d < A.day.length; d++) { a += A.day[d].legs; b += B.day[d].legs; } return b - a; }).filter((x) => x != null);
  P(`| ${dd} | ${vals.map((x) => (x == null ? '—' : (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(2)))).join(' | ')} | ${legs.length ? (legs.reduce((a, b) => a + b, 0) / legs.length).toFixed(0) : '—'} |`);
}
// 인구가 갈리기 시작한 뒤 — 끔 대비 인구 Δ 가 1 % · 5 % · 10 % 를 넘는 첫 날
P('\n세계 인구 Δ(켬 − 끔)가 처음 −1 % · −5 % · −10 % 를 넘는 날:');
for (const s of SEEDS) {
  const A = TR[`none:${s}`], B = TR[`DSP:${s}`]; if (!A || !B) continue;
  const th = [1, 5, 10].map((p) => { for (let d = 0; d < A.day.length; d++) { const a = A.day[d].pop, b = B.day[d].pop; if ((b - a) / a * 100 <= -p) return A.day[d].d; } return '없음'; });
  P(`* ${s}: ${th.join(' · ')}`);
}
// 마을별 인구 Δ 순위
P('\n## 마을별 인구 Δ(날 800 · 켬 − 끔 · 3시드 평균) — 잃은 쪽 열 · 얻은 쪽 다섯');
{
  const names = TR[`none:${SEEDS[0]}`] ? TR[`none:${SEEDS[0]}`].meta.names : [];
  const rows = names.map((nm, k) => {
    const per = SEEDS.map((s) => { const A = TR[`none:${s}`], B = TR[`DSP:${s}`]; if (!A || !B) return null; const ka = A.meta.names.indexOf(nm), kb = B.meta.names.indexOf(nm);
      const ra = A.vday[ka][A.vday[ka].length - 1], rb = B.vday[kb][B.vday[kb].length - 1];
      const mean = (T, kk, col) => { const i = vcol(T, col); const rr = T.vday[kk]; let a = 0; for (const r of rr) a += r[i] || 0; return a / rr.length; };
      return { off: ra[0], on: rb[0], dLogi: mean(B, kb, 'logi') - mean(A, ka, 'logi'), dHunger: mean(B, kb, 'hunger') - mean(A, ka, 'hunger'), dHealth: mean(B, kb, 'health') - mean(A, ka, 'health'),
        dHappy: mean(B, kb, 'happy') - mean(A, ka, 'happy'), dGated: mean(B, kb, 'gated') - mean(A, ka, 'gated'), dExp: rb[vcol(B, 'expansions')] - ra[vcol(A, 'expansions')],
        kOff: [ra[vcol(A, 'kSlot')], ra[vcol(A, 'kProd')], ra[vcol(A, 'kFuel')]], kOn: [rb[vcol(B, 'kSlot')], rb[vcol(B, 'kProd')], rb[vcol(B, 'kFuel')]] }; }).filter(Boolean);
    const av = (f) => per.reduce((a, x) => a + f(x), 0) / per.length;
    return { nm, d: av((x) => x.on - x.off), off: av((x) => x.off), on: av((x) => x.on), per: per.map((x) => x.on - x.off), dLogi: av((x) => x.dLogi), dHunger: av((x) => x.dHunger), dHealth: av((x) => x.dHealth), dHappy: av((x) => x.dHappy), dGated: av((x) => x.dGated), dExp: av((x) => x.dExp),
      kLim: per.map((x) => { const lim = (k) => ['자리', '흐름', '연료'][k.indexOf(Math.min(...k))]; return lim(x.kOff) + '→' + lim(x.kOn); }) };
  });
  rows.sort((a, b) => a.d - b.d);
  P('| 마을 | 끔 | 켬 | Δ(평균) | 시드별 Δ | 인구 식 항 Δ(판 평균 · 로지스틱 · 굶주림 · 건강 · 행복) | 집 문 닫힌 날 몫 Δ | 확장 셀 Δ | K 묶임(끔→켬 · 시드별) |');
  P('|---|---:|---:|---:|---|---|---:|---:|---|');
  const show = rows.slice(0, 10).concat(rows.slice(-5).reverse());
  for (const r of show) P(`| ${r.nm} | ${r.off.toFixed(0)} | ${r.on.toFixed(0)} | ${sg(r.d, 0)} | ${r.per.map((x) => sg(x, 0)).join(' · ')} | ${[r.dLogi, r.dHunger, r.dHealth, r.dHappy].map((x) => sg(x, 3)).join(' · ')} | ${sg(r.dGated * 100, 1)} %p | ${sg(r.dExp, 0)} | ${r.kLim.join(' · ')} |`);
  const totD = rows.reduce((a, r) => a + r.d, 0);
  const top10 = rows.slice(0, 10).reduce((a, r) => a + r.d, 0);
  P(`\n마을 51 곳 Δ 합 ${sg(totD, 0)} · 잃은 열 곳 몫 ${f1(top10 / totD * 100, 0)} % · 잃은 마을 ${rows.filter((r) => r.d < 0).length} · 얻은 마을 ${rows.filter((r) => r.d > 0).length}`);
  fs.writeFileSync(path.join(DIR, 't739-villages.json'), JSON.stringify(rows));
}

// ── ③ 곡물 길 ──
const GR = ['wheat', 'rice', 'barley', 'millet'];
const sumPh = (T, ph, goods) => { let s = 0; for (const d of T.day) for (const g of goods) { const i = T.meta.G.indexOf(g); s += (d.ph[ph][i] || 0); } return s; };
const sumArr = (T, key, goods) => { let s = 0; for (const d of T.day) for (const g of goods) { const i = T.meta.G.indexOf(g); s += (d[key][i] || 0); } return s; };
const endStock = (T, goods) => { let s = 0; for (const g of goods) { const j = T.meta.VG.indexOf(g); if (j < 0) continue; for (const rows of T.vday) s += rows[rows.length - 1][VCOL.length + j] || 0; } return s; };
const CH = [['산출(gross)', (T, g) => sumArr(T, 'prod', g)], ['먹은 것', (T, g) => -sumArr(T, 'eat', g)], ['마을 하루 순(산출 − 먹기 − 세 − 그 밖)', (T, g) => sumPh(T, 'V1', g)],
  ['자급(1인 몫)', (T, g) => sumPh(T, 'SUB', g)], ['부패', (T, g) => sumPh(T, 'DEC', g)], ['교역 출발(내보냄)', (T, g) => sumPh(T, 'TR', g)], ['캐러밴(돌아온 짐)', (T, g) => sumPh(T, 'CA', g)],
  ['장 정산(받은 짐 − 판 짐)', (T, g) => sumPh(T, 'H', g)], ['꼬리(회복)', (T, g) => sumPh(T, 'TL', g)], ['길드 세 문', (T, g) => sumPh(T, 'GT', g)]];
for (const [label, goods] of [['곡물(밀 · 쌀 · 보리 · 기장)', GR], ['식량(food)', ['food']]]) {
  P(`\n## ③ ${label} — 판 전체 흐름(51 마을 × 800일 합 · 3시드 평균 · 끔 · 켬 · 켬 − 끔 · 부패만 D · 정산+출발 SP)`);
  P('| 문 | 끔 | 켬(D,S,P) | 켬 − 끔 | D 만 − 끔 | SP − 끔 |'); P('|---|---:|---:|---:|---:|---:|');
  const avg = (k, f) => { const xs = SEEDS.map((s) => TR[`${k}:${s}`] ? f(TR[`${k}:${s}`]) : null).filter((x) => x != null); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
  for (const [nm, fn] of CH) {
    const a = avg('none', (T) => fn(T, goods)), b = avg('DSP', (T) => fn(T, goods)), dd = avg('D', (T) => fn(T, goods)), sp = avg('SP', (T) => fn(T, goods));
    P(`| ${nm} | ${f1(a, 0)} | ${f1(b, 0)} | ${a != null && b != null ? sg(b - a, 0) : '—'} | ${a != null && dd != null ? sg(dd - a, 0) : '—'} | ${a != null && sp != null ? sg(sp - a, 0) : '—'} |`);
  }
  const ea = avg('none', (T) => endStock(T, goods)), eb = avg('DSP', (T) => endStock(T, goods)), ed = avg('D', (T) => endStock(T, goods)), es = avg('SP', (T) => endStock(T, goods));
  P(`| **날 800 곳간(장부 열)** | ${f1(ea, 0)} | ${f1(eb, 0)} | ${ea != null && eb != null ? sg(eb - ea, 0) : '—'} | ${ea != null && ed != null ? sg(ed - ea, 0) : '—'} | ${ea != null && es != null ? sg(es - ea, 0) : '—'} |`);
}
// 곡물 부패의 크기 — 하루 곡물 부패 ÷ 곡물 곳간(판 평균 부패율)
{
  P('\n곡물 부패율(판 평균 · 하루 부패 ÷ 날 끝 곳간):');
  for (const k of ['none', 'DSP', 'D', 'SP']) {
    const xs = SEEDS.map((s) => { const T = TR[`${k}:${s}`]; if (!T) return null; let dec = 0, st = 0; for (let d = 0; d < T.day.length; d++) { for (const g of GR) { const i = T.meta.G.indexOf(g); dec += -(T.day[d].ph.DEC[i] || 0); } }
      for (const rows of T.vday) for (const r of rows) for (const g of ['wheat', 'rice', 'barley']) st += r[VCOL.length + T.meta.VG.indexOf(g)] || 0; return dec / Math.max(1e-9, st); }).filter((x) => x != null);
    if (xs.length) P(`* ${k}: ${(xs.reduce((a, b) => a + b, 0) / xs.length * 100).toFixed(3)} %/일`);
  }
}
// ④ 수출 유보 — 곡물 leg · 곡물 곳간이 수출 문턱(교역 문 목표 × 0.8)을 넘은 마을-날 몫
{
  P('\n## ④ 곡물 leg(띄운 캐러밴 중 곡물 첫 화물) · 판 합 · 3시드 평균');
  const legs = (k) => { const xs = SEEDS.map((s) => { const T = TR[`${k}:${s}`]; if (!T) return null; let n = 0; for (const d of T.day) for (const g of GR) n += d.legRes[g] || 0; return n; }).filter((x) => x != null); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
  const all = (k) => { const xs = SEEDS.map((s) => { const T = TR[`${k}:${s}`]; if (!T) return null; let n = 0; for (const d of T.day) n += d.legs; return n; }).filter((x) => x != null); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
  P('| 판 | 곡물 leg | 전체 leg | 곡물 몫 |'); P('|---|---:|---:|---:|');
  for (const k of ['none', 'DSP', 'D', 'SP']) { const a = legs(k), b = all(k); P(`| ${k} | ${f1(a, 0)} | ${f1(b, 0)} | ${a != null && b ? f1(a / b * 100, 2) + ' %' : '—'} |`); }
}
// ④′ 수출 문 — 곡물 곳간이 교역 문 수출 문턱을 넘은 마을-날 몫(문턱 = 0.8 × max(subs × N × 30, N × 0.8) · 내놓을 몫 = 곳간 − 0.5 × 목표)
//   식은 `economy-sim-v2.js` 수출 후보 줄(곡물은 '그 외' 갈래) · 자급 표는 내보낸 정본(`SUBSISTENCE_PER_NPC`)을 읽는다.
{
  const q = console.log; console.log = () => {}; const SUB = require(path.join(__dirname, '..', 'sim', 'economy-sim-v2.js')).SUBSISTENCE_PER_NPC; console.log = q;
  P('\n## ④′ 곡물 곳간 ↔ 수출 문턱(마을-날 · 3시드 평균)');
  P('| 판 | 밀 문턱 넘은 몫 | 쌀 | 보리 | 문턱 넘은 날의 내놓을 몫 합(밀+쌀+보리 · 판 전체) | 곡물 곳간 ÷ 문턱(중앙 · 밀) |');
  P('|---|---:|---:|---:|---:|---:|');
  for (const k of ['none', 'DSP', 'D', 'SP']) {
    const per = SEEDS.map((s) => { const T = TR[`${k}:${s}`]; if (!T) return null; const res = { wheat: [0, 0], rice: [0, 0], barley: [0, 0] }; let surplus = 0; const ratio = [];
      for (const rows of T.vday) for (const r of rows) { const N = r[0]; if (!(N > 0)) continue;
        for (const g of ['wheat', 'rice', 'barley']) { const st = r[VCOL.length + T.meta.VG.indexOf(g)] || 0; const tgt = Math.max((SUB[g] || 0) * N * 30, N * 0.8);
          res[g][1]++; if (st > 0.8 * tgt) { res[g][0]++; surplus += Math.max(1, st - 0.5 * tgt); } if (g === 'wheat') ratio.push(st / (0.8 * tgt)); } }
      ratio.sort((a, b) => a - b); return { res, surplus, med: ratio[Math.floor(ratio.length / 2)] }; }).filter(Boolean);
    if (!per.length) continue;
    const av = (f) => per.reduce((a, x) => a + f(x), 0) / per.length;
    P(`| ${k} | ${['wheat', 'rice', 'barley'].map((g) => f1(av((x) => x.res[g][0] / x.res[g][1]) * 100, 1) + ' %').join(' | ')} | ${f1(av((x) => x.surplus), 0)} | ${f1(av((x) => x.med), 2)} |`);
  }
}
// ③′ 품목별 부패 갈래 — 부패 문(D)만 켜되 품목 몇에만(또는 몇만 빼고) 결정층 목표(`t739-arms` T739_DGOODS / T739_DEXCEPT)
{
  const GD = [['gd-Dfish', '생선만'], ['gd-Dmeat', '고기만'], ['gd-Dfm', '생선 + 고기'], ['gd-Dxfm', '생선 · 고기 빼고 전부'], ['gd-Dwc', '무기 + 숯'], ['tr-D', '전 품목(D)']];
  P('\n## ③′ 품목별 부패 갈래 — 부패 문만 켬(정산 · 출발 직후 끔) · 끔 대비 Δ%(시드 ' + SEEDS.join(' · ') + ' → 평균 · T252)');
  P('| 부패 문을 건 품목 | ' + M8.join(' | ') + ' | 소멸 |'); P('|---|' + M8.map(() => '---').join('|') + '|---|');
  for (const [f, label] of GD) {
    if (!SEEDS.every((s) => ex(`${f}-${s}.json`))) { P(`| ${label} | (미완) |`); continue; }
    const X = SEEDS.map((s) => g8(rd(`${f}-${s}.json`)));
    const cells = M8.map((m) => { const d = SEEDS.map((s, i) => (X[i][m] - J[`∅:${s}`][m]) / J[`∅:${s}`][m] * 100); const mm = d.reduce((a, b) => a + b, 0) / d.length; const v = verdict(d); return `${sg(mm)}${v === '가름' ? ' **가름**' : (v === '방향만' ? ' 방향' : '')}`; });
    P(`| ${label} | ${cells.join(' | ')} | ${X.map((x) => x.소멸).join(' · ')} |`);
  }
}
fs.writeFileSync(path.join(DIR, 't739-shapley.json'), JSON.stringify(SHAP));
fs.writeFileSync(path.join(DIR, 't739-tables.md'), out.join('\n') + '\n');
console.log(out.join('\n'));
