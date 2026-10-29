#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T974 표 기계 · 판 JSON 만 읽는다 · 세계 안 만짐)
// === scripts/t974-band-table.js — 판 자 띠(T837 갈림 대조)로 다섯 셈: 전쟁 길이 · 징발 · 굶는 마을-날 · 첫해 기근 · 인구 ============
//   node scripts/t974-band-table.js <판 뿌리> --pair a:b[:이름] [--pair …] [--json out.json]
//     판 뿌리 아래 `run-<갈래>`(갈래 판) · `run-<갈래>~raidN`(그 갈래의 갈림 대조 — `diverge-ctl.js` `DCTL_SKIP=raid:n`)
//     판마다 `base-<시드>.json`(t577 판 JSON) · `.dctl.json`(diverge-ctl) · `.t845.json`(징발 · 전쟁 — `t845-observe.js`) · `.t875.json`(첫해 — `t875-observe.js`)
//   셈(3시드 합 · 판 하나):
//     wars = 판 동안 선 전쟁 수 · long30 = 30날 이상 산 전쟁(T956 `long30` 과 같은 잣대 — 산 날 = 마지막 본 날 − 처음 본 날 + 1 · 판 끝까지 산 전쟁은 판 끝까지)
//     lenMax = 가장 오래 산 전쟁(날) · warDays = 전쟁-날 합(전쟁마다 산 날의 합)
//     draftVD = 징발 마을-날(인구 > 0 · 징발 `_warDraft` > 0 — T956 `dvd` 와 같은 잣대) · draftPD = 징발 사람-날(그날 징발 수의 합)
//     starve = 굶는 마을-날(인구 > 0 · 곳간 식량 환산 < 인구 — `diverge-table` `starveDays` 와 같은 잣대 · dctl 날 줄)
//     fam365 = 365날 앞 죽음(첫해 기근 — `t875-table` `fam365` 와 같은 잣대 · t875 `deaths` 칸 · 365날 앞)
//     pop = 판 끝 인구(`eight.pop`) · empty = 끝 날 빈 마을(판 JSON `empty`)
//   띠 = 그 갈래 판들(갈래 판 + 대조 k 판) 최소 ~ 최대 · 폭 = 최대 − 최소. 견줌 = 두 갈래 판의 차 · 두 띠 평균의 차 · 겹치나 · 갈래 차 > 두 폭 중 큰 것인가
//   (`diverge-table` 과 같은 산수 — 판정 0 · 무엇을 읽을지는 보고가 적는다)
//   ★[T995] `--log` — 존 기록(`base-<시드>.log`)의 마지막 전쟁 요약 줄(`⚔️ 전쟁 day N: 선포 · 전투(공승/방승) · 사상 · 노획` — 누계)에서 셈 넷을 더한다:
//     battles = 정산된 전투 · atkWin · defWin = 공격 · 방어 승 · cas = 사상(누계) — 판 하나 3시드 합(없으면 그 판은 셈에서 빠진다). 없을 땐 종전 표 그대로.
//   ★[T995] `--top` — 판마다 시드마다 가장 오래 산 전쟁 셋(id:공격→방어:처음~마지막:산 날 · 판 끝까지 산 것은 (끝까지)) · 20날 넘게 산 전쟁 수 ·
//     판 JSON 이 없는 시드(판이 끝나기 전에 멈춘 판)도 t845 가 있으면 적는다(그 시드는 위 셈에선 빠진다 — 마지막 본 날을 함께 적는다). 없을 땐 종전 표 그대로.
//   ★[T995] `--partial` — 판 JSON 만 없는 시드(관찰기 셋은 있다 — 멈춘 판의 관찰기는 끝날 때 적는다)도 셈한다: 인구 · 빈 마을은 0 으로 두고
//     그 판은 `(부분 — 시드 s — d날까지)` 로 판마다 표에만 적는다(띠 · 견줌엔 안 든다). 없을 땐 종전 표 그대로.
//   ★[T995] `--first` — 견줌(`--pair a:b`)마다 같은 대조 판끼리(`run-a~k` ↔ `run-b~k` · k = 없음 · raid1..3) 시드마다 dctl 날 줄(인구 · 곳간 …)이
//     처음 갈린 날(둘 다 있는 날만 · 끝까지 같으면 `같음(n날)`). 벽시계 판이라 하중 흔들림도 같은 셈에 든다(판정 0). 없을 땐 종전 표 그대로.
'use strict';
const fs = require('fs');
const path = require('path');
const D = process.argv[2];
if (!D) { console.error('쓰는 법: node scripts/t974-band-table.js <판 뿌리> --pair a:b'); process.exit(2); }
const PAIRS = []; process.argv.forEach((x, i) => { if (x === '--pair') { const [a, b, ...nm] = process.argv[i + 1].split(':'); PAIRS.push({ a, b, name: nm.join(':') || `${a} ↔ ${b}` }); } });
const JOUT = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const LOGM = process.argv.includes('--log');   // ★[T995] 존 기록 전쟁 요약 줄 셈
const TOPM = process.argv.includes('--top');   // ★[T995] 시드마다 가장 긴 전쟁 셋 · 20날+
const PARTM = process.argv.includes('--partial');   // ★[T995] 판 JSON 만 없는 시드도 셈(판마다 표에만)
const FIRSTM = process.argv.includes('--first');   // ★[T995] 견줌마다 같은 대조 판끼리 dctl 날 줄이 처음 갈린 날
const SEEDS = [1020, 7, 42];
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
function measure(dir) {
  const m = { wars: 0, long30: 0, lenMax: 0, warDays: 0, draftVD: 0, draftPD: 0, starve: 0, fam365: 0, pop: 0, empty: 0, ok: true, per: {}, part: [] };
  for (const s of SEEDS) {
    let o = rd(path.join(dir, `base-${s}.json`)); const ob = rd(path.join(dir, `base-${s}.dctl.json`)), q = rd(path.join(dir, `base-${s}.t845.json`)), t = rd(path.join(dir, `base-${s}.t875.json`));
    if (!o && PARTM && ob && q && t) { o = { eight: { pop: 0 }, empty: 0 }; m.part.push(`${s} — ${q.rows.length ? q.rows[q.rows.length - 1][0] : 0}날까지`); }   // ★[T995] --partial
    if (!o || !ob || !q || !t) { m.ok = false; continue; }
    const p = { wars: 0, long30: 0, lenMax: 0, warDays: 0, draftVD: 0, draftPD: 0, starve: 0, fam365: 0, pop: o.eight ? o.eight.pop : 0, empty: o.empty || 0, longs: [] };
    if (LOGM) {   // ★[T995] 마지막 전쟁 요약 줄(누계)
      let lg = ''; try { lg = fs.readFileSync(path.join(dir, `base-${s}.log`), 'utf8'); } catch (e) { m.ok = false; continue; }
      const ls = lg.match(/⚔️ 전쟁 day \d+: 선포 \d+\[[^\]]*\] 전투 (\d+)\(공승(\d+)\/방승(\d+)\) 사상 (\d+)/g) || [];
      const mm = ls.length ? /전투 (\d+)\(공승(\d+)\/방승(\d+)\) 사상 (\d+)/.exec(ls[ls.length - 1]) : null;
      Object.assign(p, mm ? { battles: +mm[1], atkWin: +mm[2], defWin: +mm[3], cas: +mm[4] } : { battles: 0, atkWin: 0, defWin: 0, cas: 0 });
    }
    //   전쟁 — t845 `wars`(전쟁이 산 날마다 [날 · [[id · 공격 · 방어 · 국면 · 작전 · 짐 · 병력] …]])
    const lastDay = q.rows.length ? q.rows[q.rows.length - 1][0] : 0;
    const W = new Map();
    for (const [d, list] of (q.wars || [])) for (const w of list) { const x = W.get(w[0]) || { id: w[0], atk: w[1], def: w[2], first: d, last: d }; x.last = d; W.set(w[0], x); }
    for (const x of W.values()) { const len = x.last - x.first + 1; p.wars++; p.warDays += len; if (len >= 30) { p.long30++; p.longs.push(`${x.id}:${x.atk}→${x.def}:${len}${x.last >= lastDay ? '(끝까지)' : ''}`); } if (len > p.lenMax) p.lenMax = len; }
    //   징발 — t845 마을 줄 [N · tfe · eaten · drafted · …]
    const iN = 0, iDr = (q.cols || []).indexOf('drafted');
    for (const [, row] of q.rows) for (const c of row) { if (c[iN] > 0 && c[iDr] > 0) { p.draftVD++; p.draftPD += c[iDr]; } }
    //   굶는 마을-날 — dctl 날 줄 [인구 · 곳간 식량 환산 · …](diverge-table 과 같은 잣대)
    for (const [, row] of ob.days) for (const v of row) if (v && v[0] > 0 && v[1] < v[0]) p.starve++;
    //   첫해 기근 — t875 날 줄(t875-table 과 같은 잣대 · 365날 앞)
    const C = t.cols, iD = C.indexOf('deaths');
    for (const [d, row] of t.rows) if (d < 365) for (const c of row) p.fam365 += c[iD] || 0;
    for (const k of ['wars', 'long30', 'warDays', 'draftVD', 'draftPD', 'starve', 'fam365', 'pop', 'empty'].concat(LOGM ? ['battles', 'atkWin', 'defWin', 'cas'] : [])) m[k] = (m[k] || 0) + p[k];
    if (p.lenMax > m.lenMax) m.lenMax = p.lenMax;
    m.per[s] = p;
  }
  return m;
}
const dirs = fs.readdirSync(D).filter((x) => /^run-/.test(x) && fs.statSync(path.join(D, x)).isDirectory());
const G = {};
const PART = {};   // ★[T995] --partial 판(판마다 표에만)
for (const x of dirs) { const [arm, ctl] = x.slice(4).split('~'); const g = G[arm] || (G[arm] = { arm: null, ctl: {} }); const m = measure(path.join(D, x)); if (!m.ok) continue; if (m.part.length) { PART[x.slice(4)] = m; continue; } if (ctl) g.ctl[ctl] = m; else g.arm = m; }
const KEYS = [['long30', '30날 넘게 산 전쟁'], ['lenMax', '가장 긴 전쟁(날)'], ['warDays', '전쟁-날 합'], ['wars', '전쟁 수'], ['draftVD', '징발 마을-날'], ['draftPD', '징발 사람-날'],
  ['starve', '굶는 마을-날'], ['fam365', '첫해 굶어 죽음(365날 앞)'], ['pop', '판 끝 인구'], ['empty', '빈 마을(끝 날)']]
  .concat(LOGM ? [['battles', '정산된 전투'], ['atkWin', '공격 승'], ['defWin', '방어 승'], ['cas', '사상(누계)']] : []);   // ★[T995] --log
const band = (g, k) => { const xs = [g.arm, ...Object.values(g.ctl)].filter(Boolean).map((m) => m[k]); return { xs, lo: Math.min(...xs), hi: Math.max(...xs), mean: xs.reduce((a, b) => a + b, 0) / xs.length, w: Math.max(...xs) - Math.min(...xs), n: xs.length }; };
const f = (x) => (Math.abs(x) >= 100 ? Math.round(x).toLocaleString('en-US') : (Math.round(x * 10) / 10).toString());
const OUT = { groups: {}, pairs: [] };
console.log('\n## 판마다 셈(3시드 합)\n');
console.log('| 갈래 · 판 | ' + KEYS.map((k) => k[1]).join(' | ') + ' | 시드마다 30날+ 전쟁 · 가장 긴 전쟁 · 인구(1020 / 7 / 42) |');
console.log('|---|' + KEYS.map(() => '---:').join('|') + '|---|');
for (const arm of Object.keys(G).sort()) { const g = G[arm]; OUT.groups[arm] = g;
  for (const [nm, m] of [[arm, g.arm], ...Object.entries(g.ctl).sort().map(([c, v]) => [`${arm}~${c}`, v])]) { if (!m) continue;
    console.log(`| ${nm} | ${KEYS.map(([k]) => f(m[k])).join(' | ')} | ${SEEDS.map((s) => m.per[s] ? `${m.per[s].long30} · ${m.per[s].lenMax} · ${f(m.per[s].pop)}` : '—').join(' / ')} |`); } }
for (const [nm, m] of Object.entries(PART).sort()) { OUT.part = OUT.part || {}; OUT.part[nm] = m;   // ★[T995] --partial — 띠 · 견줌엔 안 든다
  console.log(`| ${nm}(부분 — 시드 ${m.part.join(' · ')} · 그 시드 인구 · 빈 마을 0) | ${KEYS.map(([k]) => f(m[k])).join(' | ')} | ${SEEDS.map((s) => m.per[s] ? `${m.per[s].long30} · ${m.per[s].lenMax} · ${f(m.per[s].pop)}` : '—').join(' / ')} |`); }
for (const P of PAIRS) {
  const A = G[P.a], B = G[P.b]; if (!A || !B || !A.arm || !B.arm) { console.log(`\n(${P.name}: 판 없음)`); continue; }
  console.log(`\n## ${P.name} — 대조 띠 vs 갈래 차(${P.a} 판 ${band(A, 'pop').n} · ${P.b} 판 ${band(B, 'pop').n})\n`);
  console.log(`| 셈 | ${P.a} 띠(최소 ~ 최대 · 폭) | ${P.b} 띠(최소 ~ 최대 · 폭) | 갈래 차(${P.b} − ${P.a} · 갈래 판끼리) | 띠 평균 차 | 띠 겹침 | 갈래 차 > 큰 띠 폭 |`);
  console.log('|---|---|---|---|---|---|---|');
  const rows = [];
  for (const [k, nm] of KEYS) { const a = band(A, k), b = band(B, k), d = B.arm[k] - A.arm[k], dm = b.mean - a.mean, ov = !(a.hi < b.lo || b.hi < a.lo), big = Math.abs(d) > Math.max(a.w, b.w);
    rows.push({ k, a, b, d, dm, ov, big });
    console.log(`| ${nm} | ${f(a.lo)} ~ ${f(a.hi)} · ${f(a.w)} | ${f(b.lo)} ~ ${f(b.hi)} · ${f(b.w)} | ${d > 0 ? '+' : ''}${f(d)} | ${dm > 0 ? '+' : ''}${f(dm)} | ${ov ? '겹침' : '안 겹침'} | ${big ? '예' : '아니오'} |`); }
  OUT.pairs.push({ P, rows });
}
if (FIRSTM) {   // ★[T995] 같은 대조 판끼리 dctl 날 줄이 처음 갈린 날
  OUT.first = {};
  for (const P of PAIRS) { OUT.first[P.name] = {};
    console.log(`\n## ${P.name} — 같은 대조 판끼리 econ 날 줄(dctl)이 처음 갈린 날(시드 1020 / 7 / 42)\n`);
    console.log('| 대조 | ' + SEEDS.join(' | ') + ' |'); console.log('|---|' + SEEDS.map(() => '---:').join('|') + '|');
    for (const k of ['', '~raid1', '~raid2', '~raid3']) { const cells = [];
      for (const s of SEEDS) { const a = rd(path.join(D, `run-${P.a}${k}`, `base-${s}.dctl.json`)), b = rd(path.join(D, `run-${P.b}${k}`, `base-${s}.dctl.json`));
        if (!a || !b) { cells.push('—'); continue; }
        const mA = new Map(a.days.map(([d, r]) => [d, JSON.stringify(r)])); let first = null, n = 0;
        for (const [d, r] of b.days) { if (!mA.has(d)) continue; n++; if (mA.get(d) !== JSON.stringify(r)) { first = d; break; } }
        cells.push(first === null ? `같음(${n}날)` : String(first)); }
      OUT.first[P.name][k || '(갈래 판)'] = cells; console.log(`| ${k || '(갈래 판)'} | ${cells.join(' | ')} |`); } }
}
if (TOPM) {   // ★[T995] 시드마다 가장 긴 전쟁 셋 · 20날+ — t845 만 읽는다(판 JSON 없는 시드도)
  OUT.top = {};
  console.log('\n## 시드마다 가장 오래 산 전쟁 셋(id:공격→방어:처음~마지막:산 날) · 20날 넘게 산 전쟁 수\n');
  console.log('| 판 | 시드 | 마지막 본 날 | 전쟁 수 | 20날+ | 가장 긴 셋 |');
  console.log('|---|---:|---:|---:|---:|---|');
  for (const x of dirs.slice().sort()) { OUT.top[x] = {};
    for (const s of SEEDS) { const q = rd(path.join(D, x, `base-${s}.t845.json`)); if (!q) continue;
      const lastDay = q.rows.length ? q.rows[q.rows.length - 1][0] : 0; const W = new Map();
      for (const [d, list] of (q.wars || [])) for (const w of list) { const o = W.get(w[0]) || { id: w[0], atk: w[1], def: w[2], first: d, last: d }; o.last = d; W.set(w[0], o); }
      const L = [...W.values()].map((o) => ({ ...o, len: o.last - o.first + 1, open: o.last >= lastDay })).sort((a, b) => b.len - a.len || a.first - b.first);
      const top = L.slice(0, 3).map((o) => `${o.id}:${o.atk}→${o.def}:${o.first}~${o.last}:${o.len}${o.open ? '(끝까지)' : ''}`), ge20 = L.filter((o) => o.len >= 20).length;
      OUT.top[x][s] = { lastDay, wars: W.size, ge20, top, json: !!rd(path.join(D, x, `base-${s}.json`)) };
      console.log(`| ${x.slice(4)} | ${s} | ${lastDay}${OUT.top[x][s].json ? '' : '(판 JSON 없음)'} | ${W.size} | ${ge20} | ${top.join(' · ')} |`); } }
}
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(OUT));
