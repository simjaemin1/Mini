#!/usr/bin/env node
// === scripts/t17-seeds.js — 15시드 일괄 러너: 짝 Δ 표 + 규약 판정 (T277) ====================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음). 세계는 안 만진다.
//
// ★왜 [T244 → T273 → 재민/PM]
//   T244 의 게이트 5(품목 충격 ≤ 1.6%)가 깨졌는데, T273 이 15시드로 다시 재니 **여덟 수 전부 못 가름**이었다.
//   1.6% 는 캐논이 아니라 T184 가 잰 값이고, 부호가 갈린 짝 Δ 의 평균 |Δ| 는 **표본이 늘면 자란다**
//   (T244 3시드 2.82% → T273 15시드 4.15%) — 임계값으로 쓰면 "더 재면 더 나빠 보이는 자"가 된다.
//   ⇒ PM 이 공통 §2 에 올린 규약: **게이트 4·5 는 값이 아니라 T252 자로 읽는다.**
//   이 파일은 그 자를 **매번 같은 손으로** 돌리기 위한 것이다. 판정 문장은 규약 그대로만 찍고 **값을 안 짓는다**.
//
// ★★규약 — 여기 적힌 수는 전부 `인계/공통.md §2` 의 것이다(새 수 0):
//   · T252(3시드)   부호 3/3 일치 **그리고** |평균| > 폭(최대−최소) → **가름**
//                   부호 일치 · |평균| ≤ 폭                        → **방향만**
//                   부호 갈림                                       → **못 가름**
//   · 시드 ≥ 10(PM 임시 · T256)
//                   부호 ≥ 80% **그리고** |평균| > 폭/2            → **가름**
//                   부호 ≥ 80% 만                                   → **방향만**
//                   그 밖                                           → **못 가름**
//   · 소멸은 3시드 0/51 이라 **한 곳만 나도 유의**(T252) — 그래서 Δ% 가 아니라 **시드 수**로 센다.
//   · 꼬리 집합(작은/큰 17곳)은 **기준 팔 A 로 뽑는다**(족보 204 — 팔별로 뽑으면 부호가 뽑는 방식의 말이 된다).
//
// 실행:
//   ARM_A='T135_TREES=0' ARM_B='' node scripts/t17-seeds.js --seeds 15
//   ARM_A='L_ALLOC_REAL=0 L_HAPPY_FLOOR1=0 L_HAPPYWORK=0' ARM_B='' node scripts/t17-seeds.js --seeds 3
//   node scripts/t17-seeds.js --spread --seeds 15          ← 게이트 4(직업 배율 퍼짐) 대역
//   node scripts/t17-seeds.js --selftest        ← 자명 통과 금지(규약이 실제로 무는지)
//
// ★게이트 둘을 이 자 하나로:
//   · **게이트 5(품목 충격)** = 짝 Δ 물음 ⇒ 기본 모드. `ARM_A='T135_TREES=0' ARM_B=''`
//   · **게이트 4(직업 배율)** = **대역** 물음이지 짝 Δ 가 아니다 ⇒ `--spread`.
//     ⚠퍼짐은 한 팔 안에서 나오는 수라 **T252 자를 댈 것이 없다** — 억지로 판정을 찍지 않고 대역을 찍는다.
//
// 손잡이(전부 env · 세계 손잡이 아님 — 이 파일의 것):
//   ARM_A / ARM_B          두 팔의 env 문자열(`K=V K=V`). 빈 문자열 = 기본 팔.
//   ARM_A_LABEL / ARM_B_LABEL  표에 적을 이름(없으면 env 문자열 그대로 · 빈 팔은 '기본')
//   T17S_WORK=/tmp/t17-seeds   판별 JSON 보관 자리(있으면 **재사용** — 재실측이 공짜다)
//   T17S_FRESH=1               보관 무시하고 다시 돈다
//   LAB_SEEDCACHE              지형·배치 캐시(기본 /tmp/t163-seeds.json · T100 손잡이 · 값 투명)
//   --days N (기본 800) · --out <경로.md> (마크다운도 파일로)
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

// ★시드 목록은 **고정**이다(T256 의 15) — 카드마다 다른 시드를 뽑으면 표끼리 못 견준다.
const SEEDS15 = [1020, 7, 42, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13];
const TAIL_SPLIT = 3;   // 51마을을 셋으로 갈라 꼬리/머리 17곳씩 — T256 이 쓴 그 가름(새 수 0)

const argv = process.argv.slice(2);
const flag = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };
const SELFTEST = argv.indexOf('--selftest') >= 0;
const SPREAD = argv.indexOf('--spread') >= 0;
const NSEED = parseInt(flag('--seeds', '15'), 10) || 15;
const DAYS = parseInt(flag('--days', '800'), 10) || 800;
const OUT = flag('--out', '');
const WORK = process.env.T17S_WORK || '/tmp/t17-seeds';
const FRESH = process.env.T17S_FRESH === '1';
const SEEDS = SEEDS15.slice(0, Math.max(1, Math.min(SEEDS15.length, NSEED)));

// ── 규약 — 이 둘이 이 파일의 심장이다. 값을 안 짓는다(공통.md §2 그대로) ─────────────────
function ruleT252(ds) {                       // 3시드(일반적으로 n < 10)
  const n = ds.length;
  if (!n) return { verdict: '자료 없음' };
  const pos = ds.filter((x) => x > 0).length, neg = n - pos;
  const same = (pos === n) || (neg === n);
  const avg = ds.reduce((a, b) => a + b, 0) / n;
  const width = Math.max.apply(null, ds) - Math.min.apply(null, ds);
  if (!same) return { verdict: '못 가름', why: `부호 갈림(+${pos}/−${neg})`, avg, width, sign: Math.max(pos, neg), n };
  const cut = Math.abs(avg) > width;
  return { verdict: cut ? '가름' : '방향만', why: `부호 ${n}/${n} · |평균| ${Math.abs(avg).toFixed(2)} ${cut ? '>' : '≤'} 폭 ${width.toFixed(2)}`,
           avg, width, sign: n, n };
}
function ruleSeed10(ds) {                     // 시드 ≥ 10 (PM 임시 · T256)
  const n = ds.length;
  if (n < 10) return { verdict: '해당 없음', why: `시드 ${n} < 10`, n };
  const pos = ds.filter((x) => x > 0).length, neg = n - pos;
  const sign = Math.max(pos, neg);
  const avg = ds.reduce((a, b) => a + b, 0) / n;
  const width = Math.max.apply(null, ds) - Math.min.apply(null, ds);
  if (sign / n < 0.8) return { verdict: '못 가름', why: `부호 ${sign}/${n}(${(100 * sign / n).toFixed(0)}% < 80%)`, avg, width, sign, n };
  const cut = Math.abs(avg) > width / 2;
  return { verdict: cut ? '가름' : '방향만',
           why: `부호 ${sign}/${n} · |평균| ${Math.abs(avg).toFixed(2)} ${cut ? '>' : '≤'} 폭/2 ${(width / 2).toFixed(2)}`,
           avg, width, sign, n };
}
// 시드 수가 정하는 **주 규약** — 카드가 `--seeds 3` 이면 3시드 규약이 주다.
const mainRule = (ds) => (ds.length >= 10 ? ruleSeed10(ds) : ruleT252(ds));

// ── 자명 통과 금지 — 규약이 실제로 무는가 ────────────────────────────────────────────
if (SELFTEST) {
  let pass = 0, fail = 0;
  const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra ? `  ${extra}` : '')); };
  console.log('\n=== t17-seeds 자명 통과 금지 — 규약이 무는지 ===\n');
  console.log('① T252(3시드)');
  ok(ruleT252([5, 6, 7]).verdict === '가름', '부호 3/3 + 평균 6 > 폭 2 → **가름**', ruleT252([5, 6, 7]).why);
  ok(ruleT252([1, 5, 9]).verdict === '방향만', '부호 3/3 인데 평균 5 ≤ 폭 8 → **방향만**', ruleT252([1, 5, 9]).why);
  ok(ruleT252([5, -6, 7]).verdict === '못 가름', '부호 갈리면 평균이 커도 → **못 가름**', ruleT252([5, -6, 7]).why);
  ok(ruleT252([-5, -6, -7]).verdict === '가름', '음수 3/3 도 같은 자로 **가름**(부호는 방향일 뿐)');
  console.log('② 시드 ≥ 10');
  const a12 = Array(12).fill(6).concat([5, 7, 6]);                       // 부호 15/15 · 폭 2 · 평균 6
  ok(ruleSeed10(a12).verdict === '가름', '부호 15/15 + 평균 6 > 폭/2 1 → **가름**', ruleSeed10(a12).why);
  const b = Array(13).fill(1).concat([-1, -1]);                          // 부호 13/15(86%) · 폭 2 · 평균 0.73
  ok(ruleSeed10(b).verdict === '방향만', '부호 13/15(86% ≥ 80%)인데 |평균| 0.73 ≤ 폭/2 1 → **방향만**', ruleSeed10(b).why);
  const c = Array(11).fill(1).concat([-1, -1, -1, -1]);                  // 부호 11/15(73%)
  ok(ruleSeed10(c).verdict === '못 가름', '부호 11/15(73% < 80%) → **못 가름**', ruleSeed10(c).why);
  ok(ruleSeed10([1, 2, 3]).verdict === '해당 없음', '시드 3 에 시드≥10 규약을 대면 **해당 없음**(자를 잘못 대는 것)');
  console.log('③ 실측이 실제로 낸 표 — T273 인구(15시드)');
  const t273 = [2.86, -0.53, -5.09, 1.85, 3.11, 1.00, 6.56, 4.44, 3.34, -10.55, 1.94, 4.46, 6.20, -6.46, 3.90];
  const r = ruleSeed10(t273);
  ok(r.verdict === '못 가름' && r.sign === 11, 'T273 인구 15시드 → **못 가름**(부호 11/15)', r.why);
  ok(ruleT252(t273.slice(0, 3)).verdict === '못 가름', '그 표의 앞 세 시드로도 **못 가름**(부호 갈림)');
  console.log('④ 경계 — 같음은 가름이 아니다(> 이지 ≥ 가 아니다)');
  ok(ruleT252([2, 3, 4]).verdict === '가름', '평균 3 > 폭 2 → **가름**(문턱 바로 위)', ruleT252([2, 3, 4]).why);
  ok(ruleT252([1, 2, 3]).verdict === '방향만', '평균 2 = 폭 2 → **방향만**(같으면 안 가른다)', ruleT252([1, 2, 3]).why);
  console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`);
  process.exit(fail ? 1 : 0);
}

// ── `--spread` : 게이트 4 — 직업 배율 퍼짐의 **대역** ─────────────────────────────────
//   `lab-alloc-server T177_TRACE=1 T177_ARM=real` 이 직업마다 내는 `실현/종전` 을 읽어
//   한 시드의 퍼짐 = max/min 을 내고, 시드들의 **대역**(중앙·최소·최대·폭)과 두 읽기를 찍는다:
//     ⓐ 문자 `≤ ×5`(T184 가 그 판에서 **관측한 최대값**) · ⓑ 한 자릿수 `< ×10`(하네스 `test-lab-alloc` ⑪ 의 그 줄)
//   값을 안 짓는다 — 둘 다 남의 파일에 이미 있는 수다.
const SPREAD_JOBS = ['hunter', 'fisher', 'miner', 'forager', 'lumberjack', 'farmer'];
function runSpread(arm, seed) {
  const f = path.join(WORK, `S_${arm.key}_${slug(arm.spec)}_${DAYS}_${seed}.json`);
  if (!FRESH && fs.existsSync(f) && fs.statSync(f).size > 0) {
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { /* 깨졌으면 다시 */ }
  }
  const env = Object.assign({}, process.env, envOf(arm.spec),
    { T177_JSON: f, T177_TRACE: '1', T177_ARM: 'real', L_ALLOC_REAL: '0' });
  const t0 = Date.now();
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'lab-alloc-server.js'), String(DAYS), String(seed)],
    { env, stdio: ['ignore', 'ignore', 'inherit'] });
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  process.stderr.write(`  · 퍼짐 시드 ${seed} — 인구 ${j.pop} · ${((Date.now() - t0) / 1000).toFixed(0)}초\n`);
  return j;
}

// ── 한 판 ────────────────────────────────────────────────────────────────────────────
const envOf = (str) => {
  const out = {};
  String(str || '').trim().split(/\s+/).filter(Boolean).forEach((kv) => {
    const i = kv.indexOf('='); if (i > 0) out[kv.slice(0, i)] = kv.slice(i + 1);
  });
  return out;
};
const ARMS = [
  { key: 'A', spec: process.env.ARM_A || '', label: process.env.ARM_A_LABEL || (process.env.ARM_A || '기본') },
  { key: 'B', spec: process.env.ARM_B || '', label: process.env.ARM_B_LABEL || (process.env.ARM_B || '기본') },
];
fs.mkdirSync(WORK, { recursive: true });
const slug = (s) => (s || 'base').replace(/[^A-Za-z0-9=_.-]+/g, '_');
function runOne(arm, seed) {
  const f = path.join(WORK, `${arm.key}_${slug(arm.spec)}_${DAYS}_${seed}.json`);
  if (!FRESH && fs.existsSync(f) && fs.statSync(f).size > 0) {
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { /* 깨졌으면 다시 돈다 */ }
  }
  const env = Object.assign({}, process.env, envOf(arm.spec), { T17_JSON: f });
  if (!env.LAB_SEEDCACHE) env.LAB_SEEDCACHE = '/tmp/t163-seeds.json';
  const t0 = Date.now();
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 't17-metrics.js'), String(DAYS), String(seed)],
    { env, stdio: ['ignore', 'ignore', 'inherit'] });
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  process.stderr.write(`  · ${arm.key}(${arm.label}) 시드 ${seed} — 인구 ${j.base.pop} · ${((Date.now() - t0) / 1000).toFixed(0)}초\n`);
  return j;
}

// ── 여덟 수 + 밀도 — JSON 에서 **읽기만** 한다(사본 0) ────────────────────────────────
const METRICS = [
  ['인구', (j) => j.base.pop],
  ['무기Q', (j) => j.base.weapQ],
  ['확장셀', (j) => j.base.expand],
  ['게시', (j) => j.board.reqOpened],
  ['도구Q', (j) => j.tool.q],
  ['보존식', (j) => j.preserve.stock],
  ['생곡', (j) => (j.eight ? j.eight.grain : null)],
  ['㉯ 일/건', (j) => (j.eight ? j.eight.densValue : null)],
];
const med = (v) => { const w = v.slice().sort((a, b) => a - b); const n = w.length; return n % 2 ? w[n >> 1] : (w[(n >> 1) - 1] + w[n >> 1]) / 2; };
// ★[T286] 지니 — 마을 **크기의 고름**. 0 이 완전 평등, 1 이 한 곳이 다 가진 것.
//   족보 204 가 요구하는 "꼬리와 머리를 따로" 중 **한 수로 요약하는 쪽**이다(작은/큰 17곳이 나누는 쪽).
//   ⚠이건 세계가 좋아졌다는 수가 아니다 — **고르냐**는 수다. 내려가면 고루 퍼진 것뿐이다.
const gini = (v) => {
  const n = v.length; if (!n) return null;
  const mu = v.reduce((a, b) => a + b, 0) / n; if (!(mu > 0)) return null;
  let sum = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) sum += Math.abs(v[i] - v[j]);
  return sum / (2 * n * n * mu);
};
const pctD = (a, b) => (a === 0 ? null : (b - a) / a * 100);

console.log(`\n=== t17-seeds — ${SEEDS.length}시드 ${SPREAD ? '· 퍼짐 대역(게이트 4)' : '× 2팔(짝 Δ)'} × ${DAYS}일 51마을 ===`);
console.log(`  ${SPREAD ? '팔' : 'A(기준)'} = ${ARMS[0].label}`);
if (!SPREAD) console.log(`  B(견줌) = ${ARMS[1].label}`);
console.log(`  시드 ${SEEDS.join(' · ')}`);
console.log(`  보관 ${WORK}${FRESH ? ' (다시 돈다)' : ' (있으면 재사용)'}\n`);

// ── `--spread` 모드는 여기서 끝난다(짝 Δ 가 아니라 대역이라 표가 다르다) ─────────────
if (SPREAD) {
  const SL = [];
  const s2 = (x) => { SL.push(x); console.log(x); };
  const rows = [];
  for (const seed of SEEDS) {
    const j = runSpread(ARMS[0], seed);
    const r = {};
    for (const k of SPREAD_JOBS) {
      const t = j.job && j.job[k];
      if (t && t.ratioN) r[k] = t.ratioSum / t.ratioN;
    }
    const v = Object.values(r);
    if (v.length < 2) continue;
    rows.push({ seed, r, spread: Math.max.apply(null, v) / Math.min.apply(null, v),
      lo: Object.keys(r).reduce((a, b) => (r[a] < r[b] ? a : b)),
      hi: Object.keys(r).reduce((a, b) => (r[a] > r[b] ? a : b)) });
  }
  s2(`### 게이트 4 — 직업 배율 퍼짐 대역 · ${rows.length}시드 · ${DAYS}일 51마을\n`);
  s2(`* 팔 \`${ARMS[0].label}\` · \`lab-alloc-server T177_TRACE=1 T177_ARM=real\`(관찰자가 정본을 부른다)`);
  s2(`* ⚠퍼짐은 **한 팔 안의 수**다 — 짝 Δ 가 아니라서 T252 자를 댈 것이 없다. **대역**으로 읽는다.\n`);
  s2('| 시드 | ' + SPREAD_JOBS.join(' | ') + ' | **퍼짐** | 분모→분자 |');
  s2('|---|' + SPREAD_JOBS.map(() => '---|').join('') + '---|---|');
  for (const x of rows) {
    s2(`| ${x.seed} | ` + SPREAD_JOBS.map((k) => (x.r[k] != null ? x.r[k].toFixed(2) : '—')).join(' | ')
      + ` | **×${x.spread.toFixed(2)}** | ${x.lo} → ${x.hi} |`);
  }
  const sp = rows.map((x) => x.spread);
  const le5 = rows.filter((x) => x.spread <= 5).length, lt10 = rows.filter((x) => x.spread < 10).length;
  const sameEnds = rows.every((x) => x.lo === rows[0].lo && x.hi === rows[0].hi);
  s2(`\n**대역** — 중앙 ×${med(sp).toFixed(2)} · 최소 ×${Math.min.apply(null, sp).toFixed(2)} · 최대 ×${Math.max.apply(null, sp).toFixed(2)}`
    + ` · 폭 ${(Math.max.apply(null, sp) - Math.min.apply(null, sp)).toFixed(2)}`);
  s2(`**두 읽기** — ⓐ 문자 \`≤×5\`(T184 가 그 판에서 관측한 최대값): **${le5}/${rows.length}**`
    + ` · ⓑ 한 자릿수 \`<×10\`(\`test-lab-alloc\` ⑪ 의 그 줄): **${lt10}/${rows.length}**`);
  s2(`**분모·분자** — ${sameEnds ? `${rows.length}시드 전부 \`${rows[0].lo}\` → \`${rows[0].hi}\`(퍼짐이 한 쌍에서만 난다)` : '시드마다 다르다 — 퍼짐이 직업 하나의 성질이 아니다'}`);
  if (OUT) { fs.writeFileSync(OUT, SL.join('\n') + '\n'); console.log(`\n  마크다운: ${OUT}`); }
  return;
}

const R = { A: {}, B: {} };
for (const seed of SEEDS) for (const arm of ARMS) R[arm.key][seed] = runOne(arm, seed);

// ── 표 ────────────────────────────────────────────────────────────────────────────────
const L = [];
const say = (s) => { L.push(s); console.log(s); };
say(`### 짝 Δ (B − A)/A — ${SEEDS.length}시드 · ${DAYS}일 · 51마을\n`);
say(`* **A(기준)** \`${ARMS[0].label}\` · **B(견줌)** \`${ARMS[1].label}\``);
say(`* 판정은 \`인계/공통.md §2\` 규약 그대로다(값을 안 짓는다) — 주 규약: **${SEEDS.length >= 10 ? '시드 ≥ 10' : 'T252(3시드)'}**\n`);
say('| 항 | 부호(다수/n) | 평균 % | 중앙 % | 최소 % | 최대 % | 폭 | T252(앞 3시드) | **주 판정** |');
say('|---|---|---|---|---|---|---|---|---|');
for (const [name, get] of METRICS) {
  const ds = [], d3 = [];
  SEEDS.forEach((s, i) => {
    const a = get(R.A[s]), b = get(R.B[s]);
    if (a == null || b == null) return;
    const d = pctD(a, b); if (d == null) return;
    ds.push(d); if (i < 3) d3.push(d);
  });
  if (!ds.length) { say(`| ${name} | — | — | — | — | — | — | 자료 없음 | 자료 없음 |`); continue; }
  const pos = ds.filter((x) => x > 0).length, sign = Math.max(pos, ds.length - pos);
  const avg = ds.reduce((a, b) => a + b, 0) / ds.length;
  const w = Math.max.apply(null, ds) - Math.min.apply(null, ds);
  const m = mainRule(ds);
  say(`| ${name} | ${sign}/${ds.length} | ${avg >= 0 ? '+' : ''}${avg.toFixed(2)} | ${med(ds) >= 0 ? '+' : ''}${med(ds).toFixed(2)} `
    + `| ${Math.min.apply(null, ds).toFixed(2)} | +${Math.max.apply(null, ds).toFixed(2)} | ${w.toFixed(2)} `
    + `| ${ruleT252(d3).verdict} | **${m.verdict}** |`);
}
// 소멸 — Δ% 가 아니라 시드 수로 센다(T252: 한 곳만 나도 유의)
const deadN = (k) => SEEDS.filter((s) => R[k][s].base.dead > 0).length;
const deadSum = (k) => SEEDS.reduce((a, s) => a + R[k][s].base.dead, 0);
say(`\n**소멸** — A **${deadN('A')}/${SEEDS.length}** 시드(합 ${deadSum('A')}곳) · B **${deadN('B')}/${SEEDS.length}** 시드(합 ${deadSum('B')}곳)`
  + `  ← T252: 3시드 0/51 이 기준선이라 **한 곳만 나도 유의**다(Δ% 로 안 읽는다).`);

// ── 꼬리 — 집합은 **A 로 뽑는다**(족보 204) ────────────────────────────────────────────
say(`\n### 꼬리와 머리 — 마을별 인구(\`vpop\`) · 집합은 **기준 팔 A 로 뽑는다**(족보 204)\n`);
const haveV = SEEDS.every((s) => Array.isArray(R.A[s].vpop) && Array.isArray(R.B[s].vpop));
if (!haveV) {
  say('⚠`vpop` 이 없는 판이 있다 — `t17-metrics` 가 낡았다(T277 이 더한 열).');
} else {
  const K = Math.floor((R.A[SEEDS[0]].vpop.length) / TAIL_SPLIT);   // 51/3 = 17 (T256 의 가름 · 새 수 0)
  const smallD = [], bigD = [], u20A = [], u20B = [];
  for (const s of SEEDS) {
    const A = R.A[s].vpop, B = R.B[s].vpop;
    const bpop = new Map(B.map((v) => [v.name, v.pop]));
    const ranked = A.slice().sort((x, y) => x.pop - y.pop);
    // 같은 **이름의 마을들**을 두 팔에서 더해 견준다 — 집합은 A 로 뽑았고 B 는 그 이름을 따라간다.
    const pick = (rows) => {
      const a = rows.reduce((t, v) => t + v.pop, 0);
      const b = rows.reduce((t, v) => t + (bpop.get(v.name) || 0), 0);
      return (b - a) / Math.max(1, a) * 100;
    };
    smallD.push(pick(ranked.slice(0, K)));
    bigD.push(pick(ranked.slice(-K)));
    u20A.push(A.filter((v) => v.pop < 20).length);
    u20B.push(B.filter((v) => v.pop < 20).length);
  }
  const row = (name, ds) => {
    const pos = ds.filter((x) => x > 0).length, sign = Math.max(pos, ds.length - pos);
    const avg = ds.reduce((a, b) => a + b, 0) / ds.length;
    const w = Math.max.apply(null, ds) - Math.min.apply(null, ds);
    say(`| ${name} | ${sign}/${ds.length} | ${avg >= 0 ? '+' : ''}${avg.toFixed(2)} | ${med(ds) >= 0 ? '+' : ''}${med(ds).toFixed(2)} | ${w.toFixed(2)} | **${mainRule(ds).verdict}** |`);
  };
  say('| 집합 | 부호(다수/n) | 평균 % | 중앙 % | 폭 | **주 판정** |');
  say('|---|---|---|---|---|---|');
  row(`작은 ${K}곳(A 기준 하위)`, smallD);
  row(`큰 ${K}곳(A 기준 상위)`, bigD);
  const sum = (v) => v.reduce((a, b) => a + b, 0);
  say(`\n**\`<20명\` 마을** — A 합 **${sum(u20A)}곳**(시드당 중앙 ${med(u20A)}) · B 합 **${sum(u20B)}곳**(시드당 중앙 ${med(u20B)})`
    + ` · 좋아진 시드 ${SEEDS.filter((s, i) => u20B[i] < u20A[i]).length}/${SEEDS.length}`);
  const minA = SEEDS.map((s) => Math.min.apply(null, R.A[s].vpop.map((v) => v.pop)));
  const minB = SEEDS.map((s) => Math.min.apply(null, R.B[s].vpop.map((v) => v.pop)));
  say(`**최소 마을 인구** — A 중앙 ${med(minA)}명(최저 ${Math.min.apply(null, minA)}) · B 중앙 ${med(minB)}명(최저 ${Math.min.apply(null, minB)})`);
  // ★[T286] 지니 — 낮을수록 고르다. 판정은 **차(포인트)** 로 읽는다(비율이 아니다 — 0~1 짜리 수라 % 가 뜻이 없다).
  const gA = SEEDS.map((s) => gini(R.A[s].vpop.map((v) => v.pop)));
  const gB = SEEDS.map((s) => gini(R.B[s].vpop.map((v) => v.pop)));
  if (gA.every((x) => x != null) && gB.every((x) => x != null)) {
    const dg = SEEDS.map((_, i) => (gB[i] - gA[i]) * 100);           // 포인트
    const down = dg.filter((x) => x < 0).length;
    const r = mainRule(dg);
    say(`**지니(마을 크기의 고름)** — A 중앙 ${med(gA).toFixed(3)} · B 중앙 ${med(gB).toFixed(3)}`
      + ` · 차 평균 ${(dg.reduce((a, b) => a + b, 0) / dg.length >= 0 ? '+' : '')}${(dg.reduce((a, b) => a + b, 0) / dg.length).toFixed(2)}p`
      + ` · 중앙 ${(med(dg) >= 0 ? '+' : '')}${med(dg).toFixed(2)}p · 폭 ${(Math.max.apply(null, dg) - Math.min.apply(null, dg)).toFixed(2)}p`
      + ` · **내려간(고루 퍼진) 시드 ${down}/${SEEDS.length}** · 판정 **${r.verdict}**`);
  }
  // 자기검사 — vpop 합이 여덟 수의 인구와 같아야 한다(열이 딴 세계를 세지 않는다)
  const bad = SEEDS.filter((s) => ARMS.some((arm) => R[arm.key][s].vpop.reduce((a, v) => a + v.pop, 0) !== R[arm.key][s].base.pop));
  say(`\n**자기검사** — \`vpop\` 합 = 여덟 수 인구: ${bad.length ? `✗ 어긋난 시드 ${bad.join(' · ')}` : `○ ${SEEDS.length}시드 × 2팔 전부 일치`}`);
}
say(`\n**읽는 법** — 판정은 규약이 낸다: 부호가 갈리거나(3시드) 80% 를 못 넘으면(시드≥10) **못 가름**이고,`);
say(`그때 "평균 몇 %" 는 효과 크기가 아니라 **잡음 폭의 표본추정**이라 시드를 늘리면 자란다(족보 215 · T244 2.82% → T273 4.15%).`);

if (OUT) { fs.writeFileSync(OUT, L.join('\n') + '\n'); console.log(`\n  마크다운: ${OUT}`); }
