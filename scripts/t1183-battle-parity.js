'use strict';
// T1183 읽기 전용 대조: 같은 병력·거리·씨로 전투 커널과 서버 어댑터를 비교한다.
// 존의 마을 소집/지형/행군 전이는 이 자가 검증하지 않는다.
const BC = require('../sim/battle-core');
const WLM = require('../server/war-live');
function run(controlled, physical = false) {
  const WL = WLM.createWarLive({ cellPx: 32, pxPerM: 32, tickHz: 30 });
  const f = WL.makeFight({ id: 7, born: 400, _heading: 0 }, null);
  f.physical = physical;
  const lab = BC.createContext(); lab.rng = WLM._muRng(f.seed);
  const handle = BC._makeHandle(lab);
  for (const side of ['A', 'B']) {
    const rows = [];
    for (let i = 0; i < 6; i++) rows.push({ type: i < 3 ? 'spear' : 'archer', x: side === 'A' ? 40 : 70, y: 40 + i * 2, agent: side + i });
    for (const row of rows) {
      const p = { x: row.x * 32, y: row.y * 32 }, gu = { pid: row.agent, type: row.type };
      WL.enlist(f, side, gu, p);
    }
    lab.sides[side].form = 'line'; handle.addUnits(side, rows, null);
  }
  for (const u of lab.units) u.face = u.side === 'A' ? 0 : Math.PI;
  const result = { server: { firstArrow: { A: null, B: null }, firstContact: null, morale: [] }, lab: { firstArrow: { A: null, B: null }, firstContact: null, morale: [] } };
  let tick = 0;
  const arrow = f.ctx.onArrow;
  f.ctx.onArrow = (kind, ar, u) => { arrow(kind, ar, u); if (kind === 'fire' && result.server.firstArrow[u.side] === null) result.server.firstArrow[u.side] = tick; };
  lab.onArrow = (kind, ar, u) => { if (kind === 'fire' && result.lab.firstArrow[u.side] === null) result.lab.firstArrow[u.side] = tick; };
  WL.setSideCtl(f, 'A', false); WL.setSideCtl(f, 'B', !!controlled);
  f.state = 'advance';
  const sample = (ctx) => ctx.units.map(u => +u.mrl.toFixed(6));
  for (tick = 1; tick <= 300; tick++) {
    const ev = WL.stepFight(f);
    BC._trackVel(lab, WL.STEP_DT); BC._stepBattle(lab, WL.STEP_DT);
    if (ev.contact && result.server.firstContact === null) result.server.firstContact = tick;
    if (lab.units.some(u => u.st === 'shoot' || u.st === 'melee') && result.lab.firstContact === null) result.lab.firstContact = tick;
    if (tick % 30 === 0) { result.server.morale.push(sample(f.ctx)); result.lab.morale.push(sample(lab)); }
  }
  result.same = JSON.stringify(result.server) === JSON.stringify(result.lab);
  return result;
}
if (require.main === module) console.log(JSON.stringify({ free: run(false), defenseInFormation: run(true), physicalDefense: run(true, true) }, null, 2));
module.exports = { run };
