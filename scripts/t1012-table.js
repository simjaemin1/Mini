#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1012 표 기계 · 판 JSON 만 읽는다)
// === scripts/t1012-table.js — 서버 판 자 띠 ↔ 랩 띠: 셈마다 띠 · 겹침 · 갈래 판 값 ===
//   node scripts/t1012-table.js --srv <뿌리>/run-<판> 여럿(쉼표) --lab <랩 뿌리>:<접두 여럿 쉼표> [--arm <이름>=<뿌리>/run-<판> …] [--json <파일>]
//     서버 판 = <run 디렉터리>/base-<시드>.t1012.json · 랩 판 = <랩 뿌리>/<접두>-<시드>.t1012.json
//   셈(3시드 합 · 산수뿐 · 판정 0): 인구(날 90 · 365 · 끝) · 첫해 굶어 죽음(날 < 365) · 굶는 마을-날(끝까지 · 첫해) · 빈 마을(끝) · 캐러밴(첫해 · 끝까지)
//     · 직업 몫(끝 · 365 — 직업마다 그 직업 사람 ÷ 인구) · 곳간(끝 · 365 · 사람당 — 식량 환산 · 도구 · 목재 · 돌 · 무기 · 옷) · 주거 ÷ 인구(끝 · 365)
//   갈래 판 귀속(`--armbase <뿌리>/run-<판>` — 갈래 판과 같은 날 수 · 같은 시드의 서버 기본 판): 안 겹치는 셈 가운데 날 365 안 셈(90 · 365 · 첫해)만
//     메운 몫 = (갈래 − 기본) ÷ (랩 띠 가운데 − 기본) — 1 = 랩 띠 가운데까지 · 0 = 그대로 · 음수 = 반대쪽 · 갈래 값이 랩 띠 안이면 `띠 안`
'use strict';
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const SEEDS = [1020, 7, 42];
const J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const get = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const srvDirs = (get('--srv') || '').split(',').filter(Boolean);
const [labRoot, labPre] = (get('--lab') || ':').split(':');
const arms = []; argv.forEach((x, i) => { if (x === '--arm') { const [n, d] = argv[i + 1].split('='); arms.push([n, d.split(',')]); } });
const JOUT = get('--json');
const ARMBASE = get('--armbase');
function measure(files) {   // 판 하나(시드 셋) → 셈
  const m = {}; let ok = 0;
  const add = (k, v) => { m[k] = (m[k] || 0) + (+v || 0); };
  const jobs365 = {}, jobsEnd = {}; let pop365 = 0, popEnd = 0;
  for (const f of files) {
    const o = J(f); if (!o || !o.daily || !o.daily.length) continue; ok++;
    const D = o.daily;
    const at = (d) => { let r = D[0]; for (const x of D) { if (x[0] <= d) r = x; else break; } return r; };
    add('인구 90', at(89)[1]); add('인구 365', at(364)[1]); add('인구 끝', D[D.length - 1][1]);
    for (const [d, , dth, st, , car] of D) { if (d < 365) { add('첫해 굶어 죽음', dth); add('첫해 굶는 마을-날', st); add('첫해 캐러밴', car); } add('굶는 마을-날', st); add('캐러밴', car); }
    add('빈 마을(끝)', D[D.length - 1][4]);
    for (const [key, J2, tgt] of [['364', jobs365, 'pop365'], ['last', jobsEnd, 'popEnd']]) {
      const S = o.samples && o.samples[key]; if (!S) continue;
      for (const v of Object.values(S)) { for (const [j, n] of Object.entries(v.counts || {})) J2[j] = (J2[j] || 0) + n; if (tgt === 'pop365') pop365 += v.pop; else popEnd += v.pop; }
      for (const v of Object.values(S)) for (const k of ['tfe', 'tool', 'wood', 'stone', 'weapon', 'clothes', 'housing']) add(`_${k}_${key}`, v[k]);
    }
  }
  if (!ok) return null;
  for (const [key, P, tag] of [['last', popEnd, '끝'], ['364', pop365, '365']]) for (const k of ['tfe', 'tool', 'wood', 'stone', 'weapon', 'clothes', 'housing']) {
    m[`사람당 ${{ tfe: '식량 환산', tool: '도구', wood: '목재', stone: '돌', weapon: '무기', clothes: '옷', housing: '주거' }[k]}(${tag})`] = P ? (m[`_${k}_${key}`] || 0) / P : 0; delete m[`_${k}_${key}`]; }
  for (const [j, n] of Object.entries(jobsEnd)) m[`직업 몫 ${j}(끝)`] = popEnd ? n / popEnd : 0;
  for (const [j, n] of Object.entries(jobs365)) m[`직업 몫 ${j}(365)`] = pop365 ? n / pop365 : 0;
  m._n = ok;
  return m;
}
const srvRuns = srvDirs.map((d) => [path.basename(d), measure(SEEDS.map((s) => path.join(d, `base-${s}.t1012.json`)))]).filter(([, m]) => m);
const labRuns = (labPre || '').split(',').filter((x) => x !== undefined).map((p) => [`lab:${p || '기본'}`, measure(SEEDS.map((s) => path.join(labRoot, `${p}${p ? '-' : '-'}${s}.t1012.json`.replace(/^-/, '')))) ]).filter(([, m]) => m);
const armRuns = arms.map(([n, ds]) => [n, ds.map((d) => measure(SEEDS.map((s) => path.join(d, `base-${s}.t1012.json`)))).filter(Boolean)]);
const keys = [...new Set([...srvRuns, ...labRuns].flatMap(([, m]) => Object.keys(m)).filter((k) => !k.startsWith('_')))];
const band = (runs, k) => { const v = runs.map(([, m]) => m[k] || 0); return [Math.min(...v), Math.max(...v)]; };
const fmt = (x, k) => (/몫|사람당/.test(k) ? (+x).toFixed(3) : Math.round(x).toLocaleString('en-US'));
const rows = [];
for (const k of keys) {
  const s = band(srvRuns, k), l = band(labRuns, k);
  const overlap = !(s[1] < l[0] || l[1] < s[0]);
  const gap = overlap ? 0 : (s[1] < l[0] ? l[0] - s[1] : s[0] - l[1]);
  const mid = (a) => (a[0] + a[1]) / 2;
  const ratio = mid(l) ? mid(s) / mid(l) : null;
  const wide = Math.max(s[1] - s[0], l[1] - l[0]);
  rows.push({ k, s, l, overlap, gap, ratio, gapOverWidth: wide ? gap / wide : (gap ? Infinity : 0), arms: armRuns.map(([n, ms]) => [n, ms.map((m) => m[k] || 0)]) });
}
rows.sort((a, b) => (a.overlap - b.overlap) || (b.gapOverWidth - a.gapOverWidth));
console.log(`\n서버 판 ${srvRuns.map(([n, m]) => `${n}(${m._n}/3)`).join(' · ')} ↔ 랩 판 ${labRuns.map(([n, m]) => `${n}(${m._n}/3)`).join(' · ')}`);
console.log(`\n| 셈(3시드 합) | 서버 띠 | 랩 띠 | 겹침 | 서버 ÷ 랩(띠 가운데) | 틈 ÷ 큰 띠 폭 |${armRuns.map(([n]) => ` ${n} |`).join('')}`);
console.log(`|---|---|---|---|---:|---:|${armRuns.map(() => '---|').join('')}`);
for (const r of rows) console.log(`| ${r.k} | ${fmt(r.s[0], r.k)} ~ ${fmt(r.s[1], r.k)} | ${fmt(r.l[0], r.k)} ~ ${fmt(r.l[1], r.k)} | ${r.overlap ? '겹침' : '**안 겹침**'} | ${r.ratio == null ? '—' : r.ratio.toFixed(2)} | ${r.overlap ? '—' : (isFinite(r.gapOverWidth) ? r.gapOverWidth.toFixed(2) : '∞')} |${r.arms.map(([, v]) => ` ${v.map((x) => fmt(x, r.k)).join(' · ') || '—'} |`).join('')}`);
let attr = null;
if (ARMBASE && armRuns.length) {
  const B = measure(SEEDS.map((s) => path.join(ARMBASE, `base-${s}.t1012.json`)));
  const early = rows.filter((r) => !r.overlap && /90|365|첫해/.test(r.k));
  attr = early.map((r) => { const lm = (r.l[0] + r.l[1]) / 2, b = B[r.k] || 0;
    return { k: r.k, base: b, labMid: lm, arms: armRuns.map(([n, ms]) => { const v = ms[0] ? (ms[0][r.k] || 0) : null;
      return [n, v, v == null || lm === b ? null : (v - b) / (lm - b), v != null && v >= r.l[0] && v <= r.l[1]]; }) }; });
  console.log(`\n갈래 판 귀속 — 기본 ${path.basename(ARMBASE)} · 칸 = 갈래 값 (메운 몫 = (갈래 − 기본) ÷ (랩 가운데 − 기본))`);
  console.log(`\n| 셈 | 기본 | 랩 가운데 |${armRuns.map(([n]) => ` ${n} |`).join('')}`);
  console.log(`|---|---:|---:|${armRuns.map(() => '---|').join('')}`);
  for (const a of attr) console.log(`| ${a.k} | ${fmt(a.base, a.k)} | ${fmt(a.labMid, a.k)} |${a.arms.map(([, v, c, inb]) => ` ${v == null ? '—' : fmt(v, a.k)} (${c == null ? '—' : (c * 100).toFixed(0) + '%'}${inb ? ' · 띠 안' : ''}) |`).join('')}`);
}
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify({ srv: srvRuns, lab: labRuns, arms: armRuns, rows, attr }));
