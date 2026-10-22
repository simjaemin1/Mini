#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T845 표 기계 · 세계 안 만짐)
// === scripts/t845-table.js — `t845-observe.js` 가 남긴 `<판>-<시드>.t845.json` 을 읽어 줄로 ===
//   node scripts/t845-table.js <끔 판 폴더> [<켬 판 폴더>] [--json <파일>]
//   ⓐ 판마다(시드): 묶인 마을 · 묶인 날 · 몰사 · 빈 마을(끝) · 끝 인구 — T815 표의 잣대 그대로:
//      묶임 = 자유민(N − 징발) 0 이 10일 이상 이어지고 그 첫날 인구 ≥ 5 · 몰사 = 묶임이 풀린 뒤 3일 안에 인구 0 · 빈 마을 = 끝 날 인구 0.
//   ⓑ 징발자 몫(①): 징발이 있는 마을-날마다 그날 먹은 합 × (밥상에 남은 징발 ÷ 밥상 인원) — 마을 식사는 밥상 한 사람마다 하루 1 몫이다(econ `foodNeed = _t423EatN(v, N) × 1.0` · 켬이면 짐 꾼(`_warPack`)이 밥상에서 빠진다).
//      원정(그 사람의 전쟁에서 이 마을이 공격) · 방어 소집(방어)으로 가른다. 관찰기에 `atkBattle` 칸이 있으면 원정 몫을 그 사람 전쟁의 국면으로 한 번 더 가른다:
//      실체 교전(`phase 'battle'` — war-core 하루 고리가 짐을 안 줄인다 · 끔이면 밥상이 그날의 유일한 끼니) ↔ 그 밖(행군 · 진영 · 포위 · 귀환 — 짐이 하루 1일분 준다 · 끔이면 두 번 먹는다).
//      원정 사람-날(그중 교전 날)도 센다 — 켬이면 교전 날의 원정 징발자는 밥상에서도 짐에서도 안 먹는다.
//   ⓒ 묶임마다 — 그 묶임으로 이어진 징발 구간(징발 > 0 이 끊김 없이 이어진 날들)의 첫날 끝 곳간(군량 적재 · 그날 식사 뒤)부터 곳간이 처음 바닥(식량 환산 < 1)에 닿는 날까지
//      (먹음 · 몫은 첫날 이튿날부터 센다 — 첫날 끝 곳간에 첫날 식사가 이미 들어 있다):
//      첫날 곳간 · 그날 군량 적재(그 마을이 공격한 전쟁의 `_packLoad`) · 바닥까지 날 수 · 그사이 먹은 합 · 그중 징발자 몫 · 몫 합이 첫날 곳간을 넘는 날.
//   ⓓ 원정 국면(관찰기에 `wars` 가 있으면): 전쟁마다 산 날 · 실체 교전(`phase 'battle'`) 날 — 판마다 전쟁 수 · 교전 날 가운데 · 가장 긴 것 · 교전 30일 이상인 전쟁 · 교전 날 병력-날.
'use strict';
const fs = require('fs');
const path = require('path');
const A = process.argv.slice(2);
const dirs = A.filter((x, i) => !x.startsWith('--') && A[i - 1] !== '--json');
const JOUT = A.includes('--json') ? A[A.indexOf('--json') + 1] : null;
const r1 = (x) => Math.round(x * 10) / 10;
function load(dir) {
  const out = {};
  for (const f of fs.readdirSync(dir).filter((x) => /-(\d+)\.t845\.json$/.test(x)).sort()) {
    const seed = +/-(\d+)\.t845\.json$/.exec(f)[1];
    const o = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const C = {}; o.cols.forEach((c, i) => { C[c] = i; });
    let run = null; try { run = JSON.parse(fs.readFileSync(path.join(dir, f.replace(/\.t845\.json$/, '.json')), 'utf8')); } catch (e) {}
    out[seed] = { o, C, run };
  }
  return out;
}
function analyse(S) {
  const { o, C } = S, names = o.names, R = o.rows;
  const res = { days: R.length ? R[R.length - 1][0] : 0, pins: [], pinDays: 0, wipes: [], emptyEnd: 0, popEnd: 0,
    share: { villageDays: 0, eaten: 0, eatenAll: 0, drafted: 0, atk: 0, def: 0, packers: 0, atkBattle: null, atkDays: 0, atkBattleDays: null }, packs: o.packs.length, packLoad: r1(o.packs.reduce((s, p) => s + (+p[4] || 0), 0)) };
  const HB = C.atkBattle != null; if (HB) { res.share.atkBattle = 0; res.share.atkBattleDays = 0; }
  const prevPop = names.map(() => 0);
  for (const [, V] of R) V.forEach((r, vi) => {
    if (r[C.pop] > 0 || prevPop[vi] > 0) res.share.eatenAll += r[C.eaten];   // 빈 마을의 `_foodEaten` 은 마지막 날 값이 남는다 — 그날 아침 인구가 있던 날만 센다
    prevPop[vi] = r[C.pop];
    if (r[C.drafted] > 0 && r[C.pop] > 0) {
      const per = r[C.eaten] / (r[C.eatN] || r[C.pop]), home = r[C.drafted] - r[C.packers], atkHome = Math.max(0, r[C.atk] - r[C.packers]);   // 밥상 한 사람 몫 = 먹은 합 ÷ 밥상 인원(켬이면 짐 꾼이 빠진다)
      res.share.villageDays++; res.share.eaten += r[C.eaten]; res.share.packers += r[C.packers];
      res.share.drafted += per * home; res.share.atk += per * atkHome; res.share.def += per * r[C.def]; res.share.atkDays += r[C.atk];
      if (HB) { res.share.atkBattle += per * Math.min(r[C.atkBattle], atkHome); res.share.atkBattleDays += r[C.atkBattle]; }
    }
  });
  for (const k of ['eaten', 'eatenAll', 'drafted', 'atk', 'def', 'atkBattle']) if (res.share[k] != null) res.share[k] = r1(res.share[k]);
  //   징발 구간 — 징발 > 0 이 끊김 없이 이어진 날들(마을마다) · 곳간이 그 안에서 바닥(식량 환산 < 1)에 닿았나 · 닿기까지 먹음 · 그중 징발자 몫
  res.runs = { n: 0, bottom: 0, list: [] };
  for (let vi = 0; vi < names.length; vi++) {
    let i = 0;
    while (i < R.length) {
      if (!(R[i][1][vi][C.drafted] > 0)) { i++; continue; }
      let j = i; while (j + 1 < R.length && R[j + 1][1][vi][C.drafted] > 0) j++;
      const x0 = R[i][1][vi], g0 = x0[C.tfe];
      let e = i; while (e <= j && R[e][1][vi][C.tfe] >= 1) e++;
      let eaten = 0, shr = 0, cross = null;
      for (let k = i + 1; k <= Math.min(e, j); k++) { const x = R[k][1][vi]; if (x[C.pop] > 0) { const per = x[C.eaten] / (x[C.eatN] || x[C.pop]); eaten += x[C.eaten]; shr += per * (x[C.drafted] - x[C.packers]); if (cross == null && shr > g0) cross = R[k][0]; } }
      const hit = e <= j;
      res.runs.n++; if (hit) res.runs.bottom++;
      const g1 = R[Math.min(e, j)][1][vi][C.tfe];
      res.runs.list.push({ name: names[vi], from: R[i][0], to: R[j][0], len: j - i + 1, pop: x0[C.pop], drafted: x0[C.drafted], atk: x0[C.atk], def: x0[C.def], granary: r1(g0),
        bottomDay: hit ? R[e][0] : null, daysToBottom: hit ? R[e][0] - R[i][0] : null, eaten: r1(eaten), share: r1(shr), shareOver: cross,
        netPerDay: hit ? r1((g1 - g0) / Math.max(1, R[e][0] - R[i][0])) : null, sharePerDay: hit ? r1(shr / Math.max(1, R[e][0] - R[i][0])) : null, minFree: Math.min(...R.slice(i, j + 1).map((x) => x[1][vi][C.free])) });
      i = j + 1;
    }
  }
  for (let vi = 0; vi < names.length; vi++) {
    let i = 0;
    while (i < R.length) {
      const r = R[i][1][vi];
      if (r[C.free] === 0 && r[C.pop] >= 1) {
        let j = i;
        while (j + 1 < R.length && R[j + 1][1][vi][C.free] === 0 && R[j + 1][1][vi][C.pop] >= 1) j++;
        const len = j - i + 1;
        if (len >= 10 && r[C.pop] >= 5) {
          const after = R.slice(j + 1, j + 4).map((x) => x[1][vi][C.pop]);
          const wipe = after.length > 0 && after.some((p) => p === 0);
          //   그 묶임으로 이어진 징발 구간의 첫날(징발 > 0 이 끊김 없이 이어진 날들을 뒤로 거슬러)
          let s = i; while (s - 1 >= 0 && R[s - 1][1][vi][C.drafted] > 0) s--;
          const d0 = R[s][0], g0 = R[s][1][vi][C.tfe];
          let e = s; while (e <= j && R[e][1][vi][C.tfe] >= 1) e++;
          const span = R.slice(s + 1, Math.min(e, j) + 1);
          let eaten = 0, shr = 0, atk = 0, atkB = HB ? 0 : null, cross = null;
          for (const [d, V] of span) { const x = V[vi]; if (x[C.pop] > 0) { const per = x[C.eaten] / (x[C.eatN] || x[C.pop]), ah = Math.max(0, x[C.atk] - x[C.packers]); eaten += x[C.eaten]; shr += per * (x[C.drafted] - x[C.packers]); atk += per * ah; if (HB) atkB += per * Math.min(x[C.atkBattle], ah); if (cross == null && shr > g0) cross = d; } }
          const loads = o.packs.filter((p) => p[1] === names[vi] && p[0] >= d0 - 1 && p[0] <= R[j][0]);
          const x0 = R[s][1][vi];
          res.pins.push({ name: names[vi], from: R[i][0], to: R[j][0], len, pop: r[C.pop], wipe,
            draft: { day: d0, pop: x0[C.pop], drafted: x0[C.drafted], atk: x0[C.atk], def: x0[C.def], granary: r1(g0),
              packLoads: loads.map((p) => ({ day: p[0], to: p[2], force: p[3], load: p[4], days: p[5] })),
              emptyDay: e <= j ? R[e][0] : null, daysToEmpty: e <= j ? R[e][0] - d0 : null,
              eaten: r1(eaten), share: r1(shr), atkShare: r1(atk), atkBattleShare: atkB == null ? null : r1(atkB), shareOver: cross } });
          res.pinDays += len;
          if (wipe) res.wipes.push(names[vi]);
        }
        i = j + 1;
      } else i++;
    }
    const lastRow = R[R.length - 1] && R[R.length - 1][1][vi];
    if (lastRow) { res.popEnd += lastRow[C.pop]; if (lastRow[C.pop] === 0) res.emptyEnd++; }
  }
  //   ⓓ 원정 국면 — 전쟁 id 마다 산 날 · 교전 날 · 그 병력-날(병력 = 그날 `force`)
  if (o.wars) {
    const W = new Map();
    for (const [d, L] of o.wars) for (const w of L) {
      let x = W.get(w[0]); if (!x) { x = { id: w[0], atk: w[1], def: w[2], from: d, to: d, days: 0, battle: 0, battleForce: 0, firstBattle: null }; W.set(w[0], x); }
      x.to = d; x.days++; if (w[3] === 'battle') { x.battle++; x.battleForce += w[6] || 0; if (x.firstBattle == null) x.firstBattle = d; }
    }
    const L = [...W.values()];
    res.wars = { n: L.length, battleWars: L.filter((x) => x.battle > 0).length, long30: L.filter((x) => x.battle >= 30).length,
      battleMed: (() => { const b = L.filter((x) => x.battle > 0).map((x) => x.battle).sort((p, q) => p - q); return b.length ? b[Math.floor(b.length / 2)] : null; })(),
      battleMax: L.reduce((m, x) => Math.max(m, x.battle), 0), battleForceDays: L.reduce((t, x) => t + x.battleForce, 0),
      longest: L.slice().sort((p, q) => q.battle - p.battle).slice(0, 3).map((x) => ({ id: x.id, atk: x.atk, def: x.def, from: x.from, to: x.to, battle: x.battle, firstBattle: x.firstBattle })) };
  }
  return res;
}
const arms = dirs.map((d) => ({ dir: d, S: load(d) }));
const doc = { arms: arms.map((a) => ({ dir: a.dir, seeds: Object.fromEntries(Object.entries(a.S).map(([s, S]) => [s, Object.assign({ knob: S.o.knob, eight: S.run && S.run.eight }, analyse(S))])) })) };
const NAME = (i) => (i === 0 ? '끔' : '켬');
console.log('| 판 | 시드 | 날 | 묶인 마을(≥10일) | 묶인 날 | 몰사 | 빈 마을(끝) | 끝 인구 | 원정 군량 적재(번 · 식량 환산) |');
console.log('|---|---|---|---|---|---|---|---|---|');
const tot = arms.map(() => ({ pins: 0, pinDays: 0, wipes: 0, empty: 0, pop: 0 }));
for (const s of Object.keys((arms[0] || { S: {} }).S)) arms.forEach((a, k) => {
  const x = doc.arms[k].seeds[s]; if (!x) return;
  tot[k].pins += x.pins.length; tot[k].pinDays += x.pinDays; tot[k].wipes += x.wipes.length; tot[k].empty += x.emptyEnd; tot[k].pop += x.popEnd;
  console.log(`| ${NAME(k)} | ${s} | ${x.days} | ${x.pins.length}${x.pins.length ? ' (' + x.pins.map((p) => `${p.name} ${p.from}~${p.to}`).join(' · ') + ')' : ''} | ${x.pinDays} | ${x.wipes.length}${x.wipes.length ? ' (' + x.wipes.join('·') + ')' : ''} | ${x.emptyEnd} | ${x.popEnd.toLocaleString('en-US')} | ${x.packs} · ${x.packLoad.toLocaleString('en-US')} |`);
});
tot.forEach((t, k) => console.log(`| ${NAME(k)} 합 | | | ${t.pins} | ${t.pinDays} | ${t.wipes} | ${t.empty} | ${t.pop.toLocaleString('en-US')} | |`));
console.log('\n| 판 | 시드 | 징발 있는 마을-날 | 그 날들 먹은 합 | 징발자 몫(원정 · 방어) | 몫 비율 | 원정 몫 중 교전 날 | 원정 사람-날(그중 교전) | 판 전체 먹은 합 |');
console.log('|---|---|---|---|---|---|---|---|---|');
const fmt = (n) => (n == null ? '—' : n.toLocaleString('en-US'));
for (const s of Object.keys((arms[0] || { S: {} }).S)) arms.forEach((a, k) => {
  const x = doc.arms[k].seeds[s]; if (!x) return; const h = x.share;
  console.log(`| ${NAME(k)} | ${s} | ${h.villageDays} | ${fmt(h.eaten)} | ${fmt(h.drafted)} (${fmt(h.atk)} · ${fmt(h.def)}) | ${h.eaten > 0 ? (100 * h.drafted / h.eaten).toFixed(1) + '%' : '—'} | ${fmt(h.atkBattle)} | ${fmt(h.atkDays)} (${fmt(h.atkBattleDays)}) | ${fmt(h.eatenAll)} |`);
});
console.log('\n| 판 | 시드 | 묶인 마을 | 징발 첫날 · 인구 · 징발(원정 · 방어) | 첫날 곳간 | 군량 적재 | 바닥 날 · 날 수 | 그사이 먹음 | 징발자 몫(원정) | 몫 합 > 첫날 곳간 | 몰사 |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const s of Object.keys((arms[0] || { S: {} }).S)) arms.forEach((a, k) => {
  const x = doc.arms[k].seeds[s]; if (!x) return;
  for (const p of x.pins) { const d = p.draft;
    console.log(`| ${NAME(k)} | ${s} | ${p.name} ${p.from}~${p.to}(${p.len}일 · 인구 ${p.pop}) | ${d.day} · ${d.pop} · ${d.drafted}(${d.atk} · ${d.def}) | ${d.granary} | ${d.packLoads.map((l) => `${l.day}일 ${l.load}(병력 ${l.force} · ${l.days}일분 → ${l.to})`).join(' · ') || '—'} | ${d.emptyDay ?? '—'} · ${d.daysToEmpty ?? '—'} | ${d.eaten} | ${d.share}(${d.atkShare}${d.atkBattleShare != null ? ' · 교전 날 ' + d.atkBattleShare : ''}) | ${d.shareOver ?? '—'} | ${p.wipe ? '몰사' : '—'} |`); }
});
console.log('\n| 판 | 시드 | 징발 구간 | 그중 곳간이 구간 안에서 바닥 | 바닥 구간: 징발 첫날 곳간(가운데 · 합) | 바닥까지 날(가운데) | 그사이 징발자 몫 합 | 몫 합 > 첫날 곳간 | 자유민 최소 0 인 구간 |');
console.log('|---|---|---|---|---|---|---|---|---|');
const med = (a) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
for (const s of Object.keys((arms[0] || { S: {} }).S)) arms.forEach((a, k) => {
  const x = doc.arms[k].seeds[s]; if (!x) return; const B = x.runs.list.filter((r) => r.bottomDay != null);
  console.log(`| ${NAME(k)} | ${s} | ${x.runs.n} | ${x.runs.bottom} | ${med(B.map((r) => r.granary)) ?? '—'} · ${r1(B.reduce((t, r) => t + r.granary, 0)).toLocaleString('en-US')} | ${med(B.map((r) => r.daysToBottom)) ?? '—'} | ${r1(B.reduce((t, r) => t + r.share, 0)).toLocaleString('en-US')} | ${B.filter((r) => r.shareOver != null).length}/${B.length} | ${x.runs.list.filter((r) => r.minFree === 0).length} |`);
});
if (Object.values(doc.arms).some((a) => Object.values(a.seeds).some((x) => x.wars))) {
  console.log('\n| 판 | 시드 | 전쟁 | 실체 교전에 든 전쟁 | 교전 날(가운데 · 가장 긴) | 교전 30일 이상 | 교전 날 병력-날 | 가장 긴 교전 |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const s of Object.keys((arms[0] || { S: {} }).S)) arms.forEach((a, k) => {
    const x = doc.arms[k].seeds[s]; if (!x || !x.wars) return; const w = x.wars;
    console.log(`| ${NAME(k)} | ${s} | ${w.n} | ${w.battleWars} | ${w.battleMed ?? '—'} · ${w.battleMax} | ${w.long30} | ${w.battleForceDays.toLocaleString('en-US')} | ${w.longest.slice(0, 2).map((l) => `${l.atk}→${l.def} ${l.from}~${l.to}(교전 ${l.battle}일)`).join(' · ')} |`);
  });
}
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(doc, null, 1));
