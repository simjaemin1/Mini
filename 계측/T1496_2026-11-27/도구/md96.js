'use strict';
// T1496 진단 표(마크다운) — node md96.js <판 폴더> <tag:seed>... → 표 1 ~ 4
const fs = require('fs'), path = require('path');
const DIR = process.argv[2], RUNS = process.argv.slice(3);
const TOOLS = ['tool', 'iron_tool', 'bronze_tool'];
const f1 = (x) => (x == null ? '—' : (Math.round(x * 10) / 10).toLocaleString('en-US'));
const f0 = (x) => (x == null ? '—' : Math.round(x).toLocaleString('en-US'));
const rows1 = [], rows2 = [], rows3 = [], rows4 = [];
for (const rs of RUNS) {
  const [tag, seed] = rs.split(':');
  const base = path.join(DIR, `${tag}-${seed}.json`);
  const X = JSON.parse(fs.readFileSync(base + '.t1496.json', 'utf8')), Y = JSON.parse(fs.readFileSync(base + '.t1460.json', 'utf8'));
  const b = Y.bandit, W = Y.wcols, w = Y.w, ix = (k) => W.indexOf(k);
  const days = X.lastDay, why = {};
  for (const g of Y.gangs) { const k = /^주둔지/.test(g.why || '') ? '주둔지(황야)' : (g.why || '?'); why[k] = (why[k] || 0) + 1; }
  const last = X.census[days] || X.census[Object.keys(X.census).pop()];
  const cen = Object.values(X.census);
  const holders = cen.reduce((m, c) => Math.max(m, c.withArms), 0), toolItems = cen.reduce((m, c) => Math.max(m, c.toolItems), 0);
  const warMax = cen.reduce((m, c) => Math.max(m, c.warrior), 0), warArms = cen.reduce((m, c) => Math.max(m, c.warriorArms), 0);
  rows1.push(`| ${seed} | ${days} | ${Y.gangs.length} — ${Object.entries(why).map(([k, v]) => `${k} ${v}`).join(' · ')} | ${b.conv | 0} · ${b.exo | 0} | ${X.joinSum.bodies} · 도구 ${X.joinSum.withTool} · 무기 짐 ${X.joinSum.withArms} | ${(b.t1079 && b.t1079.unload) || 0} | ${f0(last.vilNpc)} · ${holders} · ${toolItems} | ${warMax} · ${warArms} |`);
  const lt = TOOLS.reduce((a, k) => a + ((X.loot[k] && X.loot[k].n) || 0), 0), la = TOOLS.reduce((a, k) => a + ((X.loot[k] && X.loot[k].amt) || 0), 0);
  const lw = (X.loot.weapon && X.loot.weapon.n) || 0, lwa = (X.loot.weapon && X.loot.weapon.amt) || 0, lr = (X.loot.armor && X.loot.armor.n) || 0, lra = (X.loot.armor && X.loot.armor.amt) || 0;
  const all = Object.values(X.loot).reduce((a, o) => a + o.n, 0);
  const byG = Object.entries(X.lootByGang).filter(([, q]) => TOOLS.some((k) => q[k] > 0)).map(([id, q]) => {
    const g = Y.gangs.find((r) => String(r.id) === id); return `#${id}(${g ? `D${g.born} ~ D${g.last} · 가장 클 때 ${g.nMax}명` : '?'}) ${f1(TOOLS.reduce((a, k) => a + (q[k] || 0), 0))}`;
  }).join(' · ') || '—';
  const gt = Object.values(X.gangTools), gtPos = gt.filter((r) => r.max > 0).length;
  rows2.push(`| ${seed} | ${f0(all)} | ${lt} · ${f1(la)} | ${f1(lt / days * 365)} · ${f1(la / days * 365)} | ${byG} | ${lw} · ${f1(lwa)} / ${lr} · ${f1(lra)} | ${b.loot | 0} | ${gtPos} / ${gt.length} — 처음부터 0 |`);
  const hTot = X.hunt.reduce((a, r) => a + (r[1] || 0), 0), fTot = X.hunt.reduce((a, r) => a + (r[2] || 0), 0);
  let here = 0, mem = 0; for (const g of Y.gangs) { here += g.hereD || 0; mem += g.memD || 0; }
  const band = []; for (const g of Y.gangs) for (const t of g.t60 || []) band.push(t.bandAnimals || 0); band.sort((a, c) => a - c);
  const mobsW = X.mobs.reduce((m, s) => Math.max(m, s.all), 0), mobsN = X.mobs.reduce((m, s) => Math.max(m, s.rows.reduce((q, r) => Math.max(q, r.mobs), 0)), 0);
  rows3.push(`| ${seed} | ${f1(hTot)} · ${f1(fTot)} | ${f0(mem)} · ${f0(here)} (${mem ? (100 * (1 - here / mem)).toFixed(1) : '—'}%) | ${band.length ? `${f0(band[band.length >> 1])} · ${f0(band[band.length - 1])}` : '—'} | ${mobsW} · ${mobsN} |`);
  const cpu = X.cpu, avg = cpu.reduce((a, r) => a + r[1], 0) / cpu.length, mx = cpu.reduce((m, r) => (r[1] > m[1] ? r : m), [0, 0]);
  const slow = cpu.filter((r) => r[1] > 10).length, rss = cpu.reduce((m, r) => Math.max(m, r[2]), 0);
  const a400 = cpu.filter((r) => r[0] <= 400), avg400 = a400.reduce((a, r) => a + r[1], 0) / a400.length;
  const wk = Object.entries(X.walk).map(([d, s]) => [+d, s.max]); const wm = wk.reduce((m, r) => (r[1] > m[1] ? r : m), [0, 0]);
  rows4.push(`| ${tag} | ${seed} | ${days} | ${avg400.toFixed(2)} | ${avg.toFixed(2)} | ${mx[1].toFixed(1)}(D${mx[0]}) · ${slow}날 | ${f0(rss)} | ${f0(wm[1])}(D${wm[0]}) |`);
}
console.log(`### 표 1 — 단원이 되는 순간 그 몸의 짐
| 시드 | 날 | 선 단 — 어디서 났나 | 마을을 떠나 단이 된 사람(해체 전환 · 절망 이탈) | 떠난 몸(t1039Depart) · 그중 도구 · 무기 짐 쥔 몸 | 단에 든 몸이 내려놓은 무기 짐(T1079 unload) | 마을 몸(마지막 날) · 무기 짐(다섯) 쥔 몸 가장 많을 때 · 도구품(toolItems) 쥔 몸 | 전사 몸 가장 많을 때 · 그중 무기 짐 쥔 몸 |
|---|---|---|---|---|---|---|---|
${rows1.join('\n')}

### 표 2 — 약탈 짐에 든 도구 · 단의 도구
| 시드 | 약탈 품목 건(바구니 품목마다) | 도구 셋 건 · 양 | 해마다(건 · 양) | 받은 단(그 단이 산 날) · 양 | 무기 건 · 양 / 갑옷 건 · 양 | 약탈(캐러밴) 건 | 더미에 도구가 한 번이라도 > 0 인 단 / 단 |
|---|---|---|---|---|---|---|---|
${rows2.join('\n')}

### 표 3 — 지금 장부 사냥 ↔ 둘레 짐승
| 시드 | 장부 사냥 · 채집(두 해 합 · 식량) | 단원-날 · 그날 은거지에 있던 단원-날(길목에 나간 몫) | 은거지 둘레 40 ~ 130칸 마을 사냥터 장부 짐승(30날 표본 가운데 · 가장 많음) | 짐승 몸(세계 wildlife 몸 가장 많을 때 · 은거지 140칸 안 가장 많을 때) |
|---|---|---|---|---|
${rows3.join('\n')}

### 표 4 — 하루 걸린 초 · 몸 걸음
| 판 | 시드 | 날 | 하루 CPU 초(날 1 ~ 400 평균) | (전체 평균) | 가장 느린 날 · 10초 넘은 날 | RSS 꼭대기 MB | 단 몸 하루 곧은 걸음 가장 큼(칸) |
|---|---|---|---|---|---|---|---|
${rows4.join('\n')}`);
