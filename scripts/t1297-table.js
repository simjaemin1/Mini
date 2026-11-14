#!/usr/bin/env node
// (@regress 없음 — 판 JSON 읽기만 · 세계를 안 세운다 · 판정 0)
// === scripts/t1297-table.js — T1297 판 표: 끔 · 묶음 + T1283 · + T1297 · v2 만 + T1283 + T1297 · 끔 + T1297 (· 실험 판) — 3시드 × 400날 ===
//   읽는 것: 기준선 JSON(끔 — 인구 · 빈 마을) · `--make` JSON(팔마다) · 판 폴더의
//     `sbc-<시드>.json.t1275.json`(날 줄 — 인구 · 나무꾼 · 곳간 통나무 · 주거 문 마을 수) · `sbc-<시드>.json.t1297.json`(마을-날 — 난 · 죽은 사람 · 굶는 사람 · 곳간 일치 · 출생 문) ·
//     `sbc-<시드>.fd-deaths.json`(굶어 죽음 누계) · `sbc-<시드>.json`(판 JSON — 죽음 전부 `deadTot`)
//   재는 것(시드마다): 인구 · 끔비 · 빈 마을 · 꼭대기(날) · 꼭대기 뒤 내림 % · 굶어 죽음 · 난 사람(`bornE` · 없으면 새 얼굴 중 늘림 선 날만 = *) · 그중 곳간 10일치 밑 날 몫 · 출생 문(T1297)에 막힌 마을-날 · 주거 문 마을-날 ·
//     굶는 사람(가장 많은 날) · 끝 날 나무꾼 · 50날 줄
//   쓰는 법: node scripts/t1297-table.js --off <기준선>[@<끔 판 폴더>,…] --arm <이름>=<make.json>[,…]@<판 폴더>[,…] … [--out 계측/T1297_<날짜>]
'use strict';
const fs = require('fs'), path = require('path');
const A = process.argv.slice(2);
const opt = (k) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : null; };
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const SEEDS = [1020, 7, 42];
const arms = []; for (let i = 0; i < A.length; i++) if (A[i] === '--arm') { const v = A[i + 1], j = v.indexOf('='), [js, ds] = v.slice(j + 1).split('@'); arms.push({ k: v.slice(0, j), jsons: js.split(','), dirs: (ds || '').split(',').filter(Boolean) }); }
const OFFA = (opt('--off') || '').split('@'), OFF = OFFA[0] || null, OFFD = (OFFA[1] || '').split(',').filter(Boolean), OUT = opt('--out');
const find = (dirs, s, suf) => { for (const d of dirs) { const p = path.join(d, `sbc-${s}${suf}`); if (fs.existsSync(p)) return p; } return null; };
//   T1275 훅 날 줄 칸: 0 날 · 1 인구 · 3 곳간 통나무 · 14 나무꾼 · 20 주거 문 마을 수
function seedRow(r, dirs, s) {
  const o = { pop: r ? r.eight.pop : null, empty: r ? r.empty : null };
  const h5 = rd(find(dirs, s, '.json.t1275.json') || ''), h7 = rd(find(dirs, s, '.json.t1297.json') || ''), fd = rd(find(dirs, s, '.fd-deaths.json') || ''), sj = rd(find(dirs, s, '.json') || '');
  if (h5 && h5.days && h5.days.length) {
    const D = h5.days, last = D[D.length - 1];
    let pk = D[0]; for (const q of D) if (q[1] > pk[1]) pk = q;
    o.peak = pk[1]; o.peakDay = pk[0]; o.drop = +(100 * (pk[1] - last[1]) / pk[1]).toFixed(1);
    o.lj = last[14]; o.wood = +last[3].toFixed(0); o.houseGated = D.reduce((a, q) => a + (q[20] || 0), 0);
    o.traj = D.filter((q) => q[0] % 50 === 0).map((q) => [q[0], q[1], q[14], +q[3].toFixed(0)]);   // 50날 눈금(훅 마지막 줄 = 400날 — 여덟 수 인구와 같은 날)
  }
  if (h7 && h7.rows) {
    const c = {}; h7.cols.forEach((k, i) => { c[k] = i; });
    let born = 0, bornLow = 0, gate = 0, gateOn = false, faces = 0; const st = {};
    //   난 사람 = 훅 `bornE`(econ 새 주민 번호 계수기 `_nid` 의 날 차 — 이 마을에서 오늘 난 사람) · 그 칸이 없는 판(T1297 켬 팔)은 새 얼굴(`born` — 처음 보는 id) 중
    //     그날 늘림이 선(dP > 0) 마을-날만(늘림 0 인 날의 새 얼굴 = 다른 마을에서 나 그날 걸어 나와 닿은 사람 — 그 마을 출생 줄은 그날 못 낳는다) — 표에 * 표지
    const exact = c.bornE != null, bornOf = exact ? (q) => q[c.bornE] || 0 : (q) => ((q[c.dP] || 0) > 0 ? (q[c.born] || 0) : 0);
    o.bornExact = exact;
    for (const q of h7.rows) {
      faces += q[c.born] || 0;
      const b = bornOf(q); born += b; if (b && q[c.foodDays] != null && q[c.foodDays] < 10) bornLow += b;
      if (q[c.t1297] != null) { gateOn = true; gate += q[c.t1297] || 0; }
      st[q[c.day]] = (st[q[c.day]] || 0) + (q[c.starving] || 0);
    }
    o.born = born; o.faces = faces; o.bornLow = born ? +(100 * bornLow / born).toFixed(0) : 0; o.gate = gateOn ? gate : null;
    let sm = 0, sd = null; for (const d of Object.keys(st)) if (st[d] > sm) { sm = st[d]; sd = +d; }
    o.starveMax = sm; o.starveDay = sd;
  }
  if (fd) o.famine = fd.fdDeadTot;
  if (sj && sj.deadTot != null) o.dead = sj.deadTot;   // 판 JSON — econ `_deadTot` 합(굶음 · 늙음 · 빚 · 그 밖 모든 죽음)
  return o;
}
const res = {};
if (OFF) { const b = rd(OFF); res.off = { seeds: {} }; for (const s of SEEDS) { const r = b && b.byseed && b.byseed[String(s)]; if (r) res.off.seeds[s] = seedRow(r, OFFD, s); } }
for (const a of arms) {
  const by = {}; for (const f of a.jsons) { const b = rd(f); if (b && b.byseed) Object.assign(by, b.byseed); }
  res[a.k] = { seeds: {} };
  for (const s of SEEDS) { const r = by[String(s)]; if (r) res[a.k].seeds[s] = seedRow(r, a.dirs, s); }
}
const NAME = { off: '끔(기준선 11-11)', offN: '끔(이 베이스 · 훅)', offB: '끔 + T1297', bundleT: '묶음 + T1283', bundleTB: '묶음 + T1283 + T1297', v2TB: 'v2 만 + T1283 + T1297', v2T: 'v2 만 + T1283(T1283 판)', offB10: '끔 + T1297(기근 줄 10일치 · 실험 · 가지에 안 실음)' };
const offPop = (s) => res.off && res.off.seeds[s] ? res.off.seeds[s].pop : null;
const num = (x, f) => (typeof x !== 'number' ? (x == null ? '—' : x) : (f === 'drop' || f === 'bornLow') ? String(x) : String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
const md = [];
md.push('| 판 | 인구(명) 1020 · 7 · 42 | 끔비 1020 · 7 · 42 | 빈 마을(곳) | 꼭대기(명 · 날) | 꼭대기 뒤 내림(%) | 굶어 죽음(명 · 400날) | 난 사람(명 · 400날) | ㄴ 곳간 10일치 밑 날(%) | 죽음 전부(명 · 400날) | 출생 문(T1297)에 막힌 마을-날 | 주거 문 마을-날 | 굶는 사람(가장 많은 날 · 명) | 나무꾼(끝 · 명) |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const k of Object.keys(res)) {
  const o = res[k], per = (f) => SEEDS.map((s) => (o.seeds[s] ? num(o.seeds[s][f], f) + ((f === 'born' || f === 'bornLow') && o.seeds[s].bornExact === false ? '*' : '') : '—')).join(' · ');
  const ratio = SEEDS.map((s) => (o.seeds[s] && offPop(s) ? (o.seeds[s].pop / offPop(s)).toFixed(3) : '—')).join(' · ');
  const peak = SEEDS.map((s) => (o.seeds[s] && o.seeds[s].peak != null ? `${num(o.seeds[s].peak)} (${o.seeds[s].peakDay})` : '—')).join(' · ');
  const stv = SEEDS.map((s) => (o.seeds[s] && o.seeds[s].starveMax != null ? (o.seeds[s].starveDay == null ? '0' : `${num(o.seeds[s].starveMax)} (${o.seeds[s].starveDay})`) : '—')).join(' · ');   // 400날 내내 굶는 사람 0 = '0'
  md.push(`| ${NAME[k] || k} | ${per('pop')} | ${k === 'off' ? '1 · 1 · 1' : ratio} | ${per('empty')} | ${peak} | ${per('drop')} | ${per('famine')} | ${per('born')} | ${per('bornLow')} | ${per('dead')} | ${per('gate')} | ${per('houseGated')} | ${stv} | ${per('lj')} |`);
}
const txt = md.join('\n'); console.log(txt);
if (OUT) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 't1297-table.json'), JSON.stringify(res)); fs.writeFileSync(path.join(OUT, 't1297-table.md'), txt + '\n'); console.log(`\n→ ${OUT}/t1297-table.{json,md}`); }
