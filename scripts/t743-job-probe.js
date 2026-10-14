// (@regress 없음 — 러너 밖 · T743 계측기 · 제품 무변 · 읽기만 · T733 관찰자(`t733-loot-probe.js`)의 꼴)
// === scripts/t743-job-probe.js — **나무꾼이 왜 주나 — 직업 판단 관찰자**: 마을·날 직업 수 · 식량 날 · 통나무 · 잔가지 · 그날 값 · 그날 전환 ==========
//   쓰는 법(아이 존이 env 를 물려받는다 — `T577_OUT` 이 선 쪽만 붙는다 · 부모(자 본체)는 아무것도 안 한다):
//     NODE_OPTIONS="--require <이 파일>" T325_WOOD_ACT=1 T627_TRIP_DAY=1 T400_BUILD_ACT=0 VILLAGE_CARAVAN_MAX=0 T577_PAR=1 T577_DIR=<dir> node scripts/t577-server-run.js 400 42
//     (판 JSON 옆 `.t743.json`)
//   ★잰다 — 마을마다 · econ 하루마다 한 번(하루 마감 장부 `scanDay` 앞 · 같은 날 두 번 안 적는다):
//     · 직업 수 열한(`counts` — 나무꾼 · 농부 · 어부 · 사냥꾼 · 채집꾼 · 광부 · 석공 · 요리사 · 재봉사 · 전사 · 대장장이) · n
//     · 식량 날(`totalFoodEquivalent ÷ n` — econ 정본 함수 · 직업 판단의 기근 문 30일 · 전환 빈도 10 · 30일이 읽는 그 수)
//     · 곳간 통나무 · 잔가지 · 땔감 충당률 · 추위 · 건강 · 땔감 통나무 소비 흐름(`_consEMA.wood`) · 수식 하루 통나무 몫(`_woodOutLast`)
//     · **그날 직업 판단이 본 값** — 통나무 · 식량 그림자값(`world.priceFn` 을 econ 이 부를 때 그 결과를 그대로 받아 적는다 · 이 파일은 값 함수를 **안 부른다**)
//     · 그날 전환(`_dbgSwitch` — 그날 것이면 [필요 직업 · 한 일])
//     · 헤드리스가 벤 그루 · 곳간에 든 잔가지 누계(켠 팔 `_t733Gr`)
//     · ★[T743 ①] 해 질 녘 통나무 도장 계측 칸(켠 팔만 · 그날 [옛 글자 · 새] 걸은 몸 · 끝날 누계 `_t743W`) · 해 질 녘 정산 나섬 · 넣음(`_t720C`)
//   ★관찰만 한다 — 감싼 함수에 같은 인수를 그대로 넘기고 그 값을 그대로 돌려준다. 파일은 `exit` 에서 쓴다.
'use strict';
const SRV_OUT = process.env.T577_OUT ? process.env.T577_OUT + '.t743.json' : '';
if (SRV_OUT) {
  const fs = require('fs');
  const Module = require('module');
  let V1 = null, EV = null, VIL = null;
  let names = null, last = null, priceWrapped = false;
  const JOBS = ['lumberjack', 'farmer', 'fisher', 'hunter', 'forager', 'miner', 'mason', 'cook', 'tailor', 'warrior', 'smith'];
  const days = [];
  const S = [];
  let land = null;
  const r3 = (x) => (Number.isFinite(x) ? +x.toFixed(3) : null);
  const r4 = (x) => (Number.isFinite(x) ? +x.toFixed(4) : null);
  let seen = new Map();      // 이름 → [통나무 값 · 식량 값 · 부른 번](그날 econ 이 `world.priceFn` 을 부른 마지막 값)
  let stash = null, cutBy = new Map();
  let depsWrapped = false;
  const S7 = () => { try { return VIL && VIL.__labProbe && VIL.__labProbe._t707Probe ? VIL.__labProbe._t707Probe.setup() : null; } catch (e) { return null; } };
  const wrapDeps = () => {
    if (depsWrapped) return;
    const k = S7(); const d = k && k.deps;
    if (!d || typeof d.t325CutTreeAt !== 'function') return;
    depsWrapped = true;
    const f = d.t325CutTreeAt;
    d.t325CutTreeAt = function () {
      const r = f.apply(this, arguments);
      try { if (r && (new Error().stack || '').indexOf('_lifeDailySteps') >= 0) stash = r; } catch (e) {}
      return r;
    };
  };
  const wrapPrice = (world) => {
    if (priceWrapped || !world || typeof world.priceFn !== 'function') return;
    priceWrapped = true;
    const pf = world.priceFn;
    world.priceFn = function (v) {
      const p = pf.apply(this, arguments);
      try { if (v && v.name != null && p) { const s = seen.get(v.name); const c = s ? s[2] + 1 : 1; seen.set(v.name, [p.wood, p.food, c]); } } catch (e) {}
      return p;
    };
  };
  const record = (world) => {
    try {
      const d = world && world.day;
      if (!Number.isFinite(d) || d === last) return;
      last = d;
      wrapDeps(); wrapPrice(world);
      const V = world.villages || [];
      if (!names) {
        names = V.map((v) => v.name);
        land = V.map((v) => { const L = v.land || {}; return { wood: L.wood, fertility: L.fertility, water: L.water, game: L.game, stone: L.stone, size: L.size }; });
        for (let i = 0; i < V.length; i++) { const o = { n: [], fd: [], wd: [], tw: [], fc: [], cold: [], hl: [], ce: [], wo: [], pw: [], pf: [], pc: [], sw: [], ct: [], gr: [], t7: [] }; for (const j of JOBS) o[j] = []; S.push(o); }
      }
      days.push(d);
      const k7 = S7(); const SV = (k7 && k7.villages) || [];
      const sv = new Map(); for (const x of SV) if (x && x.econ && x.econ.name != null) sv.set(x.econ.name, x);
      for (let i = 0; i < V.length && i < S.length; i++) {
        const v = V[i], st = v.storage || {}, R = S[i], cn = v.counts || {};
        const n = (v.npcs || []).length;
        R.n.push(n); for (const j of JOBS) R[j].push(cn[j] || 0);
        R.fd.push(V1 && n > 0 ? r3(V1.totalFoodEquivalent(v) / n) : null);
        R.wd.push(r3(st.wood || 0)); R.tw.push(r4(st.twig || 0));
        R.fc.push(r4(v._fuelCov)); R.cold.push(r3(v._coldStress || 0)); R.hl.push(r4(v.lastStats && v.lastStats.health));
        R.ce.push(r4(v._consEMA && v._consEMA.wood)); R.wo.push(r4(v._woodOutLast || 0));
        const s = seen.get(v.name); R.pw.push(s ? r4(s[0]) : null); R.pf.push(s ? r4(s[1]) : null); R.pc.push(s ? s[2] : 0);
        const w = v._dbgSwitch; R.sw.push(w && w.day === d ? [w.need || null, w.did || null] : 0);
        const c = cutBy.get(v.name); R.ct.push(c || 0);
        const g = sv.get(v.name); R.gr.push(g && g._t733Gr ? r3(g._t733Gr.twig || 0) : 0);
        const t7 = g && g._t325Dbg && g._t325Dbg.t743; R.t7.push(t7 ? t7.slice() : 0);   // ★[T743 ①] 켠 팔만 서는 칸 — 그날 [옛 글자 걸은 몸 · 새] (끈 팔 · 행위 층 없는 날은 0)
      }
      seen = new Map(); cutBy = new Map();
    } catch (e) { /* 관찰 실패는 세계에 아무것도 안 한다 */ }
  };
  const _load = Module._load;
  Module._load = function () {
    const m = _load.apply(this, arguments);
    try {
      if (m && !V1 && typeof m.createVillage === 'function' && typeof m.tickVillage === 'function' && typeof m.woodToGranary === 'function') {
        V1 = m;
        const wg = m.woodToGranary;
        m.woodToGranary = function (v) {
          try { if (stash && v && v.name != null) { cutBy.set(v.name, (cutBy.get(v.name) || 0) + 1); stash = null; } } catch (e) {}
          return wg.apply(this, arguments);
        };
      }
      if (m && !EV && typeof m.createLedger === 'function') {
        EV = m;
        const mk = m.createLedger;
        m.createLedger = function () {
          const L = mk.apply(this, arguments);
          const sd = L.scanDay;
          L.scanDay = function (world) { record(world); return sd.apply(this, arguments); };
          return L;
        };
      }
      if (m && !VIL && m.__labProbe && typeof m.villageOfCell === 'function') VIL = m;
    } catch (e) { /* 감싸기 실패도 세계에 아무것도 안 한다 */ }
    return m;
  };
  process.on('exit', () => {
    try {
      //   ★[T743 ①] 끝날 마을 누계(켠 팔만 · `_t743W` — 갈린 날 · 옛 글자면 막혔을 일괄 · 갈린 몸) · 해 질 녘 정산 나섬 · 넣음(`_t720C`)
      const k7 = S7(); const W7 = {}, C7 = {};
      for (const x of ((k7 && k7.villages) || [])) if (x && x.econ && x.econ.name != null) { if (x._t743W) W7[x.econ.name] = x._t743W; if (x._t720C) C7[x.econ.name] = x._t720C; }
      fs.writeFileSync(SRV_OUT, JSON.stringify({ knobs: { T733_FELL_LOOT: process.env.T733_FELL_LOOT || null, T743_DUSK_STAMP: process.env.T743_DUSK_STAMP || null,
        T325_WOOD_ACT: process.env.T325_WOOD_ACT || null, T627_TRIP_DAY: process.env.T627_TRIP_DAY || null }, jobs: JOBS, priceWrapped, depsWrapped, names, land, days, v: S, t743W: W7, t720C: C7 }));
    } catch (e) {}
  });
}
