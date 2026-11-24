'use strict';
// (@regress 없음 — 러너 밖 · T1422 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1422-observe.js — 남는 시간 진단: 몸의 하루 조각(라벨 × 직업 × 철 · 시간 가중) · 일찍 든 날 · 반일 날 · 할 일이 있는데 쉰 마을-날 =========
//   서버 판 자: NODE_OPTIONS="-r $PWD/scripts/t1422-observe.js" node scripts/t577-server-run.js <날> <시드>  (판 JSON 곁 `<판>-<시드>.t1422.json` · `T1422_OUT=<파일>` 이면 그 자리)
//   존(아이)에서만 선다. villages 글자 덧댐(메모리 · 제품 파일 손 0 · 바꾼 자리 수는 rec.hooks):
//     ① `npcLifeTick` 을 감싸 그 몸의 라벨(`_lifeAct`)을 지난 표본부터 흐른 시간(3초 상한 — 생활층 노동 적산과 같은 틱 간격 캡)으로 센다
//     ② 마을 정본 함수(`_lifeNeedClear` · `_lifeEcon`)를 읽기 전용으로 내놓는다(끝에 한 줄)
//   쓰기 0 — 몸 · 마을 · econ 칸을 안 바꾼다(T1422 손잡이 칸 `_t1422*` 은 읽기만).
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
const SERVER = !!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1));
const OUT = !SERVER ? '' : (process.env.T1422_OUT || (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1422.json' : ''));
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const VS = path.join(ROOT, 'server', 'villages.js');
const HOOKS = [
  ['function npcLifeTick(npc, now) {', 'function npcLifeTick(npc, now) { const __r = __nlt0(npc, now); if (globalThis.__t1422T) globalThis.__t1422T(npc, now, __r); return __r; }\nfunction __nlt0(npc, now) {'],
];
const HN = [];
{ const Module = require('module'), _c = Module.prototype._compile;
  Module.prototype._compile = function (c, f) {
    if (f === VS) {
      for (const [a, b] of HOOKS) { const n = c.split(a).length - 1; HN.push(n); if (n === 1) c = c.replace(a, b); }
      c += '\n;globalThis.__t1422VS = { needClear: (v) => _lifeNeedClear(v), lifeEcon: () => _lifeEcon(), state, stat: () => (typeof t1422Stat === \'function\' ? t1422Stat() : null), stat51: () => (typeof _t1451St !== \'undefined\' ? JSON.parse(JSON.stringify(_t1451St)) : null), voc: (x, y) => villageOfCell(x, y) };\n';
    }
    return _c.call(this, c, f);
  }; }
const CAL = require(path.join(ROOT, 'server', 'calendar'));
const SEASON = (m) => (m >= 3 && m <= 5) ? '봄' : (m >= 6 && m <= 8) ? '여름' : (m >= 9 && m <= 11) ? '가을' : '겨울';
const rec = { hooks: HN, err: null,
  //   T[철][직업][라벨] = 몸-ms(낮 · 밤 다) · D[철][직업] = [몸-날, 일찍 쉰 몸-날(낮에 '휴식' 라벨), 반일 몸-날, 남는 시간 일 몸-날(`_t1422D`)]
  T: {}, D: {},
  //   V[철] = [마을-날, 낮에 누가 쉰 마을-날, 그 가운데 할 일이 있던 마을-날(아무 넷), 집터, 밭 넓힘, 식량 모자람, 나무 0] · 마을-날마다 그날 첫 표본에서 잰다(곳간 · 집터는 하루 머리 값)
  V: {}, ticks: 0, days: 0, side: null };
const LAST = new WeakMap(), ND = new WeakMap(), VD = new Map();
let curDay = -1, curS = null;
function dayOf() { const S = globalThis.__t1422VS && globalThis.__t1422VS.state; return S && S.world ? S.world.day | 0 : 0; }
function vilOf(npc) { const S = globalThis.__t1422VS && globalThis.__t1422VS.state; if (!S || !S.villages || !npc.simVillageId) return null; for (const v of S.villages) if (v.id === npc.simVillageId || v.dbId === npc.simVillageId) return v; return null; }
const VBY = new Map();
globalThis.__t1422T = (npc, now, owned) => {
  try {
    if (!owned || !npc || !npc.simJob) return;
    rec.ticks++;
    const d = dayOf();
    if (d !== curDay) { curDay = d; rec.days++; const t = CAL.dateOf(d); curS = SEASON(t.month); VD.clear(); if (rec.days % 30 === 0) dump();
      //   ★그날 세계 줄(하루 첫 표본) — [날, 인구, 사는 마을, 나무꾼 0 마을(사는 마을 중), 곳간 나무 < 1 마을, 영토 칸 합, 주거 합, 행복(사람 가중 평균), 행복 마을 값들(30날마다)]
      const VS = globalThis.__t1422VS, V = (VS && VS.state && VS.state.villages) || [];
      let pop = 0, live = 0, lj0 = 0, w0 = 0, terr = 0, house = 0, hs = 0; const hv = [];
      for (const v of V) { const e = v.econ; if (!e || !e.npcs) continue; const n = e.npcs.length; pop += n; terr += (v._terrSet && v._terrSet.size) || 0; house += +e.housing || 0;
        if (n > 0) { live++; if (!((e.counts && e.counts.lumberjack) > 0)) lj0++; if (!((e.storage && e.storage.wood) >= 1)) w0++; const h = e.lastStats && e.lastStats.happiness; if (typeof h === 'number') { hs += h * n; hv.push(+h.toFixed(3)); } } }
      (rec.w || (rec.w = [])).push([d, pop, live, lj0, w0, terr, +house.toFixed(1), pop ? +(hs / pop).toFixed(4) : 0, rec.days % 30 === 0 ? hv : null]);
      //   ★[T1451] 마을 스냅(첫 날 · 365 · 730) — 나무 고리 그루(`_t325Trees.N` · K) · 반지름별 나무(10 · 20 · 40 · 80 · 120칸 — 색인 `t325TreesAtCell`) · 갈 수 있는 땅(밭 + 밭 후보) · 영토 · 사람
      if (rec.days === 1 || rec.days === 365 || rec.days === 730) {
        const deps = VS.state.deps || {}, snap = [];
        for (const v of V) { const e = v.econ; if (!e) continue; const T = v._t325Trees || {}; const rr = [0, 0, 0];
          const RR = [10, 20, 40, 80, 120]; rr.length = RR.length; rr.fill(0); if (deps.t325TreesAtCell && v.ccx != null) { const M = RR[RR.length - 1]; for (let dy = -M; dy <= M; dy++) for (let dx = -M; dx <= M; dx++) { const r2 = dx * dx + dy * dy; if (r2 > M * M) continue; let a = null; try { a = deps.t325TreesAtCell(v.ccx + dx, v.ccy + dy); } catch (_) {} const n = a ? a.length : 0; if (!n) continue; for (let i = 0; i < RR.length; i++) if (r2 <= RR[i] * RR[i]) rr[i] += n; } }
          const bt = RR.map(() => 0), br = RR.map(() => 0); let RD = null; try { RD = require(require('path').join(process.cwd(), 'server', 'roads.js')); } catch (_) {}
          if (v.ccx != null) { const M = RR[RR.length - 1]; for (let dy = -M; dy <= M; dy++) for (let dx = -M; dx <= M; dx++) { const r2 = dx * dx + dy * dy; if (r2 > M * M) continue; const x = v.ccx + dx, y = v.ccy + dy; let k = 0;
            try { if (VS.voc && VS.voc(x, y)) k = 1; else if (RD && RD.pavedNear && RD.pavedNear(x, y, 2)) k = 2; } catch (_) {} if (!k) continue; for (let i = 0; i < RR.length; i++) if (r2 <= RR[i] * RR[i]) (k === 1 ? bt : br)[i]++; } }
          let VLm = null; try { VLm = require(require('path').join(process.cwd(), 'server', 'village-layout.js')); } catch (_) {}
          const lsz = (e.land && e.land.size) || 0, hz = +e.housing || 0, tt = VLm ? VLm.territoryTarget(lsz, hz) : null, np = (e.npcs || []).length, cap = VLm ? Math.ceil(np / (VLm.HOUSE_CAP_PER_FLOOR * VLm.HOUSE_MAX_FLOORS)) * VLm.TERR_PER_LOT + VLm.TERR_CORE : 0;
          snap.push([v.name, (e.npcs || []).length, T.N || 0, T.K || 0, ...rr, (v._farmSet ? v._farmSet.size : 0) + (v._potSet ? v._potSet.size : 0), v._terrSet ? v._terrSet.size : 0, (e.storage && e.storage.wood) || 0, bt, br, [lsz, +hz.toFixed(1), tt ? tt.target : 0, tt ? tt.econ : 0, cap]]); }
        (rec.snap || (rec.snap = {}))[rec.days] = snap; }
      { let tN = 0; for (const v of V) tN += (v._t325Trees && v._t325Trees.N) || 0; (rec.tn || (rec.tn = [])).push(tN); }
      rec.cpu = process.cpuUsage(); }
    const S = curS, j = npc.simJob, lab = npc._lifeAct || '(없음)';
    const l = LAST.get(npc); LAST.set(npc, now);
    const dt = (l != null && now > l) ? Math.min(3000, now - l) : 0;
    const TS = rec.T[S] || (rec.T[S] = {}), TJ = TS[j] || (TS[j] = {}); TJ[lab] = (TJ[lab] || 0) + dt;
    // 몸-날
    let nd = ND.get(npc); if (!nd || nd.d !== d) { nd = { d, rest: 0, half: 0, side: 0 }; ND.set(npc, nd); const DS = rec.D[S] || (rec.D[S] = {}), DJ = DS[j] || (DS[j] = [0, 0, 0, 0]); DJ[0]++; nd.row = DJ; }
    if (!nd.half && npc._half && npc._hd != null) { nd.half = 1; nd.row[2]++; }
    if (!nd.side && npc._t1422D != null && npc._t1422D === npc._hd) { nd.side = 1; nd.row[3]++; }
    const isRest = lab === '휴식';
    if (isRest && !nd.rest) { nd.rest = 1; nd.row[1]++; }
    // 마을-날
    let vil = VBY.get(npc.simVillageId); if (vil === undefined) { vil = vilOf(npc); VBY.set(npc.simVillageId, vil); }
    if (!vil) return;
    let vd = VD.get(vil);
    if (!vd) {
      const VS = globalThis.__t1422VS, E = VS.lifeEcon(), e = vil.econ;
      const site = !!(vil._site || vil._psite) ? 1 : 0;
      let clear = 0; try { clear = (VS.needClear(vil) || (vil._t1207Wait && vil._t1207Wait.why === 'body')) ? 1 : 0; } catch (_) {}
      let food = 0, wood = 0;
      if (E && e && e.npcs) { const N = e.npcs.length || 1; food = E.totalFoodEquivalent(e) < N * E.t1374NeedDays(e, (e._world && e._world.day) | 0) ? 1 : 0; wood = (E.woodSpare(e) <= 0) ? 1 : 0; }
      vd = { rest: 0, site, clear, food, wood }; VD.set(vil, vd);
      const VR = rec.V[S] || (rec.V[S] = [0, 0, 0, 0, 0, 0, 0]); VR[0]++; vd.row = VR;
    }
    if (isRest && !vd.rest) { vd.rest = 1; const R = vd.row; R[1]++; if (vd.site || vd.clear || vd.food || vd.wood) R[2]++; R[3] += vd.site; R[4] += vd.clear; R[5] += vd.food; R[6] += vd.wood; }
  } catch (e) { rec.err = String(e && e.stack || e).slice(0, 400); }
};
function dump() { try { const VS = globalThis.__t1422VS; if (VS && VS.state && VS.state.deps) { /* 손잡이 계측(있으면) */ } rec.side = (VS && VS.stat) ? VS.stat() : null; rec.s51 = (VS && VS.stat51) ? VS.stat51() : null; fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} }
process.on('exit', () => dump());
process.on('SIGTERM', () => { dump(); process.exit(0); });
