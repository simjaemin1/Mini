'use strict';
// (@regress 없음 — 러너 밖 · T951 표 기계 · 제품 무변)
// === scripts/t951-table.js — `t951-raid-observe` + `t934-observe` 판 JSON 을 읽어 마을별 습격 손실 ↔ 굶어 죽음 표 · 창 표 · 그림 자료 ===
//   쓰는 법: node scripts/t951-table.js <주 판 dir> [<대조 판 dir> …] [--json <out.json>]
//     주 판 dir = `t577-server-run.js` 의 T577_DIR(그 안 `base-<시드>.t951.json` · `.t934.json`) · 대조 판 = 같은 갈래에 `DCTL_SKIP=raid:n`(T837 갈림 대조)
//   도적 보호기 끝나는 날은 **정본 함수 그대로** 읽는다 — `server/bandits.js` 의 `_bdtOpenDay` 를 그 파일 원문 그대로 컴파일해 부른다(사본 0).
//   굶주림 몫: 죽음이 난 마을-날의 음수 칸(logi · hunger · health · happy · prestige) 크기 비로 나눈다(T934 표 기계와 같은 근사 — 그날 음수 칸이 없으면 '모름').
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ROOT = path.join(__dirname, '..');
const A = process.argv.slice(2);
const jOut = A.indexOf('--json') >= 0 ? A[A.indexOf('--json') + 1] : null;
const dirs = A.filter((x, i) => !x.startsWith('--') && A[i - 1] !== '--json');
if (!dirs.length) { console.error('쓰는 법: node scripts/t951-table.js <주 판 dir> [<대조 dir> …] [--json out]'); process.exit(2); }
const SEEDS = ['1020', '7', '42'];
const FIRST = 365;   // 첫해 = SHIELD_DAYS(econ 보호막의 그 날 수 · sim/economy-sim.js) — 아래 SHIELD 로 읽는다
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
// ── 정본 읽기: bandits.js 원문 + 내보내기 한 줄(그 파일의 함수 그대로)
function bdtOpen() {
  const f = path.join(ROOT, 'server', 'bandits.js');
  const m = new Module(f, module); m.filename = f; m.paths = Module._nodeModulePaths(path.dirname(f));
  m._compile(fs.readFileSync(f, 'utf8') + '\n;module.exports.__t951Open = _bdtOpenDay; module.exports.__t951Min = BDT_MIN_DAY;', f);
  return { open: m.exports.__t951Open, min: m.exports.__t951Min };
}
const BO = bdtOpen();
const src = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const SHIELD = +((src.match(/const SHIELD_DAYS = (\d+);/) || [])[1] || FIRST);
const load = (d, s, ext) => { try { return JSON.parse(fs.readFileSync(path.join(d, `base-${s}.${ext}.json`), 'utf8')); } catch (e) { return null; } };
const COL = ['pop', 'deaths', 'shieldAte', 'K', 'logi', 'hunger', 'health', 'happy', 'prestige'];
function runOf(d, s) {
  const o = load(d, s, 't951'), t = load(d, s, 't934');
  if (!o || !t) return null;
  const names = t.names;
  const vil = {};
  for (const n of names) vil[n] = { deaths: 0, deathsY1: 0, hungerY1: 0, unknownY1: 0, lootN: 0, lootY1: 0, lootFE: 0, lootFEY1: 0, outFE: 0, inFE: 0, toN: 0, toFE: 0, toFEY1: 0, firstTo: null, toAfter60: 0, toBefore: 0, tkY1: 0, tk: 0, raided: 0, born: 0, firstLoot: null, deathsAfter60: 0, deathsBefore: 0, byDay: {} };
  for (const [day, row] of t.rows) {
    row.forEach((r, i) => {
      if (!r) return; const v = vil[names[i]]; if (!v) return;
      const dd = r[1] || 0; if (!dd) return;
      v.deaths += dd; v.byDay[day] = (v.byDay[day] || 0) + dd;
      if (day < FIRST) {
        v.deathsY1 += dd;
        const neg = [4, 5, 6, 7, 8].map((k) => Math.max(0, -(r[k] || 0))); const sum = neg.reduce((a, b) => a + b, 0);
        if (sum > 0) v.hungerY1 += dd * neg[1] / sum; else v.unknownY1 += dd;
      }
    });
  }
  for (const L of o.loot) {
    const [day, from, , , , fe, dir] = L; const v = vil[from]; if (!v) continue;
    v.lootN++; v.lootFE += fe || 0; if (dir === 'out') v.outFE += fe || 0; else v.inFE += fe || 0;
    if (day < FIRST) { v.lootY1++; v.lootFEY1 += fe || 0; }
    if (v.firstLoot == null) v.firstLoot = day;
    //   가는 길 손실은 **목적지가 받을 짐**이기도 하다(식량을 사 오려던 마을이 못 받는다) — 목적 마을 줄에도 든다
    const w = vil[L[2]];
    if (w && dir === 'out') { w.toN++; w.toFE += fe || 0; if (day < FIRST) w.toFEY1 += fe || 0; if (w.firstTo == null && (fe || 0) > 0) w.firstTo = day; }
  }
  const lastRow = o.rows[o.rows.length - 1][1], y1Row = (o.rows.find((r) => r[0] >= FIRST - 1) || o.rows[o.rows.length - 1])[1];
  o.names.forEach((n, i) => { const v = vil[n]; if (!v) return; const a = lastRow[i], b = y1Row[i]; if (a) { v.tk = a[2]; v.raided = a[0]; v.born = a[4]; } if (b) v.tkY1 = b[2]; });
  for (const n of names) {
    const v = vil[n]; if (v.firstLoot == null) continue;
    for (const k in v.byDay) { const day = +k; if (day >= v.firstLoot && day < v.firstLoot + 60) v.deathsAfter60 += v.byDay[k]; if (day < v.firstLoot && day >= v.firstLoot - 60) v.deathsBefore += v.byDay[k]; }
  }
  for (const n of names) {
    const v = vil[n]; if (v.firstTo == null) continue;
    for (const k in v.byDay) { const day = +k; if (day >= v.firstTo && day < v.firstTo + 60) v.toAfter60 += v.byDay[k]; if (day < v.firstTo && day >= v.firstTo - 60) v.toBefore += v.byDay[k]; }
  }
  // 날 칸(30일) — 습격 · 행상 피살 · 굶어 죽음
  const bins = {}; const B = (d) => Math.floor(d / 30);
  for (const L of o.loot) { const b = B(L[0]); (bins[b] = bins[b] || { loot: 0, fe: 0, deaths: 0 }).loot++; bins[b].fe += L[5] || 0; }
  for (const [day, row] of t.rows) { let dd = 0; for (const r of row) if (r) dd += r[1] || 0; const b = B(day); (bins[b] = bins[b] || { loot: 0, fe: 0, deaths: 0 }).deaths += dd; }
  //   행상 · 캐러밴 셈(T837 `diverge-ctl` 의 cars · legs — 같은 판 곁 `.dctl.json`): 제 짐을 잃은 마을이 그 뒤 60날에 띄운 캐러밴 · 내보낸 먹을 것
  const dc = load(d, s, 'dctl');
  if (dc) for (const n of names) {
    const v = vil[n]; if (v.firstLoot == null) continue; const i = dc.names.indexOf(n); if (i < 0) continue;
    const f = v.firstLoot, win = (x) => (x >= f - 60 && x < f ? 'b' : (x >= f && x < f + 60 ? 'a' : null));
    v.cars = { b: 0, a: 0 }; v.food = { b: 0, a: 0 };
    for (const c of dc.cars) if (c[1] === i) { const w = win(c[0]); if (w) v.cars[w]++; }
    for (const L of dc.legs) if (L[1] === i) { const w = win(L[0]); if (w) v.food[w] += (L[3] || 0) * (L[4] || 0); }
  }
  const daily = {}; for (const [day, row] of t.rows) { let dd = 0; for (const r of row) if (r) dd += r[1] || 0; daily[day] = dd; }
  return { names, vil, bins, daily, lootDays: o.loot.map((L) => L[0]), lootN: o.loot.length, knob: o.knob };
}
const runs = dirs.map((d) => Object.fromEntries(SEEDS.map((s) => [s, runOf(d, s)])));
const main = runs[0];
const f0 = (x) => (x == null ? '—' : (Math.round(x * 10) / 10).toLocaleString());
const out = { shieldDays: SHIELD, bdtMin: BO.min, seeds: {}, dirs };

console.log(`\n=== T951 — 마을별 습격 손실 ↔ 굶어 죽음 (주 판 ${dirs[0]} · 대조 ${dirs.length - 1}) · 첫해 = 날 < ${FIRST} ===`);
for (const s of SEEDS) {
  const M = main[s]; if (!M) { console.log(`시드 ${s}: 판 없음`); continue; }
  const rows = [];
  for (const n of M.names) {
    const v = M.vil[n];
    const band = runs.map((R) => R[s] && R[s].vil[n] ? R[s].vil[n].deathsY1 : null).filter((x) => x != null);
    const open = BO.open({ name: n });
    rows.push({ n, ...v, bandLo: Math.min(...band), bandHi: Math.max(...band), open, shieldEnd: (v.born || 0) + SHIELD });
  }
  out.seeds[s] = { rows, bins: M.bins, daily: M.daily, lootDays: M.lootDays, lootN: M.lootN };
  const hit = rows.filter((r) => r.lootN > 0), clean = rows.filter((r) => r.lootN === 0);
  const sum = (a, k) => a.reduce((x, r) => x + (r[k] || 0), 0);
  console.log(`\n## 시드 ${s} — 습격 손실 ${M.lootN}건 · 손실 난 마을 ${hit.length}/${rows.length}`);
  console.log(`  첫해 굶어 죽음: 손실 난 마을 ${f0(sum(hit, 'deathsY1'))}(굶주림 몫 ${f0(sum(hit, 'hungerY1'))}) · 안 난 마을 ${f0(sum(clean, 'deathsY1'))}(굶주림 몫 ${f0(sum(clean, 'hungerY1'))})`);
  console.log(`  못 받은 짐(이 마을로 오던 짐이 길에서 털림 · 식량 환산 첫해): 첫해 굶어 죽은 마을 ${f0(sum(rows.filter((r) => r.deathsY1 > 0), 'toFEY1'))} · 안 죽은 마을 ${f0(sum(rows.filter((r) => !r.deathsY1), 'toFEY1'))}`);
  console.log('  | 마을 | 첫해 제 짐 손실(건 · 식량 환산) | 400날 제 짐 손실(건 · 나감 · 들어옴) | 행상 피살 첫해/400 | 첫 손실 날 · 앞 60 → 뒤 60 죽음 | 못 받은 짐(건 · 첫해 식량 환산) | 첫 못 받은 날 · 앞 60 → 뒤 60 죽음 | 첫해 굶어 죽음(띠) | 그중 굶주림 몫 | 보호막 끝 | 도적 보호기 끝 |');
  console.log('  |---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows.filter((x) => x.lootN > 0 || x.toN > 0 || x.deathsY1 > 0).sort((a, b) => b.deathsY1 - a.deathsY1 || b.toFEY1 - a.toFEY1 || b.lootFEY1 - a.lootFEY1)) {
    console.log(`  | ${r.n} | ${r.lootY1} · ${f0(r.lootFEY1)} | ${r.lootN} · ${f0(r.outFE)} · ${f0(r.inFE)} | ${r.tkY1}/${r.tk} | ${r.firstLoot == null ? '—' : r.firstLoot + ' · ' + r.deathsBefore + ' → ' + r.deathsAfter60} | ${r.toN} · ${f0(r.toFEY1)} | ${r.firstTo == null ? '—' : r.firstTo + ' · ' + r.toBefore + ' → ' + r.toAfter60} | ${r.deathsY1}(${r.bandLo}~${r.bandHi}) | ${f0(r.hungerY1)} | ${r.shieldEnd} | ${r.open} |`);
  }
}
// ── ② 창 표 — 보호막(나이 < SHIELD) · 도적 보호기(_bdtOpenDay) · 날 칸
console.log(`\n## ② 창 — 보호막 = 나이 < ${SHIELD}날(이 판은 끔 · 켠 세계라면 끝나는 날) · 도적 보호기 = BDT_MIN_DAY ${BO.min} + 해시 × ${BO.min}(T577_RAMP · 마을마다)`);
for (const s of SEEDS) {
  const S = out.seeds[s]; if (!S) continue;
  const opens = S.rows.map((r) => r.open).sort((a, b) => a - b), ends = S.rows.map((r) => r.shieldEnd).sort((a, b) => a - b);
  const inWin = (lo, hi) => { const l = S.lootDays.filter((x) => x >= lo && x < hi).length; let d = 0; for (const k in S.daily) if (+k >= lo && +k < hi) d += S.daily[k]; return [l, d]; };
  const w1 = inWin(0, ends[0]), w2 = inWin(ends[0], opens[0]), w3 = inWin(opens[0], 1e9);
  console.log(`  시드 ${s}: 보호막 끝 ${ends[0]}~${ends[ends.length - 1]} · 도적 보호기 끝 ${opens[0]}~${opens[opens.length - 1]}(중앙 ${opens[opens.length >> 1]}) · 400날 안에 보호기 끝난 마을 ${opens.filter((x) => x < 400).length}/${opens.length}`);
  console.log(`    창 [0, 보호막 끝) 습격 ${w1[0]} · 죽음 ${w1[1]} | [보호막 끝, 첫 보호기 끝) 습격 ${w2[0]} · 죽음 ${w2[1]} | [첫 보호기 끝, 400) 습격 ${w3[0]} · 죽음 ${w3[1]}`);
  console.log('    30날 칸 | ' + Object.keys(S.bins).sort((a, b) => a - b).map((b) => `${+b + 1}: 습격 ${S.bins[b].loot} · 죽음 ${S.bins[b].deaths}`).join(' | '));
}
console.log('\n## ①-ⓑ 제 짐을 잃은 마을 — 첫 손실 앞 60날 ↔ 뒤 60날: 띄운 캐러밴 · 내보낸 먹을 것(식량 환산 · dctl legs)');
for (const s of SEEDS) { const S = out.seeds[s]; if (!S) continue;
  const L = S.rows.filter((r) => r.cars).sort((a, b) => b.tk - a.tk);
  let cb = 0, ca = 0, fb = 0, fa = 0; for (const r of L) { cb += r.cars.b; ca += r.cars.a; fb += r.food.b; fa += r.food.a; }
  console.log(`  시드 ${s}: 마을 ${L.length} · 캐러밴 ${cb} → ${ca} · 먹을 것 ${f0(fb)} → ${f0(fa)} | ` + L.map((r) => `${r.n}(피살 ${r.tk} · 캐러밴 ${r.cars.b}→${r.cars.a} · 먹을 것 ${f0(r.food.b)}→${f0(r.food.a)})`).join(' · '));
}
if (jOut) { fs.writeFileSync(jOut, JSON.stringify(out, null, 1)); console.log('\n→ ' + jOut); }
