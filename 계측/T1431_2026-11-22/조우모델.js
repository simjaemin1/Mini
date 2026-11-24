'use strict';
// (계측 자 · 판정 0) T1431 ① — 길 위 조우 하나를 두 전투 모델로: econ `_raidScrum`(per-entity hp100 평면 · 라운드 · FLEE 0.35) ↔ battle-core 한 판(`caravan-battle` `resolveRaid` — 병종 · 개별 사기 · 궤주).
//   같은 조우 = 호위 E(창) + 행상 1(스크럼 = 싸우는 몸 · battle-core = 호위가 없을 때만 싸우는 몸 — `raidBattle` 그대로 · 달아남 판단은 빼고 싸움만) ↔ 도적 G(든 사람 = G · 무기 품질 0.42 둘 다 · 행복 1 — 사기 항 무변). 씨마다 20판. 칸: 캐러밴 이김 · 호위 죽음 · 행상 죽음 · 도적 죽음 · 걸린 시간 · CPU.
//   node 계측/T1431_2026-11-22/조우모델.js [씨 수]
const path = require('path'), R = path.join(__dirname, '..', '..');
const E2 = require(path.join(R, 'sim', 'economy-sim-v2.js')), V1 = require(path.join(R, 'sim', 'economy-sim.js')), CB = require(path.join(R, 'sim', 'caravan-battle.js'));
const scrum = E2._t1079Probe.raidScrum, escAtk = E2._t1079Probe.escAtk;
const N = +process.argv[2] || 20, rows = [];
const now = () => { const t = process.hrtime(); return t[0] * 1e3 + t[1] / 1e6; };
for (const E of [0, 1, 2, 3, 4, 6]) for (const G of [1, 2, 3, 4, 5, 6, 8]) {
  const a = { win: 0, esc: 0, tr: 0, ban: 0, t: 0, ms: 0 }, b = { win: 0, esc: 0, tr: 0, ban: 0, t: 0, ms: 0, draw: 0 };
  for (let s = 1; s <= N; s++) {
    V1.setSeed(s * 7919 + E * 31 + G);
    let t0 = now(); const r = scrum(E, escAtk({ _weapQ: 0.42 }), G, null); a.ms += now() - t0;
    a.win += r.repel ? 1 : 0; a.esc += r.escKilled; a.tr += r.traderDead ? 1 : 0; a.ban += r.banditsKilled;
    t0 = now(); const q = CB.resolveRaid({ spear: E, militia: E > 0 ? 0 : 1, banditN: G, weapQ: 0.42, banditWeapQ: 0.42, seed: CB.seedOf(s, E, G), mrlA: 1 }); b.ms += now() - t0;
    b.win += q.win === 'A' ? 1 : 0; b.draw += q.win === '무' ? 1 : 0; b.esc += q.escDead; b.tr += (E > 0 || q.traderAlive) ? 0 : 1; b.ban += q.banditDead; b.t += q.secs;
  }
  const f = (o) => ({ win: +(o.win / N).toFixed(2), esc: +(o.esc / N).toFixed(2), tr: +(o.tr / N).toFixed(2), ban: +(o.ban / N).toFixed(2), us: Math.round(o.ms / N * 1000) });
  rows.push({ E, G, scrum: f(a), bc: Object.assign(f(b), { secs: +(b.t / N).toFixed(1), draw: +(b.draw / N).toFixed(2) }) });
}
console.log('| 호위 E | 도적 G | 스크럼 이김 | battle-core 이김 | 스크럼 호위 죽음 | bc 호위 죽음 | 스크럼 행상 죽음 | bc 행상 죽음 | 스크럼 도적 죽음 | bc 도적 죽음 | bc 걸린 초 | 스크럼 µs | bc µs |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.E} | ${r.G} | ${r.scrum.win} | ${r.bc.win}${r.bc.draw ? ` (비김 ${r.bc.draw})` : ''} | ${r.scrum.esc} | ${r.bc.esc} | ${r.scrum.tr} | ${r.bc.tr} | ${r.scrum.ban} | ${r.bc.ban} | ${r.bc.secs} | ${r.scrum.us} | ${r.bc.us} |`);
const sum = (k, m) => rows.reduce((a, r) => a + r[m][k], 0) / rows.length;
console.log(`\n평균(${rows.length} 칸 × ${N}판) — 이김 스크럼 ${sum('win', 'scrum').toFixed(2)} · bc ${sum('win', 'bc').toFixed(2)} · 행상 죽음 ${sum('tr', 'scrum').toFixed(2)} · ${sum('tr', 'bc').toFixed(2)} · CPU µs ${Math.round(sum('us', 'scrum'))} · ${Math.round(sum('us', 'bc'))}`);
