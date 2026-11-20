// 서버 판 계측(세계 0 · 읽기만) — T1380: 영토 v2 를 랩 넓이에 맞추기(T1345 훅 `t1345hook.js` 곁에 같이 싣는다 — 그 훅의 마을-날 줄은 그대로 쓴다)
//   ① 집터 찾기 부름 줄(`calls` · `ccols`) — 생활층이 실제로 훑은 부름마다(기억 건너뜀은 부름이 아니다 — `_probe.siteCall` 과 같은 셈):
//      날 · 마을 · 찾음 · 영토 칸 · 밭 칸(`_farmSet`) · 논 존닝 칸(`_potSet`) · 지은 집 · 쉼터 · 곳간 수 · 그날 주거 문 ·
//      그 부름이 새로 판정한 후보의 거부 까닭(생활층 `_probe.siteReason` 의 부름 차 — 거부 기억에 든 후보는 이 부름에서 다시 안 본다).
//      `T1380_SHADOW=1` 이면 빈손 부름의 끝 자리(아래 ⓑ)에서 두 패스를 기억 없이 다시 훑은 전수 그림을 같이 남긴다 — 패스마다 후보 수 · 첫 까닭 ·
//      영토 밖 후보 중 모자란 칸이 다 "넣을 수 있는 칸"(막힘 아님 · 누구 땅도 아님)인 수 · 그중 가장 가까운(찾기와 같은 점수) 후보의 모자란 칸 수.
//      ⚠다시 훑기는 생활층 거부 판정 그대로를 부른다(`__labProbe._t569Probe.reject` — 술어 사본 0) — 그 판정이 개울 거부 셈(`streamStat` · 관측 칸)을 같이 올린다(세계 0).
//      부름을 아는 자리 — 레이아웃 정본 함수 둘의 겉싸개(인자 · 돌려준 값 · 부른 차례 무변):
//        ⓐ `houseSiteWant` — 마을 생활층이 집터를 원하는지 묻는 자리(찾기 바로 앞 · 앞 마을의 찾기는 끝났다)
//        ⓑ `territoryTarget` — 빈손 찾기의 끝(`_terrCapBound`)과 영토 넓히기의 머리(`_terrGrowCore`) — 빈손은 그 자리에서 바로 안다
//      부를 때마다 마을들의 `_site` · `_siteMissDay` 바뀜을 본다(바뀐 마을 = 방금 찾은 마을).
//   ② 마을-날 줄(`vrows` · `vcols`) — 사건 장부 날 끝(영토 넓히기 뒤): 사람 · 영토 칸 · 넓히기 목표(`_terrGrowCore` 의 그 식을 읽기만 — 목표 · 상한) ·
//      목표 식(⌈사람 ÷ 6⌉ × 600 + 1,500 = `_terrCap`) · 랩 식(⌈(1,500 + ⌈사람 ÷ 6⌉ × 400) × 1.5⌉ — `village-layout.generate`) · 오늘 늘어난 칸 ·
//      넓히기 까닭(`grow` 늘었다 · `target` 목표 닿음 · `wood` 통나무 없음(`_t1207Wait`) · `body` 몸 없음 · `labor` 개간 중(몸의 낮을 다 씀 — 줄은 있다) · `none` 그 밖) ·
//      말뚝 통나무 · 개간 분 · 넓힌 칸(T1207 `_t1207` 날 차) · 일괄 줄 길이(`_t1238Pend`) · 땔감 충당률(`_fuelCov`) · 곳간 통나무 · 말뚝 모자람(`_t1207Need`) ·
//      주거 문 · 집터 단계 · 그날 부름 · 찾음 · T1380 손잡이 셈(`vil._t1380` 날 차 — 켬 판만: 앞세운 날 · 앞세운 칸 · 그 자리 잡은 집 부지 · 그 칸 · 통나무 · 안 치른 개간 분 · 거절 stake) ·
//      (덧붙임 둘) 밭 칸(`_farmSet`) · 행복 h(`lastStats.happiness`) · 'lot' 기다림(happy) · 'rate' 가 덜 넓힌 칸 ·
//      (덧붙임 셋) 기근 문이 몸을 막은 날(`spare` — `T1380_SPARE_EXPAND` 켬 판만) · 기근 문(`hgr` — 곳간 식량 등가 < 사람 × `T1297_FAMINE_DAYS` · econ 정본 함수를 읽기만 —
//        켬 판은 그날 문이 정한 값 `_t1380Hd`) · 일괄 몸의 본업(`bJob` — 일괄과 같은 몸 `_t1238Body` 의 `simJob`) · K 세 항(econ `_kDbg` 식량 자리 `kS` · 식량 흐름 `kP` · 땔감 흐름 `kF`) ·
//        날것 곳간 일치(`feRaw` — 곡식 · 물고기 · 고기 · 익힌 것 ÷ 사람 — 절망 이탈 위기 선의 잣대 `bandits.js`) · 영토 일감을 쥔 몸(`tBody` — `_t1302Terr` · 몸 세계 판만) · 그중 식량 일꾼(`tFood` — 농 · 어 · 사냥 · 채집)
//   ③ 넓힌 칸의 쓰임(`use` · `ucols`) — 날 30 · 90 · 150 · 365 · 730 · 끝: 첫 줄(날 1) 뒤 영토에 든 칸을 지금 쓰임으로 —
//      집 부지(집 · 집터 · 쉼터 · 의뢰 집 원판) > 밭(`_farmSet`) > 논 존닝(`_potSet`) > 일터(곳간 5×3 · 환호 · 넣은 날 뒤에 쓴 날 표 `_t1238Use` — 나무 · 채집 · 채굴) > 그 밖 · 영토에서 빠진 칸
//   쓰는 곳: `T577_OUT` 곁 `<판>.t1380.json`(10날마다 · 끝에 한 번 더). 값 함수 · 캐시를 세우는 함수는 안 부른다(다시 훑기의 판정 함수 하나 — 위 ⚠).
'use strict';
if (process.env.T577_OUT) {
  const path = require('path'), fs = require('fs');
  const ROOT = process.env.T1380_ROOT || path.resolve(__dirname, '..', '..'), OUT = process.env.T577_OUT;
  const SHADOW = process.env.T1380_SHADOW === '1';
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const VL = require(path.join(ROOT, 'server', 'village-layout'));
  const VS = () => { const vm = require.cache[path.join(ROOT, 'server', 'villages.js')]; return vm && vm.exports; };
  const P569 = () => { const V = VS(); return V && V.__labProbe && V.__labProbe._t569Probe; };
  const sv = () => { const P = P569(); return P ? (P.setup().villages || []) : []; };
  const taOf = () => { const P = P569(); return P ? P.setup().ta : null; };
  const names = [], nameIdx = new Map();
  const vi = (name) => { let i = nameIdx.get(name); if (i === undefined) { i = names.length; names.push(name); nameIdx.set(name, i); } return i; };
  const r3 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 1000) / 1000;
  //   ── ① 부름 ──
  const CCOLS = ['day', 'v', 'hit', 'terrN', 'farmN', 'potN', 'houses', 'shelter', 'gran', 'gated', 'reasons', 'shadow'];
  const calls = [];
  let SR = null, lastSR = {};
  const srRef = () => { if (SR) return SR; const V = VS(); try { const p = V && typeof V.tickPerf === 'function' ? V.tickPerf().probe : null; if (p && p.siteReason) { SR = p.siteReason; lastSR = Object.assign({}, SR); } } catch (e) {} return SR; };
  const snap = new Map();   // 마을 이름 → { site, miss }
  const today = new Map();  // 마을 이름 → { call, hit } (그날)
  let busy = false;
  const shadowOf = (vil) => {
    const P = P569(), ta = taOf(); if (!P || !ta || !vil._terrSet) return null;
    const HC = VL.HALL_CLEAR, LOT = VL.LOT_CELLS, LR = VL.LOT_R, T = vil._terrSet;
    const owner = (k) => { for (const w of sv()) if (w !== vil && w._terrSet && w._terrSet.has(k)) return true; return false; };
    const out = [];
    for (const strict of [true, false]) {
      const n = {}; let cand = 0, outN = 0, outOk = 0, best = null, bestSc = Infinity, bestMiss = null;
      for (const k of T) {
        const ci = k.indexOf(','), x = +k.slice(0, ci), y = +k.slice(ci + 1);
        if ((x & 1) || (y & 1)) continue;
        const r = Math.hypot(x - vil.ccx, y - vil.ccy); if (r < HC) continue;
        if ((strict && vil._potSet && vil._potSet.has(k)) || (vil._farmSet && vil._farmSet.has(k))) continue;
        cand++;
        let why = null; try { why = P.reject(vil, x, y, strict); } catch (e) { why = 'err'; }
        why = why || 'ok'; n[why] = (n[why] || 0) + 1;
        if (why !== '마을 영토 밖') continue;
        outN++;
        let miss = 0, bad = false;
        for (const [dx, dy] of LOT) { const xx = x + dx, yy = y + dy, kk = xx + ',' + yy; if (T.has(kk)) continue; miss++; if (ta.isBlocked(xx, yy) || owner(kk)) { bad = true; break; } }
        if (bad) continue;
        outOk++;
        const wv = vil._wf ? vil._wf.at(x, y) : 999, wd = wv >= 999 ? 99 : Math.max(1, wv - LR);
        let sc = r + (wd < 99 ? 2000 / (wd * wd) : 0);
        if (!strict && vil._potSet) { let pc = 0; for (const [dx, dy] of LOT) if (vil._potSet.has((x + dx) + ',' + (y + dy))) pc++; sc += pc * 6; }
        if (sc < bestSc) { bestSc = sc; best = k; bestMiss = miss; }
      }
      out.push({ s: strict ? 1 : 0, cand, n, outN, outOk, best, bestMiss, bestSc: isFinite(bestSc) ? r3(bestSc) : null });
    }
    return out;
  };
  const record = (vil, hit, dR, day) => {
    const e = vil.econ || {};
    const dd = e._dpDebug || null;
    calls.push([day, vi(vil.name), hit ? 1 : 0, vil._terrSet ? vil._terrSet.size : 0, vil._farmSet ? vil._farmSet.size : 0, vil._potSet ? vil._potSet.size : 0,
      vil._houseCells ? vil._houseCells.length : 0, vil._shelter ? 1 : 0, vil._granList ? vil._granList.length : 0, dd ? (dd.gated ? 1 : 0) : null, dR,
      (SHADOW && !hit) ? shadowOf(vil) : null]);
    let t = today.get(vil.name); if (!t) { t = { call: 0, hit: 0 }; today.set(vil.name, t); }
    t.call++; if (hit) t.hit++;
  };
  let wantDay = 0;
  const detect = () => {
    if (busy) return; busy = true;
    try {
      const S = srRef(); if (!S) return;
      const ch = [];
      for (const vil of sv()) {
        const p = snap.get(vil.name) || { site: null, miss: undefined };
        const site = vil._site ? (vil._site.cx + ',' + vil._site.cy) : null, miss = vil._siteMissDay;
        if (miss != null && miss !== p.miss) ch.push([vil, 0, miss]);
        else if (site && site !== p.site && miss == null) ch.push([vil, 1, wantDay]);
        snap.set(vil.name, { site, miss });
      }
      if (!ch.length) return;
      const dR = {}; for (const k in S) { const d = (S[k] || 0) - (lastSR[k] || 0); if (d) dR[k] = d; } lastSR = Object.assign({}, S);
      if (ch.length === 1) record(ch[0][0], ch[0][1], dR, ch[0][2]);
      else for (let i = 0; i < ch.length; i++) record(ch[i][0], ch[i][1], i === 0 ? Object.assign({ _multi: ch.length }, dR) : { _multi: ch.length }, ch[i][2]);
    } catch (e) {} finally { busy = false; }
  };
  const W0 = { want: VL.houseSiteWant, tt: VL.territoryTarget };
  VL.houseSiteWant = function () { detect(); return W0.want.apply(this, arguments); };
  VL.territoryTarget = function () { detect(); return W0.tt.apply(this, arguments); };
  //   ── ② 마을-날 ──
  const VCOLS = ['day', 'v', 'N', 'terrN', 'tgt', 'capF', 'lab', 'grown', 'why', 'stakeW', 'laborMin', 'cellsT', 'pend', 'fuelCov', 'wood', 'need', 'gated', 'site', 'call', 'hit',
    'lfDays', 'lfCells', 'claims', 'claimCells', 'claimWood', 'claimLabor', 'stake', 'body', 'farmN', 'h', 'happy', 'rateCut',
    'spare', 'hgr', 'bJob', 'kS', 'kP', 'kF', 'feRaw', 'tBody', 'tFood'];
  const vrows = [];
  const prevV = new Map();
  const T1380K = ['lfDays', 'lfCells', 'claims', 'claimCells', 'claimWood', 'claimLabor', 'stake'], T1380K2 = ['happy', 'rateCut'], T1380K3 = ['spare'];
  const FOODJ = { farmer: 1, fisher: 1, hunter: 1, forager: 1 };   // econ `_T1085_FOOD`(피커 `foodOpts` 넷) 그 이름들
  const P1380 = () => { const V = VS(); return V && V.__labProbe && V.__labProbe._t1380Probe; };
  const plOf = () => { const P = VS() && VS().__labProbe && VS().__labProbe._t400Probe; try { const k = P && P.setup ? P.setup() : null; return k && k.deps ? k.deps.players : null; } catch (e) { return null; } };   // 인자 없는 setup = 읽기만
  const terrHousing = (e) => (E.T958_HOUSE_REAL && e._t958Plan !== undefined) ? e._t958Plan : (e.housing || 0);
  //   ── ③ 넓힌 칸 ──
  const seen = new Map(), grownAt = new Map(), init = new Map();   // 마을 이름 → Set · Map(칸 → 날) · 첫 줄 영토(Set — 마디 잇기)
  const UCOLS = ['day', 'v', 'grown', 'house', 'field', 'pot', 'work', 'other', 'gone'];
  const use = [];
  const lotSet = (vil) => {
    const s = new Set(), L = VL.LOT_CELLS;
    const put = (h) => { if (h && h.cx != null) for (const [dx, dy] of L) s.add((h.cx + dx) + ',' + (h.cy + dy)); };
    for (const h of vil._houseCells || []) put(h);
    for (const h of [vil._site, vil._shelter, vil._psite]) put(h);
    for (const h of vil._pHouses || []) put(h);
    return s;
  };
  const useRows = (day) => {
    for (const vil of sv()) {
      const e = vil.econ; if (!e || e.founder || !vil._terrSet) continue;
      const g = grownAt.get(vil.name); if (!g) continue;
      const lot = lotSet(vil), work = new Set();
      for (const q of vil._granList || []) for (let dx = -2; dx <= 2; dx++) for (let dy = -1; dy <= 1; dy++) work.add((q.cx + dx) + ',' + (q.cy + dy));
      for (const c of vil._ditch || []) work.add(c.cx + ',' + c.cy);
      const o = { grown: 0, house: 0, field: 0, pot: 0, work: 0, other: 0, gone: 0 };
      for (const k of g.keys()) {
        o.grown++;
        if (!vil._terrSet.has(k)) { o.gone++; continue; }
        if (lot.has(k)) o.house++;
        else if (vil._farmSet && vil._farmSet.has(k)) o.field++;
        else if (vil._potSet && vil._potSet.has(k)) o.pot++;
        else if (work.has(k) || (vil._t1238Use && (vil._t1238Use.get(k) | 0) > (g.get(k) | 0))) o.work++;   // 쓴 날 표는 넣은 날에도 찍힌다(`_t1238Added`) — 넣은 뒤에 쓴 칸만
        else o.other++;
      }
      use.push([day, vi(vil.name), o.grown, o.house, o.field, o.pot, o.work, o.other, o.gone]);
    }
  };
  //   (덧붙임 셋) 읽기만 — 기근 문 · 일괄 몸 · K 세 항 · 날것 곳간 · 영토 일감을 쥔 몸
  const hgrOf = (vil, e, N, day) => {
    const c = vil._t1380Hd; if (c && (c.day | 0) === (day | 0)) return c.v ? 1 : 0;   // 켬 판 — 그날 문이 정한 값
    try { return E.totalFoodEquivalent(e) < (N || 1) * E.T1297_FAMINE_DAYS ? 1 : 0; } catch (_) { return null; }
  };
  const bJobOf = (vil) => { const P = P1380(); try { const b = P && P.body ? P.body(vil) : null; return b ? (b.simJob || b.job || '?') : null; } catch (_) { return null; } };
  const kOf = (e) => { const k = e._kDbg; return k ? [r3(k.slot), r3(k.prod), r3(k.fuel)] : [null, null, null]; };
  const feRawOf = (e, N) => { const S = e.storage || {}; return N ? r3(((S.food || 0) + (S.fish || 0) + (S.meat || 0) + (S.cooked_food || 0)) / N) : null; };
  const terrBodies = (vil) => {
    if (!process.env.T1302_TERR_BODY) return [null, null];
    const pl = plOf(); if (!pl) return [null, null];
    let n = 0, f = 0; for (const pid of (vil.npcPids || [])) { const p = pl.get(pid); if (p && p._t1302Terr) { n++; if (FOODJ[p.simJob]) f++; } }
    return [n, f];
  };
  let lastDay = -1;
  //   ★마디 판(`T1380_SEG=1`) — 셈 칸(이름 차례 · 마을-날 앞 누계 · 집터 표지 · 첫 줄 영토 · 넓힌 칸 날)을 마디 끝(종료)에 판 폴더 `t1380.state.<날>.json` 에 두고
  //     다음 마디(`seg-<그 날>.json`)가 읽는다. `vil._t1380` 셈은 재기동이 안 싣는다(0 부터) — 그 앞 누계는 0 으로 · `_t1207` 은 T1340 이 싣는다(줄면 버림).
  const SEG = process.env.T1380_SEG === '1';
  const segFrom = (() => { const m = /seg-(\d+)\.json$/.exec(OUT); return m ? +m[1] : 0; })();
  const stFile = (d) => path.join(path.dirname(OUT), `t1380.state.${d}.json`);
  if (SEG && segFrom > 0) {
    try {
      const S0 = JSON.parse(fs.readFileSync(stFile(segFrom), 'utf8'));
      for (const n of S0.names) vi(n);
      for (const [k, v] of S0.prevV) { const q = Object.assign({}, v, { _seg: 1 }); for (const kk of T1380K.concat(T1380K2, T1380K3)) q[kk] = 0; prevV.set(k, q); }
      for (const [k, v] of S0.snap) snap.set(k, v);
      for (const [k, v] of S0.init) init.set(k, new Set(v));
      for (const [k, v] of S0.grown) grownAt.set(k, new Map(v));
      lastDay = S0.day | 0; wantDay = lastDay + 1;
    } catch (e) {}
  }
  const saveSeg = () => {
    if (!SEG || lastDay < 0) return;
    try {
      fs.writeFileSync(stFile(lastDay), JSON.stringify({ day: lastDay, names, prevV: [...prevV], snap: [...snap], init: [...init].map(([k, v]) => [k, [...v]]), grown: [...grownAt].map(([k, v]) => [k, [...v]]) }));
      for (const f of fs.readdirSync(path.dirname(OUT))) { const m = /^t1380\.state\.(\d+)\.json$/.exec(f); if (m && +m[1] < lastDay - 60) try { fs.unlinkSync(path.join(path.dirname(OUT), f)); } catch (e) {} }
    } catch (e) {}
  };
  const dayRows = (day) => {
    detect();
    for (const vil of sv()) {
      const e = vil.econ; if (!e || e.founder) continue;
      const N = (e.npcs || []).length, terrN = vil._terrSet ? vil._terrSet.size : 0;
      //   넓힌 칸 표
      let s = seen.get(vil.name), g = grownAt.get(vil.name);
      if (!s && init.has(vil.name)) { s = new Set(init.get(vil.name)); if (!g) { g = new Map(); grownAt.set(vil.name, g); } for (const k of g.keys()) s.add(k); seen.set(vil.name, s); }   // 마디 잇기 — 앞 마디의 본 칸
      if (!s) { s = new Set(vil._terrSet || []); seen.set(vil.name, s); init.set(vil.name, new Set(s)); g = new Map(); grownAt.set(vil.name, g); }
      else for (const k of vil._terrSet || []) if (!s.has(k)) { s.add(k); g.set(k, day); }
      //   넓히기 목표(읽기 — `_terrGrowCore` 의 그 식: max(econ, 집) 과 상한 중 작은 쪽)
      const capF = Math.ceil(N / 6) * 600 + 1500, lab = Math.round((1500 + Math.ceil(N / 6) * 400) * 1.5);
      let tgt = null; try { if (e.land && e.land.size) { const tt = W0.tt(e.land.size, terrHousing(e)); tgt = Math.min(tt.target, capF); } } catch (_) {}
      let p = prevV.get(vil.name) || null;
      const T7 = vil._t1207 || {}, K = vil._t1380 || {};
      if (p && p._seg) { p = Object.assign({}, p); delete p._seg; if (['wood', 'laborMin', 'cells', 'body'].some((k) => +(T7[k] || 0) + 1e-9 < (p[k] || 0))) for (const k of ['wood', 'laborMin', 'cells', 'body']) p[k] = 0; }   // 마디 잇기 — `_t1207` 이 다시 0 부터면(재기동이 안 실은 판) 앞 누계를 버린다
      const d = (o, k) => p ? (+(o[k] || 0) - (p[k] || 0)) : +(o[k] || 0);   // 셈 칸 날 차 — 마을의 첫 줄은 부팅(셈 0) 뒤 누계(한 번에 돈 판 · 첫 날 몫을 안 버린다)
      const grown = p ? terrN - p.terrN : null;
      const wt = vil._t1207Wait && (vil._t1207Wait.day | 0) === (day | 0) ? vil._t1207Wait.why : null;
      const why = grown == null ? null : grown > 0 ? (wt ? 'grow+' + wt : 'grow') : (tgt != null && terrN >= tgt) ? 'target' : wt ? wt : ((vil._t1238Pend && vil._t1238Pend.length) || (vil._t1207Pend && vil._t1207Pend.length)) ? 'labor' : 'none';
      const t = today.get(vil.name) || { call: 0, hit: 0 };
      const dd = e._dpDebug || null;
      vrows.push([day, vi(vil.name), N, terrN, tgt, capF, lab, grown, why, r3(d(T7, 'wood')), r3(d(T7, 'laborMin')), d(T7, 'cells'), vil._t1238Pend ? vil._t1238Pend.length : (vil._t1207Pend ? vil._t1207Pend.length : 0),
        r3(e._fuelCov), r3((e.storage && e.storage.wood) || 0), r3(e._t1207Need || 0), dd ? (dd.gated ? 1 : 0) : null, vil._site ? (vil._site.stage | 0) : -1, t.call, t.hit,
        ...T1380K.map((k) => r3(d(K, k))), d(T7, 'body'), vil._farmSet ? vil._farmSet.size : null, r3(e.lastStats && e.lastStats.happiness), ...T1380K2.map((k) => r3(d(K, k))),
        ...T1380K3.map((k) => r3(d(K, k))), hgrOf(vil, e, N, day), bJobOf(vil), ...kOf(e), feRawOf(e, N), ...terrBodies(vil)]);
      const q = { terrN }; for (const k of ['wood', 'laborMin', 'cells', 'body']) q[k] = +(T7[k] || 0); for (const k of T1380K.concat(T1380K2, T1380K3)) q[k] = +(K[k] || 0);
      prevV.set(vil.name, q);
    }
    today.clear();
    if ([30, 90, 150, 365, 730].includes(day | 0)) useRows(day | 0);
  };
  let stat = null;
  const dump = () => {
    try {
      const V = VS();
      try { stat = V && typeof V.t1380Stat === 'function' ? V.t1380Stat() : null; } catch (e) { stat = null; }
      let probe = null; try { const pp = V && typeof V.tickPerf === 'function' ? V.tickPerf().probe : null; probe = pp ? { siteCall: pp.siteCall, siteHit: pp.siteHit, siteSkip: pp.siteSkip } : null; } catch (e) {}
      const u = use.slice(); if (lastDay > 0 && !use.some((r) => r[0] === lastDay)) { const n0 = use.length; useRows(lastDay); for (let i = n0; i < use.length; i++) u.push(use[i]); use.length = n0; }
      fs.writeFileSync(OUT + '.t1380.json', JSON.stringify({ env: { BUNDLE: process.env.T1334_BUNDLE || null, DAY_MS: process.env.VILLAGE_DAY_MS || null, BUILD: process.env.T400_BUILD_ACT || null,
        LOTF: process.env.T1380_TERR_LOT_FIRST || null, CLAIM: process.env.T1380_LOT_CLAIM || null, FULL: process.env.T1380_START_FULL || null, HAPPY: process.env.T1380_HAPPY_EXPAND || null, HC: process.env.T1373_HOME_CAP || null, TB: process.env.T1302_TERR_BODY || null, TC: process.env.T1329_TERR_CREW || null, SPARE: process.env.T1380_SPARE_EXPAND || null, BODY: process.env.T577_BODY || null,
        SHADOW: SHADOW ? 1 : 0 }, lastDay, probe, stat, ccols: CCOLS, vcols: VCOLS, ucols: UCOLS, names, calls, vrows, use: u }));
    } catch (e) {}
  };
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const Lg = mk.apply(this, arguments), sd = Lg.scanDay;
    Lg.scanDay = function (world, day) {
      const r = sd.apply(this, arguments);
      try { if ((day | 0) !== lastDay) { lastDay = day | 0; wantDay = lastDay + 1; dayRows(lastDay); if (lastDay % 10 === 0) dump(); } } catch (e) {}
      return r;
    };
    return Lg;
  };
  process.on('exit', () => { dump(); saveSeg(); });
}
