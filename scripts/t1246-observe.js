'use strict';
// T1246 읽기 전용 계측. t176의 env 설정 전에 econ 모듈을 require하지 않는다.
const fs = require('fs'), Module = require('module'), path = require('path');
const root = process.env.T1246_ROOT || path.resolve(__dirname, '..');
const births = new WeakMap();
const compile = Module.prototype._compile;
const stat = { villageDays: 0, populationDays: 0, lumberjackDays: 0, births: 0,
  zeroBirthVillageDays: 0, reasons: {}, priceSum: 0, priceMin: Infinity, priceMax: 0,
  priceAt1000: 0, foodDaysSum: 0, snapshots: [] };
global.__t1246Birth = v => births.set(v, (births.get(v) || 0) + 1);
Module.prototype._compile = function (src, file) {
  if (file === path.join(root, 'sim/economy-sim.js')) {
    const from = '    v.counts[newJob] = (v.counts[newJob] || 0) + 1;';
    if (!src.includes(from)) throw Error('T1246 birth observer anchor missing');
    src = src.replace(from, '    global.__t1246Birth(v);\n' + from);
  }
  const result = compile.call(this, src, file);
  if (file === path.join(root, 'sim/economy-sim-v2.js')) {
    const V = this.exports, E = require(root + '/sim/economy-sim');
    const old = V.tickWorldV2;
    V.tickWorldV2 = function (w) {
      for (const v of w.villages) births.set(v, 0);
      const ret = old.apply(this, arguments);
      for (const v of w.villages) {
        const n = v.npcs.length;
        if (!n) continue;
        const b = births.get(v) || 0, px = V.computeShadowPrices(v).food, d = v._dpDebug || {};
        stat.villageDays++; stat.populationDays += n;
        stat.lumberjackDays += (v.counts || {}).lumberjack || 0;
        stat.births += b; stat.priceSum += px;
        stat.priceMin = Math.min(stat.priceMin, px); stat.priceMax = Math.max(stat.priceMax, px);
        if (px >= 999.999) stat.priceAt1000++;
        stat.foodDaysSum += E.totalFoodEquivalent(v) / n;
        if (!b) {
          stat.zeroBirthVillageDays++;
          const reason = d.gated ? 'housing' : v._t1149Gate ? 'winter-food' :
            d.dP <= 0 ? 'nonpositive-or-rounded-growth' : 'fraction-or-other-birth-gate';
          stat.reasons[reason] = (stat.reasons[reason] || 0) + 1;
        }
      }
      if (w.day % 100 === 0) stat.snapshots.push({ day: w.day,
        population: w.villages.reduce((a, v) => a + v.npcs.length, 0),
        lumberjacks: w.villages.reduce((a, v) => a + ((v.counts || {}).lumberjack || 0), 0) });
      return ret;
    };
  }
  return result;
};
process.on('exit', code => {
  stat.exit = code;
  stat.priceMean = stat.priceSum / Math.max(1, stat.villageDays);
  stat.lumberjackShare = stat.lumberjackDays / Math.max(1, stat.populationDays);
  fs.writeFileSync(process.env.T1246_OBSERVE_OUT || '/tmp/t1246-observe-' + process.pid + '.json', JSON.stringify(stat, null, 2));
});
