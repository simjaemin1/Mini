#!/usr/bin/env node
// (@regress 없음 — 판 JSON 읽기만 · 세계를 안 세운다 · 판정 0)
// === scripts/t1275-table.js — T1275 판 표: 끔(기준선) · v2 만(고침 뒤) · 묶음(나무꾼 몸 + v2 · 고침 뒤) — 3시드 × 400날 ===
//   읽는 것: 기준선 JSON(끔 — 인구 · 빈 마을) · `--make` JSON(팔마다 · 인구 · 빈 마을) · 판 폴더의 `sbc-<시드>.json.t1275.json`(계측 훅 — 칸 읽기만)
//   재는 것(끝 날 · 시드마다): 인구 · 끔비 · 빈 마을 · 영토 칸 · econ 땅 · 말뚝 통나무 누계 · 개간 그루 · 곳간에 든 개간 통나무 · 마을 짐 · 통나무 막힘 % · 나무꾼 · 곳간 통나무
//   쓰는 법: node scripts/t1275-table.js --off 계측/서버기준선_2026-11-11.json[@<끔 판 폴더>,…] --arm v2=<make.json>[,…]@<판 폴더>[,…] --arm bundle=… [--arm pre=… (고치기 전 v2 · 있으면)] [--out 계측/T1275_<날짜>]
'use strict';
const fs = require('fs'), path = require('path');
const A = process.argv.slice(2);
const opt = (k) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : null; };
const arms = []; for (let i = 0; i < A.length; i++) if (A[i] === '--arm') { const v = A[i + 1], j = v.indexOf('='), [js, ds] = v.slice(j + 1).split('@'); arms.push({ k: v.slice(0, j), jsons: js.split(','), dirs: (ds || '').split(',').filter(Boolean) }); }
const OFFA = (opt('--off') || '').split('@'), OFF = OFFA[0] || null, OFFD = (OFFA[1] || '').split(',').filter(Boolean), OUT = opt('--out');   // --off <기준선>[@<끔 판 폴더>,…] — 폴더가 있으면 끔 줄도 훅(땅 · 나무꾼 · 곳간 통나무)을 읽는다
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const SEEDS = [1020, 7, 42];
//   훅 날 줄 칸: [날 · 인구 · 영토 · 곳간 통나무 · 잉여+ · 잉여 마을 · 비축 넘는 마을 · 통나무 막힘 누계 · 몸 막힘 누계 · 넓힌 칸 · 말뚝 통나무 · 벤 그루 · 곳간에 든 개간 통나무 · 짐 · 나무꾼 · 나무꾼 자리 · 수식 목재 · 주거 · 모자람 · 땅 · 출생 주거 문]
const D = { pop: 1, terr: 2, wood: 3, stallW: 7, days: null, cells: 9, postW: 10, felled: 11, woodIn: 12, pack: 13, lj: 14, land: 19 };
const res = {};
if (OFF) { const b = rd(OFF); res.off = { seeds: {} }; for (const s of SEEDS) { const r = b && b.byseed && b.byseed[String(s)]; if (!r) continue;
  let h = null; for (const d of OFFD) { h = rd(path.join(d, `sbc-${s}.json.t1275.json`)); if (h) break; }
  const last = h && h.days && h.days[h.days.length - 1];
  res.off.seeds[s] = { pop: r.eight.pop, empty: r.empty, hook: !!h, land: last ? +last[D.land].toFixed(1) : null, lj: last ? last[D.lj] : null, wood: last ? last[D.wood] : null,
    traj: h ? h.days.filter((q) => q[0] % 50 === 0).map((q) => [q[0], q[1], q[2], +q[3].toFixed(0), q[14], +(q[13] || 0).toFixed(0)]) : [] }; } }
for (const a of arms) {
  const by = {}; for (const f of a.jsons) { const b = rd(f); if (b && b.byseed) Object.assign(by, b.byseed); }
  const o = { seeds: {} };
  for (const s of SEEDS) {
    const r = by[String(s)]; if (!r) continue;
    let h = null; for (const d of a.dirs) { h = rd(path.join(d, `sbc-${s}.json.t1275.json`)); if (h) break; }
    const last = h && h.days && h.days[h.days.length - 1];
    const T = h && h.snaps && h.snaps[h.snaps.length - 1];
    const tdays = T ? T.rows.reduce((x, q) => x + (q[9] || 0), 0) : 0;   // T1207 장부 치른 날(넓히려 한 마을-날)
    o.seeds[s] = { pop: r.eight.pop, empty: r.empty, hook: !!h,
      terr: last ? last[D.terr] : null, land: last ? +last[D.land].toFixed(1) : null, postW: last ? last[D.postW] : null, felled: last ? last[D.felled] : null,
      woodIn: last ? last[D.woodIn] : null, pack: last ? last[D.pack] : null, lj: last ? last[D.lj] : null, wood: last ? last[D.wood] : null,
      stallPct: (last && tdays) ? +(100 * last[D.stallW] / tdays).toFixed(1) : null,
      traj: h ? h.days.filter((q) => q[0] % 50 === 0).map((q) => [q[0], q[1], q[2], +q[3].toFixed(0), q[14], +(q[13] || 0).toFixed(0)]) : [] };
  }
  res[a.k] = o;
}
const NAME = { off: '끔(기준선 11-11)', pre: 'v2 만 · 고치기 전', v2: 'v2 만 · 고침 뒤', bundle: '묶음(나무꾼 몸 + v2) · 고침 뒤' };
const offPop = (s) => res.off && res.off.seeds[s] ? res.off.seeds[s].pop : null;
const md = [];
md.push('| 판 | 인구(명) 1020 · 7 · 42 | 끔비 1020 · 7 · 42 | 빈 마을(곳) | 영토(끝 · 칸) | econ 땅(끝 · 51마을 합 · v2 = 영토 칸 ÷ 25) | 말뚝 통나무 누계(단) | 벤 그루(그루) | 곳간에 든 개간 통나무(단) | 마을 짐(끝 · 단) | 통나무 막힘(% · 넓히려 한 마을-날 중) | 나무꾼(끝 · 명) | 곳간 통나무(끝 · 단) |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
const num = (x, f) => (typeof x !== 'number' ? x : f === 'stallPct' ? x.toFixed(1) : String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ','));   // 표 글자만 — 1,000 자리 쉼표 · 막힘 % 만 소수 한 자리(JSON 은 그대로)
for (const k of Object.keys(res)) {
  const o = res[k], per = (f) => SEEDS.map((s) => (o.seeds[s] && o.seeds[s][f] != null ? num(o.seeds[s][f], f) : '—')).join(' · ');
  const ratio = SEEDS.map((s) => (o.seeds[s] && offPop(s) ? (o.seeds[s].pop / offPop(s)).toFixed(3) : '—')).join(' · ');
  md.push(`| ${NAME[k] || k} | ${per('pop')} | ${k === 'off' ? '1 · 1 · 1' : ratio} | ${per('empty')} | ${k === 'off' ? '—' : per('terr')} | ${per('land')} | ${k === 'off' ? '—' : per('postW')} | ${k === 'off' ? '—' : per('felled')} | ${k === 'off' ? '—' : per('woodIn')} | ${k === 'off' ? '—' : per('pack')} | ${k === 'off' ? '—' : per('stallPct')} | ${per('lj')} | ${per('wood')} |`);
}
const txt = md.join('\n'); console.log(txt);
if (OUT) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 't1275-table.json'), JSON.stringify(res)); fs.writeFileSync(path.join(OUT, 't1275-table.md'), txt + '\n'); console.log(`\n→ ${OUT}/t1275-table.{json,md}`); }
