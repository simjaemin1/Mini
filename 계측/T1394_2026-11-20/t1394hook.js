// 서버 판 계측(세계 0 · 읽기만) — T1394: 굶주림 ↔ 도구 나선 둘째 — 돌이 없는 마을 · 석공 목표 · 빈 마을의 죽는 차례
//   T1363 훅(`계측/T1363_2026-11-18/t1363hook.js`)의 칸에 넷을 더했다:
//     ⓐ 사람 들고 남 — 사람 id 로 어제 명부와 견줘 새로 든 사람(난 아이 · 들어온 사람) · 빠진 사람(죽음 + 떠남) · 죽음 누계 셋(굶어 · 자연 · 모두) · 이탈 누계(`_emigTot`) · 단이 됨(`_banditized`)
//     ⓑ 돌 흐름 — 그날 주운 돌(`dailyProductionBuf.stone`) · 석공 석기 누계(`_stoneToolMade`) · 마제석검 누계(`_stoneWeaponMade`) · 막석기 누계(`_selfToolMade`) · 석공 가장 높은 숙련
//     ⓒ 철 · 날씨가 걸린 땅 돌(econ 틱 안 값 — v2 `applyLandModifiers` 그 식을 사본 위에서) · 그 땅에서의 채집꾼 자리(`jobCapacity` — 사본 위 · 캐시 칸 뺌)
//     ⓓ 도구 마모 흐름(그날 직업 수로 econ 마모 식 그대로 — 농부 0.02 · 그 밖 도구 일꾼 0.01 · v2 자급 0.005 × 사람)
//   30날마다 파일을 새로 쓴다 · 끝날 때 한 번 더. ⚠값 함수 · 캐시를 세우는 함수는 제 마을에 안 부른다(사본 위 · 순수 함수만 — 끈 판 지문이 같아야 한다).
'use strict';
if (process.env.T577_OUT) {
  const path = require('path'), fs = require('fs');
  const ROOT = process.env.T1394_ROOT || path.resolve(__dirname, '..', '..'), OUT = process.env.T577_OUT;
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2.js'));
  const SM = (V2._t1152Probe && V2._t1152Probe.seasonMult) || null;
  const SEAS = ['spring', 'summer', 'autumn', 'winter'];
  const JOBS = ['farmer', 'fisher', 'hunter', 'forager', 'lumberjack', 'miner', 'warrior', 'smith', 'cook', 'merchant', 'tailor'];
  const COLS = ['day', 'v', 'N', 'toolStock', 'stoneTool', 'toolDeps', 'toolMade', 'n_mason', 'masonT', 'stone', 'stoneWork', 'landStone', 'sea', 'landStoneEff', 'capForager',
    'foodDays', 'famine', 'toolCrit', ...JOBS.map((j) => 'n_' + j), 'need', 'moves', 'born', 'gone',
    'fdTot', 'deadTot', 'natTot', 'emigTot', 'bandit', 'stoneMade', 'foodMade', 'stToolCum', 'stWeapCum', 'selfToolCum', 'masonSk', 'wear',
    'kSlot', 'kProd', 'kFuel', 'fuelCov', 'health', 'homeCap', 'housing'];
  const names = [], nameIdx = new Map(), rows = [];
  const lastJob = new Map();   // 마을 이름 → (사람 id → 어제 일)
  const r3 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 1000) / 1000;
  let lastDay = -1, lastWrite = -1;
  const sv = () => { const vm = require.cache[path.join(ROOT, 'server', 'villages.js')], VS = vm && vm.exports; return VS && VS.__labProbe && VS.__labProbe._t569Probe ? (VS.__labProbe._t569Probe.setup().villages || []) : []; };
  const seaOf = (day) => { try { return Ev.seasonOf ? Ev.seasonOf(day) : null; } catch (_) { return null; } };
  // 그날 econ 틱 안의 땅(계절 · 날씨 · 풍흉 배수 — v2 `applyLandModifiers` 그 식) — 사본
  const landAt = (e, sea, day) => {
    const o = e._origLand || e.land, sm = (SM && SM[sea]) || {};
    const w = (e._weather && e._weather.untilDay >= day) ? e._weather.mult : null, y = (e._yearShock && e._yearShock.untilDay >= day) ? e._yearShock.mult : null;
    const m = (k) => (sm[k] || 1) * (w ? (w[k] || 1) : 1) * (y ? (y[k] || 1) : 1);
    return Object.assign({}, o, { size: e.land.size, baseSize: e.land.baseSize, fertility: o.fertility * m('fertility'), water: o.water * m('water'), game: o.game * m('game'), wood: o.wood * m('wood'), stone: o.stone * m('stone'), ore: o.ore * m('ore') });
  };
  const dayRows = (day) => {
    const out = [];
    const sea = seaOf(day);
    for (const vil of sv()) {
      const e = vil && vil.econ; if (!e || e.founder) continue;
      let vi = nameIdx.get(vil.name); if (vi === undefined) { vi = names.length; names.push(vil.name); nameIdx.set(vil.name, vi); }
      const N = (e.npcs || []).length, st = e.storage || {}, c = e.counts || {};
      const tS = (st.iron_tool || 0) + (st.bronze_tool || 0) + (st.tool || 0);
      const deps = e._toolDeps || 0;
      let fe = null; try { fe = E.totalFoodEquivalent(e); } catch (_) {}
      let mt = null, sw = null; try { mt = E.masonTarget(e); } catch (_) {} try { sw = E.stoneWorkStock(e); } catch (_) {}
      let Ls = null, capF = null;
      try { const L1 = landAt(e, sea, day); Ls = L1.stone; const cc = E.jobCapacity(Object.assign({}, e, { land: L1, _effSizeCache: undefined })); capF = cc ? cc.forager : null; } catch (err) { if (!dayRows._err2) dayRows._err2 = String(err && err.stack || err); }
      const sd = e._dbgSwitch && e._dbgSwitch.day === day ? e._dbgSwitch : null, k = e._kDbg || {};
      let lj = lastJob.get(vil.name); if (!lj) { lj = new Map(); lastJob.set(vil.name, lj); }
      const mv = {}; let born = 0; const seen = new Set();
      let msk = 0, wear = 0;
      for (const p of e.npcs || []) {
        seen.add(p.id);
        const j0 = lj.get(p.id);
        if (j0 === undefined) born++;
        else if (j0 !== p.currentJob) { const kk = j0 + '>' + p.currentJob; mv[kk] = (mv[kk] || 0) + 1; }
        lj.set(p.id, p.currentJob);
        if (p.currentJob === 'mason') msk = Math.max(msk, (p.skills && p.skills.masonry) || 0);
      }
      let gone = 0; for (const id of [...lj.keys()]) if (!seen.has(id)) { gone++; lj.delete(id); }
      try { for (const j of Object.keys(c)) { const jd = E.JOBS && E.JOBS[j]; if (jd && jd.toolDependent) wear += (c[j] || 0) * (j === 'farmer' ? 0.02 : 0.01); } wear += N * 0.005; } catch (_) { wear = null; }
      const dp = e.dailyProductionBuf || {};
      let hc = null; try { if (E.t1373HomeCap) { const h = E.t1373HomeCap(e); hc = isFinite(h) ? h : null; } } catch (_) {}
      out.push([day, vi, N, r3(tS), r3(st.tool || 0), deps, r3(dp.tool || 0), c.mason || 0, r3(mt), r3(st.stone || 0), r3(sw), r3(e.land ? e.land.stone : null),
        SEAS.indexOf(sea), r3(Ls), capF,
        fe == null || !N ? null : r3(fe / N), fe == null ? null : (fe < N * 30 ? 1 : 0), tS < deps * 0.7 ? 1 : 0,
        ...JOBS.map((j) => c[j] || 0), sd ? sd.need : null, Object.keys(mv).length ? mv : null, born, gone,
        e._fdDeadTot || 0, e._deadTot || 0, e._natDeadTot || 0, e._emigTot || 0, e._banditized ? 1 : 0,
        r3(dp.stone || 0), r3((dp.food || 0) + (dp.fish || 0) + (dp.meat || 0)), r3(e._stoneToolMade || 0), r3(e._stoneWeaponMade || 0), r3(e._selfToolMade || 0), msk, r3(wear),
        k.slot == null ? null : r3(k.slot), k.prod == null ? null : r3(k.prod), k.fuel == null ? null : r3(k.fuel), e._fuelCov == null ? null : r3(e._fuelCov),
        e.lastStats && typeof e.lastStats.health === 'number' ? r3(e.lastStats.health) : null, hc, e.housing == null ? null : r3(e.housing)]);
    }
    return out;
  };
  const dump = () => fs.writeFileSync(OUT + '.t1394.json', JSON.stringify({ env: { BUNDLE: process.env.T1334_BUNDLE || null, HOME: process.env.T1373_HOME_CAP || null, FIX: process.env.T1363_FAMINE_TOOLS || null,
    A: process.env.T1394_FIX || null },
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
  process.on('exit', () => { try { dump(); } catch (e) { try { fs.writeFileSync(OUT + '.t1394.json', JSON.stringify({ err: String(e && e.stack || e) })); } catch (_) {} } });
}
