// (@regress 없음 — 러너 밖 · T717 계측기 · 제품 무변 · 읽기만 · T702 관찰자(`t702-wood-probe.js`)의 꼴)
// === scripts/t717-wood-probe.js — **통나무 1단계 판 관찰자**: 마을·날 땔감 · 집 · 노 · 인구 · 건강 · 직업 판단 + (행위 층 켬 세계) 곳간 입구 한 번씩 ==========
//   쓰는 법(아이 존이 env 를 물려받는다 — `T577_OUT` 이 선 쪽만 붙는다 · 부모(자 본체 · 기준선 게이트)는 아무것도 안 한다):
//     NODE_OPTIONS="--require <이 파일>" node scripts/server-baseline-check.js 계측/서버기준선_2026-10-13.json   # 게이트와 같이(판 JSON 옆 `.t717.json`)
//     NODE_OPTIONS="--require <이 파일>" T400_BUILD_ACT=0 VILLAGE_CARAVAN_MAX=0 T577_PAR=1 T577_DIR=<dir> node scripts/t577-server-run.js 400 1020,7,42
//   ★잰다 — 마을마다 · econ 하루마다 한 번(하루 마감 장부 `scanDay` 앞 · 같은 날 두 번 안 적는다):
//     · n · 곳간 통나무 · 나무꾼 수 · 땔감 충당률(`_fuelCov`) · 추위(`_coldStress`) · 집 수용력 · 노 연료 0 누계(`_smeltNoFuel`) · 숯가마(`_kiln`)
//     · 기근(`_dpDebug.hunger < 0`) · 건강(`lastStats.health`) · 건강 항(`_dpDebug.health`) · 죽음 누계(`_deadTot`)
//     · 그날 직업 전환 판단(`_dbgSwitch` — `need>did` · 그날 판단이 있으면 식량 일수 `totalFoodEquivalent ÷ n` 도)
//     · (행위 층 켬) 헤드리스 벤 그루(`_t325Dbg.cut`) · 걸은 몸(`walked`) · 수요 멈춤(`stop`) · 마을 짐(`econ._t717Pack`) · 손(몸들의 `inventory.wood` 합)
//       · 곳간 입구(`woodToGranary`) 한 번씩 — 내민 몫 · 받은 몫을 부른 자리별로(헤드리스 벰 `cut` · 몸 손 `hand` · 짐 `pack` — 호출 스택의 함수 이름)
//       · 세계 하루 벤 단(존 문 `t325CutTreeAt` 이 돌려준 `wood` 합 — 일괄 · 몸 둘 다 이 문으로 벤다)
//   ★관찰만 한다 — 감싼 함수에 같은 인수를 그대로 넘기고 그 값을 그대로 돌려준다. 파일은 `exit` 에서 쓴다.
'use strict';
const SRV_OUT = process.env.T577_OUT ? process.env.T577_OUT + '.t717.json' : '';
if (SRV_OUT) {
  const fs = require('fs');
  const Module = require('module');
  let V1 = null, EV = null, VIL = null;
  let names = null, last = null, idx = null;
  const days = [];
  const S = [];
  const CUT = [];   // 세계 하루 [벤 단 · 그루]
  let land = null;
  const r3 = (x) => (Number.isFinite(x) ? +x.toFixed(3) : null);
  const r4 = (x) => (Number.isFinite(x) ? +x.toFixed(4) : null);
  // 곳간 입구 — 그날 마을별 [내민 · 받은] × 자리 셋
  let gate = new Map();   // 이름 → { cut:[o,g], hand:[o,g], pack:[o,g], n }
  let cutU = 0, cutN = 0;   // 그날 세계 벤 단 · 그루(존 문)
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
      try { if (r && r.wood > 0) { cutU += r.wood; cutN++; } } catch (e) {}
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
        names = V.map((v) => v.name); idx = new Map(names.map((nm, k) => [nm, k]));
        land = V.map((v) => { const L = v.land || {}; return { wood: L.wood, woodSustain: L.woodSustain == null ? null : L.woodSustain, fertility: L.fertility, water: L.water, game: L.game, ore: L.ore, size: L.size }; });
        for (let i = 0; i < V.length; i++) S.push({ n: [], wood: [], lj: [], fc: [], cold: [], house: [], sns: [], kiln: [], fam: [], hl: [], ht: [], dead: [], sw: [], fd: [],
          ct: [], wk: [], stp: [], pk: [], hd: [], gc: [], gh: [], gp: [] });
      }
      days.push(d);
      // 서버 마을(손 · 헤드리스 칸) — 이름으로 잇는다
      const k7 = S7(); const SV = (k7 && k7.villages) || [], pl = k7 && k7.deps && k7.deps.players;
      const sv = new Map(); for (const x of SV) if (x && x.econ && x.econ.name != null) sv.set(x.econ.name, x);
      for (let i = 0; i < V.length && i < S.length; i++) {
        const v = V[i], st = v.storage || {}, cn = v.counts || {}, R = S[i];
        const n = (v.npcs || []).length;
        R.n.push(n); R.wood.push(r3(st.wood || 0)); R.lj.push(cn.lumberjack || 0);
        R.fc.push(r4(v._fuelCov)); R.cold.push(r3(v._coldStress || 0)); R.house.push(r3(v.housing));
        R.sns.push(v._smeltNoFuel || 0); R.kiln.push(v._kiln ? 1 : 0);
        R.fam.push(v._dpDebug && v._dpDebug.hunger < 0 ? 1 : 0);
        R.hl.push(r4(v.lastStats && v.lastStats.health)); R.ht.push(r4(v._dpDebug && v._dpDebug.health));
        R.dead.push(v._deadTot || 0);
        { const w = v._dbgSwitch; const on = w && w.day === d;
          R.sw.push(on ? ((w.need || '-') + '>' + (w.did || '-')) : 0);
          R.fd.push(on && V1 && n > 0 ? r3(V1.totalFoodEquivalent(v) / n) : null); }
        const s = sv.get(v.name);
        const D = s && s._t325Dbg;
        R.ct.push(D ? (D.cut | 0) : null); R.wk.push(D ? (D.walked | 0) : null); R.stp.push(D ? (D.stop | 0) : null);
        R.pk.push(r4(v._t717Pack || 0));
        let h = 0; if (s && pl && s.npcPids) for (const pid of s.npcPids) { const p = pl.get(pid); if (p && p.inventory && p.inventory.wood > 0) h += p.inventory.wood; }
        R.hd.push(r4(h));
        const g = gate.get(v.name);
        R.gc.push(g ? [r4(g.cut[0]), r4(g.cut[1])] : 0); R.gh.push(g ? [r4(g.hand[0]), r4(g.hand[1])] : 0); R.gp.push(g ? [r4(g.pack[0]), r4(g.pack[1])] : 0);
      }
      CUT.push([r4(cutU), cutN]);
      gate = new Map(); cutU = 0; cutN = 0;
    } catch (e) { /* 관찰 실패는 세계에 아무것도 안 한다 */ }
  };
  const _load = Module._load;
  Module._load = function () {
    const m = _load.apply(this, arguments);
    try {
      if (m && !V1 && typeof m.createVillage === 'function' && typeof m.tickVillage === 'function' && typeof m.woodToGranary === 'function') {
        V1 = m;
        const wg = m.woodToGranary;
        m.woodToGranary = function (v, units) {
          const got = wg.apply(this, arguments);
          try {
            if (v && v.name != null && units > 0) {
              const st = new Error().stack || '';
              const k = st.indexOf('_t717PackIn') >= 0 ? 'pack' : st.indexOf('_t325Deliver') >= 0 ? 'hand' : 'cut';
              let g = gate.get(v.name); if (!g) gate.set(v.name, (g = { cut: [0, 0], hand: [0, 0], pack: [0, 0] }));
              g[k][0] += units; g[k][1] += (got || 0);
            }
          } catch (e) {}
          return got;
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
      fs.writeFileSync(SRV_OUT, JSON.stringify({ knobs: { T717_WOOD_HAND: process.env.T717_WOOD_HAND || null, T717_FUEL_GATE: process.env.T717_FUEL_GATE || null,
        T325_WOOD_ACT: process.env.T325_WOOD_ACT || null, T374_DEMAND_STOP: process.env.T374_DEMAND_STOP || null },
        consts: V1 ? { HOUSE_BUFFER: V1.HOUSE_BUFFER } : null, depsWrapped, names, land, days, v: S, cut: CUT }));
    } catch (e) {}
  });
}
