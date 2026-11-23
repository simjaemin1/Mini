// (가) 버틸 날 — 꾸민 마을(사람 30 · 오늘 흐름 = 먹을 것 · 들여온 것 0) · 일 하나만 · 철 가운데 날
process.env.T1419_FOOD_NEED = 'harv';
const path = require('path'); const ROOT = path.resolve(__dirname, '..', '..');
const l0 = console.log; console.log = () => {};
const E = require(path.join(ROOT, 'sim/economy-sim.js')); require(path.join(ROOT, 'sim/economy-sim-v2.js'));
const Cal = require(path.join(ROOT, 'server/calendar'));
console.log = l0;
const N = 30;
const mk = (land, counts, ema, day) => { E.setSeed(1); const v = E.createVillage(Object.assign({ fertility: 0.6, water: 0.6, stone: 0.6, ore: 0, wood: 0.6, game: 0.6, arable: 1, size: 70, initialPop: N, name: 'X' }, land)); v.counts = counts; v.surplusEMA = { food: ema }; v._importEMA = 0; v._world = { day }; return v; };
const days = { '봄(4월 15일)': Cal.dayOf(1, 4, 15), '여름(7월 15일)': Cal.dayOf(1, 7, 15), '가을(10월 15일)': Cal.dayOf(1, 10, 15), '겨울(1월 15일)': Cal.dayOf(2, 1, 15) };
const kinds = {
  '어촌(어부만)': [{ water: 1 }, { fisher: 10 }],
  '사냥(사냥꾼만)': [{ game: 1 }, { hunter: 10 }],
  '채집(채집꾼만)': [{ fertility: 0.8, wood: 0.8, stone: 0.8 }, { forager: 10 }],
  '밭 마을(농부만 · 끔 세계 = 날마다 거둠)': [{ fertility: 1 }, { farmer: 10 }],
  '섞인 마을(농부 4 · 어부 2 · 사냥 2 · 채집 2)': [{ fertility: 0.9, water: 0.8, game: 0.7 }, { farmer: 4, fisher: 2, hunter: 2, forager: 2 }],
};
const rows = [];
for (const [k, [land, c]] of Object.entries(kinds)) {
  const r = [k];
  for (const [s, d] of Object.entries(days)) r.push(E.foodNeedDays(mk(land, c, 0, d), d).toFixed(1));
  rows.push(r);
}
// 밭 세계 — 한 해 한 번 거둠(밭만 · 다음 거둠 = 그해 9월 15일 · 지났으면 이듬해)
{ const r = ['밭 세계(밭만 · 다음 거둠 9월 15일)'];
  for (const [s, d] of Object.entries(days)) { const v = mk({ fertility: 1 }, { farmer: 10 }, 0, d); const t = Cal.dateOf(d); let h = Cal.dayOf(t.month >= 9 && !(t.month === 9 && t.dom < 15) ? t.year + 1 : t.year, 9, 15); if (t.month < 3) h = Cal.dayOf(t.year, 9, 15); v._t1374Next = h; r.push(E.foodNeedDays(v, d).toFixed(1)); }
  rows.push(r); }
{ const r = ['넉넉한 밭 마을(흐름 = 먹을 것 × 1.5)']; for (const [s, d] of Object.entries(days)) r.push(E.foodNeedDays(mk({ fertility: 1 }, { farmer: 10 }, N * 0.5, d), d).toFixed(1)); rows.push(r); }
console.log('| 마을 꼴 | ' + Object.keys(days).join(' | ') + ' |');
console.log('|---|' + Object.keys(days).map(() => '---:').join('|') + '|');
for (const r of rows) console.log('| ' + r.join(' | ') + ' |');
