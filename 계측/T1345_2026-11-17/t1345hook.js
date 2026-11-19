// 서버 판 계측(세계 0 · 읽기만) — T1345: 조건 사다리(서버 자 → 몸 세계)의 마을-날 줄 + 이주 문마다 "물었다 · 닫혔다 · 까닭"
//   마을-날 줄(마을 × 날 · 아래 `COLS` 차례):
//     인구 `N` · 닿음 `arr`(오늘 명부에 새로 든 사람 중 이 마을에서 오늘 난 사람이 아닌 사람 — T1312 훅과 같은 셈) · 난 사람 `born`(econ `_nid` 날 차) ·
//     떠남 `emig`(`_emigTot` 날 차) · 죽음 `dead`(`_deadTot`) · 굶어 죽음 `fd`(`_fdDeadTot`) · 늙어 죽음 `nat`(`_natDeadTot`) — `dead − fd − nat` = 인구 식 죽음(K 위 · dP 음수 고리) ·
//     곳간 일치 `fdays`(식량 환산 ÷ 사람) · 행복 `h`(`lastStats.happiness`) · 그 몫 — 천천히 `hS`(`happinessSlow`) · 그날 부담 `hB`(`happinessBurden`) · 좋은 것 `hG`(`happinessGoods`) ·
//     영토 셀 `terr`(`lastStats.terrCells`) · 부양력 `K` · 늘림 `dP` · 행복 항 `hap`(`_dpDebug.happy`) · 문 `gated` · 침상 `beds`(min(집 · 지도 침상)) ·
//     이탈 압력 `acc`(`_emigAccum` 날 끝) · 물음 `ask`(econ 이 호스트 이탈 문 `world.t1075Emigrate` 를 부른 수) · 떠남 허락 `ok1`(그 문이 참을 돌린 수) ·
//     받는 곳 없음 `none`(그 부름 동안 `t1147Stat.none` 차) · 문 까닭(그 부름 동안 셈 차 — 켬 판만): 모름 `gU` · 행복 `gH` · 침상 `gB` · K `gK` · 곳간 얇음 `gT` · 무리 몫 `gHerd` · 통과 `gOk` ·
//     출생 곳간 문 `bGate`(`_t1297Gate`) · 집 짓기(집 켬 판 — 생활층 크루): 집터 단계 `site`(없으면 −1) · 오늘 오른 단계 `t4adv`(`_t400Dbg.adv`) ·
//     자재 없어 멈춤 `t4stall`(`_t400Dbg.stall`) · 곳간 나무 `wood` · 돌 `stone` · econ 주거 `housing` · 지도 침상 `mapBeds` ·
//     영토 셀 수 `terrN`(서버 `_terrSet`) · 지은 집 칸 `houses`(`_houseCells`) · 집터 찾기가 마지막으로 빈손이던 날 `missDay`(`_siteMissDay` · 없으면 −1).
//     영토 실물(T1207 켬 판 — 마을 칸 `_t1207` 누계): 넓힌 칸 `t7cells` · 통나무 없어 멈춘 날 `t7stW` · 몸 없어 멈춘 날 `t7stB` · 말뚝 통나무 모자람 `t7need`(econ `_t1207Need`).
//   `probes` — 10날마다 생활층 집터 찾기 누계(`tickPerf().probe`: 부름 · 찾음 · 건너뜀 · 빈손(영토 상한 탓 · 아님) · 거부 까닭 · 영토 넓힘).
//   세계-날 줄(`wcols`): 이주 문 날 수(`t1319MigNeedDays` — 가을 문 켬이면 가을도 겨울 끝까지) · 가을 문 없는 날 수(max(기근 30 · 겨울 남은 날)) · 가을인가 ·
//     T1147 · T1306 · T1312 · T1319 · T1342 셈의 날 차 · 걷기 셈(bandits `t1075Leave` · `t765Arrive`) 날 차.
//   물음 셈은 호스트 문 `world.t1075Emigrate`(bandits `_t1075Leave`)를 같은 인자로 그대로 부르는 겉싸개로 센다(돌려준 값 · 부른 순서 무변). 셈 칸(`t13xxStat`)은 읽기만.
//   ⚠값 함수 · 캐시를 세우는 함수는 안 부른다 — 칸을 읽고 순수 함수(식량 환산 · 날 수)만 부른다.
//   쓰는 곳: `T577_OUT` 곁 `<판>.t1345.json`(10날마다 · 끝에 한 번 더).
'use strict';
if (process.env.T577_OUT) {
  const path = require('path'), fs = require('fs');
  const ROOT = process.env.T1345_ROOT || path.resolve(__dirname, '..', '..'), OUT = process.env.T577_OUT;
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const COLS = ['day', 'v', 'N', 'arr', 'born', 'emig', 'dead', 'fd', 'nat', 'fdays', 'h', 'hS', 'hB', 'hG', 'terr', 'K', 'dP', 'hap', 'gated', 'beds',
    'acc', 'ask', 'ok1', 'none', 'gU', 'gH', 'gB', 'gK', 'gT', 'gHerd', 'gOk', 'bGate',
    'site', 't4adv', 't4stall', 'wood', 'stone', 'housing', 'mapBeds', 'terrN', 'houses', 'missDay', 't7cells', 't7stW', 't7stB', 't7need'];
  const WCOLS = ['day', 'needMig', 'needNoAut', 'autumn', 'pick', 'none', 's6seen', 's6ok', 's6thin', 's6unk', 's12seen', 's12ok', 's12unk', 's12unh', 's12beds', 's12thin', 's12herd',
    'overK', 'g42gate', 'g42full', 'g42back', 'g42noHome', 'g42told', 'g42use', 'leave', 'arrive', 'ask', 'ok1'];
  const names = [], nameIdx = new Map(), rows = [], wrows = [];
  const r3 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 1000) / 1000;
  const vi = (name) => { let i = nameIdx.get(name); if (i === undefined) { i = names.length; names.push(name); nameIdx.set(name, i); } return i; };
  const VS = () => { const vm = require.cache[path.join(ROOT, 'server', 'villages.js')]; return vm && vm.exports; };
  const BS = () => { const bm = require.cache[path.join(ROOT, 'server', 'bandits.js')]; return bm && bm.exports; };
  const sv = () => { const V = VS(); return V && V.__labProbe && V.__labProbe._t569Probe ? (V.__labProbe._t569Probe.setup().villages || []) : []; };
  const stOf = (f) => { const V = VS(); try { return V && typeof V[f] === 'function' ? V[f]() : null; } catch (e) { return null; } };
  //   셈 칸 한 벌(수만 · 읽기만)
  const snapSt = () => {
    const a = stOf('t1147Stat') || {}, b = stOf('t1306Stat') || {}, c = stOf('t1312Stat') || {}, d = stOf('t1319Stat') || {}, g = stOf('t1342Stat') || {};
    let w = null; try { const B = BS(); w = B && typeof B.stats === 'function' ? B.stats() : null; } catch (e) { w = null; }
    return { pick: a.pick | 0, none: a.none | 0, s6seen: b.seen | 0, s6ok: b.ok | 0, s6thin: b.thin | 0, s6unk: b.unknown | 0,
      s12seen: c.seen | 0, s12ok: c.ok | 0, s12unk: c.unknown | 0, s12unh: c.unhappy | 0, s12beds: c.beds | 0, s12thin: c.thin | 0, s12herd: c.herdCut | 0,
      overK: d.overK | 0, g42gate: g.gate | 0, g42full: g.full | 0, g42back: g.back | 0, g42noHome: g.noHome | 0, g42told: g.told | 0, g42use: g.toldUse | 0,
      leave: w ? (w.t1075Leave | 0) : 0, arrive: w ? (w.t765Arrive | 0) : 0 };
  };
  //   물음 셈 — 마을(econ 객체) → 오늘 { ask, ok1, none, gU, gH, gB, gK, gT, gHerd, gOk }
  const askBy = new Map(); let askTot = 0, ok1Tot = 0;
  const wrapGo = (W) => {
    if (!W || typeof W.t1075Emigrate !== 'function' || W.t1075Emigrate.__t1345) return;
    const orig = W.t1075Emigrate;
    const go = function (ev, p, day) {
      const s0 = snapSt();
      const r = orig.apply(this, arguments);
      try {
        const s1 = snapSt();
        let o = askBy.get(ev); if (!o) { o = { ask: 0, ok1: 0, none: 0, gU: 0, gH: 0, gB: 0, gK: 0, gT: 0, gHerd: 0, gOk: 0 }; askBy.set(ev, o); }
        o.ask++; askTot++; if (r) { o.ok1++; ok1Tot++; }
        o.none += s1.none - s0.none;
        //   켬(T1312) 판 = 무리 문 셈 · 끔(T1306 만) 판 = 이주 문 셈 · 둘 다 끔 = 까닭 칸 0(종전 줄은 셈이 없다)
        if (s1.s12seen > s0.s12seen) { o.gU += s1.s12unk - s0.s12unk; o.gH += s1.s12unh - s0.s12unh; o.gB += s1.s12beds - s0.s12beds; o.gK += s1.overK - s0.overK; o.gT += s1.s12thin - s0.s12thin; o.gHerd += s1.s12herd - s0.s12herd; o.gOk += s1.s12ok - s0.s12ok; }
        else if (s1.s6seen > s0.s6seen) { o.gU += s1.s6unk - s0.s6unk; o.gT += s1.s6thin - s0.s6thin; o.gOk += s1.s6ok - s0.s6ok; }
      } catch (e) {}
      return r;
    };
    go.__t1345 = true;
    W.t1075Emigrate = go;
  };
  let lastDay = -1, prevSt = null;
  const prevRoster = new Map(), prev = new Map();
  const dayRows = (day, world) => {
    for (const vil of sv()) {
      const e = vil && vil.econ; if (!e || e.founder) continue;
      const N = (e.npcs || []).length, i = vi(vil.name);
      const p = prev.get(vil.name) || null, roster = new Set((e.npcs || []).map((n) => n.id));
      const nid = e._nid | 0, pre = 'n' + e.id + '.';
      let arr = null;
      if (p) {
        arr = 0;
        const yr = prevRoster.get(vil.name) || new Set();
        for (const id of roster) { if (yr.has(id)) continue; const s = String(id); if (!(s.startsWith(pre) && (+s.slice(pre.length)) > p.nid)) arr++; }
      }
      const d = (k) => (p ? (e[k] || 0) - (p[k] || 0) : null);
      let fe = null; try { fe = E.totalFoodEquivalent(e); } catch (_) {}
      const dd = e._dpDebug || null, ls = e.lastStats || null, num = (o, k) => (o && typeof o[k] === 'number') ? o[k] : null;
      const beds = Math.min(e.housing !== undefined ? e.housing : Infinity, e._mapBeds !== undefined ? e._mapBeds : Infinity);
      const a = askBy.get(e) || null;
      rows.push([day, i, N, arr, p ? nid - p.nid : null, d('_emigTot'), d('_deadTot'), d('_fdDeadTot'), d('_natDeadTot'), fe == null || !N ? null : r3(fe / N),
        r3(num(ls, 'happiness')), r3(num(ls, 'happinessSlow')), r3(num(ls, 'happinessBurden')), r3(num(ls, 'happinessGoods')), num(ls, 'terrCells'),
        dd ? dd.K : null, dd ? dd.dP : null, dd ? dd.happy : null, dd ? (dd.gated ? 1 : 0) : null, isFinite(beds) ? beds : null,
        r3(e._emigAccum || 0), a ? a.ask : 0, a ? a.ok1 : 0, a ? a.none : 0, a ? a.gU : 0, a ? a.gH : 0, a ? a.gB : 0, a ? a.gK : 0, a ? a.gT : 0, a ? a.gHerd : 0, a ? a.gOk : 0,
        e._t1297Gate ? 1 : 0,
        vil._site ? (vil._site.stage | 0) : -1, vil._t400Dbg ? (vil._t400Dbg.adv | 0) : null, vil._t400Dbg ? (vil._t400Dbg.stall | 0) : null,
        r3((e.storage && e.storage.wood) || 0), r3((e.storage && e.storage.stone) || 0), e.housing !== undefined ? r3(e.housing) : null, e._mapBeds !== undefined ? e._mapBeds : null,
        vil._terrSet ? vil._terrSet.size : null, vil._houseCells ? vil._houseCells.length : null, vil._siteMissDay != null ? (vil._siteMissDay | 0) : -1,
        vil._t1207 ? (vil._t1207.cells | 0) : null, vil._t1207 ? (vil._t1207.stallWood | 0) : null, vil._t1207 ? (vil._t1207.stallBody | 0) : null, r3(e._t1207Need || 0)]);
      prev.set(vil.name, { nid, _emigTot: e._emigTot || 0, _deadTot: e._deadTot || 0, _fdDeadTot: e._fdDeadTot || 0, _natDeadTot: e._natDeadTot || 0 });
      prevRoster.set(vil.name, roster);
    }
    askBy.clear();
    const s = snapSt(), q = prevSt || s;
    let needMig = null, needNoAut = null, aut = null;
    try { needMig = (E.t1319MigNeedDays || E.t1297NeedDays)(day); needNoAut = Math.max(E.T1297_FAMINE_DAYS || 30, E.t1297WinterLeft ? E.t1297WinterLeft(day) : 0); aut = E.t1319AutumnLeft && E.t1319AutumnLeft(day) > 0 ? 1 : 0; } catch (_) {}
    wrows.push([day, needMig, needNoAut, aut].concat(WCOLS.slice(4, -2).map((k) => (s[k] | 0) - (q[k] | 0))).concat([askTot, ok1Tot]));
    askTot = 0; ok1Tot = 0; prevSt = s;
    wrapGo(world);   // 이 날 뒤의 물음부터 센다(세계가 새로 서면 — 마디 — 다시 감싼다)
  };
  //   집터 찾기 셈(생활층 `_probe` — `tickPerf().probe` · 계측 전용 · 읽기만) — 10날마다 · 끝에 한 번(날마다는 안 부른다)
  const probe = () => { const V = VS(); try { const p = V && typeof V.tickPerf === 'function' ? V.tickPerf().probe : null; return p ? { siteCall: p.siteCall, siteHit: p.siteHit, siteSkip: p.siteSkip, siteMissCap: p.siteMissCap, siteMissFree: p.siteMissFree, siteReason: p.siteReason, terrGrowDays: p.terrGrowDays, terrGrowCells: p.terrGrowCells, day: lastDay } : null; } catch (e) { return null; } };
  const probes = [];
  const dump = () => {
    try {
      const pq = probe(); if (pq && (!probes.length || probes[probes.length - 1].day !== pq.day)) probes.push(pq);
      fs.writeFileSync(OUT + '.t1345.json', JSON.stringify({ env: { BUNDLE: process.env.T1334_BUNDLE || null, MIG: process.env.T1306_MIGRATE_FOOD || null, HERD: process.env.T1312_HERD || null,
        K: process.env.T1319_RECV_K || null, AUT: process.env.T1319_AUTUMN_LOOK || null, GH: process.env.T1342_GATE_HOME || null, DAY_MS: process.env.VILLAGE_DAY_MS || null,
        CAP: process.env.VILLAGE_NPC_CAP || null, BUILD: process.env.T400_BUILD_ACT || null, MAPBEDS: process.env.T315_MAPBEDS || null, CARAVAN: process.env.VILLAGE_CARAVAN_MAX || null },
        cols: COLS, wcols: WCOLS, names, rows, wrows, probes }));
    } catch (e) {}
  };
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const Lg = mk.apply(this, arguments), sd = Lg.scanDay;
    Lg.scanDay = function (world, day) {
      const r = sd.apply(this, arguments);
      try { if ((day | 0) !== lastDay) { lastDay = day | 0; dayRows(lastDay, world); if (lastDay % 10 === 0) dump(); } } catch (e) {}
      return r;
    };
    return Lg;
  };
  process.on('exit', dump);
}
