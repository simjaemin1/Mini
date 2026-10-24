#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T905 해부 · 판 JSON 만 읽는다 · 제품 0 · 새 수 0)
// === scripts/t905-anatomy.js — T879 판(T825 · T859 켬)의 굶는 마을-날 해부 =====================================
//   쓰는 법: node scripts/t905-anatomy.js <판 뿌리> <레포 뿌리> <출력 디렉터리>
//     판 뿌리 아래 `run-<갈래>` · `run-<갈래>~raidN`(T837 갈림 대조 · `diverge-ctl.js` ver 2 · `t577-server-run.js` 판 JSON)
//     갈래 = off(둘 다 끔) · keep(T825 만) · hunger(T859 만) · on(둘 다) — 있는 것만 · 띠 = 갈래 판 + 대조(판 4)
//   ⇒ `T905_해부.md` · `T905_해부.json`
//   셈: ① 정의(날 · 사람 · 깊이 · 고비 · 죽음 `_deadTot`) · ② 해 × 계절 · ③ 마을 종류 · ④ 수입 길(캐러밴) · ⑤ 마을별 · ⑥ 마을 묶음
//       · ⑦ 떠나는 날 출발 마을 곳간 며칠치로 가른 캐러밴 · 먹을 것 leg · ⑧ 세계 합 기간별
//   굶는 마을-날 = 날 끝 곳간 식량 환산(`totalFoodEquivalent`) < 인구(T837 `diverge-table` 정의 그대로).
'use strict';
(() => {
// T905 해부 — T879 판 16(켬 4 · 끔 4 · 3시드) dctl · t577 JSON 만 읽는다(제품 0 · 새 수 0)
const fs = require('fs'), path = require('path');
const D = process.argv[2], ROOT = process.argv[3], OUTD = process.argv[4] || '.';
const C = require(path.join(ROOT, 'server', 'calendar.js'));
const SEEDS = [1020, 7, 42];
const ARMS = {}; for (const a of ['off', 'keep', 'hunger', 'day1', 'on']) { const rs = [a, a + '~raid1', a + '~raid2', a + '~raid3'].filter((r) => SEEDS.every((s) => fs.existsSync(path.join(D, 'run-' + r, `base-${s}.dctl.json`)) && fs.existsSync(path.join(D, 'run-' + r, `base-${s}.json`)))); if (rs.length) ARMS[a] = rs; }
const AN = { off: '끔', keep: 'T825 만', hunger: 'T859 만', day1: 'T825 하루치 + T859', on: '둘 다(T879)' };
const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const SEAS = ['spring', 'summer', 'autumn', 'winter'], KO = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };
const kind = (n) => n.replace(/[0-9]+$/, '');
function measure(run) {
  const m = { vd: 0, sd: 0, pd: 0, spd: 0, gap: 0, bins: [0, 0, 0, 0], deaths: 0, sdeaths: 0, ys: {}, byV: {}, byKind: {}, inStarve: 0, inAll: 0, cars: 0,
    exportV: {}, popV: {}, carsToV: {}, carsFromV: {}, sdNoCar30: 0, sdWithCar30: 0, legsStarve: 0, legsStarveUnits: 0,
    starveSpells: 0, spellLen: 0, recov: [0, 0], firstSD: [], perCapSD: 0 };
  for (const s of SEEDS) {
    const ob = rd(path.join(D, 'run-' + run, `base-${s}.dctl.json`)), o = rd(path.join(D, 'run-' + run, `base-${s}.json`));
    const N = ob.names, dead = new Map(o.rows.map((r) => [r[0], r[3]]));
    const inc = new Map();   // (day,to) → 그날 그 마을로 떠난 캐러밴 수
    for (const [d, fi, ti] of ob.cars) { const k = d + ':' + ti; inc.set(k, (inc.get(k) || 0) + 1);
      const vn = s + ':' + N[ti], vf = s + ':' + N[fi]; m.carsToV[vn] = (m.carsToV[vn] || 0) + 1; m.carsFromV[vf] = (m.carsFromV[vf] || 0) + 1; m.cars++; }
    for (const l of ob.legs) if (l[6] < l[5]) { m.legsStarve++; m.legsStarveUnits += l[3] * l[4]; const vn = s + ':' + N[l[1]]; m.exportV[vn] = (m.exportV[vn] || 0) + 1; }
    let prevDead = null; const was = new Array(N.length).fill(false), spell = new Array(N.length).fill(0);
    for (const [d, row] of ob.days) {
      const dd = dead.get(d + 1) || dead.get(d), y = Math.floor(d / 365) + 1, se = C.seasonOf(d), key = `${y}·${KO[se]}`;
      for (let i = 0; i < row.length; i++) { const v = row[i]; if (!v || !(v[0] > 0)) { if (spell[i]) { m.starveSpells++; m.spellLen += spell[i]; spell[i] = 0; } was[i] = false; continue; }
        const vn = s + ':' + N[i]; m.vd++; m.pd += v[0]; m.popV[vn] = (m.popV[vn] || 0) + v[0];
        const st = v[1] < v[0];
        const dD = (prevDead && dd) ? Math.max(0, (dd[i] || 0) - (prevDead[i] || 0)) : 0; m.deaths += dD;
        let ci = 0; for (let k = d; k > d - 30 && k >= 0; k--) ci += inc.get(k + ':' + i) || 0;
        m.inAll += inc.get(d + ':' + i) || 0;
        if (st) { m.sd++; m.spd += v[0]; m.gap += v[0] - v[1]; const r = v[1] / v[0]; m.bins[r < 0.25 ? 0 : r < 0.5 ? 1 : r < 0.75 ? 2 : 3]++; m.sdeaths += dD;
          m.ys[key] = (m.ys[key] || 0) + 1; m.byV[vn] = (m.byV[vn] || 0) + 1; const kk = kind(N[i]); m.byKind[kk] = (m.byKind[kk] || 0) + 1;
          m.inStarve += inc.get(d + ':' + i) || 0; if (ci) m.sdWithCar30++; else m.sdNoCar30++; spell[i]++; }
        else if (spell[i]) { m.starveSpells++; m.spellLen += spell[i]; spell[i] = 0; }
        was[i] = st; }
      prevDead = dd; }
    for (let i = 0; i < N.length; i++) if (spell[i]) { m.starveSpells++; m.spellLen += spell[i]; }
  }
  return m;
}
const R = {}; for (const a of Object.keys(ARMS)) R[a] = ARMS[a].map(measure);
const f = (x, p = 0) => (+x).toLocaleString('en-US', { maximumFractionDigits: p, minimumFractionDigits: p });
const band = (xs, p = 0) => `${f(Math.min(...xs), p)} ~ ${f(Math.max(...xs), p)}`;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const ov = (a, b) => !(Math.max(...a) < Math.min(...b) || Math.max(...b) < Math.min(...a));
const ORDER = Object.keys(AN).filter((a) => R[a]);
const cell = (a, g, p) => { const xs = R[a].map(g); if (a === 'off') return band(xs, p); const o = R.off.map(g), d = mean(xs) - mean(o); return `${band(xs, p)} (${d >= 0 ? '+' : ''}${f(d, p)}${ov(o, xs) ? '' : ' · **띠 밖**'})`; };
const row = (nm, g, p = 0) => `| ${nm} | ${ORDER.map((a) => cell(a, g, p)).join(' | ')} |`;
const H = `| 셈(3시드 합) | ${ORDER.map((a) => `${AN[a]} 띠(판 ${R[a].length})`).join(' | ')} |\n|---|${ORDER.map(() => '---').join('|')}|`;
const out = [];
out.push('## ① 정의 — 날 수 · 사람 · 깊이\n', H,
  row('굶는 마을-날(날 끝 곳간 식량 환산 < 인구)', (m) => m.sd),
  row('산 마을-날(분모)', (m) => m.vd),
  row('굶는 마을-날 몫 %', (m) => 100 * m.sd / m.vd, 2),
  row('사람-날(분모 · Σ 인구)', (m) => m.pd),
  row('굶는 사람-날(Σ 굶는 날 인구)', (m) => m.spd),
  row('굶는 사람-날 몫 %(1인당 굶음)', (m) => 100 * m.spd / m.pd, 2),
  row('모자란 식량(Σ 인구 − 곳간 · 사람-날)', (m) => m.gap),
  row('모자란 식량 ÷ 사람-날 %', (m) => 100 * m.gap / m.pd, 3),
  row('굶는 날 곳간/인구 < 0.25', (m) => m.bins[0]),
  row('〃 0.25 ~ 0.5', (m) => m.bins[1]),
  row('〃 0.5 ~ 0.75', (m) => m.bins[2]),
  row('〃 0.75 ~ 1', (m) => m.bins[3]),
  row('굶는 고비 수(연속 굶는 날 묶음)', (m) => m.starveSpells),
  row('고비 평균 길이(날)', (m) => m.spellLen / m.starveSpells, 2),
  row('죽음(800일 · `_deadTot` 증분)', (m) => m.deaths),
  row('그중 그 마을이 굶는 날의 죽음', (m) => m.sdeaths),
  row('굶는 날 1,000 사람-날당 죽음', (m) => 1000 * m.sdeaths / m.spd, 3),
  row('굶지 않는 날 1,000 사람-날당 죽음', (m) => 1000 * (m.deaths - m.sdeaths) / (m.pd - m.spd), 3));
out.push('\n## ② 해 × 계절 — 굶는 마을-날\n', H);
const keys = [...new Set([].concat(...R.off.map((m) => Object.keys(m.ys)), ...R.on.map((m) => Object.keys(m.ys))))].sort((a, b) => { const [ya, sa] = a.split('·'), [yb, sb] = b.split('·'); return ya - yb || ['봄', '여름', '가을', '겨울'].indexOf(sa) - ['봄', '여름', '가을', '겨울'].indexOf(sb); });
for (const k of keys) out.push(row(k + '년차 ' , (m) => m.ys[k] || 0));
out.push('\n## ③ 마을 종류 — 굶는 마을-날\n', H);
for (const k of ['농촌', '어촌', '임업', '광산']) out.push(row(k, (m) => m.byKind[k] || 0));
out.push('\n## ④ 수입 길 — 캐러밴\n', H,
  row('떠난 캐러밴(800일 전체)', (m) => m.cars),
  row('굶는 마을로 떠난 캐러밴(그 마을이 굶는 날)', (m) => m.inStarve),
  row('굶는 마을-날 중 앞 30일 안에 그 마을로 떠난 캐러밴이 0', (m) => m.sdNoCar30),
  row('〃 1 이상', (m) => m.sdWithCar30),
  row('굶는 날 먹을 것 수출 leg', (m) => m.legsStarve),
  row('〃 식량 환산', (m) => m.legsStarveUnits));
// ⑤ 마을별 — 끔 4판 평균 vs 켬 4판 평균 · 늘어난 몫 큰 마을
const vs = new Set(); for (const a of ORDER) for (const m of R[a]) for (const k of Object.keys(m.popV)) vs.add(k);
const mv = (a, k, fld) => mean(R[a].map((m) => m[fld][k] || 0));
const tab = [...vs].map((k) => ({ k, off: mv('off', k, 'byV'), on: mv('on', k, 'byV'), popOff: mv('off', k, 'popV') / 800, popOn: mv('on', k, 'popV') / 800,
  exOff: mv('off', k, 'exportV'), toOff: mv('off', k, 'carsToV'), toOn: mv('on', k, 'carsToV'), frOff: mv('off', k, 'carsFromV'), frOn: mv('on', k, 'carsFromV') }));
tab.forEach((t) => { t.d = t.on - t.off; });
const tot = tab.reduce((a, t) => a + t.d, 0), pos = tab.filter((t) => t.d > 0).reduce((a, t) => a + t.d, 0), neg = tab.filter((t) => t.d < 0).reduce((a, t) => a + t.d, 0);
tab.sort((a, b) => b.d - a.d);
out.push(`\n## ⑤ 마을별(시드 · 마을 153 · 판 4 평균) — 늘어난 몫 합 ${f(tot)} = 는 마을 +${f(pos)} · 준 마을 ${f(neg)}\n`);
const top = tab.slice(0, 15);
out.push(`위 15 마을이 늘어난 몫의 ${f(100 * top.reduce((a, t) => a + t.d, 0) / pos, 1)}%(는 몫 대비).\n`);
out.push('| 시드 · 마을 | 굶는 날 끔 → 켬 | 차 | 평균 인구 끔 → 켬 | 끔에서 굶는 날 먹을 것 수출 leg | 그 마을로 떠난 캐러밴 끔 → 켬 | 그 마을이 낸 캐러밴 끔 → 켬 |\n|---|---|---|---|---|---|---|');
for (const t of top) out.push(`| ${t.k.replace(':', ' · ')} | ${f(t.off)} → ${f(t.on)} | +${f(t.d)} | ${f(t.popOff, 1)} → ${f(t.popOn, 1)} | ${f(t.exOff, 1)} | ${f(t.toOff)} → ${f(t.toOn)} | ${f(t.frOff)} → ${f(t.frOn)} |`);
// 가설 가르기 — 마을 묶음(끔 판 평균으로 가르고 갈래마다 굶는 날 합)
for (const t of tab) { t.arm = {}; for (const a of ORDER) t.arm[a] = mv(a, t.k, 'byV'); }
const grp = (pred, nm) => { const g = tab.filter(pred), S = (a) => g.reduce((x, t) => x + t.arm[a], 0);
  return `| ${nm} | ${g.length} | ${f(S('off'))} | ${ORDER.filter((a) => a !== 'off').map((a) => { const d = S(a) - S('off'); return `${f(S(a))} (${d >= 0 ? '+' : ''}${f(d)})`; }).join(' | ')} | ${f(g.reduce((a, t) => a + t.popOff, 0))} → ${f(g.reduce((a, t) => a + t.popOn, 0))} | ${f(g.reduce((a, t) => a + t.toOff, 0))} → ${f(g.reduce((a, t) => a + t.toOn, 0))} |`; };
const medTo = [...tab].map((t) => t.toOff).sort((a, b) => a - b)[Math.floor(tab.length / 2)];
const medFr = [...tab].map((t) => t.frOff).sort((a, b) => a - b)[Math.floor(tab.length / 2)];
out.push('\n## ⑥ 마을 묶음(끔 판 4 평균으로 가른다 · 칸 = 굶는 마을-날 합 · 판 평균)\n', `| 묶음 | 마을 | 끔 | ${ORDER.filter((a) => a !== 'off').map((a) => AN[a]).join(' | ')} | 평균 인구 합 끔 → 둘 다 | 그 마을로 떠난 캐러밴 끔 → 둘 다 |\n|---|---|---|${ORDER.filter((a) => a !== 'off').map(() => '---').join('|')}|---|---|`,
  grp((t) => t.exOff >= 0.5, '끔에서 굶는 날 먹을 것을 판 마을(leg ≥ 0.5)'),
  grp((t) => t.exOff < 0.5, '〃 안 판 마을'),
  grp((t) => t.toOff >= medTo, `끔에서 그 마을로 오는 캐러밴이 많은 쪽(≥ 중앙 ${f(medTo)})`),
  grp((t) => t.toOff < medTo, '〃 적은 쪽'),
  grp((t) => t.frOff >= medFr, `끔에서 캐러밴을 많이 낸 쪽(≥ 중앙 ${f(medFr)})`),
  grp((t) => t.frOff < medFr, '〃 적게 낸 쪽'),
  grp((t) => t.popOn > t.popOff, '둘 다 켬에서 인구가 는 마을'),
  grp((t) => t.popOn <= t.popOff, '둘 다 켬에서 인구가 같거나 준 마을'),
  grp((t) => t.off === 0, '끔에서 한 번도 안 굶은 마을'),
  grp((t) => /^농촌/.test(t.k.split(':')[1]), '농촌'), grp((t) => /^어촌/.test(t.k.split(':')[1]), '어촌'),
  grp((t) => /^임업/.test(t.k.split(':')[1]), '임업'), grp((t) => /^광산/.test(t.k.split(':')[1]), '광산'));
// 인구 효과: 켬 판의 곳간을 끔 인구로 나누면? — 마을-날 단위 견줌은 판이 달라 못 한다 · 대신 묶음 단위로 "인구가 는 마을의 몫"
fs.writeFileSync(path.join(OUTD, 'T905_해부.md'), out.join('\n') + '\n');
fs.writeFileSync(path.join(OUTD, 'T905_해부.json'), JSON.stringify({ R: Object.fromEntries(Object.entries(R).map(([a, ms]) => [a, ms.map((m) => { const c = Object.assign({}, m); delete c.byV; delete c.popV; delete c.exportV; delete c.carsToV; delete c.carsFromV; return c; })])), villages: tab }));
console.log(out.join('\n'));

})();
(() => {
const fs = require('fs'), path = require('path');
const D = process.argv[2], OUTD = process.argv[4] || '.';
const SEEDS = [1020, 7, 42];
const ARMS = {}; for (const a of ['off', 'keep', 'hunger', 'day1', 'on']) { const rs = [a, a + '~raid1', a + '~raid2', a + '~raid3'].filter((r) => SEEDS.every((s) => fs.existsSync(path.join(D, 'run-' + r, `base-${s}.dctl.json`)) && fs.existsSync(path.join(D, 'run-' + r, `base-${s}.json`)))); if (rs.length) ARMS[a] = rs; }
const AN = { off: '끔', keep: 'T825 만', hunger: 'T859 만', day1: 'T825 하루치 + T859', on: '둘 다(T879)' };
const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const kind = (n) => n.replace(/[0-9]+$/, '');
const BIN = (r) => r < 1 ? '< 1일' : r < 15 ? '1 ~ 15일' : r < 36 ? '15 ~ 36일' : '≥ 36일';
const BINS = ['< 1일', '1 ~ 15일', '15 ~ 36일', '≥ 36일'];
function measure(run) {
  const m = { dep: {}, depK: {}, legs: {}, legsU: {}, vd: {}, buyF: {}, buyN: {} };
  for (const s of SEEDS) {
    const ob = rd(path.join(D, 'run-' + run, `base-${s}.dctl.json`)); const N = ob.names;
    const day = new Map(ob.days.map((d) => [d[0], d[1]]));
    for (const [d, row] of ob.days) for (const v of row) if (v && v[0] > 0) { const b = BIN(v[1] / v[0]); m.vd[b] = (m.vd[b] || 0) + 1; }
    for (const [d, fi] of ob.cars) { const row = day.get(d - 1) || day.get(d); const v = row && row[fi]; if (!v || !(v[0] > 0)) continue;
      const b = BIN(v[1] / v[0]), k = kind(N[fi]); m.dep[b] = (m.dep[b] || 0) + 1; m.depK[k + '|' + b] = (m.depK[k + '|' + b] || 0) + 1; }
    for (const l of ob.legs) { const b = BIN(l[6] / l[5]); m.legs[b] = (m.legs[b] || 0) + 1; m.legsU[b] = (m.legsU[b] || 0) + l[3] * l[4]; }
  }
  return m;
}
const R = {}; for (const a of Object.keys(ARMS)) R[a] = ARMS[a].map(measure);
const f = (x, p = 0) => (+x).toLocaleString('en-US', { maximumFractionDigits: p, minimumFractionDigits: p });
const band = (xs, p = 0) => `${f(Math.min(...xs), p)} ~ ${f(Math.max(...xs), p)}`;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const ov = (a, b) => !(Math.max(...a) < Math.min(...b) || Math.max(...b) < Math.min(...a));
const ORDER = Object.keys(AN).filter((a) => R[a]);
const cell = (a, g, p) => { const xs = R[a].map(g); if (a === 'off') return band(xs, p); const o = R.off.map(g), d = mean(xs) - mean(o); return `${band(xs, p)} (${d >= 0 ? '+' : ''}${f(d, p)}${ov(o, xs) ? '' : ' · **띠 밖**'})`; };
const row = (nm, g, p = 0) => `| ${nm} | ${ORDER.map((a) => cell(a, g, p)).join(' | ')} |`;
const H = `| 셈(3시드 합) | ${ORDER.map((a) => `${AN[a]} 띠(판 ${R[a].length})`).join(' | ')} |\n|---|${ORDER.map(() => '---').join('|')}|`;
const out = ['## ⑦ 떠나는 날 출발 마을 곳간(식량 환산 ÷ 인구 = 며칠치)으로 가른 캐러밴 · 먹을 것 leg\n', H];
for (const b of BINS) out.push(row(`마을-날 — 곳간 ${b}`, (m) => m.vd[b] || 0));
for (const b of BINS) out.push(row(`떠난 캐러밴 — 곳간 ${b}`, (m) => m.dep[b] || 0));
for (const b of BINS) out.push(row(`먹을 것 수출 leg(식량류 넷 밖) — 곳간 ${b}`, (m) => m.legs[b] || 0));
for (const b of BINS) out.push(row(`〃 식량 환산 — 곳간 ${b}`, (m) => m.legsU[b] || 0));
out.push('\n### 마을 종류 × 곳간 — 떠난 캐러밴\n', H);
for (const k of ['농촌', '어촌', '임업', '광산']) for (const b of BINS) out.push(row(`${k} · ${b}`, (m) => m.depK[k + '|' + b] || 0));
fs.appendFileSync(path.join(OUTD, 'T905_해부.md'), '\n' + out.join('\n') + '\n');
console.log(out.join('\n'));

})();
(() => {
const fs = require('fs'), path = require('path');
const D = process.argv[2], OUTD = process.argv[4] || '.'; const SEEDS = [1020, 7, 42];
const ARMS = {}; for (const a of ['off', 'keep', 'hunger', 'day1', 'on']) { const rs = [a, a + '~raid1', a + '~raid2', a + '~raid3'].filter((r) => SEEDS.every((s) => fs.existsSync(path.join(D, 'run-' + r, `base-${s}.dctl.json`)) && fs.existsSync(path.join(D, 'run-' + r, `base-${s}.json`)))); if (rs.length) ARMS[a] = rs; }
const AN = { off: '끔', keep: 'T825 만', hunger: 'T859 만', day1: 'T825 하루치 + T859', on: '둘 다(T879)' };
const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const PER = [[0, 120], [120, 240], [240, 365], [365, 545], [545, 730], [730, 800]];
function measure(run) { const m = {};
  for (const s of SEEDS) { const ob = rd(path.join(D, 'run-' + run, `base-${s}.dctl.json`));
    for (const [d, row] of ob.days) { const p = PER.findIndex(([a, b]) => d >= a && d < b); if (p < 0) continue; const k = m[p] || (m[p] = { n: 0, pop: 0, tfe: 0, prod: 0, tool: 0, alive: 0 });
      k.n++; for (const v of row) if (v && v[0] > 0) { k.pop += v[0]; k.tfe += v[1]; k.prod += (v[4] || 0) * v[0]; k.tool += v[2]; k.alive++; } } }
  return m; }
const R = {}; for (const a of Object.keys(ARMS)) R[a] = ARMS[a].map(measure);
const f = (x, p = 0) => (+x).toLocaleString('en-US', { maximumFractionDigits: p, minimumFractionDigits: p });
const band = (xs, p) => `${f(Math.min(...xs), p)} ~ ${f(Math.max(...xs), p)}`;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const ov = (a, b) => !(Math.max(...a) < Math.min(...b) || Math.max(...b) < Math.min(...a));
const ORDER = Object.keys(AN).filter((a) => R[a]);
const out = ['\n## ⑧ 세계 합(3시드 · 날 평균) — 기간별\n', `| 기간(날) | 셈 | ${ORDER.map((a) => AN[a] + ' 띠').join(' | ')} |\n|---|---|${ORDER.map(() => '---').join('|')}|`];
const G = [['인구', (k) => k.pop / k.n, 0], ['곳간 식량 환산', (k) => k.tfe / k.n, 0], ['곳간 ÷ 인구(며칠치)', (k) => k.tfe / k.pop, 2], ['생산 배율(인구 가중 · `lastStats.production`)', (k) => k.prod / k.pop, 3], ['도구 합', (k) => k.tool / k.n, 0]];
PER.forEach(([a, b], p) => { for (const [nm, g, pr] of G) { const O = R.off.map((m) => g(m[p]));
  out.push(`| ${a} ~ ${b} | ${nm} | ${ORDER.map((x) => { const X = R[x].map((m) => g(m[p])); if (x === 'off') return band(X, pr); const d = mean(X) - mean(O); return `${band(X, pr)} (${d >= 0 ? '+' : ''}${f(d, pr)}${ov(O, X) ? '' : ' · **띠 밖**'})`; }).join(' | ')} |`); } });
fs.appendFileSync(path.join(OUTD, 'T905_해부.md'), out.join('\n') + '\n'); console.log(out.join('\n'));

})();
