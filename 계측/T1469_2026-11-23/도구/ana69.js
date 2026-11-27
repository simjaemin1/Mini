// ana69.js — T1469 판 표: node ana69.js <runs 폴더>
//   끔 팔 = N_*(넷 다) · D_*(넷 다 + T1460) · 켬 팔 = M_*(넷 다 + T1469) · MD_*(+ T1460) · MF_1020(feed) · 전쟁 WN · WM
'use strict';
const fs = require('fs'), path = require('path');
const RUNS = process.argv[2];
const med = (a) => { const b = a.filter((x) => x != null).sort((x, y) => x - y); return b.length ? b[Math.floor((b.length - 1) / 2)] : null; };
const r1 = (x) => x == null ? null : Math.round(x * 10) / 10;
const rd = (tag, s) => { if (fs.existsSync(path.join(RUNS, tag + 'y'))) tag = tag + 'y'; const d = path.join(RUNS, tag), b = path.join(d, `${tag}-${s}.json.t1460.json`); if (!fs.existsSync(b)) return null; const lf = path.join(d, `${tag}-${s}.log`); return { J: JSON.parse(fs.readFileSync(b, 'utf8')), log: fs.existsSync(lf) ? fs.readFileSync(lf, 'utf8') : '' }; };
const out = { runs: [], diag: [] };
const TAGS = [];
for (const s of [1020, 7, 42]) for (const p of ['N', 'D', 'M', 'MD']) TAGS.push([p + '_' + s, s]);
TAGS.push(['MF_1020', 1020], ['WN_1020', 1020], ['WM_1020', 1020]);
for (const [tag, s] of TAGS) {
  const X = rd(tag, s); if (!X) { out.runs.push({ tag, missing: true }); continue; }
  const J = X.J, C = J.wcols, w = J.w, ix = (k) => C.indexOf(k), last = w[w.length - 1], col = (k) => w.map((r) => r[ix(k)]);
  const vil = new Map(); for (const m of X.log.matchAll(/\[([^\]\s]+)\] 시딩: 중심 셀\((\d+),(\d+)\)/g)) vil.set(m[1], [+m[2], +m[3]]);
  const nearOf = (c) => { let b = null, bd = Infinity; for (const [n, p] of vil) { const d = Math.hypot(p[0] - c[0], p[1] - c[1]); if (d < bd) { bd = d; b = n; } } return b; };
  const G = J.gangs, life = (g) => g.last - g.first + 1;
  const moved = G.filter((g) => g.t1469 && g.t1469.moved);
  const lootAfter = moved.reduce((a, g) => a + Math.max(0, (g.lootN | 0) - (g.lootAtMove | 0)), 0);
  const lootBefore = moved.reduce((a, g) => a + (g.lootAtMove | 0), 0);
  //   한 마을 곁 소굴 — 30날 표본마다 살아 있는 단의 은거지 → 가장 가까운 마을 · 같은 마을 곁 단 수의 가장 큰 값
  const byDay = new Map(); for (const g of G) for (const t of (g.t60 || [])) { const c = (g.campList || []).filter((q) => q[2] != null && q[2] <= t.day).slice(-1)[0]; const camp = c ? [c[0], c[1]] : ((g.campList && g.campList[0]) || g.camp); (byDay.get(t.day) || byDay.set(t.day, []).get(t.day)).push(nearOf(camp)); }
  let crowd = 0, crowdAt = null; for (const [d, L] of byDay) { const m = new Map(); for (const v of L) m.set(v, (m.get(v) || 0) + 1); for (const [v, k] of m) if (k > crowd) { crowd = k; crowdAt = [d, v]; } }
  //   부유한 마을 — 끝 날 털 것 1위(관찰기 숨을 자리 표)의 인구 · 행복
  const sp = J.spots && (J.spots['730'] || J.spots['365']); let rich = null;
  if (sp) { const top = sp.filter((r) => r.loot != null).sort((a, b) => b.loot - a.loot)[0]; if (top) { const vi = J.names.indexOf(top.v), lastM = Math.max(...J.vm.map((r) => r[0])), row = J.vm.find((r) => r[0] === lastM && r[1] === vi); const hi = J.vcols.indexOf('hapEnd'); rich = { v: top.v, loot: top.loot, pop: row ? row[3] : null, hap: row && hi >= 0 ? row[hi] : null }; } }
  const lastM = Math.max(...J.vm.map((r) => r[0])), empty = J.vm.filter((r) => r[0] === lastM && r[3] === 0).length;
  const doors = [...X.log.matchAll(/D(\d+) 도적단#(\d+) 먹을 것이 떨어져 (\d+)명이 마을로 떠난다/g)].map((m) => ({ d: +m[1], id: +m[2], k: +m[3] }));
  const moves = [...X.log.matchAll(/D(\d+) 도적단#(\d+) 털 것이 없어 소굴을 옮긴다 \((\d+),(\d+)\) → \((\d+),(\d+)\) · (\d+)명/g)].map((m) => ({ d: +m[1], id: +m[2], from: [+m[3], +m[4]], to: [+m[5], +m[6]], n: +m[7] }));
  const st4 = (J.t1404 && J.t1404.st) || {}, b = J.bandit || {}, st9 = J.t1469 || null;
  const sent = col('sent').reduce((a, x) => a + x, 0), raided = col('raided').reduce((a, x) => a + x, 0);
  out.runs.push({ tag, seed: s, days: last[0], popEnd: last[ix('pop')], empty, gangsSeen: G.length, lifeMed: med(G.map(life)), memMed: med(col('members')), memMax: Math.max(...col('members')), biggest: G.length ? Math.max(...G.map((g) => g.nMax)) : 0,
    loot: col('lootN').reduce((a, x) => a + x, 0), raidPct: sent ? r1(100 * raided / sent) : null, killed: col('killed').reduce((a, x) => a + x, 0), foodImp: r1(col('foodImp').reduce((a, x) => a + x, 0)),
    home: st4.home || 0, starve: b.starve || 0, doors: doors.length, doorPeople: doors.reduce((a, x) => a + x.k, 0), doorDays: doors.map((x) => x.d),
    moves: moves.length, moveDays: moves.map((x) => x.d), moveDist: med(moves.map((x) => Math.round(Math.hypot(x.to[0] - x.from[0], x.to[1] - x.from[1])))), walkDays: med(moved.map((g) => g.t1469.at != null ? g.t1469.at - g.t1469.d0 : null)),
    lootBefore, lootAfter, movedLife: med(moved.map(life)), crowd, crowdAt, rich, st9, firstMove: moves.length ? moves[0].d : null });
}
const base = (tag) => tag.replace(/^MD_/, 'D_').replace(/^MF_/, 'D_').replace(/^M_/, 'N_').replace(/^WM_/, 'WN_');
for (const r of out.runs) { if (r.missing) continue; const o = out.runs.find((x) => x.tag === base(r.tag)); if (o && !o.missing && o !== r) { r.popRatio = +(r.popEnd / o.popEnd).toFixed(3); r.base = o.tag; } }
//   진단(할 일 1) — 끔 팔(N_*): 처음 소굴 자리의 털 것 차례(날 60 표) · 해마다 털 것 1위 마을
for (const s of [1020, 7, 42]) {
  const X = rd('N_' + s, s) || rd('D_' + s, s); if (!X || !X.J.spots) continue;
  const S = X.J.spots, row = { seed: s, from: X.J.env && X.J.env.KNOBS, top: {} };
  for (const d of Object.keys(S)) { const L = (S[d] || []).filter((r) => r.loot != null).sort((a, b) => b.loot - a.loot); row.top[d] = L.slice(0, 3).map((r) => [r.v, Math.round(r.loot)]); }
  const L60 = (S['60'] || []).filter((r) => r.loot != null).sort((a, b) => b.loot - a.loot);
  const vil = new Map(); for (const m of X.log.matchAll(/\[([^\]\s]+)\] 시딩: 중심 셀\((\d+),(\d+)\)/g)) vil.set(m[1], [+m[2], +m[3]]);
  row.dens = (X.J.dens || []).map((d) => { let b = null, bd = Infinity; for (const [n, p] of vil) { const dd = Math.hypot(p[0] - d.cx, p[1] - d.cy); if (dd < bd) { bd = dd; b = n; } } return { id: d.id, at: [d.cx, d.cy], near: b, rank60: L60.findIndex((r) => r.v === b) + 1 }; });
  out.diag.push(row);
}
console.log(JSON.stringify(out, null, 1));
