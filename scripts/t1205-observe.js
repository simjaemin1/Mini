'use strict';
// === scripts/t1205-observe.js — T1205 행복 식 관측(계측기 · 러너 밖 · 제품 무변) ======================================
//   서버 판 자(`t577-server-run.js`) 아이 존에 `NODE_OPTIONS=--require` 로 싣는다. 서버 장부 `scanDay`(econ 하루 끝)에서
//   T1205_EVERY 날(기본 5)마다 마을마다 한 줄: [인구 · 영토 셀(`_terrSet`) · econ 땅 셀(size×25) · 창설 셀(baseSize×25) ·
//   좋은 것 G · 사치품 몫 · 겪은 일 E · 천천히 S · 부담 B · 행복 h · 위신 · 떠난 누계 · 멈춘 날 누계 · 출생 누계 근사(인구 변화)].
//   끝에 `$T577_OUT.t1205.json`.
if (require('worker_threads').isMainThread && process.env.T577_OUT) {
  const fs = require('fs'), path = require('path');
  const Ev = require('../server/events');
  const V = require('../server/villages');
  const EVERY = parseInt(process.env.T1205_EVERY || '5', 10) || 5;
  const rows = []; let names = null;
  const r4 = (x) => (x == null || !isFinite(x) ? null : +(+x).toFixed(4));
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const L = mk.apply(this, arguments), sd = L.scanDay;
    L.scanDay = function (world, day) {
      const r = sd.apply(this, arguments);
      try {
        if ((day | 0) % EVERY === 0) {
          const st = V.__p3Bind({}).state, W = world.villages;
          if (!names) names = W.map((v) => v.name);
          rows.push([day | 0, W.map((v) => {
            const vil = st.byEcon && st.byEcon.get(v), s = v.lastStats || {}, L2 = v.land || {};
            return [(v.npcs || []).length, vil && vil._terrSet ? vil._terrSet.size : null, r4((L2.size || 0) * 25), r4((L2.baseSize || 0) * 25),
              r4(s.happinessGoods), r4(s.happinessLux), r4(v._t1134E), r4(s.happinessSlow != null ? s.happinessSlow : s.happinessEq), r4(s.happinessBurden), r4(s.happiness), r4(s.prestige),
              v._emigTot || 0, v._t1205Stop || 0, (v._dpDebug && v._dpDebug.happy) != null ? r4(v._dpDebug.happy) : null];
          })]);
        }
      } catch (e) { console.error('[t1205-observe]', e.message); }
      return r;
    };
    return L;
  };
  const dump = () => { try { fs.writeFileSync(process.env.T577_OUT + '.t1205.json', JSON.stringify({ cols: ['n', 'terr', 'land25', 'base25', 'G', 'lux', 'E', 'S', 'B', 'h', 'prestige', 'emig', 'stop', 'happyTerm'], names, rows })); } catch (e) {} };
  process.on('exit', dump);
}
