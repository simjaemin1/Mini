// (@regress 없음 — 러너 밖 · T733 계측기 · 제품 무변 · 읽기만 · T717 관찰자(`t717-wood-probe.js`)의 꼴)
// === scripts/t733-loot-probe.js — **벤 그루의 잔가지 · 도토리 판 관찰자**: 마을·날 곳간 두 칸 · 땔감 · 벤 전리품 · 걸은 몸 ==========
//   쓰는 법(아이 존이 env 를 물려받는다 — `T577_OUT` 이 선 쪽만 붙는다 · 부모(자 본체)는 아무것도 안 한다):
//     NODE_OPTIONS="--require <이 파일>" T325_WOOD_ACT=1 T627_TRIP_DAY=1 T400_BUILD_ACT=0 VILLAGE_CARAVAN_MAX=0 T577_PAR=1 T577_DIR=<dir> node scripts/t577-server-run.js 400 1020
//     (판 JSON 옆 `.t733.json`)
//   ★잰다 — 마을마다 · econ 하루마다 한 번(하루 마감 장부 `scanDay` 앞 · 같은 날 두 번 안 적는다):
//     · n · 곳간 잔가지 · 도토리(`storage` — 다른 흐름도 섞인 재고) · 땔감 충당률(`_fuelCov`) · 추위 · 건강
//     · 그날 **헤드리스가 벤 그루의 전리품**(존 문 `t325CutTreeAt` 이 돌려준 것 — 바로 뒤 통나무 입구 `woodToGranary` 의 마을로 잇는다) [단 · 잔가지 · 도토리 · 그루]
//     · (켠 팔) 곳간에 든 두 칸 누계(`vil._t733Gr`) · 마을 짐(`econ._t733Pack`) · 몸 손의 두 칸 합
//     · 걸은 몸 — 채집(`_t347Dbg.walked` · 켠 팔은 [옛 셈 · 새 셈] `_t347Dbg.t733`) · 나무(`_t325Dbg.walked`)
//     · 세계 하루 — 벤 전리품 합(헤드리스 · 몸 갈래 따로 — 호출 스택에 `_lifeDailySteps` 가 있나)
//   ★관찰만 한다 — 감싼 함수에 같은 인수를 그대로 넘기고 그 값을 그대로 돌려준다. 파일은 `exit` 에서 쓴다.
'use strict';
const SRV_OUT = process.env.T577_OUT ? process.env.T577_OUT + '.t733.json' : '';
if (SRV_OUT) {
  const fs = require('fs');
  const Module = require('module');
  let V1 = null, EV = null, VIL = null;
  let names = null, last = null;
  const days = [];
  const S = [];
  const W = [];   // 세계 하루 [헤드리스 단 · 잔가지 · 도토리 · 그루 · 몸 단 · 잔가지 · 도토리 · 그루]
  let land = null;
  const r4 = (x) => (Number.isFinite(x) ? +x.toFixed(4) : null);
  let stash = null;          // 헤드리스가 막 벤 그루의 전리품 — 바로 뒤 통나무 입구 부름의 마을로 간다
  let cutBy = new Map();     // 이름 → [단 · 잔가지 · 도토리 · 그루](그날 헤드리스)
  let wd = [0, 0, 0, 0, 0, 0, 0, 0];
  let lost = 0;              // 마을로 못 이은 헤드리스 전리품 수(0 이어야 한다)
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
      try {
        if (r) {
          const head = (new Error().stack || '').indexOf('_lifeDailySteps') >= 0;
          const o = head ? 0 : 4;
          wd[o] += r.wood || 0; wd[o + 1] += r.twig || 0; wd[o + 2] += r.acorn || 0; wd[o + 3] += 1;
          if (head) { if (stash) lost++; stash = r; }
        }
      } catch (e) {}
      return r;
    };
  };
  const record = (world) => {
    try {
      const d = world && world.day;
      if (!Number.isFinite(d) || d === last) return;
      last = d;
      wrapDeps();
      const V = world.villages || [];
      if (!names) {
        names = V.map((v) => v.name);
        land = V.map((v) => { const L = v.land || {}; return { wood: L.wood, fertility: L.fertility, size: L.size }; });
        for (let i = 0; i < V.length; i++) S.push({ n: [], tw: [], ac: [], fc: [], cold: [], hl: [], cut: [], gr: [], pk: [], hd: [], fw: [], f7: [], ww: [], ct: [] });
      }
      days.push(d);
      const k7 = S7(); const SV = (k7 && k7.villages) || [], pl = k7 && k7.deps && k7.deps.players;
      const sv = new Map(); for (const x of SV) if (x && x.econ && x.econ.name != null) sv.set(x.econ.name, x);
      for (let i = 0; i < V.length && i < S.length; i++) {
        const v = V[i], st = v.storage || {}, R = S[i];
        R.n.push((v.npcs || []).length); R.tw.push(r4(st.twig || 0)); R.ac.push(r4(st.acorn || 0));
        R.fc.push(r4(v._fuelCov)); R.cold.push(r4(v._coldStress || 0)); R.hl.push(r4(v.lastStats && v.lastStats.health));
        const c = cutBy.get(v.name); R.cut.push(c ? c.map(r4) : 0);
        const s = sv.get(v.name);
        const G = s && s._t733Gr; R.gr.push(G ? [r4(G.twig || 0), r4(G.acorn || 0)] : 0);
        const P = v._t733Pack; R.pk.push(P ? [r4(P.twig || 0), r4(P.acorn || 0)] : 0);
        let ht = 0, ha = 0; if (s && pl && s.npcPids) for (const pid of s.npcPids) { const p = pl.get(pid); if (p && p.inventory) { ht += p.inventory.twig || 0; ha += p.inventory.acorn || 0; } }
        R.hd.push(ht || ha ? [r4(ht), r4(ha)] : 0);
        const F = s && s._t347Dbg; R.fw.push(F ? (F.walked | 0) : null); R.f7.push(F && F.t733 ? F.t733.slice() : 0);
        const D = s && s._t325Dbg; R.ww.push(D ? (D.walked | 0) : null); R.ct.push(D ? (D.cut | 0) : null);
      }
      W.push(wd.map(r4));
      cutBy = new Map(); wd = [0, 0, 0, 0, 0, 0, 0, 0];
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
          try {
            if (stash && v && v.name != null) {
              let c = cutBy.get(v.name); if (!c) cutBy.set(v.name, (c = [0, 0, 0, 0]));
              c[0] += stash.wood || 0; c[1] += stash.twig || 0; c[2] += stash.acorn || 0; c[3] += 1;
              stash = null;
            }
          } catch (e) {}
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
      fs.writeFileSync(SRV_OUT, JSON.stringify({ knobs: { T733_FELL_LOOT: process.env.T733_FELL_LOOT || null, T325_WOOD_ACT: process.env.T325_WOOD_ACT || null,
        T347_FORAGE_ACT: process.env.T347_FORAGE_ACT || null, T627_TRIP_DAY: process.env.T627_TRIP_DAY || null, T717_WOOD_HAND: process.env.T717_WOOD_HAND || null, T720_LON_DAY: process.env.T720_LON_DAY || null },
        depsWrapped, lost, names, land, days, v: S, world: W }));
    } catch (e) {}
  });
}
