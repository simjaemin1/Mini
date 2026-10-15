#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T743 표 기계 · 관찰자 JSON 만 읽는다 · 세계를 안 세운다)
// === scripts/t743-job-table.js — 나무꾼이 왜 주나: 끔(`T733_FELL_LOOT=0`) ↔ 켬(기본) 직업 판단 표 ==========
//   쓰는 법:
//     node scripts/t743-job-table.js detail <끔 .t743.json> <켬 .t743.json> [--json out.json]
//       — 한 시드: 기간(1~100 · 101~200 · 201~300 · 301~400)마다 나무꾼 · 인구 · 통나무 값(직업 판단이 쓰는 자른 값) · 곳간 통나무 · 잔가지 ·
//         식량 날 · 기근 문(식량 < 30일) 마을·날 · 주거 안전망 통나무 문(곳간 < 2N) 마을·날 · 판단(필요 직업 = 나무꾼 · 전환 · 보류) ·
//         나무꾼 수 변화의 갈래(전환 들어옴 · 전환 나감 · 태어남 · 죽음 · 그 밖) · 두 팔이 처음 갈린 날 · 100일 앞뒤 마을 표
//     node scripts/t743-job-table.js timeline <끔 .t743.json> <켬 .t743.json> [창 날 20] — 날 창마다 끔 → 켬(어느 수가 먼저 갈리나)
//     node scripts/t743-job-table.js seeds --off <폴더>:<태그> --on <폴더>:<태그> [--seeds 1020,7,...] [--extra <시드>=<끔 파일>,<켬 파일>] [--json out.json]
//       — 시드마다 켬 ↔ 끔 Δ% · 15시드 규약(T256 — 부호 ≥ 80% · |평균| > 폭/2) · 3시드 규약(T252) — 규약 함수는 `t17-seeds.js` 소스에서 그대로 읽는다(사본 0)
//   ★값 — 관찰자는 econ 이 그날 `world.priceFn` 을 부른 결과를 받아 적었다(값 함수를 다시 안 부른다). 직업 판단은 그 값을 [0.05, 200] 으로 잘라 쓴다(`w(r)`).
//   ★직업 점수의 항(econ `pickDeficitJob_rational` · `opportunityCost` 의 식 그대로 — 땅 칸 × 산출 계수 × 자른 값):
//     한계 후보(식량 30일 넘는 날만 닿는다) — 나무꾼 = 숲 × 0.3 × 100 × w(통나무) · 농부 = 비옥 × 0.4 × 100 × w(식량)
//     전환에서 빠질 사람(기회비용 가장 낮은 몸) — 나무꾼 = 숲 × 0.3 × w(통나무) · 농부 = 비옥 × 0.4 × w(식량)(숙련 배수 1 로 본다)
'use strict';
const path = require('path');
const fs = require('fs');
const argv = process.argv.slice(2);
const MODE = argv[0];
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const JOUT = opt('--json', '');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'sim', 'economy-sim.js'), 'utf8');
//   직업 판단 식의 수 — econ 정본 소스에서 읽는다(표 기계에 사본 0)
const PICK = SRC.slice(SRC.indexOf('function pickDeficitJob_rational('), SRC.indexOf('function autoSwitchJob('));   // 직업 판단(합리) · 전환 몸통 앞까지
const num = (re, src) => { const m = (src || SRC).match(re); if (!m) throw new Error('식을 못 읽었다: ' + re); return +m[1]; };
const K = {
  ljGain: num(/candidates\.push\(\['lumberjack', v\.land\.wood \* ([\d.]+) \* period \* w\('wood'\)\]\)/),
  fmGain: num(/const farmerGain = v\.land\.fertility \* ([\d.]+) \* period/),
  period: num(/const period = (\d+);\s+\/\/ 평가 윈도우/),
  ljCost: num(/case 'lumberjack':\s+return \(L\.wood \|\| 0\) \* ([\d.]+) \* w\('wood'\) \* sk;/),
  fmCost: num(/case 'farmer':\s+return \(L\.fertility \|\| 0\) \* ([\d.]+) \* w\('food'\) \* sk;/),
  wLo: num(/const w = priceTbl \? \(r => Math\.max\(([\d.]+), Math\.min\(\d+, /), wHi: num(/const w = priceTbl \? \(r => Math\.max\([\d.]+, Math\.min\((\d+), /),
  famine: num(/if \(foodEquiv < N \* (\d+)\) \{/, PICK), houseWood: num(/\(v\.storage\.wood \|\| 0\) < N \* (\d+)\)\s*\n?\s*\|\| \(woodEarlyOn\(\)/, PICK),
};
const wc = (p) => (Number.isFinite(p) ? Math.max(K.wLo, Math.min(K.wHi, p)) : NaN);
//   시드 규약 — `t17-seeds.js` 의 두 함수를 소스 그대로 읽어 쓴다
const T17S = fs.readFileSync(path.join(__dirname, 't17-seeds.js'), 'utf8');
const fnSrc = (nm) => (T17S.match(new RegExp('function ' + nm + '\\(ds\\) \\{[\\s\\S]*?\\n\\}')) || [''])[0];
// eslint-disable-next-line no-new-func
const RULES = new Function(fnSrc('ruleT252') + '\n' + fnSrc('ruleSeed10') + '\nreturn { ruleT252, ruleSeed10 };')();
const PER = [[1, 100], [101, 200], [201, 300], [301, 400]];
const FOOD = new Set(['farmer', 'fisher', 'hunter', 'forager']);   // 기근 문 안 판단이 고르는 넷(econ `foodOpts` — 아래 소스 확인)
{ const fo = (PICK.match(/const foodOpts = \[([\s\S]*?)\]\.filter/) || ['', ''])[1]; const got = [...fo.matchAll(/\['(\w+)',/g)].map((m) => m[1]).sort().join();
  if (got !== [...FOOD].sort().join()) throw new Error('기근 문 식량 넷이 econ 소스와 다르다: ' + got); }
const f = (x, d = 1) => (Number.isFinite(x) ? (Math.abs(x) >= 10000 ? Math.round(x).toLocaleString('en-US') : x.toFixed(d)) : '—');
const pct = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? 100 * (a - b) / Math.abs(b) : NaN);

function load(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

//   한 팔 — 기간마다
function arm(pr) {
  const D = pr.days, V = pr.v, L = pr.land || [];
  const out = [];
  for (const [a, b] of PER) {
    const ks = []; for (let k = 0; k < D.length; k++) if (D[k] >= a && D[k] <= b) ks.push(k);
    if (!ks.length) { out.push(null); continue; }
    let lj = 0, pop = 0, wd = 0, tw = 0, nd = ks.length;
    let pwA = 0, pwN = 0, fdA = 0, fdN = 0, fam = 0, low = 0, vdN = 0, fcA = 0, fcN = 0, ceA = 0, woA = 0;
    let ljG = 0, fmG = 0, gWin = 0, gN = 0, cLo = 0, cN = 0;
    let need = 0, inn = 0, hold = 0, sw = 0, swOther = 0;
    const dec = { in: 0, out: 0, born: 0, died: 0, other: 0 };
    let ct = 0;
    //   판단 날(econ 이 그날 직업 판단을 남긴 마을·날) — 기근 문 안 몫 · 필요 직업 갈래(식량 넷 · 나무꾼 · 그 밖) · 기근 밖 판단의 나무꾼 ·
    //   새 몸(그날 전환이 없는 마을·날의 직업 수 증가) — 나무꾼 · 식량 넷 · 그 밖 · 기근 문 안 마을에서 난 몫
    const J = { d: 0, fam: 0, food: 0, lj: 0, oth: 0, nf: 0, nfLj: 0, bLj: 0, bFood: 0, bOth: 0, b: 0, bFam: 0 };
    for (const k of ks) {
      for (let i = 0; i < V.length; i++) {
        const S = V[i], n = S.n[k] || 0, l = S.lumberjack[k] || 0;
        lj += l; pop += n; wd += S.wd[k] || 0; tw += S.tw[k] || 0; ceA += S.ce[k] || 0; woA += S.wo[k] || 0; ct += S.ct[k] || 0;
        if (n > 0) {
          vdN++;
          if (Number.isFinite(S.fd[k])) { fdA += S.fd[k]; fdN++; if (S.fd[k] < K.famine) fam++; }
          if ((S.wd[k] || 0) < K.houseWood * n) low++;
          if (Number.isFinite(S.fc[k])) { fcA += Math.min(1, S.fc[k]); fcN++; }
        }
        const pw = wc(S.pw[k]), pf = wc(S.pf[k]), Li = L[i] || {};
        if (Number.isFinite(pw)) {
          pwA += pw; pwN++;
          if (Number.isFinite(pf)) {
            const g1 = (Li.wood || 0) * K.ljGain * K.period * pw, g2 = (Li.fertility || 0) * K.fmGain * K.period * pf;
            ljG += g1; fmG += g2; gN++; if (g1 > g2) gWin++;
            const c1 = (Li.wood || 0) * K.ljCost * pw, c2 = (Li.fertility || 0) * K.fmCost * pf;
            cN++; if (c1 < c2) cLo++;
          }
        }
        const s = S.sw[k];
        if (s && s !== 0 && s[0]) {
          const fam = Number.isFinite(S.fd[k]) && S.fd[k] < K.famine;
          J.d++; if (fam) J.fam++; else J.nf++;
          if (FOOD.has(s[0])) J.food++; else if (s[0] === 'lumberjack') { J.lj++; if (!fam) J.nfLj++; } else J.oth++;
        }
        if (k > 0 && D[k - 1] === D[k] - 1 && !(s && s !== 0 && s[1] && !String(s[1]).startsWith('hold'))) {
          const dn = n - (S.n[k - 1] || 0);
          if (dn > 0) {
            J.b += dn; if (Number.isFinite(S.fd[k - 1]) && S.fd[k - 1] < K.famine) J.bFam += dn;
            for (const j of pr.jobs) { const dj = (S[j][k] || 0) - (S[j][k - 1] || 0); if (dj > 0) { if (j === 'lumberjack') J.bLj += dj; else if (FOOD.has(j)) J.bFood += dj; else J.bOth += dj; } }
          }
        }
        if (s && s !== 0) {
          if (s[0] === 'lumberjack') { need++; if (s[1] === 'lumberjack') inn++; else if (s[1] && String(s[1]).startsWith('hold')) hold++; }
          if (s[1] && !String(s[1]).startsWith('hold')) { sw++; if (s[1] !== 'lumberjack') swOther++; }
        }
        //   나무꾼 수 변화의 갈래(그날 하나의 일로 본다 — 같은 날 둘이면 "그 밖")
        if (k > 0 && D[k - 1] === D[k] - 1) {
          let dl = l - (S.lumberjack[k - 1] || 0); const dn = n - (S.n[k - 1] || 0);
          if (!dl) continue;
          if (s && s[1] === 'lumberjack' && dl > 0) { dec.in++; dl--; }
          if (dl < 0 && dn === 0 && s && s[1] && s[1] !== 'lumberjack' && !String(s[1]).startsWith('hold')) { dec.out++; dl++; }
          if (dl > 0 && dn > 0) { const x = Math.min(dl, dn); dec.born += x; dl -= x; }
          if (dl < 0 && dn < 0) { const x = Math.min(-dl, -dn); dec.died += x; dl += x; }
          dec.other += Math.abs(dl);
        }
      }
    }
    out.push({ a, b, lj: lj / nd, pop: pop / nd, share: pop ? lj / pop : NaN, pw: pwN ? pwA / pwN : NaN, pwN, wdPc: pop ? wd / pop : NaN, wd: wd / nd, tw: tw / nd,
      fd: fdN ? fdA / fdN : NaN, fam: vdN ? fam / vdN : NaN, low: vdN ? low / vdN : NaN, fc: fcN ? fcA / fcN : NaN, ce: ceA / nd, wo: woA / nd, ct,
      ljG: gN ? ljG / gN : NaN, fmG: gN ? fmG / gN : NaN, gWin: gN ? gWin / gN : NaN, cLo: cN ? cLo / cN : NaN, need, inn, hold, sw, swOther, dec, J });
  }
  return out;
}
function firstSplit(p0, p1) {
  const n = Math.min(p0.days.length, p1.days.length);
  let lj = -1, any = -1;
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < p0.v.length; i++) {
      const a = p0.v[i], b = p1.v[i];
      if (any < 0 && (a.n[k] !== b.n[k] || a.wd[k] !== b.wd[k] || a.tw[k] !== b.tw[k])) any = p0.days[k];
      if (lj < 0 && a.lumberjack[k] !== b.lumberjack[k]) lj = p0.days[k];
    }
    if (lj >= 0 && any >= 0) break;
  }
  return { any, lj };
}
//   마을 표 — 기간 101~200 나무꾼 평균이 가장 많이 준 마을
function villages(p0, p1, a, b, top) {
  const ks = []; for (let k = 0; k < p0.days.length; k++) if (p0.days[k] >= a && p0.days[k] <= b) ks.push(k);
  const rows = [];
  for (let i = 0; i < p0.v.length; i++) {
    const m = (S, key, fn) => { let s = 0, c = 0; for (const k of ks) { const x = fn ? fn(S, k) : S[key][k]; if (Number.isFinite(x)) { s += x; c++; } } return c ? s / c : NaN; };
    const A = p0.v[i], B = p1.v[i];
    rows.push({ name: p0.names[i], wood: (p0.land[i] || {}).wood, fert: (p0.land[i] || {}).fertility,
      lj0: m(A, 'lumberjack'), lj1: m(B, 'lumberjack'), n0: m(A, 'n'), n1: m(B, 'n'), pw0: m(A, null, (S, k) => wc(S.pw[k])), pw1: m(B, null, (S, k) => wc(S.pw[k])),
      wd0: m(A, 'wd'), wd1: m(B, 'wd'), tw1: m(B, 'tw'), fd0: m(A, 'fd'), fd1: m(B, 'fd') });
  }
  rows.sort((x, y) => (x.lj1 - x.lj0) - (y.lj1 - y.lj0));
  return rows.slice(0, top);
}

if (MODE === 'detail') {
  const p0 = load(argv[1]), p1 = load(argv[2]);
  const A0 = arm(p0), A1 = arm(p1), sp = firstSplit(p0, p1);
  console.log(`\n=== 나무꾼이 왜 주나 — 끔(${p0.knobs.T733_FELL_LOOT}) ↔ 켬(${p1.knobs.T733_FELL_LOOT || '기본'}) · 마을 ${p0.names.length} · 날 ${p0.days[0]}~${p0.days[p0.days.length - 1]} ===`);
  console.log(`  값 감싸기 ${p0.priceWrapped}/${p1.priceWrapped} · 두 팔이 처음 갈린 날: 마을 칸 ${sp.any} · 나무꾼 수 ${sp.lj}`);
  console.log(`  식(econ 소스): 한계 나무꾼 = 숲×${K.ljGain}×${K.period}×w(통나무) · 농부 = 비옥×${K.fmGain}×${K.period}×w(식량) · 기회비용 나무꾼 = 숲×${K.ljCost}×w · 농부 = 비옥×${K.fmCost}×w · w ∈ [${K.wLo}, ${K.wHi}] · 기근 문 식량 < ${K.famine}일 · 주거 안전망 곳간 통나무 < ${K.houseWood}N`);
  const rows = [
    ['lj', '나무꾼(마을 합 · 날 평균)', 1], ['pop', '인구', 0], ['share', '나무꾼 몫', 4], ['pw', 'w(통나무) — 그날 직업 판단이 쓴 값(마을·날)', 3], ['pwN', '  값 본 마을·날', 0],
    ['wd', '곳간 통나무(합)', 0], ['wdPc', '곳간 통나무 / 사람', 2], ['tw', '곳간 잔가지(합)', 2], ['ce', '통나무 소비 흐름 `_consEMA.wood`(합)', 1], ['wo', '수식 통나무 몫 `_woodOutLast`(합)', 1],
    ['fd', '식량 날(마을·날)', 1], ['fam', '기근 문 안 마을·날 몫(식량 < 30일)', 3], ['low', '주거 안전망 통나무 문(곳간 < 2N) 마을·날 몫', 3], ['fc', '땔감 충당률', 3],
    ['ljG', '한계 나무꾼 항(값 본 날)', 1], ['fmG', '한계 농부 항', 1], ['gWin', '나무꾼 항 > 농부 항 몫', 3], ['cLo', '기회비용 나무꾼 < 농부 몫(전환에서 먼저 빠진다)', 3],
    ['need', '판단 "나무꾼이 필요" 번', 0], ['inn', '  → 나무꾼으로 전환', 0], ['hold', '  → 보류(값 차익 문)', 0], ['swOther', '다른 직업으로 전환', 0], ['ct', '헤드리스 벤 그루', 0],
  ];
  const H = ['| 기간 · 끔 → 켬 | ' + PER.map(([a, b]) => `${a}~${b}`).join(' | ') + ' |', '|---|' + PER.map(() => '---').join('|') + '|'];
  for (const [k, nm, d] of rows) H.push(`| ${nm} | ` + PER.map((_, j) => { const x = A0[j], y = A1[j]; if (!x || !y) return '—'; const dp = pct(y[k], x[k]); return `${f(x[k], d)} → ${f(y[k], d)}${Number.isFinite(dp) && Math.abs(dp) >= 0.05 && !['need', 'inn', 'hold', 'swOther', 'pwN', 'ct'].includes(k) ? ` (${dp >= 0 ? '+' : ''}${dp.toFixed(1)}%)` : ''}`; }).join(' | ') + ' |');
  const JR = [['d', '판단 날(마을·날)'], ['fam', '  그중 기근 문 안(식량 넷만 · 값 안 봄)'], ['food', '  필요 = 식량 넷'], ['lj', '  필요 = 나무꾼'], ['nfLj', '  기근 밖 판단에서 필요 = 나무꾼'], ['nf', '  기근 밖 판단 날'],
    ['b', '새 몸(전환 없는 마을·날)'], ['bFam', '  그중 기근 문 안 마을'], ['bLj', '  새 몸 나무꾼'], ['bFood', '  새 몸 식량 넷'], ['bOth', '  새 몸 그 밖']];
  for (const [k, nm] of JR) H.push(`| ${nm} | ` + PER.map((_, j) => { const x = A0[j], y = A1[j]; return x && y ? `${x.J[k]} → ${y.J[k]}` : '—'; }).join(' | ') + ' |');
  for (const key of ['in', 'out', 'born', 'died', 'other']) {
    const nm = { in: '나무꾼 +: 전환 들어옴', out: '나무꾼 −: 전환 나감', born: '나무꾼 +: 태어남(새 몸 직업)', died: '나무꾼 −: 죽음', other: '그 밖(같은 날 겹침 · 안전망)' }[key];
    H.push(`| ${nm} | ` + PER.map((_, j) => { const x = A0[j], y = A1[j]; return x && y ? `${x.dec[key]} → ${y.dec[key]}` : '—'; }).join(' | ') + ' |');
  }
  console.log(H.join('\n'));
  const vt = villages(p0, p1, 101, 200, 8);
  console.log('\n101~200일 나무꾼이 가장 많이 준 마을(끔 → 켬 · 기간 평균):');
  console.log('| 마을 | 숲 · 비옥 | 나무꾼 | 인구 | w(통나무) | 곳간 통나무 | 켬 잔가지 | 식량 날 |\n|---|---|---|---|---|---|---|---|');
  for (const r of vt) console.log(`| ${r.name} | ${f(r.wood, 2)} · ${f(r.fert, 2)} | ${f(r.lj0, 2)} → ${f(r.lj1, 2)} | ${f(r.n0, 1)} → ${f(r.n1, 1)} | ${f(r.pw0, 3)} → ${f(r.pw1, 3)} | ${f(r.wd0, 1)} → ${f(r.wd1, 1)} | ${f(r.tw1, 3)} | ${f(r.fd0, 1)} → ${f(r.fd1, 1)} |`);
  if (JOUT) fs.writeFileSync(JOUT, JSON.stringify({ K, split: sp, off: A0, on: A1, villages: vt }, null, 1));
} else if (MODE === 'seeds') {
  const [d0, t0] = String(opt('--off', '')).split(':'), [d1, t1] = String(opt('--on', '')).split(':');
  const SEEDS = String(opt('--seeds', '1020,7,42,1,2,3,4,5,6,8,9,10,11,12,13')).split(',').map(Number);
  const extra = {}; for (let i = 0; i < argv.length; i++) if (argv[i] === '--extra') { const [s, fl] = argv[i + 1].split('='); extra[+s] = fl.split(','); }
  const per = [];
  for (const s of SEEDS) {
    const f0 = extra[s] ? extra[s][0] : path.join(d0, `${t0}-${s}.json.t743.json`), f1 = extra[s] ? extra[s][1] : path.join(d1, `${t1}-${s}.json.t743.json`);
    if (!fs.existsSync(f0) || !fs.existsSync(f1)) { console.log(`  시드 ${s}: 판 없음(${fs.existsSync(f0) ? '' : '끔 '}${fs.existsSync(f1) ? '' : '켬'})`); continue; }
    const p0 = load(f0), p1 = load(f1), A0 = arm(p0), A1 = arm(p1);
    const mean = (A, k, js) => js.reduce((a, j) => a + (A[j] ? A[j][k] : 0), 0) / js.length;
    //   해 질 녘 정산 나섬(`_t720C.go` 마을 합 · 관찰자가 이 칸을 적기 시작한 판만) — T650 W 자에서 몸이 통나무를 들고 곳간에 간 번
    const dusk = (p) => (p.t720C ? Object.values(p.t720C).reduce((a, c) => a + (c.go || 0), 0) : null);
    const r = { seed: s, split: firstSplit(p0, p1), dusk0: dusk(p0), dusk1: dusk(p1) };
    for (const [nm, js] of [['p1', [0]], ['p2', [1]], ['p3', [2]], ['p4', [3]], ['p24', [1, 2, 3]]]) {
      r[nm] = { lj0: mean(A0, 'lj', js), lj1: mean(A1, 'lj', js), pop0: mean(A0, 'pop', js), pop1: mean(A1, 'pop', js), pw0: mean(A0, 'pw', js), pw1: mean(A1, 'pw', js),
        wd0: mean(A0, 'wdPc', js), wd1: mean(A1, 'wdPc', js), low0: mean(A0, 'low', js), low1: mean(A1, 'low', js), fc0: mean(A0, 'fc', js), fc1: mean(A1, 'fc', js),
        sh0: mean(A0, 'share', js), sh1: mean(A1, 'share', js), fam0: mean(A0, 'fam', js), fam1: mean(A1, 'fam', js), fd0: mean(A0, 'fd', js), fd1: mean(A1, 'fd', js) };
      r[nm].jd0 = js.reduce((a, j) => a + (A0[j] ? A0[j].J.d : 0), 0); r[nm].jd1 = js.reduce((a, j) => a + (A1[j] ? A1[j].J.d : 0), 0);
      r[nm].bl0 = js.reduce((a, j) => a + (A0[j] ? A0[j].J.bLj : 0), 0); r[nm].bl1 = js.reduce((a, j) => a + (A1[j] ? A1[j].J.bLj : 0), 0);
      r[nm].jf0 = js.reduce((a, j) => a + (A0[j] ? A0[j].J.fam : 0), 0); r[nm].jf1 = js.reduce((a, j) => a + (A1[j] ? A1[j].J.fam : 0), 0);
    }
    per.push(r);
  }
  const col = (nm, k0, k1) => per.map((r) => pct(r[nm][k1], r[nm][k0]));
  const show = (title, ds) => {
    const r15 = RULES.ruleSeed10(ds), r3 = RULES.ruleT252(ds.slice(0, 3));
    const pos = ds.filter((x) => x > 0).length, neg = ds.filter((x) => x < 0).length, avg = ds.reduce((a, b) => a + b, 0) / (ds.length || 1);
    const width = ds.length ? Math.max.apply(null, ds) - Math.min.apply(null, ds) : NaN;
    return `| ${title} | ${ds.map((x) => (Number.isFinite(x) ? (x >= 0 ? '+' : '') + x.toFixed(1) : '—')).join(' · ')} | ${pos >= neg ? '+' : '−'} ${Math.max(pos, neg)}/${ds.length} | ${f(avg, 2)} | ${f(width, 1)} | **${r15.verdict}** | ${r3.verdict} |`;
  };
  console.log(`\n=== 시드 ${per.map((r) => r.seed).join(' · ')} — 켬 ↔ 끔 Δ% ===`);
  console.log('| 수 | 시드별 Δ% | 부호 | 평균 | 폭 | 15시드(T256) | 앞 3시드(T252) |\n|---|---|---|---|---|---|---|');
  const lines = [
    ['나무꾼 101~200', col('p2', 'lj0', 'lj1')], ['나무꾼 201~300', col('p3', 'lj0', 'lj1')], ['나무꾼 301~400', col('p4', 'lj0', 'lj1')], ['나무꾼 101~400', col('p24', 'lj0', 'lj1')],
    ['나무꾼 몫 101~400', col('p24', 'sh0', 'sh1')], ['인구 101~400', col('p24', 'pop0', 'pop1')], ['w(통나무) 101~400', col('p24', 'pw0', 'pw1')],
    ['곳간 통나무/사람 101~400', col('p24', 'wd0', 'wd1')], ['통나무 문(곳간 < 2N) 몫 101~400', col('p24', 'low0', 'low1')], ['땔감 충당률 101~400', col('p24', 'fc0', 'fc1')],
    ['식량 날 101~400', col('p24', 'fd0', 'fd1')], ['기근 문 안 마을·날 몫 101~400', col('p24', 'fam0', 'fam1')], ['직업 판단 날 101~400', col('p24', 'jd0', 'jd1')],
    ['새 몸 나무꾼 101~400', col('p24', 'bl0', 'bl1')], ['인구 1~100', col('p1', 'pop0', 'pop1')], ['나무꾼 1~100', col('p1', 'lj0', 'lj1')], ['땔감 충당률 1~100', col('p1', 'fc0', 'fc1')],
    ['인구 101~200', col('p2', 'pop0', 'pop1')], ['기근 문 안 마을·날 몫 101~200', col('p2', 'fam0', 'fam1')], ['식량 날 101~200', col('p2', 'fd0', 'fd1')],
  ];
  for (const [t, ds] of lines) console.log(show(t, ds));
  //   고리가 시드마다 서나 — 기근 문 안 몫 Δ 와 나무꾼 Δ 의 부호가 반대인 시드 · 두 Δ 의 상관(피어슨 · 시드 n)
  const pair = (a, b) => { let opp = 0, n = 0; const xs = [], ys = []; for (let i = 0; i < a.length; i++) { if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) continue; n++; if (Math.sign(a[i]) * Math.sign(b[i]) < 0) opp++; xs.push(a[i]); ys.push(b[i]); }
    const mx = xs.reduce((u, v) => u + v, 0) / (n || 1), my = ys.reduce((u, v) => u + v, 0) / (n || 1);
    let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
    return { opp, n, r: sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN }; };
  const LINK = [
    ['기근 문 몫 Δ ↔ 나무꾼 Δ(101~400)', col('p24', 'fam0', 'fam1'), col('p24', 'lj0', 'lj1')],
    ['기근 문 몫 Δ(101~200) ↔ 나무꾼 Δ(201~300)', col('p2', 'fam0', 'fam1'), col('p3', 'lj0', 'lj1')],
    ['인구 Δ(101~200) ↔ 기근 문 몫 Δ(101~200)', col('p2', 'pop0', 'pop1'), col('p2', 'fam0', 'fam1')],
    ['w(통나무) Δ ↔ 나무꾼 Δ(101~400)', col('p24', 'pw0', 'pw1'), col('p24', 'lj0', 'lj1')],
  ];
  console.log('\n| 고리 | 부호 반대 시드 | 상관 r |\n|---|---|---|');
  const linkOut = LINK.map(([t, a, b]) => { const q = pair(a, b); console.log(`| ${t} | ${q.opp}/${q.n} | ${f(q.r, 2)} |`); return { t, a, b, q }; });
  console.log('\n두 팔이 처음 갈린 날(마을 칸 · 나무꾼): ' + per.map((r) => `${r.seed} ${r.split.any}·${r.split.lj}`).join(' / '));
  const jsh = (r, k) => (r.p24[k === 0 ? 'jd0' : 'jd1'] ? r.p24[k === 0 ? 'jf0' : 'jf1'] / r.p24[k === 0 ? 'jd0' : 'jd1'] : NaN);
  const sh0 = per.map((r) => jsh(r, 0)), sh1 = per.map((r) => jsh(r, 1));
  console.log(`직업 판단 중 기근 문 안 몫(101~400 · 시드별 끔 → 켬): ${per.map((r, i) => `${r.seed} ${f(100 * sh0[i], 1)} → ${f(100 * sh1[i], 1)}%`).join(' / ')} · 범위 ${f(100 * Math.min(...sh0, ...sh1), 1)} ~ ${f(100 * Math.max(...sh0, ...sh1), 1)}%`);
  console.log('해 질 녘 정산 나섬(끔 · 켬 · 마을 합 · — = 그 칸을 안 적은 판): ' + per.map((r) => `${r.seed} ${r.dusk0 == null ? '—' : r.dusk0}·${r.dusk1 == null ? '—' : r.dusk1}`).join(' / '));
  if (JOUT) fs.writeFileSync(JOUT, JSON.stringify({ K, per, lines: lines.map(([t, ds]) => ({ t, ds, r15: RULES.ruleSeed10(ds), r3: RULES.ruleT252(ds.slice(0, 3)) })), link: linkOut }, null, 1));
} else if (MODE === 'timeline') {
  //   차례 — W 날 창마다 끔 → 켬(어느 수가 먼저 갈리나)
  const p0 = load(argv[1]), p1 = load(argv[2]), W = +(argv[3] || 20);
  const win = (p, a, b) => { let lj = 0, pop = 0, fdA = 0, fdN = 0, fam = 0, vd = 0, fc = 0, fcN = 0, wd = 0, pw = 0, pwN = 0, hl = 0, hlN = 0, tw = 0, born = 0, nd = 0;
    for (let k = 0; k < p.days.length; k++) { const d = p.days[k]; if (d < a || d > b) continue; nd++;
      for (const S of p.v) { const n = S.n[k] || 0; lj += S.lumberjack[k] || 0; pop += n; wd += S.wd[k] || 0; tw += S.tw[k] || 0;
        if (n > 0) { vd++; if (Number.isFinite(S.fd[k])) { fdA += S.fd[k]; fdN++; if (S.fd[k] < K.famine) fam++; } if (Number.isFinite(S.fc[k])) { fc += Math.min(1, S.fc[k]); fcN++; } if (Number.isFinite(S.hl[k])) { hl += S.hl[k]; hlN++; } }
        const w = wc(S.pw[k]); if (Number.isFinite(w)) { pw += w; pwN++; }
        if (k > 0) { const dn = n - (S.n[k - 1] || 0); if (dn > 0) born += dn; } } }
    return { lj: lj / nd, pop: pop / nd, fd: fdA / fdN, fam: fam / vd, fc: fc / fcN, hl: hl / hlN, wd: wd / nd, tw: tw / nd, pw: pw / pwN, born }; };
  console.log('| 날 | 나무꾼 끔 → 켬 | 인구 | 식량 날 | 기근 문 안 몫 | 땔감 충당률 | 건강 | 곳간 통나무 | 곳간 잔가지 | w(통나무) | 는 몸(합) |\n|---|---|---|---|---|---|---|---|---|---|---|');
  for (let a = 1; a <= 400; a += W) { const b = a + W - 1, x = win(p0, a, b), y = win(p1, a, b);
    console.log(`| ${a}~${b} | ${f(x.lj)} → ${f(y.lj)} | ${f(x.pop, 0)} → ${f(y.pop, 0)} | ${f(x.fd)} → ${f(y.fd)} | ${f(x.fam, 3)} → ${f(y.fam, 3)} | ${f(x.fc, 3)} → ${f(y.fc, 3)} | ${f(x.hl, 3)} → ${f(y.hl, 3)} | ${f(x.wd, 0)} → ${f(y.wd, 0)} | ${f(x.tw, 2)} → ${f(y.tw, 2)} | ${f(x.pw, 1)} → ${f(y.pw, 1)} | ${x.born} → ${y.born} |`); }
} else {
  console.log('쓰는 법: detail <끔> <켬> | timeline <끔> <켬> [창 날] | seeds --off <폴더>:<태그> --on <폴더>:<태그>');
}
