// 서버 판 계측(세계 0 · 읽기만) — T1373: 인구 상한의 땅 몫 · 집터 · 계절 배수 — 마을-날 줄
//   마을-날 줄(`COLS` 차례):
//     K 셋(`_kDbg` — 식량 자리 slotK · 식량 흐름 prodK · 땔감 fuelK) · 인구 식이 쓴 K(`_dpDebug.K`) · 로지스틱 몫(`_dpDebug.logi` — 음수 = K 위 죽음 압력) · 그날 dP · 건강 몫 · 행복 몫 · 주거 문에 막힘(`_dpDebug.gated`)
//     주거(`housing` — econ 주거) · 지은 침상(`_mapBeds` — 서버 `_houseCells` × 6) · 영토 칸(서버 `_terrSet` 크기 · 없으면 econ 땅 × 25) · 집 칸(서버 `_houseCells` 수)
//     계절(0 봄 · 1 여름 · 2 가을 · 3 겨울) · 날씨 · 풍흉 걸림 · 경작지 칸 있음 · 그날 econ 이 본 땅의 식량 자리(농 · 어 · 사냥 · 채집) · 계절 배수만 뺀 땅의 식량 자리 ·
//     벌목 흐름 상한(나무꾼 자리 × 0.9 × 나무 — fuelK 의 숲 몫) 계절 있음 · 없음(땅은 틱 뒤 원래로 돌아가므로 v2 `applyLandModifiers` 그 식으로 사본 위에서 다시 센다) ·
//     그날 만든 곡식 · 생선 · 고기 · 농부 · 어부 · 사냥꾼 · 나무꾼 수
//     곳간 나무 · 땔감 충당 · 곳간 날 수 · 굶어 죽음 누계 · K 위 죽음 누계
//   K 위 죽음의 땅 몫 · 땔감 몫은 표가 그날 slotK 와 fuelK 가운데 작은 쪽으로 가른다(인구 식 음수 몫 `min(slotK, fuelK)` 그 식 · T1074 켬).
//   30날마다 파일을 새로 쓴다 · 끝날 때 한 번 더. ⚠값 함수 · 캐시를 세우는 함수는 안 부른다(순수 식량 환산만).
'use strict';
if (process.env.T577_OUT) {
  const path = require('path'), fs = require('fs');
  const ROOT = process.env.T1373_ROOT || path.resolve(__dirname, '..', '..'), OUT = process.env.T577_OUT;
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const COLS = ['day', 'v', 'N', 'slotK', 'prodK', 'fuelK', 'K', 'logi', 'dP', 'hTerm', 'hapTerm', 'gated', 'housing', 'mapBeds', 'terrCells', 'lsize', 'homeCap', 'houses',
    'sea', 'wx', 'ysh', 'arable', 'slFarm', 'slFish', 'slHunt', 'slFor', 'slotNoSea', 'wcap', 'wcapNoSea', 'pFood', 'pFish', 'pMeat', 'n_farmer', 'n_fisher', 'n_hunter', 'n_lumberjack', 'wood', 'fuelCov', 'foodDays', 'fdTot', 'kovTot', 'natTot', 'cropIn', 'cropAcc'];
  const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2.js'));
  const SM = (V2._t1152Probe && V2._t1152Probe.seasonMult) || {};
  const SEAS = ['spring', 'summer', 'autumn', 'winter'];
  // 그날 econ 이 본 땅(계절 · 날씨 · 풍흉 배수 — v2 \`applyLandModifiers\` 그 식)과 계절만 뺀 땅으로 자리를 다시 센다 — 마을 사본 위(제 마을 무변 · 읽개 끔)
  const landAt = (e, sea, day, withSeason) => {
    const o = e._origLand || e.land, sm = withSeason ? (SM[sea] || {}) : {};
    const w = (e._weather && e._weather.untilDay >= day) ? e._weather.mult : null, y = (e._yearShock && e._yearShock.untilDay >= day) ? e._yearShock.mult : null;
    const m = (k) => (sm[k] || 1) * (w ? (w[k] || 1) : 1) * (y ? (y[k] || 1) : 1);
    return Object.assign({}, o, { size: e.land.size, baseSize: e.land.baseSize, fertility: o.fertility * m('fertility'), water: o.water * m('water'), game: o.game * m('game'), wood: o.wood * m('wood'), stone: o.stone * m('stone'), ore: o.ore * m('ore') });
  };
  const capAt = (e, land) => { const c = E.jobCapacity(Object.assign({}, e, { land, _effSizeCache: undefined })); return c; };
  const names = [], nameIdx = new Map(), rows = [];
  const r3 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 1000) / 1000;
  let lastDay = -1, lastWrite = -1;
  const sv = () => { const vm = require.cache[path.join(ROOT, 'server', 'villages.js')], VS = vm && vm.exports; return VS && VS.__labProbe && VS.__labProbe._t569Probe ? (VS.__labProbe._t569Probe.setup().villages || []) : []; };
  const dayRows = (day) => {
    const out = [];
    for (const vil of sv()) {
      const e = vil && vil.econ; if (!e || e.founder) continue;
      let vi = nameIdx.get(vil.name); if (vi === undefined) { vi = names.length; names.push(vil.name); nameIdx.set(vil.name, vi); }
      const N = (e.npcs || []).length, k = e._kDbg || {}, dp = e._dpDebug || {}, L = e.land || {}, O = e._origLand || L, c = e.counts || {}, P = e.dailyProductionBuf || {};
      const ratio = (a, b) => (b > 0 && a != null) ? r3(a / b) : null;
      let fe = null; try { fe = E.totalFoodEquivalent(e); } catch (_) {}
      const terr = vil._terrSet && vil._terrSet.size ? vil._terrSet.size : (L.size ? L.size * 25 : null);
      out.push([day, vi, N, k.slot == null ? null : k.slot, k.prod == null ? null : k.prod, k.fuel == null ? null : k.fuel, dp.K == null ? null : dp.K, dp.logi == null ? null : dp.logi, dp.dP == null ? null : dp.dP, dp.health == null ? null : dp.health, dp.happy == null ? null : dp.happy, dp.gated ? 1 : 0,
        e.housing == null ? null : r3(e.housing), e._mapBeds == null ? null : e._mapBeds, terr, L.size == null ? null : r3(L.size), (E.t1373HomeCap ? (() => { const h = E.t1373HomeCap(e); return isFinite(h) ? h : null; })() : null), vil._houseCells ? vil._houseCells.length : null,
        ...(() => { try {
          const sea = Ev.seasonOf ? Ev.seasonOf(day) : null, si = SEAS.indexOf(sea);
          const c1 = capAt(e, landAt(e, sea, day, true)), L0 = landAt(e, sea, day, false), c0 = capAt(e, L0), L1 = landAt(e, sea, day, true);
          const tf = (c) => c.farmer + c.fisher + c.hunter + Math.floor(c.forager * 0.5);
          return [si, (e._weather && e._weather.untilDay >= day) ? 1 : 0, (e._yearShock && e._yearShock.untilDay >= day) ? 1 : 0, e.land.arable != null ? 1 : 0,
            c1.farmer, c1.fisher, c1.hunter, c1.forager, tf(c0), r3((c1.lumberjack || 0) * 0.9 * (L1.wood || 0)), r3((c0.lumberjack || 0) * 0.9 * (L0.wood || 0))];
        } catch (err) { if (!dayRows._err2) dayRows._err2 = String(err && err.stack || err); return [null, null, null, null, null, null, null, null, null, null, null]; } })(),
        r3(P.food || 0), r3(P.fish || 0), r3(P.meat || 0), c.farmer || 0, c.fisher || 0, c.hunter || 0, c.lumberjack || 0,
        r3((e.storage && e.storage.wood) || 0), e._fuelCov == null ? null : r3(e._fuelCov), fe == null || !N ? null : r3(fe / N),
        e._fdDeadTot || 0, (e._deadTot || 0) - (e._fdDeadTot || 0) - (e._natDeadTot || 0), e._natDeadTot || 0,
        r3(e._t1179InToday || 0), r3(e._t1179F ? e._t1179F.acc : 0)]);   // ★[T1179 작물 철 켬] 그날 거둬 곳간에 든 먹을 것 · 밭에 든 몫 누계(식량 환산 — 곳간에 든 식량 = 그날 만든 것 − 밭에 든 몫 + 거둔 것)
    }
    return out;
  };
  const dump = () => fs.writeFileSync(OUT + '.t1373.json', JSON.stringify({ env: { BUNDLE: process.env.T1334_BUNDLE || null, HOME: process.env.T1373_HOME_CAP || null, NOSEA: process.env.T1373_NO_SEASON_YIELD || null, CROP: process.env.T1179_CROP_SEASON || null, FARM: process.env.T1243_FARM_ON || null },
    cols: COLS, names, rows, last: lastDay, err: dayRows._err || null, err2: dayRows._err2 || null }));
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const Lg = mk.apply(this, arguments), sd = Lg.scanDay;
    Lg.scanDay = function (world, day) {
      const r = sd.apply(this, arguments);
      try {
        if ((day | 0) === lastDay) return r; lastDay = day | 0;
        for (const q of dayRows(lastDay)) rows.push(q);
        if (lastDay - lastWrite >= 30) { lastWrite = lastDay; dump(); }
      } catch (e) { if (!dayRows._err) { dayRows._err = String(e && e.stack || e); } }
      return r;
    };
    return Lg;
  };
  process.on('exit', () => { try { dump(); } catch (e) { try { fs.writeFileSync(OUT + '.t1373.json', JSON.stringify({ err: String(e && e.stack || e) })); } catch (_) {} } });
}
