// (@regress 없음 — 러너 밖 · T702 계측기 · 제품 무변 · 읽기만 · T692 관찰자(`t692-seed-probe.js`)의 꼴)
// === scripts/t702-wood-probe.js — **통나무가 왜 모자라고 왜 파나**: 마을·날 통나무 장부 · 첫 N일 통나무 화물 한 건씩 · 끝날 때 벤 나무 ==========
//   쓰는 법(아이 존이 env 를 물려받는다 — `T577_OUT` 이 선 쪽만 붙는다 · 부모(자 본체)는 아무것도 안 한다):
//     NODE_OPTIONS="--require <이 파일>" T400_BUILD_ACT=0 VILLAGE_CARAVAN_MAX=0 T577_PAR=1 T577_DIR=<dir> \
//       [T702_TREES=<t702-forest-audit --trees 산출>] node scripts/t577-server-run.js 400 1020,7,42
//     ⇒ 판마다 `<T577_OUT>.t702.json`(판 JSON 옆). 두 자(t17 · t176)에 붙일 땐 `T702_PROBE_OUT=<파일>`(서버 칸은 비어 있다).
//   ★잰다 — 마을마다 · econ 하루마다 한 번(서버 = 하루 마감 장부 `scanDay` 앞 · 두 자 = `tickWorldV2` 뒤 · 같은 날 두 번 안 적는다):
//     · n · 곳간 통나무 · 돌 · 도구 · 나무꾼 수 · 그날 생산(`dailyProductionBuf.wood`) · 그날 `_cons` 통나무 합(`_consDay.wood` — 땔감 · 집 · 노 · 숯가마)
//     · 노 연료 통나무 누계(`_smeltFuelWood`) · 숯가마 통나무 누계(`_kilnWood`) · 집 수용력(`housing`) · 땔감 충당률(`_fuelCov`) · 추위(`_coldStress`)
//     · 야금공 수(대장장이 + 무기장이 + 갑옷장이 — v1 땔감 식의 `smelters`) · 기근(`_dpDebug.hunger < 0`)
//     · 노 연료 모자람 누계 둘(`_smeltNoFuel` — 연료 0 이라 못 녹인 번 · `_smeltShort` — 덜 녹인 번) · 숯가마 섰나(`_kiln`)
//     · 그날 직업 전환 판단(`_dbgSwitch` — econ 이 이미 남기는 진단 칸 `need>did` · 그날 판단이 없으면 0)
//     · 통나무 교역 넷 — 문 ① 발주(그날 선 econ 캐러밴의 출발 화물) · 문 ② 남의 캐러밴이 되사 감(`tradeLog` `bought` · 판 쪽 `to`)
//       · 들어옴(받은 `sent` — 빈손 귀환 뺌 · 제 캐러밴이 되사 온 `bought`) — T692 관찰자와 같은 문
//     · (서버) 영토 칸 수(`vil._terrSet.size` — 서버 마을 목록은 `__labProbe._t569Probe.setup()` 이 **인자 없이** 돌려주는 그 배열 · 안 바꾼다)
//   ★첫 `T702_EVENT_DAYS`(기본 60)일 — 통나무 화물 한 건씩: 출발(id · 날 · 판 · 받을 · 양 · 계획한 귀환 품목 · 출발 때 두 값) ·
//     도착 줄(`tradeLog` — 보낸 것 · 되사 온 것 · 빈손 · 돌림) · 끝(캐러밴이 목록에서 빠진 날 — 실어 온 품목 · 양 · 빈손 표).
//   ★끝날 때(서버만 · `exit`) — 존 장부(`__testBind().harvestedSeeds` — 읽기만)의 벤 나무를 `T702_TREES` 표(감사 자가 쓴 나무 키 → 마을 · 걸음 띠 · 칸)에
//     붙여 센다: 벤 날(≤1 · ≤30 · ≤100 · ≤400 · 그 뒤) · 지금 술어(`regrowBlockedAt` = 다시 안 남) · 자리(영토 = `villageOfCell` · 다져진 길 = `Roads.pavedNear(…, 0)` · 그 밖).
//   ★관찰만 한다 — 감싼 함수에 같은 인수를 그대로 넘기고 읽기만 한다. 값 함수(`priceFn`)는 안 부른다. 파일은 `exit` 에서 쓴다.
'use strict';
const LAB_OUT = process.env.T702_PROBE_OUT || '';
const SRV_OUT = (!LAB_OUT && process.env.T577_OUT) ? process.env.T577_OUT + '.t702.json' : '';
const OUT = LAB_OUT || SRV_OUT;
if (OUT) {
  const fs = require('fs');
  const Module = require('module');
  const EVD = parseInt(process.env.T702_EVENT_DAYS || '60', 10) || 60;
  let V1 = null, V2 = null, EV = null, VIL = null, ZN = null, CH = null;
  let names = null, last = null, maxCid = 0, lastRow = null;
  const seed = Object.create(null);
  const days = [];
  const S = [];
  const ev = { dep: [], arr: [], done: [] };
  const track = new Map();   // 캐러밴 id → 객체(통나무 화물 · 첫 EVD 일)
  const r3 = (x) => (Number.isFinite(x) ? +x.toFixed(3) : null);
  let srvVils = null;
  const srvList = () => {
    if (srvVils || !VIL || !VIL.__labProbe || !VIL.__labProbe._t569Probe) return srvVils;
    try { const k = VIL.__labProbe._t569Probe.setup(); srvVils = (k && k.villages) || null; } catch (e) { srvVils = null; }
    return srvVils;
  };
  const record = (world) => {
    try {
      const d = world && world.day;
      if (!Number.isFinite(d) || d === last) return;
      last = d;
      const V = world.villages || [];
      if (!names) { names = V.map((v) => v.name); for (let i = 0; i < V.length; i++) S.push({ n: [], wood: [], stone: [], tool: [], lj: [], prod: [], cons: [], smw: [], kw: [], house: [], fc: [], cold: [], sm: [], fam: [], sns: [], ssh: [], kiln: [], sw: [], exS: [], exB: [], imS: [], imB: [], terr: [] }); }
      days.push(d);
      const idx = new Map(names.map((nm, k) => [nm, k]));
      const z = () => new Array(names.length).fill(0);
      const exS = z(), exB = z(), imS = z(), imB = z();
      // 문 ① — 그날 선 캐러밴(출발 화물) · 첫 EVD 일은 한 건씩
      const C = Array.isArray(world.caravans) ? world.caravans : [];
      let mx = maxCid;
      const live = new Set();
      for (const c of C) {
        if (!c) continue;
        live.add(c.id);
        if (!(c.id > maxCid)) continue;
        if (c.id > mx) mx = c.id;
        const a = c.from ? idx.get(c.from.name) : undefined;
        if (a == null) continue;
        let w = 0;
        if (c.giveRes === 'wood' && c.giveAmt > 0) w += c.giveAmt;
        if (c.giveRes2 === 'wood' && c.giveAmt2 > 0) w += c.giveAmt2;
        exS[a] += w;
        if (w > 0 && d <= EVD) {
          ev.dep.push({ id: c.id, d, from: c.from.name, to: c.to ? c.to.name : null, amt: r3(w), res: c.giveRes, res2: c.giveRes2 || null,
            ret: c.returnRes || null, td: c.travelDays, pF: r3(c.pFrom_at_depart), pT: r3(c.pTo_at_depart), stock: r3((c.from.storage && c.from.storage.wood) || 0) });
          track.set(c.id, c);
        }
      }
      maxCid = mx;
      // 끝난 캐러밴(목록에서 빠짐) — 실어 온 것
      for (const [id, c] of track) {
        if (live.has(id) && !c._done) continue;
        ev.done.push({ id, d, retRes: c._returningRes || null, retAmt: r3(c._returningAmt || 0), aband: !!c._abandoned, rer: c._rerouted || 0, to: c.to ? c.to.name : null });
        track.delete(id);
      }
      // 문 ② · 들어옴 — tradeLog 새 줄
      const TL = Array.isArray(world.tradeLog) ? world.tradeLog : [];
      let from = 0; if (lastRow) { const j = TL.lastIndexOf(lastRow); from = j >= 0 ? j + 1 : 0; }
      for (let j = from; j < TL.length; j++) {
        const t = TL[j], a = idx.get(t.from), b = idx.get(t.to);
        const bw = t.bought && t.bought.res === 'wood' && t.bought.amt > 0, sw = t.sent && t.sent.res === 'wood' && t.sent.amt > 0;
        if (bw) { if (b != null) exB[b] += t.bought.amt; if (a != null) imB[a] += t.bought.amt; }
        if (!t.abandoned && sw && b != null) imS[b] += t.sent.amt;
        if ((bw || sw) && d <= EVD + 30) ev.arr.push({ d, from: t.from, to: t.to, sent: t.sent ? { res: t.sent.res, amt: r3(t.sent.amt) } : null, bought: t.bought ? { res: t.bought.res, amt: r3(t.bought.amt) } : null, aband: !!t.abandoned, rer: !!t.rerouted });
      }
      if (TL.length) lastRow = TL[TL.length - 1];
      // 서버 마을(영토) — 이름으로 잇는다
      const SV = srvList();
      const terrBy = new Map();
      if (SV) for (const sv of SV) if (sv && sv.econ && sv.econ.name != null) terrBy.set(sv.econ.name, (sv._terrSet && sv._terrSet.size) || 0);
      for (let i = 0; i < V.length && i < S.length; i++) {
        const v = V[i], st = v.storage || {}, cn = v.counts || {};
        S[i].n.push((v.npcs || []).length);
        S[i].wood.push(r3(st.wood || 0)); S[i].stone.push(r3(st.stone || 0)); S[i].tool.push(r3(st.tool || 0));
        S[i].lj.push(cn.lumberjack || 0);
        S[i].prod.push(r3((v.dailyProductionBuf && v.dailyProductionBuf.wood) || 0));
        S[i].cons.push(r3((v._consDay && v._consDay.wood) || 0));
        S[i].smw.push(r3(v._smeltFuelWood || 0)); S[i].kw.push(r3(v._kilnWood || 0));
        S[i].house.push(r3(v.housing));
        S[i].fc.push(r3(v._fuelCov)); S[i].cold.push(r3(v._coldStress || 0));
        S[i].sm.push((cn.smith || 0) + (cn.weaponsmith || 0) + (cn.armorsmith || 0));
        S[i].fam.push(v._dpDebug && v._dpDebug.hunger < 0 ? 1 : 0);
        S[i].sns.push(v._smeltNoFuel || 0); S[i].ssh.push(v._smeltShort || 0); S[i].kiln.push(v._kiln ? 1 : 0);
        { const w = v._dbgSwitch; S[i].sw.push(w && w.day === d ? ((w.need || '-') + '>' + (w.did || '-')) : 0); }
        S[i].exS.push(r3(exS[i])); S[i].exB.push(r3(exB[i])); S[i].imS.push(r3(imS[i])); S[i].imB.push(r3(imB[i]));
        S[i].terr.push(terrBy.has(v.name) ? terrBy.get(v.name) : null);
      }
    } catch (e) { /* 관찰 실패는 세계에 아무것도 안 한다 */ }
  };
  // 모듈을 처음 부를 때 감싼다(모양으로 알아본다 — 경로 무관)
  const _load = Module._load;
  Module._load = function () {
    const m = _load.apply(this, arguments);
    try {
      if (m && !V1 && typeof m.createVillage === 'function' && typeof m.tickVillage === 'function') {
        V1 = m;
        const cv = m.createVillage;   // 시딩 곳간 — 마을이 서는 그 순간(첫 틱 전)
        m.createVillage = function () {
          const v = cv.apply(this, arguments);
          try { if (v && v.name != null) { const st = v.storage || {}, L = v.land || {};
            seed[v.name] = { n: (v.npcs || []).length, wood: r3(st.wood || 0), stone: r3(st.stone || 0), tool: r3(st.tool || 0), food: r3(st.food || 0), housing: r3(v.housing),
              land: { wood: L.wood, stone: L.stone, ore: L.ore, fertility: L.fertility, water: L.water, game: L.game, size: L.size, woodSustain: L.woodSustain == null ? null : L.woodSustain } }; } } catch (e) {}
          return v;
        };
      }
      if (m && !V2 && typeof m.tickWorldV2 === 'function' && typeof m.computeShadowPrices === 'function') {
        V2 = m;
        if (LAB_OUT) { const tw = m.tickWorldV2; m.tickWorldV2 = function (world) { const r = tw.apply(this, arguments); record(world); return r; }; }
      }
      if (m && !EV && SRV_OUT && typeof m.createLedger === 'function') {
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
      if (m && !CH && typeof m.generateChunkResources === 'function' && typeof m.regrowStageOf === 'function') CH = m;
      if (m && !ZN && typeof m.__testBind === 'function') ZN = m;
    } catch (e) { /* 감싸기 실패도 세계에 아무것도 안 한다 */ }
    return m;
  };
  // 끝날 때 — 벤 나무(서버만 · 표가 있을 때만)
  const cutSnapshot = () => {
    const TF = process.env.T702_TREES || '';
    if (!SRV_OUT || !TF || !ZN || !VIL) return null;
    let tb = null; try { tb = JSON.parse(fs.readFileSync(TF, 'utf8')); } catch (e) { return { err: 'trees' }; }
    let B = null; try { B = ZN.__testBind(); } catch (e) { return { err: 'bind' }; }
    const H = B && B.harvestedSeeds; if (!H || typeof H.get !== 'function') return { err: 'ledger' };
    const D = last;
    const nV = tb.names.length, nB = tb.bands.length;
    const mk = () => Array.from({ length: nV }, () => new Array(nB).fill(0));
    const out = { day: D, ledger: H.size, inTable: 0, cutBy: { d1: mk(), d30: mk(), d100: mk(), d400: mk(), later: mk() }, gone: mk(), terr: mk(), road: mk(), other: mk(), dayNaN: 0 };
    for (const [k, cd] of H) {
      const t = tb.keys[k]; if (!t) continue;
      out.inTable++;
      const [vi, b, cx, cy] = t;
      const c = Number(cd);
      if (!Number.isFinite(c)) out.dayNaN++;
      const bin = !Number.isFinite(c) ? 'later' : (c <= 1 ? 'd1' : c <= 30 ? 'd30' : c <= 100 ? 'd100' : c <= 400 ? 'd400' : 'later');
      out.cutBy[bin][vi][b]++;
      let blk = false; try { blk = !!B.regrowBlockedAt(cx, cy); } catch (e) {}
      if (blk) out.gone[vi][b]++;
      let inT = false, rd = false;
      try { inT = !!VIL.villageOfCell(cx, cy); } catch (e) {}
      try { rd = !!(B.Roads && B.Roads.pavedNear && B.Roads.pavedNear(cx, cy, 0)); } catch (e) {}
      if (inT) out.terr[vi][b]++; else if (rd) out.road[vi][b]++; else out.other[vi][b]++;
    }
    try { out.t566 = Object.assign({}, B._t566Stat); } catch (e) {}
    try { out.paved = B.Roads && B.Roads.pavedCount ? B.Roads.pavedCount() : null; } catch (e) {}
    return out;
  };
  process.on('exit', () => {
    let cut = null; try { cut = cutSnapshot(); } catch (e) { cut = { err: String(e && e.message) }; }
    try {
      fs.writeFileSync(OUT, JSON.stringify({ knobs: { LANDFIT: process.env.LANDFIT == null ? null : process.env.LANDFIT, T692_SEED_RESERVE: V1 && V1.T692_SEED_RESERVE, T325_WOOD_ACT: process.env.T325_WOOD_ACT || null },
        consts: V1 ? { HOUSE_WOOD: V1.HOUSE_WOOD, HOUSE_BUFFER: V1.HOUSE_BUFFER, RESERVE_PC_wood: V1.RESERVE_PC && V1.RESERVE_PC.wood } : null,
        subsWood: V2 && V2.SUBSISTENCE_PER_NPC && V2.SUBSISTENCE_PER_NPC.wood, eventDays: EVD,
        names, seed: names ? names.map((nm) => (nm in seed ? seed[nm] : null)) : null, days, v: S, ev, cut }));
    } catch (e) {}
  });
}
