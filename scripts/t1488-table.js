#!/usr/bin/env node
// === scripts/t1488-table.js — T1488 표 만들기(판 자료만 읽는다 · 제품 무변 · @regress 없음) ===
// 읽는 것: $R/runs/<팔>-<시드>.done · .json.gz(판 JSON) · obs-<팔>-<시드>.json.gz(scripts/t1488-observe.js) — 팔 off · on · noobs-off(관찰기 없는 끔 한 판)
// 내는 것: $R/표.md · $R/요약.json · $R/빈마을.csv · $R/장부_판별.csv · $R/물먼길.csv · $R/세계열량.csv (보고의 모든 수는 여기서 복사한다 · 손 셈 0)
// 쓰는 법: R=<판 자료 폴더> node scripts/t1488-table.js
// 말뜻: 곳간 = `totalFoodEquivalent`(1.0 = 사람 하루치 = 날치 = DAY_KCAL 열량) · 거둔 것 = 그날 `dailyProductionBuf` 식량류 × 환산(직업 계측 없음 → 품목 몫) · 먹은 것 = `_foodEaten` × 환산 ·
//   썩은 것 = `tickVillage` 뒤 몫 − 몸통 끝 곳간 · 들여온/내보낸 = 교역 장부 줄의 식량류 수량(약탈 전 · xzone 줄 제외)
//   장부 틈 = 곳간(날 d) − 곳간(날 d−1) − (거둔 − 먹은 + 들여온 − 내보낸 − 썩은) 의 마을-날 합 ÷ 같은 마을-날 흐름 절댓값 합(거둔 + 먹은 + 들여온 + 내보낸 + 썩은)
//   빈 마을 = 마지막 날 사람 0 · 곳간 0 날 = 최고 인구 날 이후 첫 "곳간 ÷ 사람 < 1날치" 날 · 첫 떠남 = 최고 인구 날 이후 `_emigTot` 이 처음 오른 날 · 비기 시작 = 최고 인구의 절반 아래로 마지막으로 내려선 날
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const R = process.env.R || path.join(__dirname, '..', '계측', 'T1488_2026-11-25');
const SEEDS = [1020, 7, 42], ARMS = ['off', 'on'];
let DAYKCAL = 2450; try { DAYKCAL = require(path.join(__dirname, '..', 'sim', 'kcal')).DAY_KCAL || 2450; } catch (e) {}
const rd = (f) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8')); } catch (e) { return null; } };
const sum = (a) => a.reduce((x, y) => x + y, 0);
const mean = (a) => (a.length ? sum(a) / a.length : null);
const med = (a) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const f = (v, n) => (v == null || !isFinite(v) ? '—' : (+v).toFixed(n == null ? 0 : n));
const ff = (v) => (v == null || !isFinite(v) ? '—' : Math.round(v).toLocaleString('en-US'));
const typeOf = (name) => { const m = /^(농촌|어촌|광산|임업)/.exec(name); return m ? m[1] : '기타'; };
const H = ['hf', 'hs', 'hm', 'hg', 'hc', 'ho'];
const run = {};
for (const arm of [...ARMS, 'noobs-off']) for (const s of (arm === 'noobs-off' ? [1020] : SEEDS)) {
  const tag = `${arm}-${s}`; let d = null;
  try { const [, rc, sec] = fs.readFileSync(path.join(R, 'runs', `${tag}.done`), 'utf8').trim().split(/\s+/); d = { rc: +rc, sec: +sec }; } catch (e) {}
  const mk = rd(path.join(R, 'runs', `${tag}.json.gz`)), ob = arm === 'noobs-off' ? null : rd(path.join(R, 'runs', `obs-${tag}.json.gz`));
  const fp = mk && mk.byseed && mk.byseed[s] ? mk.byseed[s] : null;
  run[tag] = { tag, arm, seed: s, d, fp, ob, ok: arm === 'noobs-off' ? !!(d && d.rc === 0) : !!(d && d.rc === 0 && ob && ob.day && ob.day.length >= 398 && !ob.err) };
}
const have = (arm, s) => run[`${arm}-${s}`] && run[`${arm}-${s}`].ok;
const okRuns = [].concat(...ARMS.map((a) => SEEDS.filter((s) => have(a, s)).map((s) => run[`${a}-${s}`])));
const L = [], SUM = { made: new Date().toISOString().slice(0, 10), dayKcal: DAYKCAL, runs: {} };
const rowOf = (o, fld, d) => o[fld][d];
const vsum = (o, fld, d) => sum(o[fld][d].map((x) => x || 0));
const dayIdx = (o, day) => { const i = o.day.indexOf(day); return i; };
const pop = (o, d) => vsum(o, 'n', d);
const harv = (o, d, i) => sum(H.map((h) => o[h][d][i] || 0));

// ---- ① 판 · 장부 (판 하나) ----
function ledger(o) {
  const D = o.day.length, N = o.names.length; let res = 0, abs = 0, flow = 0, sRes = 0;
  const part = { gapBefore: 0, gapBody: 0, gapAfter: 0 };
  const tot = { H: 0, eat: 0, fin: 0, fout: 0, sp: 0, dfe: 0, b: 0, im: 0, em: 0, vn: 0, nd: 0, pd: 0, fd: 0, dd: 0 };
  const byVill = new Array(N).fill(0).map(() => ({ res: 0, flow: 0, absr: 0 })); const blk = new Map(); let absB = 0;
  for (let d = 1; d < D; d++) for (let i = 0; i < N; i++) {
    const hv = harv(o, d, i), eat = o.eat[d][i] || 0, fin = o.fin[d][i] || 0, fout = o.fout[d][i] || 0, S0 = o.S0[d][i] || 0, S1 = o.S1[d][i] || 0, S3 = o.S3[d][i] || 0;
    const sp = (S1 || S3) ? S1 - S3 : 0, dfe = o.fe[d][i] - o.fe[d - 1][i];
    const r = dfe - (hv - eat + fin - fout - sp), fl = hv + eat + fin + fout + Math.abs(sp);
    res += r; abs += Math.abs(r); flow += fl; { const kk = i * 100 + Math.floor((d - 1) / 10); blk.set(kk, (blk.get(kk) || 0) + r); } byVill[i].res += r; byVill[i].absr += Math.abs(r); byVill[i].flow += fl;
    part.gapBefore += S0 - o.fe[d - 1][i]; part.gapBody += (S1 - S0) - (hv - eat); part.gapAfter += o.fe[d][i] - S3;
    tot.H += hv; tot.eat += eat; tot.fin += fin; tot.fout += fout; tot.sp += sp; tot.dfe += dfe; tot.pd += o.n[d][i];
    tot.b += o.b[d][i] || 0; tot.im += o.im[d][i] || 0; tot.vn += o.vn[d][i] || 0;
  }
  for (const v of blk.values()) absB += Math.abs(v);
  tot.em = vsum(o, 'em', D - 1) - vsum(o, 'em', 0); tot.fd = vsum(o, 'fd', D - 1) - vsum(o, 'fd', 0); tot.dd = vsum(o, 'dd', D - 1) - vsum(o, 'dd', 0);
  return { res, abs, flow, gapSigned: flow ? 100 * res / flow : null, gapAbs: flow ? 100 * abs / flow : null, gapAbs10: flow ? 100 * absB / flow : null, part, tot, byVill };
}
// ---- ① 결정: 값 ----
function decisions(o) {
  const D = o.day.length, N = o.names.length; let vd = 0, g97 = 0, g74 = 0, g49 = 0; const nds = [];
  for (let d = 1; d < D; d++) for (let i = 0; i < N; i++) if (o.n[d][i] > 0) { vd++; g97 += o.g1297[d][i] || 0; g74 += o.g1374[d][i] || 0; g49 += o.g1149[d][i] || 0; const x = o.nd[d] && o.nd[d][i]; if (x != null) nds.push(x); }
  const leg = (o.legacyNeed || []).filter((x) => x[1] != null);
  return { vd, g1297: 100 * g97 / vd, g1374: 100 * g74 / vd, g1149: 100 * g49 / vd, ndMean: mean(nds), ndMed: med(nds), ndN: nds.length, ndMin: nds.length ? Math.min(...nds) : null, ndMax: nds.length ? Math.max(...nds) : null,
    legBirth: mean(leg.map((x) => x[1])), legMig: mean(leg.filter((x) => x[2] != null).map((x) => x[2])), legMin: leg.length ? Math.min(...leg.map((x) => x[1])) : null, legMax: leg.length ? Math.max(...leg.map((x) => x[1])) : null };
}
const LG = {}, DC = {};
for (const r of okRuns) { LG[r.tag] = ledger(r.ob); DC[r.tag] = decisions(r.ob); }

L.push('# T1488 표 (scripts/t1488-table.js 출력)');
L.push('');
L.push(`열량 환산: 1날치 = ${DAYKCAL} kcal(\`sim/kcal.js\` DAY_KCAL).`);
L.push('');
L.push('## ① 판마다 · 장부');
L.push('');
L.push('| 시드 | 팔 | 종료 | 초 | 인구(끝) | 끔비 | 빈 마을 | 태어남 | 옮겨 옴 | 떠남 | 굶어 죽음 | 죽음 합 | 사라진 몸 | 거둔 | 먹은 | 들여온 | 내보낸 | 썩은 | 곳간 변화 | 장부 틈 합계 % | 장부 틈 절댓값 % |');
L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
const END = {};
for (const s of SEEDS) for (const arm of ARMS) {
  const r = run[`${arm}-${s}`], o = r.ob;
  if (!r.ok) { L.push(`| ${s} | ${arm} | 없음 | | | | | | | | | | | | | | | | | | |`); continue; }
  const D = o.day.length, L0 = LG[r.tag].tot, popEnd = pop(o, D - 1), offE = END[`off-${s}`];
  const empt = o.n[D - 1].filter((x) => x === 0).length; END[r.tag] = { popEnd, empty: empt };
  L.push(`| ${s} | ${arm} | ${r.d.rc} | ${r.d.sec} | ${ff(popEnd)} | ${offE ? f(popEnd / offE.popEnd, 3) : '1.000'} | ${empt} | ${ff(L0.b)} | ${ff(L0.im)} | ${ff(L0.em)} | ${ff(L0.fd)} | ${ff(L0.dd)} | ${ff(L0.vn)} | ${ff(L0.H)} | ${ff(L0.eat)} | ${ff(L0.fin)} | ${ff(L0.fout)} | ${ff(L0.sp)} | ${ff(L0.dfe)} | ${f(LG[r.tag].gapSigned, 2)} | ${f(LG[r.tag].gapAbs, 2)} |`);
  SUM.runs[r.tag] = { popEnd, empty: empt, tot: L0, gapSigned: LG[r.tag].gapSigned, gapAbs: LG[r.tag].gapAbs, gapAbs10: LG[r.tag].gapAbs10, part: LG[r.tag].part, dec: DC[r.tag] };
}
L.push('');
// 팔별 합
const armTot = {};
for (const arm of ARMS) {
  const rs = SEEDS.filter((s) => have(arm, s)).map((s) => run[`${arm}-${s}`]); if (!rs.length) continue;
  const t = { n: rs.length, pop: 0, empty: 0, b: 0, im: 0, em: 0, fd: 0, dd: 0, vn: 0, H: 0, eat: 0, fin: 0, fout: 0, sp: 0, dfe: 0, pd: 0, res: 0, abs: 0, flow: 0 };
  for (const r of rs) { const x = LG[r.tag]; t.pop += END[r.tag].popEnd; t.empty += END[r.tag].empty; for (const k of ['b', 'im', 'em', 'fd', 'dd', 'vn', 'H', 'eat', 'fin', 'fout', 'sp', 'dfe', 'pd']) t[k] += x.tot[k]; t.res += x.res; t.abs += x.abs; t.abs10 = (t.abs10 || 0) + x.gapAbs10 * x.flow / 100; t.flow += x.flow; }
  t.gapSigned = 100 * t.res / t.flow; t.gapAbs = 100 * t.abs / t.flow; t.gapAbs10 = 100 * t.abs10 / t.flow; armTot[arm] = t;
}
SUM.armTot = armTot;
if (armTot.off && armTot.on) {
  const a = armTot.off, b = armTot.on;
  L.push('### 팔 합(시드 셋)');
  L.push('');
  L.push('| 칸 | 끔 | 켬 | 켬 ÷ 끔 |'); L.push('|---|---|---|---|');
  const row = (n, k, d) => L.push(`| ${n} | ${f(a[k], d || 0)} | ${f(b[k], d || 0)} | ${f(b[k] / a[k], 3)} |`);
  row('끝 인구', 'pop'); row('빈 마을', 'empty'); row('태어남', 'b'); row('옮겨 옴(마을 사이)', 'im'); row('떠남(`_emigTot`)', 'em'); row('굶어 죽음', 'fd'); row('죽음 합', 'dd'); row('사람-날', 'pd');
  row('거둔 식량(날치)', 'H'); row('먹은 식량', 'eat'); row('들여온 식량', 'fin'); row('썩은 식량', 'sp');
  L.push(`| 태어남 ÷ 사람-날 ×1000 | ${f(1000 * a.b / a.pd, 2)} | ${f(1000 * b.b / b.pd, 2)} | ${f(b.b / b.pd / (a.b / a.pd), 3)} |`);
  L.push(`| 굶어 죽음 ÷ 사람-날 ×1000 | ${f(1000 * a.fd / a.pd, 2)} | ${f(1000 * b.fd / b.pd, 2)} | ${f(b.fd / b.pd / (a.fd / a.pd), 3)} |`);
  L.push(`| 떠남 ÷ 사람-날 ×1000 | ${f(1000 * a.em / a.pd, 2)} | ${f(1000 * b.em / b.pd, 2)} | ${f(b.em / b.pd / (a.em / a.pd), 3)} |`);
  L.push(`| 거둔 ÷ 사람-날 | ${f(a.H / a.pd, 3)} | ${f(b.H / b.pd, 3)} | ${f(b.H / b.pd / (a.H / a.pd), 3)} |`);
  L.push(`| 먹은 ÷ 사람-날 | ${f(a.eat / a.pd, 3)} | ${f(b.eat / b.pd, 3)} | ${f(b.eat / b.pd / (a.eat / a.pd), 3)} |`);
  L.push(`| 장부 틈 합계 % | ${f(a.gapSigned, 2)} | ${f(b.gapSigned, 2)} | |`);
  L.push(`| 장부 틈 절댓값 % (마을-날) | ${f(a.gapAbs, 2)} | ${f(b.gapAbs, 2)} | |`);
  L.push(`| 장부 틈 절댓값 % (마을 · 10날 토막 합) | ${f(a.gapAbs10, 2)} | ${f(b.gapAbs10, 2)} | |`);
  L.push('');
}
// 장부 틈 쪼개기
L.push('### 장부 틈 쪼개기(마을-날 합 · 날치)');
L.push('');
L.push('| 판 | 틈 앞(전날 끝 곳간 → 몸통 머리) | 몸통(거둔 − 먹은 에 안 잡힌 것) | 틈 뒤(몸통 끝 → 날 끝 곳간) | 합 |');
L.push('|---|---|---|---|---|');
for (const r of okRuns) { const p = LG[r.tag].part; L.push(`| ${r.tag} | ${ff(p.gapBefore)} | ${ff(p.gapBody)} | ${ff(p.gapAfter)} | ${ff(p.gapBefore + p.gapBody + p.gapAfter)} |`); }
L.push('');
// 꼴별 장부 틈(코너: 광산 · 임업 들여오는 마을)
L.push('### 꼴별(광산 · 임업은 먹을 것을 산다) — 켬 · 끔 합(시드 셋)');
L.push('');
L.push('| 꼴 | 팔 | 마을-판 수 | 거둔 | 먹은 | 들여온 | 내보낸 | 장부 틈 합계 % | 사람-날 당 거둔 | 사람-날 당 먹은 | 사람-날 당 순입 |');
L.push('|---|---|---|---|---|---|---|---|---|---|---|');
const typeRows = {};
for (const arm of ARMS) for (const ty of ['농촌', '어촌', '광산', '임업', '기타']) {
  let c = 0, Hh = 0, E = 0, I = 0, O = 0, Rr = 0, Fl = 0, P = 0;
  for (const s of SEEDS) { if (!have(arm, s)) continue; const o = run[`${arm}-${s}`].ob, bv = LG[`${arm}-${s}`].byVill;
    for (let i = 0; i < o.names.length; i++) { if (typeOf(o.names[i]) !== ty) continue; c++; Rr += bv[i].res; Fl += bv[i].flow;
      for (let d = 1; d < o.day.length; d++) { Hh += harv(o, d, i); E += o.eat[d][i] || 0; I += o.fin[d][i] || 0; O += o.fout[d][i] || 0; P += o.n[d][i]; } } }
  if (!c) continue; typeRows[`${arm}-${ty}`] = { c, H: Hh, eat: E, fin: I, fout: O, gap: Fl ? 100 * Rr / Fl : null, pd: P };
  L.push(`| ${ty} | ${arm} | ${c} | ${ff(Hh)} | ${ff(E)} | ${ff(I)} | ${ff(O)} | ${f(Fl ? 100 * Rr / Fl : null, 2)} | ${f(Hh / P, 3)} | ${f(E / P, 3)} | ${f((I - O) / P, 3)} |`);
}
SUM.typeRows = typeRows; L.push('');

// ---- ① 결정별 값 ----
L.push('## ① 결정마다 끔 ↔ 켬');
L.push('');
L.push('(이 서버 판은 출생 곳간 문 `T1297_BIRTH_FOOD` · `T1374_BIRTH_HARV` · `T1149` · 이주 문 `T1306_MIGRATE_FOOD` 이 꺼져 있다 — 문 닫힘 0 % 는 "문이 없다"는 뜻이지 "안 닫혔다"가 아니다. 관찰기 `knobs` 칸 참고.)');
L.push('');
L.push('"버틸 날"(`t1419Days`) 값은 켬에서 그날 마을이 물었을 때 캐시(`_t1419N.d`)에 남은 값을 읽은 것(관찰기가 함수를 부르지 않는다). 끔은 종전 값(출생 · 이주 `t1297NeedDays` / `t1319MigNeedDays` 를 마을 없이 부른 값 · 그 밖은 30).');
L.push('');
L.push('| 판 | 마을-날(사람 있음) | 출생 곳간 문 닫힘 % (`_t1297Gate`) | 수확 문 닫힘 % (`_t1374Gate`) | 곳간 문 닫힘 % (`_t1149Gate`) | 켬 버틸 날 평균 · 중앙값 [최소 ~ 최대] (물은 마을-날 수) | 끔 종전 출생 날수 평균 [최소 ~ 최대] | 끔 종전 이주 날수 평균 |');
L.push('|---|---|---|---|---|---|---|---|');
for (const r of okRuns) { const c = DC[r.tag]; L.push(`| ${r.tag} | ${ff(c.vd)} | ${f(c.g1297, 1)} | ${f(c.g1374, 1)} | ${f(c.g1149, 1)} | ${c.ndN ? `${f(c.ndMean, 1)} · ${f(c.ndMed, 1)} [${f(c.ndMin, 1)} ~ ${f(c.ndMax, 1)}] (${ff(c.ndN)})` : '—'} | ${f(c.legBirth, 1)} [${f(c.legMin, 1)} ~ ${f(c.legMax, 1)}] | ${f(c.legMig, 1)} |`); }
L.push('');
// 호출수
L.push('### 읽는 자리마다 호출 수(`t1419Stat` 마지막 값 · 켬 판)');
L.push('');
for (const r of okRuns) { if (r.arm !== 'on') continue; const t = (r.ob.tags || []).filter((x) => x[1]); if (!t.length) { L.push(`- ${r.tag}: 호출 수 계측 없음`); continue; } L.push(`- ${r.tag}: ${JSON.stringify(t[t.length - 1][1])}`); }
L.push('');

// ---- ② 날 121 ~ 210 ----
L.push('## ② 날 91 ~ 240 열 날 토막 — 먼저 꺾이는 것(시드 셋 합)');
L.push('');
L.push('토막마다: 거둔 ÷ 사람 = 마을 합 거둔 식량(날치) ÷ 사람-날 · 곳간 ÷ 사람 = 날 끝 곳간 합 ÷ 사람 합의 토막 평균 · 태어남 · 굶어 죽음 = 사람-날 1,000당 · 기준 = 날 91 ~ 120 켬 팔 값.');
L.push('');
const win = (arm, d0, d1) => {   // d0..d1 날(포함)
  const t = { H: 0, pd: 0, fe: 0, nsum: 0, k: 0, b: 0, fd: 0, em: 0, dd: 0, im: 0 };
  for (const s of SEEDS) { if (!have(arm, s)) continue; const o = run[`${arm}-${s}`].ob;
    for (let d = 1; d < o.day.length; d++) { const dy = o.day[d]; if (dy < d0 || dy > d1) continue;
      for (let i = 0; i < o.names.length; i++) { t.H += harv(o, d, i); t.pd += o.n[d][i]; t.b += o.b[d][i] || 0; t.im += o.im[d][i] || 0; }
      t.fe += vsum(o, 'fe', d); t.nsum += pop(o, d); t.k++;
      t.fd += vsum(o, 'fd', d) - vsum(o, 'fd', d - 1); t.em += vsum(o, 'em', d) - vsum(o, 'em', d - 1); t.dd += vsum(o, 'dd', d) - vsum(o, 'dd', d - 1); } }
  return { Hpp: t.H / t.pd, fepp: t.fe / t.nsum, b1k: 1000 * t.b / t.pd, fd1k: 1000 * t.fd / t.pd, em1k: 1000 * t.em / t.pd, im1k: 1000 * t.im / t.pd, pd: t.pd, days: t.k };
};
const WIN = [];
for (let d0 = 91; d0 <= 231; d0 += 10) WIN.push([d0, d0 + 9]);
const base = { off: win('off', 91, 120), on: win('on', 91, 120) };
SUM.base = base;
L.push('| 토막 | 끔 거둔÷사람 | 켬 거둔÷사람 | 켬/끔 | 끔 곳간÷사람 | 켬 곳간÷사람 | 켬/끔 | 끔 태어남‰ | 켬 태어남‰ | 끔 굶음‰ | 켬 굶음‰ | 끔 떠남‰ | 켬 떠남‰ | 켬 사람-날 ÷ 끔 |');
L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
const wr = [];
for (const [a, b] of WIN) { const o = win('off', a, b), n = win('on', a, b); wr.push({ a, b, o, n });
  L.push(`| ${a}~${b} | ${f(o.Hpp, 3)} | ${f(n.Hpp, 3)} | ${f(n.Hpp / o.Hpp, 3)} | ${f(o.fepp, 2)} | ${f(n.fepp, 2)} | ${f(n.fepp / o.fepp, 3)} | ${f(o.b1k, 2)} | ${f(n.b1k, 2)} | ${f(o.fd1k, 2)} | ${f(n.fd1k, 2)} | ${f(o.em1k, 2)} | ${f(n.em1k, 2)} | ${f(n.pd / o.pd, 3)} |`); }
L.push('');
// 첫 꺾임: 켬 기준 −20 %(거둔 · 곳간 · 태어남) / +20 %(굶음) 켬 팔 자신의 기준(91~120) 대비. 121 이후 토막.
const first = (key, dir) => { const B = base.on[key]; for (const w of wr) { if (w.a < 121) continue; const x = w.n[key]; if (dir < 0 ? x <= 0.8 * B : x >= 1.2 * B + (key === 'fd1k' ? 0.5 : 0)) return { a: w.a, b: w.b, val: x, base: B }; } return null; };
const brk = { harvest: first('Hpp', -1), stock: first('fepp', -1), births: first('b1k', -1), starve: first('fd1k', +1) };
SUM.firstBreak = brk; SUM.windows = wr;
L.push('켬 팔 첫 꺾임(자기 기준 날 91 ~ 120 대비 −20 %(거둔 · 곳간 · 태어남) · +20 %(굶음)): ');
for (const [k, nm] of [['harvest', '사람당 거둔'], ['stock', '사람당 곳간'], ['births', '출생률'], ['starve', '굶어 죽음']]) L.push(`- ${nm}: ${brk[k] ? `${brk[k].a}~${brk[k].b} 토막(${f(brk[k].base, 3)} → ${f(brk[k].val, 3)})` : '날 121~240 안에 없음'}`);
const bk = Object.entries(brk).filter(([, v]) => v).sort((x, y) => x[1].a - y[1].a);
SUM.firstBreakName = bk.length ? bk[0][0] : null; SUM.firstBreakTies = bk.filter((x) => x[1].a === (bk[0] && bk[0][1].a)).map((x) => x[0]);
L.push('');

// ---- ③ 빈 마을 ----
L.push('## ③ 빈 마을 — 곳간 0 날 ↔ 첫 떠남');
L.push('');
const emp = []; const csv = ['arm,seed,village,type,water,peak,peakDay,declineDay,stock0Day,firstDepartDay,first,emptyDay,fdTot,emTot'];
for (const arm of ARMS) for (const s of SEEDS) { if (!have(arm, s)) continue; const o = run[`${arm}-${s}`].ob, D = o.day.length;
  for (let i = 0; i < o.names.length; i++) { if (o.n[D - 1][i] !== 0) continue;
    let pk = 0, pd = 0; for (let d = 0; d < D; d++) if (o.n[d][i] > pk) { pk = o.n[d][i]; pd = d; }
    let dec = null; for (let d = D - 1; d >= pd; d--) if (o.n[d][i] >= pk / 2) { dec = d + 1 < D ? d + 1 : d; break; }
    let z = null; for (let d = pd; d < D; d++) { const n = o.n[d][i]; if (n === 0 ? true : o.fe[d][i] / n < 1) { z = d; break; } }
    let dep = null; for (let d = Math.max(pd, 1); d < D; d++) if ((o.em[d][i] || 0) > (o.em[d - 1][i] || 0)) { dep = d; break; }
    let ez = null; for (let d = D - 1; d >= 0; d--) { if (o.n[d][i] > 0) { ez = d + 1; break; } } if (ez == null) ez = 0;
    const dy = (d) => (d == null ? null : o.day[d]);
    const first = z == null && dep == null ? '없음' : dep == null ? '곳간' : z == null ? '떠남' : o.day[z] < o.day[dep] ? '곳간' : o.day[z] > o.day[dep] ? '떠남' : '같은 날';
    const e = { arm, seed: s, village: o.names[i], type: typeOf(o.names[i]), water: o.stat[i].water, peak: pk, peakDay: dy(pd), declineDay: dy(dec), stock0Day: dy(z), firstDepartDay: dy(dep), first, emptyDay: dy(ez),
      fd: o.fd[D - 1][i], em: o.em[D - 1][i], lead: dep != null && z != null ? o.day[dep] - o.day[z] : null,
      stockAtDecline: dec != null ? o.fe[dec][i] / Math.max(1, o.n[dec][i]) : null, emBeforeDecline: dec != null ? o.em[dec][i] - o.em[Math.max(pd, 0)][i] : null };
    // 비기 시작 이후 기준 첫 떠남
    let dep2 = null; for (let d = Math.max(dec == null ? 1 : dec, 1); d < D; d++) if ((o.em[d][i] || 0) > (o.em[d - 1][i] || 0)) { dep2 = d; break; }
    let z2 = null; for (let d = dec == null ? pd : dec; d < D; d++) { const n = o.n[d][i]; if (n === 0 ? true : o.fe[d][i] / n < 1) { z2 = d; break; } }
    e.first2 = z2 == null && dep2 == null ? '없음' : dep2 == null ? '곳간' : z2 == null ? '떠남' : o.day[z2] < o.day[dep2] ? '곳간' : o.day[z2] > o.day[dep2] ? '떠남' : '같은 날';
    let za = null; for (let d = pd; d < D; d++) if (o.fe[d][i] < 1) { za = d; break; } e.stockAbsDay = dy(za);
    e.firstAbs = za == null && dep == null ? '없음' : dep == null ? '곳간' : za == null ? '떠남' : o.day[za] < o.day[dep] ? '곳간' : o.day[za] > o.day[dep] ? '떠남' : '같은 날';
    emp.push(e); csv.push([arm, s, e.village, e.type, e.water, pk, e.peakDay, e.declineDay, e.stock0Day, e.firstDepartDay, first, e.emptyDay, e.fd, e.em].join(',')); } }
fs.writeFileSync(path.join(R, '빈마을.csv'), csv.join('\n') + '\n');
const cnt = (arr, k, v) => arr.filter((x) => x[k] === v).length;
const eo = emp.filter((x) => x.arm === 'on'), ef = emp.filter((x) => x.arm === 'off');
SUM.empty = { on: eo.length, off: ef.length, onStockFirst: cnt(eo, 'first', '곳간'), onDepartFirst: cnt(eo, 'first', '떠남'), onTie: cnt(eo, 'first', '같은 날'), onNone: cnt(eo, 'first', '없음'),
  onStockFirst2: cnt(eo, 'first2', '곳간'), onDepartFirst2: cnt(eo, 'first2', '떠남'), onTie2: cnt(eo, 'first2', '같은 날'), onNone2: cnt(eo, 'first2', '없음'),
  offStockFirst: cnt(ef, 'first', '곳간'), offDepartFirst: cnt(ef, 'first', '떠남'), offTie: cnt(ef, 'first', '같은 날'),
  onAbsStockFirst: cnt(eo, 'firstAbs', '곳간'), onAbsDepartFirst: cnt(eo, 'firstAbs', '떠남'), onAbsTie: cnt(eo, 'firstAbs', '같은 날'), onAbsNone: cnt(eo, 'firstAbs', '없음'),
  atPeak: eo.filter((x) => x.stock0Day === x.peakDay).length,
  leadMed: med(eo.filter((x) => x.lead != null).map((x) => x.lead)), stockAtDeclineMed: med(eo.filter((x) => x.stockAtDecline != null).map((x) => x.stockAtDecline)), types: {} };
for (const x of eo) SUM.empty.types[x.type] = (SUM.empty.types[x.type] || 0) + 1;
L.push(`켬 빈 마을 ${eo.length}곳(시드별 ${SEEDS.map((s) => `${s}: ${eo.filter((x) => x.seed === s).length}`).join(' · ')}) · 끔 빈 마을 ${ef.length}곳.`);
L.push(`- 최고 인구 날 기준: 곳간 0 이 먼저 ${SUM.empty.onStockFirst}/${eo.length} · 떠남이 먼저 ${SUM.empty.onDepartFirst}/${eo.length} · 같은 날 ${SUM.empty.onTie} · 어느 쪽도 없음 ${SUM.empty.onNone} (끔: 곳간 ${SUM.empty.offStockFirst} · 떠남 ${SUM.empty.offDepartFirst} · 같은 날 ${SUM.empty.offTie}/${ef.length})`);
L.push(`- 비기 시작(최고 인구 절반 아래로 마지막으로 내려선 날) 기준: 곳간 0 이 먼저 ${SUM.empty.onStockFirst2}/${eo.length} · 떠남이 먼저 ${SUM.empty.onDepartFirst2}/${eo.length} · 같은 날 ${SUM.empty.onTie2} · 없음 ${SUM.empty.onNone2}`);
L.push(`- 곳간 총량 1날치 미만(절대 0) 기준: 곳간이 먼저 ${SUM.empty.onAbsStockFirst}/${eo.length} · 떠남이 먼저 ${SUM.empty.onAbsDepartFirst}/${eo.length} · 같은 날 ${SUM.empty.onAbsTie} · 없음 ${SUM.empty.onAbsNone}`);
L.push(`- 사람당 곳간 < 1날치가 최고 인구 날 그날부터였던 곳 ${SUM.empty.atPeak}/${eo.length}`);
L.push(`- 곳간 0 날 → 첫 떠남 날 차(+ = 곳간이 먼저) 중앙값 ${f(SUM.empty.leadMed, 0)}날 · 비기 시작 날 사람당 곳간 중앙값 ${f(SUM.empty.stockAtDeclineMed, 1)}날치`);
L.push('');
L.push('| 팔 | 시드 | 마을 | 꼴 | 물 | 최고 인구 | 최고 날 | 비기 시작 | 곳간 0 날 | 첫 떠남 날 | 먼저(최고 날 기준) | 먼저(비기 시작 기준) | 총량<1 날 | 먼저(총량<1) | 빈 날 | 굶어 죽음 | 떠남 합 |');
L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const e of emp) L.push(`| ${e.arm} | ${e.seed} | ${e.village} | ${e.type} | ${f(e.water, 2)} | ${e.peak} | ${e.peakDay} | ${e.declineDay} | ${e.stock0Day == null ? '—' : e.stock0Day} | ${e.firstDepartDay == null ? '—' : e.firstDepartDay} | ${e.first} | ${e.first2} | ${e.stockAbsDay == null ? '—' : e.stockAbsDay} | ${e.firstAbs} | ${e.emptyDay} | ${e.fd} | ${e.em} |`);
L.push('');

// ---- 3. 물 먼 땅 들여오는 길 ----
L.push('## ④ 물 먼 마을(물 아래서 위 3분의 1 중 하위: `land.water` 낮은 3분의 1) — 식량 들여오는 길');
L.push('');
L.push('길 한 줄 = 교역 장부 한 줄에서 받는 쪽 식량 수량(환산 > 0). 보낸 쪽 곳간 = 그날 끝 곳간 ÷ 사람. "같이 비었다" = 보낸 쪽 사람당 곳간이 1날치 미만인 보내기 몫.');
L.push('');
L.push('| 팔 | 물 먼 마을 수(판 합) | 들여온 회수 | 들여온 양(날치) | 마을 · 100날 당 회수 | 보낸 마을 수(다른) | 보낸 쪽 곳간÷사람 중앙값 | 보낸 쪽 곳간÷사람 < 1 몫 % | 들여온 양 ÷ 사람-날 | 물 먼 마을 먹은 ÷ 사람-날 | 물 먼 마을 거둔 ÷ 사람-날 |');
L.push('|---|---|---|---|---|---|---|---|---|---|---|');
const wf = {}; const csv2 = ['arm,seed,dest,src,day,amt,srcStockPP,destStockPP'];
for (const arm of ARMS) { const t = { n: 0, cnt: 0, amt: 0, vd: 0, srcs: new Set(), spp: [], pdsum: 0, eat: 0, H: 0, below: 0, bAmt: 0, perSeedAmt: {}, perSeedCnt: {} };
  for (const s of SEEDS) { if (!have(arm, s)) continue; const o = run[`${arm}-${s}`].ob, N = o.names.length;
    const idx = o.stat.map((x, i) => [i, x.water]).sort((a, b) => a[1] - b[1]); const far = new Set(idx.slice(0, Math.floor(N / 3)).map((x) => x[0]));
    t.n += far.size; t.perSeedAmt[s] = 0; t.perSeedCnt[s] = 0;
    const dIdx = new Map(o.day.map((d, k) => [d, k]));
    for (const rrow of o.rt) { const [dy, a, b, g, tt] = rrow; const k = dIdx.get(dy); if (k == null) continue;
      for (const [src, dst, amt] of [[a, b, g], [b, a, tt]]) { if (!(amt > 0) || !far.has(dst)) continue;
        const sn = Math.max(1, o.n[k][src]), spp = o.fe[k][src] / sn; t.cnt++; t.amt += amt; t.srcs.add(s + ':' + src); t.spp.push(spp); if (spp < 1) { t.below += amt; } t.bAmt += amt; t.perSeedAmt[s] += amt; t.perSeedCnt[s]++;
        csv2.push([arm, s, o.names[dst], o.names[src], dy, amt, spp.toFixed(2), (o.fe[k][dst] / Math.max(1, o.n[k][dst])).toFixed(2)].join(',')); } }
    for (let d = 1; d < o.day.length; d++) for (const i of far) { t.vd += 1; t.pdsum += o.n[d][i]; t.eat += o.eat[d][i] || 0; t.H += harv(o, d, i); } }
  wf[arm] = t;
  L.push(`| ${arm} | ${t.n} | ${ff(t.cnt)} | ${ff(t.amt)} | ${f(100 * t.cnt / (t.vd || 1), 2)} | ${t.srcs.size} | ${f(med(t.spp), 2)} | ${f(t.bAmt ? 100 * t.below / t.bAmt : null, 1)} | ${f(t.amt / (t.pdsum || 1), 4)} | ${f(t.eat / (t.pdsum || 1), 3)} | ${f(t.H / (t.pdsum || 1), 3)} |`); }
L.push('');
fs.writeFileSync(path.join(R, '물먼길.csv'), csv2.join('\n') + '\n');
SUM.waterFar = {}; for (const arm of ARMS) if (wf[arm]) { const t = wf[arm]; SUM.waterFar[arm] = { n: t.n, cnt: t.cnt, amt: t.amt, srcs: t.srcs.size, srcStockMed: med(t.spp), belowPct: t.bAmt ? 100 * t.below / t.bAmt : null, amtPerPd: t.amt / (t.pdsum || 1), perSeedAmt: t.perSeedAmt, perSeedCnt: t.perSeedCnt }; }
// 시드별
L.push('| 팔 | 시드 | 들여온 회수 | 들여온 양 |'); L.push('|---|---|---|---|');
for (const arm of ARMS) if (wf[arm]) for (const s of SEEDS) if (have(arm, s)) L.push(`| ${arm} | ${s} | ${ff(wf[arm].perSeedCnt[s])} | ${ff(wf[arm].perSeedAmt[s])} |`);
L.push('');
// 켬에서 길이 끊기나: 물 먼 마을 달별 들여온 양
L.push('물 먼 마을 들여온 양 · 사람당 곳간 · 사람-날당 거둔(100날 토막 · 시드 셋 합):');
L.push('');
L.push('| 토막 | 끔 들여온 | 켬 들여온 | 끔 곳간÷사람 | 켬 곳간÷사람 | 끔 거둔÷사람 | 켬 거둔÷사람 | 끔 사람 | 켬 사람 |'); L.push('|---|---|---|---|---|---|---|---|---|');
const wfW = [];
for (let a = 1; a <= 400; a += 100) { const row = { a, off: { imp: 0, fe: 0, n: 0, H: 0, pd: 0, k: 0 }, on: { imp: 0, fe: 0, n: 0, H: 0, pd: 0, k: 0 } };
  for (const arm of ARMS) for (const s of SEEDS) { if (!have(arm, s)) continue; const o = run[`${arm}-${s}`].ob, N = o.names.length; const idx = o.stat.map((x, i) => [i, x.water]).sort((p, q) => p[1] - q[1]); const far = idx.slice(0, Math.floor(N / 3)).map((x) => x[0]);
    const t = row[arm]; for (let d = 1; d < o.day.length; d++) { const dy = o.day[d]; if (dy < a || dy > a + 99) continue; for (const i of far) { t.imp += o.fin[d][i] || 0; t.fe += o.fe[d][i]; t.n += o.n[d][i]; t.H += harv(o, d, i); t.pd += o.n[d][i]; } } }
  wfW.push(row); L.push(`| ${a}~${a + 99} | ${ff(row.off.imp)} | ${ff(row.on.imp)} | ${f(row.off.fe / (row.off.n || 1), 2)} | ${f(row.on.fe / (row.on.n || 1), 2)} | ${f(row.off.H / (row.off.pd || 1), 3)} | ${f(row.on.H / (row.on.pd || 1), 3)} | ${ff(row.off.pd)} | ${ff(row.on.pd)} |`); }
SUM.waterFarWin = wfW; L.push('');

// ---- 세계 열량 ÷ 사람 ----
L.push('## ⑤ 세계 하루 거둔 열량 ÷ 사는 사람 — 100날마다');
L.push('');
L.push(`1날치 = ${DAYKCAL} kcal. "그날" = 그 날 하나 · "100날 평균" = 그 날까지 100날 합 ÷ 사람-날. 거둔 = 식량류 품목 환산(밭 곡 · 작물은 익은 날 곳간에 든 몫).`);
L.push('');
L.push('| 시드 | 날 | 끔 그날 날치/인 | 켬 그날 날치/인 | 끔 100날 평균 | 켬 100날 평균 | 끔 kcal/인(100날) | 켬 kcal/인(100날) | 끔 사람 | 켬 사람 | 끔 먹은÷사람(100날) | 켬 먹은÷사람(100날) |');
L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
const cal = {}; const csv3 = ['seed,day,offInstant,onInstant,offWin,onWin,offKcalWin,onKcalWin,offPop,onPop'];
const calAt = (o, day) => { const k = o.day.indexOf(day); if (k < 0) return null; let ins = 0, wH = 0, wP = 0, wE = 0; ins = sum(Array.from({ length: o.names.length }, (_, i) => harv(o, k, i))) / Math.max(1, pop(o, k));
  for (let d = Math.max(1, k - 99); d <= k; d++) { wH += sum(Array.from({ length: o.names.length }, (_, i) => harv(o, d, i))); wP += pop(o, d); wE += vsum(o, 'eat', d); } return { ins, win: wH / wP, eat: wE / wP, pop: pop(o, k) }; };
for (const s of [...SEEDS, 'all']) for (const day of [100, 200, 300, 400]) {
  const ss = s === 'all' ? SEEDS : [s]; const R2 = {};
  for (const arm of ARMS) { const xs = ss.filter((q) => have(arm, q)).map((q) => { const o = run[`${arm}-${q}`].ob; const dd = o.day.includes(day) ? day : o.day[o.day.length - 1]; return calAt(o, dd); }).filter(Boolean);
    if (xs.length) R2[arm] = { ins: mean(xs.map((x) => x.ins)), win: mean(xs.map((x) => x.win)), eat: mean(xs.map((x) => x.eat)), pop: sum(xs.map((x) => x.pop)) }; }
  if (!R2.off || !R2.on) continue; cal[`${s}-${day}`] = R2;
  L.push(`| ${s === 'all' ? '셋 평균' : s} | ${day} | ${f(R2.off.ins, 3)} | ${f(R2.on.ins, 3)} | ${f(R2.off.win, 3)} | ${f(R2.on.win, 3)} | ${f(R2.off.win * DAYKCAL, 0)} | ${f(R2.on.win * DAYKCAL, 0)} | ${ff(R2.off.pop)} | ${ff(R2.on.pop)} | ${f(R2.off.eat, 3)} | ${f(R2.on.eat, 3)} |`);
  csv3.push([s, day, R2.off.ins, R2.on.ins, R2.off.win, R2.on.win, R2.off.win * DAYKCAL, R2.on.win * DAYKCAL, R2.off.pop, R2.on.pop].join(',')); }
fs.writeFileSync(path.join(R, '세계열량.csv'), csv3.join('\n') + '\n');
SUM.cal = cal; L.push('');

// ---- 겨울 · 달 ----
L.push('## ⑥ 겨울 가장자리 — 철마다 굶어 죽음 · 장부 틈(시드 셋 합)');
L.push('');
L.push('| 팔 | 철 | 날 수 | 굶어 죽음 | ‰ 사람-날 | 장부 틈 합계 % |'); L.push('|---|---|---|---|---|---|');
const seaRows = {};
for (const arm of ARMS) { const T = {}; for (const s of SEEDS) { if (!have(arm, s)) continue; const o = run[`${arm}-${s}`].ob;
  for (let d = 1; d < o.day.length; d++) { const se = o.sea && o.sea[d] != null ? String(o.sea[d]) : '?'; const t = T[se] || (T[se] = { days: 0, fd: 0, pd: 0, res: 0, flow: 0 }); t.days++; t.fd += vsum(o, 'fd', d) - vsum(o, 'fd', d - 1); t.pd += pop(o, d);
    for (let i = 0; i < o.names.length; i++) { const hv = harv(o, d, i), eat = o.eat[d][i] || 0, fin = o.fin[d][i] || 0, fout = o.fout[d][i] || 0, sp = (o.S1[d][i] || o.S3[d][i]) ? o.S1[d][i] - o.S3[d][i] : 0; t.res += o.fe[d][i] - o.fe[d - 1][i] - (hv - eat + fin - fout - sp); t.flow += hv + eat + fin + fout + Math.abs(sp); } } }
  for (const [se, t] of Object.entries(T)) { L.push(`| ${arm} | ${se} | ${t.days} | ${ff(t.fd)} | ${f(1000 * t.fd / t.pd, 2)} | ${f(100 * t.res / t.flow, 2)} |`); seaRows[`${arm}-${se}`] = t; } }
SUM.seaRows = seaRows; L.push('');

// ---- 관찰기 무변 ----
const inv = (() => {
  const a = run['off-1020'], b = run['noobs-off-1020'];
  if (!a || !b || !a.fp || !b.fp) return { ok: null, why: '판 없음' };
  const j = (x) => JSON.stringify([x.runHash, x.days, x.side && x.side.days]);
  return { ok: j(a.fp) === j(b.fp), runHashObs: a.fp.runHash, runHashNo: b.fp.runHash, days: (a.fp.days || []).length, daysNo: (b.fp.days || []).length, bytes: j(a.fp).length };
})();
SUM.invariance = inv;
L.push('## ⑦ 관찰기 무변');
L.push('');
L.push('| 견줌 | 판 지문 | runHash(관찰기 켬) | runHash(관찰기 없음) | 경제 날 지문 줄 수 | 비교한 글자 수 |'); L.push('|---|---|---|---|---|---|');
L.push(`| 끔 1020 — 관찰기 있음 ↔ 없음 | ${inv.ok == null ? inv.why : inv.ok ? '바이트 같음' : '다름'} | ${inv.runHashObs || '—'} | ${inv.runHashNo || '—'} | ${inv.days || '—'} · ${inv.daysNo || '—'} | ${inv.bytes || '—'} |`);
L.push('');

// ---- 한 줄 요약 ----
const A = armTot.off, B = armTot.on, c400 = cal['all-400'] || {}, c100 = cal['all-100'] || {};
const sf = SUM.empty;
SUM.line = {
  popRatio: A && B ? B.pop / A.pop : null, births1k: A && B ? [1000 * A.b / A.pd, 1000 * B.b / B.pd] : null, bRatio: A && B ? (B.b / B.pd) / (A.b / A.pd) : null,
  gap: B ? B.gapSigned : null, gapOff: A ? A.gapSigned : null };
L.push('## ⑧ 한 줄 답(표)'); L.push('');
L.push(`- 인구 켬 ÷ 끔 ${f(SUM.line.popRatio, 3)} · 태어남‰ ${SUM.line.births1k ? `${f(SUM.line.births1k[0], 2)} → ${f(SUM.line.births1k[1], 2)}` : '—'} · 떠남‰ ${A && B ? `${f(1000 * A.em / A.pd, 2)} → ${f(1000 * B.em / B.pd, 2)}` : '—'} · 굶어 죽음‰ ${A && B ? `${f(1000 * A.fd / A.pd, 2)} → ${f(1000 * B.fd / B.pd, 2)}` : '—'}`);
L.push(`- 먼저 꺾인 것: ${SUM.firstBreakName || '날 121~240 안에 없음'}${SUM.firstBreakTies && SUM.firstBreakTies.length > 1 ? ' (같은 토막: ' + SUM.firstBreakTies.join(' · ') + ')' : ''}`);
L.push(`- 곳간 0 먼저 ${sf.onStockFirst}/${sf.on} · 떠남 먼저 ${sf.onDepartFirst}/${sf.on} · 같은 날 ${sf.onTie}`);
L.push(`- 물 먼 마을 들여온 양 ${SUM.waterFar.off ? ff(SUM.waterFar.off.amt) : '—'} → ${SUM.waterFar.on ? ff(SUM.waterFar.on.amt) : '—'}`);
L.push(`- 세계 거둔 ÷ 사람(날 400 · 100날 평균 날치) ${c400.off ? f(c400.off.win, 3) : '—'} → ${c400.on ? f(c400.on.win, 3) : '—'}`);
L.push(`- 장부 틈 ${B ? f(B.gapSigned, 2) : '—'} % (끔 ${A ? f(A.gapSigned, 2) : '—'} %) · 절댓값 ${B ? f(B.gapAbs, 2) : '—'} %`);
L.push('');
fs.writeFileSync(path.join(R, '표.md'), L.join('\n') + '\n');
fs.writeFileSync(path.join(R, '요약.json'), JSON.stringify(SUM, null, 1));
// 판 별 장부 csv
const lc = ['tag,popEnd,empty,births,im,em,fd,dd,vanished,harvest,eat,fin,fout,spoiled,dStock,gapSigned,gapAbs'];
for (const r of okRuns) { const x = LG[r.tag].tot; lc.push([r.tag, END[r.tag].popEnd, END[r.tag].empty, x.b, x.im, x.em, x.fd, x.dd, x.vn, x.H, x.eat, x.fin, x.fout, x.sp, x.dfe, LG[r.tag].gapSigned, LG[r.tag].gapAbs].join(',')); }
fs.writeFileSync(path.join(R, '장부_판별.csv'), lc.join('\n') + '\n');
console.log(`표 ${L.length}줄 · 판 ${okRuns.length}/6`);
