// === sim/_battle-join-test.js — addUnits(참전 삽입 구조) 검증 ===
'use strict';
const BC = require('./battle-core.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };
const mkRng = (s0) => { let s = s0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };
const SPEC = { A: { spear: 1, form: 'circle' }, B: { dagger: 6, form: 'line' }, terrain: 'plain', quality: { A: { weapQ: 0.42 }, B: { weapQ: 0.46 } } };
// [1] 무증원 기준: 1v6 → B 승(기존 실측 재현) + 같은 시드 2회 = 동일 결과(비트 동일 간접 확인)
function runPlain(seed) { const h = BC.createBattle(SPEC, { rng: mkRng(seed) }); let t = 0; while (!h.result && t++ < 4000) h.step(0.05); return { win: h.result && h.result.win, tick: h.tick }; }
const r1 = runPlain(77), r2 = runPlain(77);
ok(r1.win === 'B', '기준 1v6=B승(' + r1.win + ')');
ok(r1.win === r2.win && r1.tick === r2.tick, '동시드 재현 동일(미호출=무영향)');
// [2] 중반 증원: A측 창병 6 투입 → 전세 반전 + start/유닛수 정합
{
  const h = BC.createBattle(SPEC, { rng: mkRng(77) });
  for (let t = 0; t < 20 && !h.result; t++) h.step(0.05);
  const before = h.sides.A.start;
  const list = []; for (let i = 0; i < 6; i++) list.push({ type: 'spear', x: 60 + (i % 3) * 2, y: 62 + ((i / 3) | 0) * 2, face: 0 });
  const n = h.addUnits('A', list, { weapQ: 0.6 });
  ok(n === 6 && h.sides.A.start === before + 6 && h.units.filter(u => u.side === 'A').length === before + 6, '증원 수·start 정합(' + n + ')');
  let t2 = 0; while (!h.result && t2++ < 4000) h.step(0.05);
  const aAlive = h.units.filter(u => u.side === 'A' && u.hp > 0).length;
  ok(h.result && h.result.win === 'A' && aAlive > 0, '증원 후 전세 반전(win=' + (h.result && h.result.win) + ' A생존 ' + aAlive + ')');
}
// [3] 궁수 증원 = 화살 보급 가산
{
  const h = BC.createBattle(SPEC, { rng: mkRng(5) });
  h.step(0.05);
  const a0 = h.sides.A.arrows || 0;
  h.addUnits('A', [{ type: 'archer', x: 55, y: 65 }]);
  ok((h.sides.A.arrows || 0) > a0, '궁수 증원 화살 가산(' + a0 + '→' + h.sides.A.arrows + ')');
}
// [4] 결판 후 증원 거부
{
  const h = BC.createBattle(SPEC, { rng: mkRng(9) });
  let t = 0; while (!h.result && t++ < 4000) h.step(0.05);
  ok(h.addUnits('A', [{ type: 'spear', x: 65, y: 65 }]) === 0, '결판 후 0');
}
console.log(fail === 0 ? 'PASS ' + pass + '/' + (pass + fail) : 'FAIL ' + fail + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
