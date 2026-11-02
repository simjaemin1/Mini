#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1056 표 기계 · 판 JSON 만 읽는다 · 판정 0)
// === scripts/t1056-table.js — T1050 회부 3 표: 서버 판에서 집터를 못 세운 마을-날 · 그 마을들의 성장 차 몫 ===
//   node scripts/t1056-table.js --srv <뿌리>/run-srv,<뿌리>/run-srv~raid1,… --lab <랩 뿌리>:h,h1,h2,h3 [--json out.json]
//     서버 판 = <run>/base-<시드>.t1056.json(관찰기 `t1056-observe.js`) · 같은 자리 `.t1012.json`(마을마다 인구 — 날 90 · 365 · 끝)
//     랩 판   = <랩 뿌리>/<접두>-<시드>.t1012.json
//   셈(산수뿐):
//     ⓐ 판마다 · 시드마다 — 집터 시도 마을-날 · 못 세운 마을-날(첫해 · 끝까지) · 못 세운 날이 하루라도 있는 마을 수 · 짝 못 찾은 부름(ambig · nomatch)
//     ⓑ 성장 차 = 마을마다 (랩 인구 − 서버 인구)(같은 시드 · 같은 이름 · 날 90 · 365 · 끝) — 판 쌍은 같은 차례(기본 ↔ 기본 …)
//        그 마을들(그 서버 판에서 못 세운 날 > 0) 몫 = 그 마을 차 합 ÷ 전체 차 합(부호 그대로) · 절댓값 몫 = |차| 합 ÷ |차| 합
//        ★그 날 전에 이미 못 세운 마을(첫 못 세운 날 < 표본 날)만 친 몫도 낸다(`그 날 전` 칸 — 날 90 표본에 날 500 에 처음 막힌 마을을 넣지 않게)
'use strict';
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const get = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const SEEDS = [1020, 7, 42];
const srv = (get('--srv') || '').split(',').filter(Boolean);
const [labRoot, labPre] = (get('--lab') || ':').split(':');
const pres = (labPre || '').split(',').filter(Boolean);
const out = { runs: [] };
const keys = [['89', '90'], ['364', '365'], ['last', '끝']];
console.log('\n| 서버 판 | 시드 | 시도 마을-날 | 못 세운 마을-날(첫해) | 못 세운 마을-날(끝까지) | 못 세운 마을 | 짝 못 찾음 |');
console.log('|---|---|---:|---:|---:|---:|---:|');
const gapRows = [];
srv.forEach((d, ri) => {
  const pre = pres[ri] || pres[0];
  const agg = { att: 0, f365: 0, fall: 0, vils: 0, miss: 0 };
  const G = Object.fromEntries(keys.map(([k]) => [k, { all: 0, sub: 0, absAll: 0, absSub: 0, n: 0, subB: 0, absSubB: 0 }]));
  for (const seed of SEEDS) {
    const o = J(path.join(d, `base-${seed}.t1056.json`)); if (!o) { console.log(`| ${path.basename(d)} | ${seed} | (없음) |`); continue; }
    let att = 0, f365 = 0, fall = 0, vils = 0; const failV = new Set(), firstOf = {};
    for (const [n, p] of Object.entries(o.per)) { att += p.att; f365 += p.fail365; fall += p.fail; if (p.fail > 0) { vils++; failV.add(n); firstOf[n] = p.first; } }
    agg.att += att; agg.f365 += f365; agg.fall += fall; agg.vils += vils; agg.miss += (o.ambig || 0) + (o.nomatch || 0);
    console.log(`| ${path.basename(d)} | ${seed} | ${att.toLocaleString('en-US')} | ${f365.toLocaleString('en-US')} | ${fall.toLocaleString('en-US')} | ${vils} | ${(o.ambig || 0) + (o.nomatch || 0)} |`);
    const S = J(path.join(d, `base-${seed}.t1012.json`)), L = J(path.join(labRoot, `${pre}-${seed}.t1012.json`));
    if (!S || !L) continue;
    for (const [k] of keys) {
      const ss = (S.samples || {})[k] || {}, ls = (L.samples || {})[k] || {};
      for (const n of Object.keys(ss)) { if (!ls[n]) continue; const g = ls[n].pop - ss[n].pop; G[k].all += g; G[k].absAll += Math.abs(g); G[k].n++; if (failV.has(n)) { G[k].sub += g; G[k].absSub += Math.abs(g); if (firstOf[n] != null && (k === 'last' || firstOf[n] < +k)) { G[k].subB += g; G[k].absSubB += Math.abs(g); } } }
    }
    out.runs.push({ run: path.basename(d), seed, att, f365, fall, vils, failV: [...failV], per: o.per });
  }
  console.log(`| **${path.basename(d)} 합** | 3시드 | ${agg.att.toLocaleString('en-US')} | ${agg.f365.toLocaleString('en-US')} | ${agg.fall.toLocaleString('en-US')} | ${agg.vils} | ${agg.miss} |`);
  gapRows.push([path.basename(d), pre, G]);
});
console.log('\n| 서버 판 ↔ 랩 판 | 날 | 성장 차 Σ(랩 − 서버) 전체 | 못 세운 마을 몫 | 몫(부호) | \\|차\\| 전체 | \\|차\\| 못 세운 마을 | 몫(\\|차\\|) | 그 날 전 막힌 마을 차 | 몫(부호) | \\|차\\| | 몫(\\|차\\|) |');
console.log('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const [r, pre, G] of gapRows) for (const [k, nm] of keys) {
  const g = G[k];
  console.log(`| ${r} ↔ ${pre} | ${nm} | ${g.all} | ${g.sub} | ${g.all ? (g.sub / g.all * 100).toFixed(1) + '%' : '—'} | ${g.absAll} | ${g.absSub} | ${g.absAll ? (g.absSub / g.absAll * 100).toFixed(1) + '%' : '—'} | ${g.subB} | ${g.all ? (g.subB / g.all * 100).toFixed(1) + '%' : '—'} | ${g.absSubB} | ${g.absAll ? (g.absSubB / g.absAll * 100).toFixed(1) + '%' : '—'} |`);
}
out.gap = gapRows;
if (get('--json')) fs.writeFileSync(get('--json'), JSON.stringify(out, null, 1));
