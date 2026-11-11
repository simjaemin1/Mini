'use strict';
// (@regress 없음 — 러너 밖 · T1256 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1256-observe.js — 몸 세계 광부: 광산 마을 원석 · 노 · 청동 — 서버 판 자(`t577-server-run.js`) 곁 프리로드 ==========
//   쓰는 법: NODE_OPTIONS="-r $PWD/scripts/t745-vclock.js -r $PWD/scripts/t1256-observe.js" node scripts/t577-server-run.js 100 1020
//     → 판 JSON 곁 `<판>-<시드>.t1256.json`(10날마다 덮어 쓴다 · 끝에 한 번 더)
//   광산 마을 = 첫 관측 날 `land.ore > 0.15` 또는 `land.tin > 0.15`(T1249 훅 `t1249-hook.js` 와 같은 가름 · 그 뒤 고정).
//   ① 날마다(econ `tickVillage` 첫 마을 머리 — 그날 econ 틱 앞 · 어제 몫이 남아 있다) 광산 마을마다 한 줄 `rec.day[d] = [[…]]`(열 = `rec.dcols`):
//      econ 광부 · econ 대장장이 · 광부 몸 · 대장장이 몸 · 원석 재고(합 · 종류별) · 어제 원석 산출(`dailyProductionBuf` 원석 칸 합 — T1249 훅 그 칸) ·
//      어제 몸이 곳간에 넣은 원석(종류별 단위 — econ 정본 `mineToGranary` 의 돌려준 값을 센다 · 값 무변) · 어제 몸이 깎은 덩이(`_t724CutLast`) ·
//      어제 몸이 쳤나(`_t724Walk`) · 수요 D(`_oreOutLast`) · 노 녹임 누계(`_smeltedTotal` 원석 단위) · 녹여 나온 금속 누계(`_t1188Smelt` · 쪼개기 켬만) ·
//      청동 무기 누계(`_bronzeWeaponMade`) · 구리 · 주석 · 무기 재고 · 장인 작업표 셈(`_t1196C`)
//   ② 날마다 세계 셈 `rec.g[d]`: 채굴 행위 셈(`tickPerf().probe.t724` — 친 걸음 · 타 · kg · 퇴근 까닭 · 닿나 기다림 …) 누계 그대로 · 일괄 수요 문 셈(`_t1095Stat` 합)
//   ③ 표본(`T1256_BODY_MS` 가상 시계 간격 · 기본 10000 = 게임 10분 · 0 = 끔): 광산 마을 광부 몸마다 ·
//      광맥 셀(`vil._oreCells`) 위에 선 몸-표본 · 그날 한 표본의 최대 · '채광' 라벨 몸-표본 · 라벨 분포 · 마을 `_t724Hit`(그날 타수 — 날 머리에 0 으로 지운다) 그날 최대
//      + 몸 셋(광부 · 처음 잡힌 순서 · 광부가 아니게 되면 다음 광부로 바꾼다) 하루: 상태 표본(t1243 `stateOf` 가름 + '채광') · 걸은 거리(표본 사이 변위 합 · 셀) ·
//        친 셀(그날 '채광'으로 선 셀 수) · 손에 든 원석 늘어난 kg · 라벨 분포
//   ⚠값을 바꾸지 않는다 — econ `mineToGranary` 감쌈은 인자 · 돌려준 값 그대로(센 것만 이 파일 칸에 남긴다).
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1256.json' : '';
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const OG = require(path.join(ROOT, 'server', 'ore-goods'));
let VIL = null, KGU = null;
const rec = {
  split: !!V1.T1188_ORE_SPLIT, t724: !!V1.T724_MINE_ACT,
  dcols: ['name', 'eMiner', 'eSmith', 'bMiner', 'bSmith', 'oreStock', 'oreTyped', 'oreProdY', 'bodyInY', 'cutY', 'walkY', 'D', 'smeltTot', 'smeltOut', 'bronzeW', 'copper', 'tin', 'weapon', 'art'],
  mines: null, kgU: null, day: {}, g: {}, samp: {}, life: {}, lifePids: [], err: null,
};
// ── econ 원석 입구 감쌈(센 것만 · 값 무변) ─────────────────────────────────────────────────────────────────────────
const _inY = new Map();   // econ 마을 → { 종류: 단위 } (오늘치 — 날 머리에 줄로 옮기고 비운다)
const _m2g = V1.mineToGranary;
if (typeof _m2g === 'function') {
  V1.mineToGranary = function (v, units, mineral) {
    const g = _m2g.apply(this, arguments);
    try {
      if (g > 0 && v) {
        const k = (rec.split ? OG.idOf(mineral) : null) || 'ore';
        const o = _inY.get(v) || (_inY.set(v, {}), _inY.get(v)); o[k] = (o[k] || 0) + g;
      }
    } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
    return g;
  };
}
const r3 = (x) => +(+x || 0).toFixed(3);
let MINES = null;   // 광산 마을 이름 집합(첫 관측에 고정)
function _isMine(e) { const L = (e && e.land) || {}; return (L.ore || 0) > 0.15 || (L.tin || 0) > 0.15; }
function _bodies(vil, players) {
  let bm = 0, bs = 0;
  for (const pid of (vil.npcPids || [])) { const p = players.get(pid); if (!p) continue; if (p.simJob === 'miner') bm++; else if (p.simJob === 'smith') bs++; }
  return [bm, bs];
}
// 그날 표본 누계(마을별) — 날 머리에 줄로 옮긴다
let _sd = null;
function _sday(day) { if (!_sd || _sd.day !== day) { _sd = { day, n: 0, v: {}, acts: {} }; rec.samp[day] = _sd; } return _sd; }
function snap(day) {
  if (!VIL) VIL = require(path.join(ROOT, 'server', 'villages'));
  if (KGU === null) { try { const W = require(path.join(ROOT, 'server', 'weights')); KGU = (W && W.kgOf) ? (W.kgOf('ore') || 0) : 0; } catch (e) { KGU = 0; } rec.kgU = KGU; }
  const P = VIL.__labProbe._t569Probe.setup(), B = VIL.__p3Bind({});
  const players = (B.state.deps && B.state.deps.players) || new Map();
  if (!MINES) { MINES = new Set(); for (const vil of (P.villages || [])) if (_isMine(vil.econ)) MINES.add(vil.name); rec.mines = [...MINES]; }
  const rows = [];
  for (const vil of (P.villages || [])) {
    if (!MINES.has(vil.name)) continue;
    const e = vil.econ || {}, st = e.storage || {}, c = e.counts || {};
    const typed = {}; let tot = Math.max(0, st.ore || 0);
    for (const k of OG.ids) { const q = st[k] || 0; if (q > 0) { typed[k] = r3(q); tot += q; } }
    if ((st.ore || 0) > 0) typed.ore = r3(st.ore);
    const dp = e.dailyProductionBuf || {}; let prod = dp.ore || 0; for (const k of OG.ids) prod += dp[k] || 0;
    const inY = _inY.get(e) || {}; const inYr = {}; for (const k in inY) inYr[k] = r3(inY[k]);
    const so = {}; for (const k in (e._t1188Smelt || {})) so[k] = r3(e._t1188Smelt[k]);
    const [bm, bs] = _bodies(vil, players);
    rows.push([vil.name, c.miner || 0, c.smith || 0, bm, bs, r3(tot), typed, r3(prod), inYr, r3(vil._t724CutLast || 0), (e._t724Walk | 0), r3(e._oreOutLast || 0),
      r3(e._smeltedTotal || 0), so, r3(e._bronzeWeaponMade || 0), r3(st.copper || 0), r3(st.tin || 0), r3(st.weapon || 0), e._t1196C ? Object.assign({}, e._t1196C) : null]);
  }
  _inY.clear();
  rec.day[day] = rows;
  // 세계 셈 — 채굴 행위 · 일괄 수요 문(누계 그대로)
  let t724 = null; try { const tp = VIL.tickPerf ? VIL.tickPerf() : null; const Q = tp && tp.probe && tp.probe.t724;   // ⚠`probeStats()` 안(`tickPerf().probe.t724`) — 겉 `tickPerf().t724` 는 없다(T1249 훅이 읽은 자리 · 늘 null)
    if (Q) { t724 = {}; for (const k of ['pulse', 'sw', 'kg', 'cut', 'bodies', 'gran', 'granKg', 'granU', 'dusk', 'duskKg', 'duskU', 'keepKg', 'done', 'full', 'noGran', 'none', 'repick', 'skip', 'batch', 'walkVd', 'walk', 'wait', 'picks', 'calls', 'duskDays']) t724[k] = typeof Q[k] === 'number' ? r3(Q[k]) : Q[k];
      t724.ns = Q.ns; t724.nsPick = Q.nsPick; t724.nsCut = Q.nsCut; t724.granH = Q.granH ? Q.granH.slice() : null;
      if (day % 10 === 0) { t724.vs = Q.vs ? JSON.parse(JSON.stringify(Q.vs)) : null; t724.daysN = Q.days ? Q.days.length : 0; t724.firstGran = Q.firstGran ? Q.firstGran.slice(0, 40) : null; } } } catch (e) { t724 = { err: String(e).slice(0, 200) }; }
  let t1095 = null; try { const S = B._t1095Stat; if (S) t1095 = { days: S.days, cut: S.cut, zero: S.zero, open: S.open, dug: r3(S.dug), D: r3(S.D) }; } catch (e) {}
  let pop = 0, miners = 0, smiths = 0; for (const vil of (P.villages || [])) { const e = vil.econ || {}; pop += (e.npcs || []).length; miners += (e.counts && e.counts.miner) || 0; smiths += (e.counts && e.counts.smith) || 0; }
  rec.g[day] = { pop, miners, smiths, t724, t1095 };
  if (day % 10 === 0) { rec.t1095v = (B._t1095Stat && B._t1095Stat.vils) ? JSON.parse(JSON.stringify(B._t1095Stat.vils)) : null; write(); }
}
function write() { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 자리 */ } }
// ── 표본(가상 시계 간격 · 읽기만) ─────────────────────────────────────────────────────────────────────────────
const BODY_MS = process.env.T1256_BODY_MS == null ? 10000 : +process.env.T1256_BODY_MS;
const WORK = new Set(['경작', '수확', '낚시', '드리움', '놓침', '낚음', '벌목', '채석', '제작', '수색', '채집', '파종', '모내기', '김매기', '추수', '사냥', '건축', '개간']);
const WALK = new Set(['출근', '귀가', '운반', '저장', '인출']);
const REST = new Set(['휴식', '요양']);
const OTHER = new Set(['대피', '장마당']);
function stateOf(npc) {   // t1243-observe `stateOf`(= t1231) 가름 + '채광'(광부 친 자리)을 따로
  const act = npc._lifeAct || '', beh = npc.behavior || '';
  const mv = Math.hypot(npc.vx || 0, npc.vy || 0) > 1;
  if (beh === 'fight' || beh === 'flee' || OTHER.has(act) || npc.canadiaTask) return 'other';
  if (act === '취침') return mv ? 'walk' : 'sleep';
  if (act === '식사') return 'eat';
  if (act === '채광') return mv ? 'walk' : 'mine';
  if (WALK.has(act)) return 'walk';
  if (WORK.has(act) || beh === 'gather' || beh === 'plant' || beh === 'harvest') return mv ? 'walk' : 'work';
  if (REST.has(act)) return mv ? 'wander' : 'rest';
  return mv ? 'wander' : 'rest';
}
module.exports.stateOf = stateOf;   // ★[T1266] 관찰기 `t1266-observe.js` 가 같은 가름을 읽는다(사본 0 · 이 파일 동작 무변)
const _cellSets = new Map();   // 마을 이름 → { arr, set }
function _oreSet(vil) {
  const arr = vil._oreCells || null; let o = _cellSets.get(vil.name);
  if (!o || o.arr !== arr) { const s = new Set(); if (arr) for (const c of arr) s.add(c.cx + ',' + c.cy); o = { arr, set: s }; _cellSets.set(vil.name, o); }
  return o.set;
}
const LIFE_N = 3;
const _life = new Map();   // pid → { x, y, hand }
function _lifeDay(day, pid) { const D = rec.life[day] || (rec.life[day] = {}); return D[pid] || (D[pid] = { vil: null, st: {}, dist: 0, cells: [], kg: 0, acts: {}, n: 0 }); }
if (BODY_MS > 0) {
  setInterval(() => {
    try {
      if (!VIL || !MINES) return;
      const P = VIL.__labProbe._t569Probe.setup(), B = VIL.__p3Bind({});
      const players = (B.state.deps && B.state.deps.players) || new Map();
      const SZ = B.SZ || 32;
      const day = (B.state && B.state.world && B.state.world.day) | 0;
      const S = _sday(day); S.n++;
      const avail = [];
      for (const vil of (P.villages || [])) {
        if (!MINES.has(vil.name)) continue;
        const cs = _oreSet(vil);
        const r = S.v[vil.name] || (S.v[vil.name] = { mb: 0, on: 0, onMax: 0, mine: 0, hitMax: 0, cells: cs.size });
        let on = 0;
        for (const pid of (vil.npcPids || [])) {
          const p = players.get(pid); if (!p || p.simJob !== 'miner') continue;
          r.mb++; avail.push([vil.name, pid]);
          if (cs.has(Math.floor(p.x / SZ) + ',' + Math.floor(p.y / SZ))) on++;
          if (p._lifeAct === '채광') r.mine++;
          const a = p._lifeAct || '(없음)'; S.acts[a] = (S.acts[a] || 0) + 1;
        }
        r.on += on; if (on > r.onMax) r.onMax = on;
        const h = vil._t724Hit | 0; if (h > r.hitMax) r.hitMax = h;
        r.cells = cs.size;
      }
      // 몸 셋 — 광부가 아니게 되었거나 사라지면 다음 광부(처음 잡힌 순서 · 이미 고른 몸 제외)
      for (let i = 0; i < LIFE_N; i++) {
        const pid = rec.lifePids[i];
        const p = pid != null ? players.get(pid) : null;
        if (!p || p.simJob !== 'miner') {
          const nx = avail.find(([, q]) => !rec.lifePids.includes(q));
          if (!nx) continue;
          if (pid != null) (rec.lifeSwap || (rec.lifeSwap = [])).push([day, pid, nx[1]]);
          rec.lifePids[i] = nx[1]; _life.delete(pid);
        }
      }
      for (const pid of rec.lifePids) {
        const p = players.get(pid); if (!p) continue;
        const vn = (avail.find(([, q]) => q === pid) || [null])[0];
        const L = _lifeDay(day, pid); L.vil = vn; L.n++;
        const s = stateOf(p); L.st[s] = (L.st[s] || 0) + 1;
        const a = p._lifeAct || '(없음)'; L.acts[a] = (L.acts[a] || 0) + 1;
        const hand = (p.inventory && p.inventory.ore_chunk) || 0;
        const prev = _life.get(pid);
        if (prev) { L.dist += Math.hypot(p.x - prev.x, p.y - prev.y) / SZ; if (hand > prev.hand) L.kg += hand - prev.hand; }
        _life.set(pid, { x: p.x, y: p.y, hand });
        if (p._lifeAct === '채광') { const k = Math.floor(p.x / SZ) + ',' + Math.floor(p.y / SZ); if (!L.cells.includes(k)) L.cells.push(k); }
      }
    } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  }, BODY_MS);
}
let last = -1;
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  try { if (day !== last) { last = day; snap(day); } } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); write(); }
  return _t.apply(this, arguments);
};
process.on('exit', () => { for (const D of Object.values(rec.life)) for (const L of Object.values(D)) L.dist = +L.dist.toFixed(1), L.kg = r3(L.kg); write(); });
