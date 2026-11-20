'use strict';
// (@regress 없음 — 러너 밖 · T1384 표 자 · 읽기만)
// === scripts/t1384-table.js — T1384 표: 광산5 의 한 해 · 광산 · 임업 마을 400날 · 막힌 문 셈(제 캐러밴) · 파는 쪽 문 · 세계 식량 · 끔 ↔ 켬 ==========
//   쓰는 법: RUNS=<판 자리> [LAB=<랩 판 자리>] [ARMS=OFF,PULL,…] node scripts/t1384-table.js
//     판 자리 = `<판>-<시드>/<판>-<시드>.<꼴>.json` (판 폴더) 또는 납작 `<판>-<시드>.<꼴>.json[.gz]` — 둘 다 읽는다
//     판: 서버 자 400날 S<팔>-<시드>(1020 · 7 · 42) · 몸 세계 100날 B<팔>-<시드> · 랩 L<팔>-0/probe.json(econ-lab-real 100날)
//   셈은 다 관찰기 JSON 에서(손 셈 0) — 식량 단위 = econ 곳간 식량 환산(사람 하루 1 = `DAILY_FOOD_CONSUMPTION`)
//     들여옴 = 남이 보낸 먹을 것 짐(받은 쪽 = 그 마을) + 그 마을 캐러밴이 사 온 먹을 것(귀로 — 장부 줄의 날 = 그곳에서 산 날)
//     내보냄 = 그 마을이 보낸 먹을 것 짐 + 남의 캐러밴이 그 마을에서 사 간 먹을 것
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const RUNS = process.env.RUNS || '/root/t1384runs', LAB = process.env.LAB || path.join(RUNS, 'lab');
const ARMS = (process.env.ARMS || 'OFF').split(',');   // 팔: OFF · KEEP(① 붙든다) · ROUTE(② 길 위를 센다) · BOTH
const ANAME = { OFF: '끔', KEEP: '켬 ① 붙든다', ROUTE: '켬 ② 길 위를 센다', BOTH: '켬 ①+②' };
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
const sum = (a) => a.reduce((s, x) => s + (+x || 0), 0);
const med = (a) => { const s = a.filter((x) => x != null && isFinite(x)).sort((p, q) => p - q); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const out = (s) => process.stdout.write(s + '\n');
const isMine = (n) => /^광산\d+$/.test(n), isWood = (n) => /^임업\d+$/.test(n);
const cls = (n) => (isMine(n) ? '광산' : isWood(n) ? '임업' : /^농촌/.test(n) ? '농촌' : /^어촌/.test(n) ? '어촌' : '그 밖');
const K5 = '광산5';

// ── 한 판 읽기 → 마을마다 날 줄 · 들여옴 · 내보냄 ──
function load(n) { return loadObj(rd(n, 't1384')); }
function loadObj(O) {
  if (!O || !O.day || !O.names) return null;
  const C = O.vcols, I = (k) => C.indexOf(k), names = O.names, days = Object.keys(O.day).map(Number).sort((a, b) => a - b);
  const inF = {}, outF = {}, inN = {}, outN = {}, ownBuyN = {}, ownLaunch = {};   // [마을] → { 날: 양 }
  const add = (M, v, d, x) => { const o = M[v] || (M[v] = {}); o[d] = (o[d] || 0) + x; };
  for (const L of O.legs || []) {
    const [d, from, to, sRes, sAmt, sEq, bRes, bAmt, bEq] = L;
    add(ownLaunch, from, d, 1);
    if (sEq > 0) { add(inF, to, d, sEq); add(inN, to, d, 1); add(outF, from, d, sEq); add(outN, from, d, 1); }
    if (bEq > 0) { add(inF, from, d, bEq); add(inN, from, d, 1); add(ownBuyN, from, d, 1); add(outF, to, d, bEq); add(outN, to, d, 1); }
  }
  return { O, C, I, names, days, inF, outF, inN, outN, ownBuyN, ownLaunch };
}
// 마을 하나 · 날 [a, b] 묶음
function vsum(R, v, a, b) {
  const vi = R.names.indexOf(v); if (vi < 0) return null;
  const I = R.I, ds = R.days.filter((d) => d >= a && d <= b && R.O.day[d] && R.O.day[d][vi]);
  if (!ds.length) return null;
  const row = (d) => R.O.day[d][vi], col = (k) => ds.map((d) => row(d)[I(k)]);
  const first = row(ds[0]), last = row(ds[ds.length - 1]);
  const pick = (M) => sum(ds.map((d) => ((M[v] || {})[d - 1] || 0)));   // 날 머리 줄 d = 어제(d − 1) 하루
  const Ns = col('N');
  const own = ds.map((d) => (R.O.own[d] || {})[v]).filter(Boolean), OC = R.O.ocols, OI = (k) => OC.indexOf(k);
  return {
    n: ds.length, N0: first[I('N')], N1: last[I('N')], Nmin: Math.min(...Ns), Nmax: Math.max(...Ns),
    secF: med(col('secF')), secFavg: sum(col('secF')) / ds.length, stockDays: med(ds.map((d) => rat(row(d)[I('stockEq')], row(d)[I('N')]))),
    need: sum(col('need')), prod: sum(col('prod')), eaten: sum(col('eaten')), short: sum(col('short')),
    fdDead: last[I('fdDead')] - first[I('fdDead')], fdDeadEnd: last[I('fdDead')], emig: last[I('emig')] - first[I('emig')], emigEnd: last[I('emig')],
    crisisDays: sum(col('crisis')), pFood: med(col('pFood')), cash: last[I('cash')],
    inF: pick(R.inF), outF: pick(R.outF), inN: pick(R.inN), outN: pick(R.outN), ownBuyN: pick(R.ownBuyN), launch: pick(R.ownLaunch),
    candDays: ds.filter((d) => row(d)[I('nCand')] > 0).length, foodCandDays: ds.filter((d) => row(d)[I('foodCand')] > 0).length,
    farmer: med(col('farmer')), forager: med(col('forager')), hunter: med(col('hunter')), miner: med(col('miner')), trading: sum(col('trading')) / ds.length,
    own: own.length ? {
      n: own.length, noCand: own.filter((o) => !(o[OI('nCand')] > 0)).length, noLeg: own.filter((o) => o[OI('nCand')] > 0 && o[OI('bestTot')] == null).length,
      gateFail: own.filter((o) => o[OI('bestTot')] != null && !o[OI('pass')]).length, pass: own.filter((o) => o[OI('pass')]).length,
      full: own.filter((o) => o[OI('trading')] >= o[OI('spareCap')]).length, fLeg: own.filter((o) => o[OI('fTot')] != null).length,
      bestTot: med(own.map((o) => o[OI('bestTot')])), gate: med(own.map((o) => o[OI('gate')])),
      topCand: (() => { const c = {}; for (const o of own) for (const t of String(o[OI('cands')] || '').split(' ').filter(Boolean)) { const r = t.split(':')[0]; c[r] = (c[r] || 0) + 1; } return Object.entries(c).sort((p, q) => q[1] - p[1]).slice(0, 4).map(([r, k]) => `${r} ${k}`).join(' · '); })(),
    } : null,
  };
}
const RUN = {}; for (const a of ARMS) for (const s of SSEEDS) { const R = load(`S${a}-${s}`); if (R) RUN[`S${a}-${s}`] = R; }   // 끔 판 = 관찰기 칸이 다 있는 판(같은 세계 — 칸만 더한 관찰기 판과 같은 줄 · 보고 §9)
for (const a of ARMS) for (const s of BSEEDS) { const R = load(`B${a}-${s}`); if (R) RUN[`B${a}-${s}`] = R; }
for (const a of ARMS) { const R = loadObj(rdf(path.join(LAB, `L${a}-0`, 'probe.json'))); if (R) RUN[`L${a}-0`] = R; }
const LABX = {}; for (const a of ARMS) for (const sd of [0, 1, 2]) { const R = loadObj(rdf(path.join(LAB, `L${a}-${sd}`, 'probe.json'))); if (R) LABX[`L${a}-${sd}`] = R; }   // 랩 난수열 셋(§6 랩 칸)

out('# T1384 표 — 먹을거리를 못 내는 마을은 왜 굶나\n');
out(`판 자리 \`${RUNS}\` · 판 ${Object.keys(RUN).filter((k) => RUN[k]).join(' · ')}\n`);

// ── §1 광산5 의 한 해(서버 1020 끔 · 30날 묶음) ──
function yearTable(key, label, step) {
  const R = RUN[key]; if (!R) return;
  step = step || 30; const top = R.days[R.days.length - 1];
  out(`## 1. 광산5 의 한 해 — ${label}(${step}날 묶음 · 식량 단위 = 사람 하루치)\n`);
  const HW = R.I('lumber') >= 0, vi = R.names.indexOf(K5);
  out('| 날 | 사람(처음 → 끝 · 최저) | 식량 안보(가운데) | 곳간(사람당 날치) | 필요 | 제 생산(필요비) | 먹음(필요비) | 모자람 | 들여옴(줄 · 양) | 그 가운데 제 귀로 짐 줄 | 내보냄(줄 · 양) | 굶어 죽음 | 떠남 | 위기 날 | 식량 값(가운데) | 제 캐러밴: 후보 있는 날 · 문 통과 날 · 낸 줄 | 농 · 채집 · 사냥 · 광부 |' + (HW ? ' 집(끝) · 집 문 날 · 나무꾼 · 곳간 목재 0 날 |' : ''));
  out('|---|---|---:|---:|---:|---|---|---:|---|---:|---|---:|---:|---:|---:|---|---|' + (HW ? '---|' : ''));
  for (let a = 1; a <= top; a += step) {
    const b = Math.min(a + step - 1, top), S = vsum(R, K5, a, b); if (!S) continue;
    out(`| ${a} ~ ${b} | ${S.N0} → ${S.N1} · ${S.Nmin} | ${f2(S.secF)} | ${f1(S.stockDays)} | ${f0(S.need)} | ${f0(S.prod)} (${f2(rat(S.prod, S.need))}) | ${f0(S.eaten)} (${f2(rat(S.eaten, S.need))}) | ${f0(S.short)} | ${f0(S.inN)} · ${f1(S.inF)} | ${f0(S.ownBuyN)} | ${f0(S.outN)} · ${f1(S.outF)} | ${S.fdDead} | ${S.emig} | ${S.crisisDays} | ${f1(S.pFood)} | ${S.own ? `${S.own.n - S.own.noCand} · ${S.own.pass}` : '—'} · ${f0(S.launch)} | ${f0(S.farmer)} · ${f0(S.forager)} · ${f0(S.hunter)} · ${f0(S.miner)} |` + (HW ? (() => { const ds = R.days.filter((d) => d >= a && d <= b && R.O.day[d] && R.O.day[d][vi]), row = (d) => R.O.day[d][vi], I = R.I; const l = row(ds[ds.length - 1]); return ` ${f1(l[I('housing')])} · ${ds.filter((d) => row(d)[I('gated')]).length} · ${f0(med(ds.map((d) => row(d)[I('lumber')])))} · ${ds.filter((d) => !(row(d)[I('wood')] > 0.5)).length} |`; })() : ''));
  }
  out('');
}
yearTable('SOFF-1020', '서버 1020 · 끔');
yearTable('SOFF-7', '서버 7 · 끔(광산5 가 굶는 판)');
yearTable('BOFF-1020', '몸 세계 1020 · 끔(100날)', 20);
if (ARMS.includes('KEEP')) yearTable('SKEEP-1020', '서버 1020 · 켬 ① 붙든다(광산5 가 큰 판)');
if (ARMS.includes('ROUTE')) yearTable('SROUTE-1020', '서버 1020 · 켬 ② 길 위를 센다');

// ── §2 광산 · 임업 마을 400날 — 시드마다 ──
out('## 2. 광산 · 임업 마을 — 판 전체(마을마다 · 식량 단위 = 사람 하루치)\n');
for (const key of Object.keys(RUN)) {
  const R = RUN[key]; if (!R) continue;
  const a = R.days[0], b = R.days[R.days.length - 1];
  out(`### ${key}(날 ${a} ~ ${b})\n`);
  out('| 마을 | 사람(처음 · 최저 · 끝) | 굶어 죽음 | 떠남 | 식량 안보(가운데) | 제 생산 ÷ 필요 | 들여옴 ÷ 필요(줄) | 내보냄 ÷ 필요(줄) | 모자람 ÷ 필요 | 위기 날 | 제 캐러밴 낸 줄 · 귀로 먹을 것 줄 | 후보 있는 날 · 먹을 것 후보 날 |');
  out('|---|---|---:|---:|---:|---:|---|---|---:|---:|---|---|');
  const rows = R.names.filter((n) => isMine(n) || isWood(n)).map((n) => [n, vsum(R, n, a, b)]).filter((x) => x[1]);
  for (const [n, S] of rows) out(`| ${n} | ${S.N0} · ${S.Nmin} · ${S.N1} | ${S.fdDead} | ${S.emig} | ${f2(S.secF)} | ${f2(rat(S.prod, S.need))} | ${f2(rat(S.inF, S.need))} (${f0(S.inN)}) | ${f2(rat(S.outF, S.need))} (${f0(S.outN)}) | ${f2(rat(S.short, S.need))} | ${S.crisisDays} | ${f0(S.launch)} · ${f0(S.ownBuyN)} | ${S.candDays} · ${S.foodCandDays} |`);
  // 갈래 합
  const by = {}; for (const n of R.names) { const S = vsum(R, n, a, b); if (!S) continue; const c = cls(n), o = by[c] || (by[c] = { v: 0, N0: 0, N1: 0, fd: 0, emig: 0, need: 0, prod: 0, inF: 0, outF: 0, short: 0 }); o.v++; o.N0 += S.N0; o.N1 += S.N1; o.fd += S.fdDead; o.emig += S.emig; o.need += S.need; o.prod += S.prod; o.inF += S.inF; o.outF += S.outF; o.short += S.short; }
  out('');
  out('| 갈래 | 마을 | 사람 처음 → 끝 | 굶어 죽음 | 떠남 | 제 생산 ÷ 필요 | 들여옴 ÷ 필요 | 내보냄 ÷ 필요 | 모자람 ÷ 필요 |');
  out('|---|---:|---|---:|---:|---:|---:|---:|---:|');
  for (const c of ['광산', '임업', '농촌', '어촌', '그 밖']) { const o = by[c]; if (!o) continue; out(`| ${c} | ${o.v} | ${f0(o.N0)} → ${f0(o.N1)} | ${f0(o.fd)} | ${f0(o.emig)} | ${f2(rat(o.prod, o.need))} | ${f2(rat(o.inF, o.need))} | ${f2(rat(o.outF, o.need))} | ${f2(rat(o.short, o.need))} |`); }
  out('');
}

// ── §3 막힌 문 셈 — 광산 마을 제 캐러밴(날 머리마다 · 위기 마을-날 / 다) ──
out('## 3. 제 캐러밴 문 — 광산 마을-날(관찰기 ④ · 그날 머리 곳간 · 값 캐시로 다시 셈)\n');
out('| 판 | 광산 마을-날 | 위기(흐름 EMA < 0) | 내보낼 후보 0 | 후보는 있는데 이익 다리 0 | 다리는 있는데 기회비용 문에서 막힘 | 낼 수 있음 | 교역 자리 참 | 위기 날 식량 있는 목적지 다리(P2) | 실제 낸 줄(장부) | 많은 후보 |');
out('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|');
for (const key of Object.keys(RUN)) {
  const R = RUN[key]; if (!R) continue; const OC = R.O.ocols, OI = (k) => OC.indexOf(k);
  let n = 0, cr = 0, nc = 0, nl = 0, gf = 0, ps = 0, fl = 0, fL = 0; const top = {};
  for (const d of Object.keys(R.O.own)) for (const [m, o] of Object.entries(R.O.own[d])) {
    n++; if (o[OI('crisis')]) cr++;
    if (!(o[OI('nCand')] > 0)) nc++; else if (o[OI('bestTot')] == null) nl++; else if (!o[OI('pass')]) gf++; else ps++;
    if (o[OI('trading')] >= o[OI('spareCap')]) fl++; if (o[OI('crisis')] && o[OI('fTot')] != null) fL++;
    for (const t of String(o[OI('cands')] || '').split(' ').filter(Boolean)) { const r = t.split(':')[0]; top[r] = (top[r] || 0) + 1; }
  }
  const launch = sum(R.names.filter(isMine).map((m) => sum(Object.values(R.ownLaunch[m] || {}))));
  out(`| ${key} | ${f0(n)} | ${f0(cr)} | ${f0(nc)} | ${f0(nl)} | ${f0(gf)} | ${f0(ps)} | ${f0(fl)} | ${f0(fL)} | ${f0(launch)} | ${Object.entries(top).sort((p, q) => q[1] - p[1]).slice(0, 5).map(([r, k]) => `${r} ${k}`).join(' · ')} |`);
}
out('');

// ── §4 파는 쪽 문 — 광산5 (10날 꾸러미마다) ──
out('## 4. 파는 쪽 문 — 광산5 로 먹을 것을 팔 수 있는 마을(10날 꾸러미 · 관찰기 ⑤)\n');
out('| 판 | 꾸러미 | 먹을 것 후보 있는 마을(꾸러미 평균) | 그 가운데 광산5 가 가까운 20 안 | 정보 거리 안 | 광산5 다리 이익 > 0 | 광산5 가 그 마을의 가장 좋은 다리 | 광산5 다리 ÷ 가장 좋은 다리(가운데) | 가까운 20 안 마을의 거리(가운데) |');
out('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const key of Object.keys(RUN)) {
  const R = RUN[key]; if (!R || !R.O.sell) continue;
  const SC = R.O.scols, SI = (k) => SC.indexOf(k), ds = Object.keys(R.O.sell).filter((d) => R.O.sell[d][K5]);
  let s = 0, inN = 0, inR = 0, pos = 0, best = 0; const ratios = [], dists = [];
  for (const d of ds) for (const x of R.O.sell[d][K5]) {
    s++; if (x[SI('inNear')]) { inN++; dists.push(x[SI('dist')]); } if (x[SI('inRange')]) inR++;
    if (x[SI('fTot')] > 0) pos++; if (x[SI('bestTo')] === K5) best++;
    if (x[SI('inNear')] && x[SI('fTot')] != null && x[SI('bestTot')] > 0) ratios.push(x[SI('fTot')] / x[SI('bestTot')]);
  }
  const k = ds.length || 1;
  out(`| ${key} | ${ds.length} | ${f1(s / k)} | ${f1(inN / k)} | ${f1(inR / k)} | ${f1(pos / k)} | ${f1(best / k)} | ${f2(med(ratios))} | ${f0(med(dists))} |`);
}
out('');

// ── §5 집 · 나무 — 광산 · 임업 마을(끔 판 · 관찰기 칸 집 · 집 문 · 나무꾼 · 곳간 목재 · 땔감 충당) ──
out('## 5. 집 · 나무 — 광산 · 임업 마을이 왜 안 크나(끔 판 · 날 머리 줄)\n');
out('| 판 | 마을 | 사람 끝(집 끝) | 집 문에 막힌 날 % | K > 1.2 × 사람 날 % | 나무꾼(가운데 · 끝) | 곳간 목재 0 날 % | 땔감 충당(가운데) | 곳간 날치(가운데) | 사냥꾼 ÷ 사람(가운데) |');
out('|---|---|---|---:|---:|---|---:|---:|---:|---:|');
for (const key of Object.keys(RUN).filter((k) => /^(S|B)OFF-/.test(k))) {
  const R = RUN[key]; if (!R || R.I('lumber') < 0) continue;
  const I = R.I;
  for (const n of R.names.filter((x) => isMine(x) || isWood(x))) {
    const vi = R.names.indexOf(n), ds = R.days.filter((d) => d >= 30 && R.O.day[d] && R.O.day[d][vi] && R.O.day[d][vi][I('N')] > 0);
    if (!ds.length) continue;
    const row = (d) => R.O.day[d][vi], last = row(R.days[R.days.length - 1]) || row(ds[ds.length - 1]);
    const pct = (f) => 100 * ds.filter(f).length / ds.length;
    out(`| ${key} | ${n} | ${last[I('N')]} (${f0(last[I('housing')])}) | ${pct((d) => row(d)[I('gated')]).toFixed(0)} | ${pct((d) => row(d)[I('K')] > 1.2 * row(d)[I('N')]).toFixed(0)} | ${f0(med(ds.map((d) => row(d)[I('lumber')])))} · ${last[I('lumber')]} | ${pct((d) => !(row(d)[I('wood')] > 0.5)).toFixed(0)} | ${f2(med(ds.map((d) => row(d)[I('fuelCov')])))} | ${f1(med(ds.map((d) => row(d)[I('stockEq')] / row(d)[I('N')])))} | ${f2(med(ds.map((d) => row(d)[I('hunter')] / row(d)[I('N')])))} |`);
  }
}
out('');

// ── §6 판 — 끔 대 켬(서버 자 400날 · 시드마다) · T1347 (가) 위 끝과 나란히 ──
const GA = { 1020: { m5: 144, bz: 25.22, bzx: 1.95, m5bz: 1.44, fd: 76, fdOff: 194, cu: '0', fed: 52606 }, 7: { m5: 137, bz: 24.64, bzx: 1.29, m5bz: 7.46, fd: 251, fdOff: 293, cu: '3 · 5.9', fed: 49280 }, 42: { m5: 144, bz: 27.15, bzx: 1.45, m5bz: 16.29, fd: 244, fdOff: 153, cu: '3 · 8.4', fed: 60576 } };
function judgeRun(key) {
  const R = RUN[key]; if (!R) return null;
  const I = R.I, dl = R.days[R.days.length - 1], L = R.O.day[dl];
  const N = (n) => { const r = L[R.names.indexOf(n)]; return r ? r[I('N')] : 0; };
  const fd = (n) => { const r = L[R.names.indexOf(n)]; return r ? r[I('fdDead')] : 0; };
  const vi5 = R.names.indexOf(K5), n5 = R.days.filter((d) => d >= 30).map((d) => (R.O.day[d][vi5] || [])[I('N')]).filter((x) => x != null);
  const legs = R.O.legs || [];
  const foodEq = sum(legs.map((l) => (l[5] || 0) + (l[8] || 0)));
  const cu5 = legs.filter((l) => (l[2] === K5 && l[3] === 'copper') || (l[1] === K5 && l[6] === 'copper'));
  const B = rd(key, 't1344'); let bz = null, bz5 = null;
  if (B && B.day) { const k = Object.keys(B.day).map(Number).sort((a, b) => a - b).pop(), D = B.day[k], AI = B.acols.indexOf('bronzeW'); bz = sum(Object.values(D).map((r) => r[AI] || 0)); bz5 = D[K5] ? D[K5][AI] : 0; }
  return { R, dl, m5: N(K5), m5min: n5.length ? Math.min(...n5) : null, mineFd: sum(R.names.filter(isMine).map(fd)), worldFd: sum(R.names.map(fd)), pop: sum(R.names.map(N)), empty: R.names.filter((n) => !(N(n) > 0)).length,
    foodEq, foodLegs: legs.filter((l) => (l[5] || 0) + (l[8] || 0) > 0).length, cu5: `${cu5.length} · ${f1(sum(cu5.map((l) => l[2] === K5 ? l[4] : l[7])))}`, bz, bz5, N, fd };
}
out('## 6. 판 — 끔 대 켬(서버 자 400날) · T1347 (가) 위 끝(식량을 그 자리에서 사람 × 60일치까지 채운 판 — 옛 베이스 `7c6e9466a`)과 나란히\n');
out('| 시드 · 팔 | 광산5 사람 끝 · 최저(날 30 뒤) | 광산 굶어 죽음 | 세계 굶어 죽음 | 빈 마을 | 세계 사람 | 식량 교역량(짐 줄 · 식량 환산) | 청동 세계 · 광산5 | 광산5 로 간 구리 짐(줄 · 양) | 파는 마을 최악(굶어 죽음 더 는 마을 · 사람 비 최소) |');
out('|---|---|---:|---:|---:|---:|---|---|---|---|');
for (const s of SSEEDS) {
  const off = judgeRun(`SOFF-${s}`);
  for (const a of ARMS) {
    const J = judgeRun(`S${a}-${s}`); if (!J) continue;
    let worst = '—';
    if (off && a !== 'OFF') {
      let wFd = null, wN = null, n20 = 0;
      for (const n of J.R.names) { const dF = J.fd(n) - off.fd(n), r = off.N(n) > 0 ? J.N(n) / off.N(n) : null; if (dF > 20) n20++; if (!wFd || dF > wFd[1]) wFd = [n, dF]; if (r != null && (!wN || r < wN[1])) wN = [n, r]; }
      worst = `${wFd ? `${wFd[0]} ${wFd[1] >= 0 ? '+' : ''}${wFd[1]}` : '—'} · ${wN ? `${wN[0]} ${f2(wN[1])}` : '—'} · 굶어 죽음 +20 넘는 마을 ${n20}`;
    }
    const rr = (x, y) => (off && a !== 'OFF' && y > 0 ? ` (×${f2(x / y)})` : '');
    out(`| ${s} · ${ANAME[a] || a} | ${J.m5} · ${J.m5min} | ${J.mineFd} | ${J.worldFd} | ${J.empty} | ${f0(J.pop)}${rr(J.pop, off && off.pop)} | ${f0(J.foodLegs)} · ${f0(J.foodEq)}${rr(J.foodEq, off && off.foodEq)} | ${f1(J.bz)}${rr(J.bz, off && off.bz)} · ${f2(J.bz5)} | ${J.cu5} | ${worst} |`);
  }
  const g = GA[s]; if (g) out(`| ${s} · T1347 (가) 위 끝 | ${g.m5} · — | — | ${g.fd} (끔 ${g.fdOff}) | — | (끔비 1.00 ~ 1.05) | — | ${g.bz} (×${g.bzx}) · ${g.m5bz} | ${g.cu} | 먹인 식량 ${f0(g.fed)} |`);
}
out('');

// §6 랩 칸 — 난수열 0 · 1 · 2(랩 100날 · 51 곳)
{
  const keys = Object.keys(LABX);
  if (keys.length) {
    out('### 랩 100날 — 난수열 0 · 1 · 2(끝 날)\n');
    out('| 팔 | 세계 사람(난수열마다) | 광산 7 곳 사람 | 임업 6 곳 | 농촌 22 곳 | 어촌 16 곳 | 광산5 사람 | 굶어 죽음 | 먹을 것 짐(줄 · 식량 환산) |');
    out('|---|---|---|---|---|---|---|---|---|');
    for (const a of ARMS) {
      const rs = [0, 1, 2].map((sd) => LABX[`L${a}-${sd}`]).filter(Boolean); if (!rs.length) continue;
      const cell = (f) => rs.map(f).map((x) => f0(x)).join(' · ');
      const endRow = (R) => R.O.day[R.days[R.days.length - 1]];
      const tot = (R, pred) => { const L = endRow(R), I = R.I; return sum(R.names.map((n, vi) => (pred(n) && L[vi] ? L[vi][I('N')] : 0))); };
      const fdT = (R) => { const L = endRow(R), I = R.I; return sum(R.names.map((n, vi) => (L[vi] ? L[vi][I('fdDead')] : 0))); };
      const fl = (R) => (R.O.legs || []).filter((l) => (l[5] || 0) + (l[8] || 0) > 0);
      out(`| ${ANAME[a] || a} | ${cell((R) => tot(R, () => true))} | ${cell((R) => tot(R, isMine))} | ${cell((R) => tot(R, isWood))} | ${cell((R) => tot(R, (n) => /^농촌/.test(n)))} | ${cell((R) => tot(R, (n) => /^어촌/.test(n)))} | ${cell((R) => tot(R, (n) => n === K5))} | ${cell(fdT)} | ${rs.map((R) => `${f0(fl(R).length)} · ${f0(sum(fl(R).map((l) => (l[5] || 0) + (l[8] || 0))))}`).join(' / ')} |`);
    }
    out('');
  }
}

// ── §7 같은 날 몰림 — 먹을 것 짐이 같은 날 같은 마을로(② 가 보는 자리) ──
out('## 7. 같은 날 몰림 — 먹을 것 짐(서버 자 · 판 전체)\n');
out('| 판 | 먹을 것 짐 줄 | 같은 날 같은 마을로 간 짐(다른 짐과 겹친) | 한 마을 하루 최대 짐 | 값 천장(≥ 500) 마을로 간 짐 · 그 가운데 겹친 | 광산5 로 간 먹을 것 짐(줄 · 식량 환산) |');
out('|---|---:|---:|---:|---|---|');
for (const key of Object.keys(RUN).filter((k) => /^S/.test(k))) {
  const R = RUN[key], I = R.I, legs = (R.O.legs || []).filter((l) => l[5] > 0);
  const sd = {}; for (const l of legs) { const k = l[0] + '>' + l[2]; sd[k] = (sd[k] || 0) + 1; }
  const multi = legs.filter((l) => sd[l[0] + '>' + l[2]] > 1).length;
  const pf = (d, v) => { const D = R.O.day[d + 1] || R.O.day[d]; const r = D && D[R.names.indexOf(v)]; return r ? r[I('pFood')] : null; };
  const cap = legs.filter((l) => pf(l[0], l[2]) >= 500), capM = cap.filter((l) => sd[l[0] + '>' + l[2]] > 1).length;
  const to5 = legs.filter((l) => l[2] === K5);
  out(`| ${key} | ${f0(legs.length)} | ${f0(multi)} (${pc(rat(multi, legs.length))}) | ${Math.max(0, ...Object.values(sd))} | ${f0(cap.length)} · ${f0(capM)} | ${to5.length} · ${f0(sum(to5.map((l) => l[5])))} |`);
}
out('');

// ── §8 지나가는 먹을 것 — 굶는 날 광산 마을이 내보낸 먹을 것(① 이 보는 자리) ──
out('## 8. 지나가는 먹을 것 — 광산 마을이 굶는 날(흐름 EMA < 0) 내보낸 먹을 것 ÷ 그날 필요(서버 자 · 판 전체)\n');
out('| 판 | 광산1 | 광산2 | 광산3 | 광산4 | 광산5 | 광산6 | 광산7 | 광산 곳간 날치(가운데 · 굶는 날) |');
out('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const key of Object.keys(RUN).filter((k) => /^S/.test(k))) {
  const R = RUN[key], I = R.I, cells = [], sdays = [];
  for (const m of R.names.filter(isMine)) {
    const vi = R.names.indexOf(m); let need = 0, outF = 0;
    for (const d of R.days) { const r = R.O.day[d][vi]; if (!r || !r[I('crisis')]) continue; need += r[I('need')] || 0; outF += ((R.outF[m] || {})[d - 1] || 0); if (r[I('N')] > 0) sdays.push(r[I('stockEq')] / r[I('N')]); }
    cells.push(need > 0 ? pc(outF / need) : '—');
  }
  out(`| ${key} | ${cells.join(' | ')} | ${f1(med(sdays))} |`);
}
out('');
