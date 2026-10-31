'use strict';
// (@regress 없음 — 러너 밖 · T1031 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1031-war-observe.js — 전쟁 하나하나의 편성 · 지형 · 결과 — 서버 판 자(`t577-server-run.js`) 곁 프리로드 ===
//   쓰는 법: NODE_OPTIONS="-r $PWD/scripts/diverge-ctl.js -r $PWD/scripts/t1031-war-observe.js" [DCTL_SKIP=raid:n] node scripts/t577-server-run.js 800 1020
//            (아이 존만 · 판 JSON 곁 `<판>-<시드>.t1031.json` · `T1031_OUT` 로 바꿀 수 있다)
//            다시 치기: `scripts/t1031-lab-replay.js` · 표: `scripts/t1031-table.js`
//   ★왜 [T1031 · 재민 09-03 캐논 "랩 = 목표"] 서버 판의 전쟁 하나하나가 전쟁실험실(`lab/전쟁실험실.html` · battle-core 공용)과 같은 모양인가 —
//     사상 비율 · 전쟁 길이 · 궤주 · 함락 · 포로. 랩에서 다시 칠 수 있게 **그 순간 econ 이 아는 편성**과 **실제로 싸운 몸**을 같이 남긴다.
//   뜨는 것(이미 있는 문 앞에서 읽기만 — 새 수 0 · 세계 값 무변):
//     ⓐ 결단 층(war-core `createWar` 가 돌려준 문) — 선포 칸(공 · 방 · 명분 · 병력 · econ 편성 `w.composition` · `w.weapQ` · 선포 날 · 행군 날) ·
//        교전 훅(`onEngage` — 그날 · 까닭 assault | sortie) 앞에서 **두 마을 econ 의 편성 입력 사본**(사람마다 직업 · 포로 표 · 숙련 칸 ·
//        곳간 무기 · 돌 · 주석 · `_swordFrac` · `_weapQ` · 땅 주석 · 비옥 · 물 — 랩 `toBattleSpec` · `conscript` · `warCapture` 가 읽는 칸만 · 값 사본) · 명분 J(`warJustice` — 순수) ·
//        호스트가 부른 `conscript`(방어 소집 편성 — 돌려준 값을 그대로 적는다) · 정산(`warResolveBattle` — 받은 res · 돌려준 사상 · 그 자리 포로 표 `w._capResolve`) ·
//        날마다 국면 · 작전 전이 · 끝난 날 · 그 전쟁의 war-core 글(호스트가 null 로 둔 `log` 문에 받아 적기만)
//     ⓑ 몸 층(war-live `createWarLive` 가 돌려준 문) — 교전 마디(전진 명령 `orderAdvance` → 대치 | 정산): 걸음 · 맞붙은 걸음 · 접촉 걸음 · 첫 접촉 때 ·
//        그 마디의 죽음 · 궤주 · 첫 접촉 때 측마다 병종 몸 수 · 두 몸 최소 거리 · 무게중심 ↔ 방어 마을 중심 거리 ·
//        정산(`settle`) 때 측마다 병종 몸(시작 · 죽음 · 궤주)
//     ⓒ 지형 층 — 교전의 존 세계 어댑터(`ctx.world` — 호스트 `_warWorld` 가 준 술어 넷)를 같은 인자로 부르고 그 답을 그대로 돌려주며 **답을 센다**:
//        시야(`losBlocked` 참 · 부름) · 몸 클램프(`blocked` 참 · 부름) · 엄폐(`coverAt` 참 · 부름) · 전진 방향(`advance` null · 부름). 랩은 어댑터가 없다(빈 들판).
//   ⚠읽기만 — 전쟁 칸 · 몸 칸 · 교전 칸 · econ 에 쓰지 않는다 · RNG 무접촉. 감싸개는 원 함수를 같은 인자로 부르고 돌려줌을 그대로 돌려준다.
//     econ 사본은 원시 값만 옮긴다(객체 신원 0 · 사본에 쓰는 것은 다시 치기 쪽 몫).
//   ⚠판 자 몸 상한(`VILLAGE_NPC_CAP=1` — t577 기본)이면 군대 몸이 마을마다 하나다 — econ 편성(수십)과 싸운 몸(하나)을 둘 다 적는 까닭.
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T1031_OUT || (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1031.json' : '');
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const WLM = require(path.join(ROOT, 'server', 'war-live'));
const WCM = require(path.join(ROOT, 'sim', 'war-core'));
const SNAP_MAX = 4;   // 전쟁마다 econ 사본을 남기는 교전 훅 수(관찰 크기 상한일 뿐 · 세계 수 아님)
const LOG_MAX = 80;   // 전쟁마다 글 줄 상한(관찰 크기)
const rec = {
  ver: 1, seed: +process.env.T577_SEED,
  knob: Object.fromEntries(['VILLAGE_NPC_CAP', 'VILLAGE_DAY_MS', 'T941_BATTLE_DAY', 'T990_ECON_DAY', 'T995_BACK_AMMO', 'T995_CONTACT_REACH', 'T995_DRY_STANDOFF', 'T956_ASSAULT_MISS', 'DCTL_SKIP', 'DCTL_ARM', 'WAR_MINDAY', 'WAR_CAPTIVES', 'T874_BATTLE_FAST']
    .map((k) => [k, process.env[k] != null ? process.env[k] : null])),
  tickHz: null, wars: {}, errs: 0, err0: null, lastDay: null, hooked: { war: 0, live: 0, daily: 0, step: 0, settle: 0, resolve: 0, conscript: 0 },
};
const r2 = (x) => (x == null || !Number.isFinite(+x)) ? null : Math.round(+x * 100) / 100;
const r3 = (x) => (x == null || !Number.isFinite(+x)) ? null : Math.round(+x * 1000) / 1000;
function err(e) { rec.errs++; if (!rec.err0) rec.err0 = String(e && e.stack || e).slice(0, 800); }
const COMP_K = ['champion', 'greataxe', 'spear', 'pike', 'dagger', 'archer', 'slinger', 'militia'];
const compOf = (c) => { if (!c) return null; const o = {}; for (const k of COMP_K) if (c[k]) o[k] = +c[k]; return o; };
let _today = -1;
function W(w) {
  const id = w && w.id; if (id == null) return null;
  let o = rec.wars[id];
  if (!o) o = rec.wars[id] = {
    id, atk: w.atk && w.atk.name, def: w.def && w.def.name, den: !!(w.def && w.def._den), casus: w.casus || null, force: w.force, warriors: w.warriors,
    comp: compOf(w.composition), weapQ: r3(w.weapQ), born: w.born, marchDays: w.marchDays, seen: _today,
    arrive: null, end: null, last: null, ops: [], hook: [], dcs: [], seg: [], res: [], set: [], logs: [],
  };
  return o;
}
// ── econ 편성 입력 사본(랩 `toBattleSpec` · `conscript` · `warCapture` 가 읽는 칸만 · 원시 값) ──
const NPC_K = ['currentJob', '_wsSword', '_wsSpear', '_wsSling', '_wsInit'];
function snapEcon(e) {
  if (!e || !e.npcs) return null;
  const npcs = e.npcs.map((n) => { const a = [n.currentJob || null, n.captive ? 1 : 0, (n.skills && n.skills.archery) || 0];
    for (let i = 1; i < NPC_K.length; i++) a.push(n[NPC_K[i]] == null ? null : n[NPC_K[i]]); return a; });
  const S = e.storage || {}, L = e.land || {};
  const counts = {}; if (e.counts) for (const k of Object.keys(e.counts)) { const v = e.counts[k]; if (typeof v === 'number') counts[k] = v; }
  return { n: e.npcs.length, npcs, counts, storage: { weapon: S.weapon || 0, stone: S.stone || 0, tin: S.tin || 0 },
    land: { tin: L.tin || 0, fertility: L.fertility || 0, water: L.water || 0, size: L.size || 0 },
    _swordFrac: e._swordFrac != null ? e._swordFrac : null, _weapQ: e._weapQ != null ? e._weapQ : null, _palisade: e._palisade || 0 };
}
// ── 몸 층 호스트 상태(t956 · t924 와 같은 문 — 빈 목 = 아무것도 안 덮는다) ──
let _vst = null;
function vstate() {
  if (_vst) return _vst;
  try { const k = require.resolve(path.join(ROOT, 'server', 'villages.js')); const m = require.cache[k]; if (m && m.exports && typeof m.exports.__p3Bind === 'function') _vst = m.exports.__p3Bind({}).state; } catch (e) { _vst = null; }
  return _vst;
}
// ── 그날 war-core 글 → 그 전쟁(두 마을 이름이 든 줄) ──
let _logBuf = [];
const KEEP = /선전포고|돌격 결단|출격\(sortie\)|철수|무혈 항복|무저항 함락|포로 \d|전투 |포위 개시|포위 유지|소굴#|앞 도착|방어 태세/;
function flushLogs(ws) {
  if (!_logBuf.length) return;
  for (const o of ws) { if (!o || o.logs.length >= LOG_MAX) continue;
    for (const [d, m] of _logBuf) { if (o.logs.length >= LOG_MAX) break; if (!KEEP.test(m)) continue; if ((o.atk && m.indexOf(o.atk) >= 0) && (o.def && m.indexOf(o.def) >= 0)) o.logs.push('D' + d + ' ' + m); } }
  _logBuf = [];
}
const WSN = (w) => (w.phase || '') + '/' + (w.op || '');
const cw = WCM.createWar;
WCM.createWar = function (opts) {
  const host = opts || {};
  const hostLog = typeof host.log === 'function' ? host.log : null;
  const hostEngage = host.onEngage;
  const o2 = Object.assign({}, host, {
    log: function (day, m) { try { if (_logBuf.length < 20000) _logBuf.push([day | 0, String(m)]); } catch (e) { err(e); } if (hostLog) return hostLog.apply(this, arguments); },
    onEngage: typeof hostEngage === 'function' ? function (w, day, why) {
      let pre = null;
      try {
        const o = W(w);
        if (o) {
          const A = w.atk && w.atk.econ, D = w.def && w.def.econ;
          pre = { day: day | 0, why, pre: WSN(w), aPop: A && A.npcs ? A.npcs.length : null, dPop: D && D.npcs ? D.npcs.length : null,
            J: (A && w.def) ? r3(WCM.warJustice(A, w.def.name, w.casus)) : null, aWeapQ: A && A._weapQ != null ? r3(A._weapQ) : null,
            pWin: r3(WCM._opAtkOdds(w)), pDef: r3(WCM._opDefOdds(w.def, w.force || 0)) };
          if (o.hook.filter((h) => h.snap).length < SNAP_MAX) pre.snap = { A: snapEcon(A), D: snapEcon(D) };
          o.hook.push(pre);
        }
      } catch (e) { err(e); }
      const took = hostEngage.apply(this, arguments);
      try { if (pre) { pre.took = !!took; pre.post = WSN(w); } } catch (e) { err(e); }
      return took;
    } : hostEngage,
  });
  const war = cw.call(this, o2);
  rec.hooked.war++;
  // 호스트가 부르는 방어 소집 편성(돌려준 값을 그대로 적는다 — 그 마을을 지키는 열린 전쟁에)
  const cs = war.conscript;
  if (typeof cs === 'function') war.conscript = function (v, mode, op) {
    const r = cs.apply(this, arguments);
    try {
      rec.hooked.conscript++;
      if (r && op && op.defense && v) for (const o of Object.values(rec.wars)) {
        if (o.end != null || o.def !== v.name || o.dcs.length >= 8) continue;
        o.dcs.push({ day: _today, mode, comp: compOf(r.composition), force: r.force, weapQ: r3(r.weapQ) });
      }
    } catch (e) { err(e); }
    return r;
  };
  // 정산(몸 교전 res · 소굴 headless) — 돌려준 사상 · 그 자리 포로 표
  const rb = war.warResolveBattle;
  if (typeof rb === 'function') war.warResolveBattle = function (w, day, pre) {
    let c0 = null; try { c0 = (war.stats().captured || 0); } catch (e) { err(e); }
    const r = rb.apply(this, arguments);
    try {
      rec.hooked.resolve++;
      const o = W(w);
      if (o) {
        const res = pre && pre.res ? pre.res : null;
        const cr = w._capResolve && w._capResolve.day === (day | 0) ? w._capResolve : null;
        o.res.push({ day: day | 0, path: res ? 'body' : (pre && pre.bodies ? 'den-headless' : 'headless'),
          res: res ? { winner: res.winner, atkStart: res.atkStart, atkDead: res.atkDead, defStart: res.defStart, defDead: res.defDead, routA: res.routA, routB: res.routB, t: res.tick } : null,
          ret: r ? { winner: r.winner, atkCas: r.atkCas, defCas: r.defCas } : null,
          cap: cr ? { side: cr.side, take: (cr.npcs || []).length, freed: cr.freedN || 0 } : null,
          capN: c0 != null ? (war.stats().captured || 0) - c0 : null });
      }
    } catch (e) { err(e); }
    return r;
  };
  const dl = war.daily;
  war.daily = function (day) {
    const pre = new Map();
    try { for (const w of war.WARS || []) pre.set(w.id, WSN(w)); } catch (e) { err(e); }
    const r = dl.apply(this, arguments);
    try {
      rec.hooked.daily++;
      const d0 = day | 0; _today = d0; rec.lastDay = d0;
      const seen = new Set(), touched = [];
      for (const w of war.WARS || []) {
        const o = W(w); if (!o) continue; seen.add(w.id); touched.push(o);
        const a = pre.get(w.id) || null, b = WSN(w);
        if (a !== b) o.ops.push([d0, a, b]);
        if (o.arrive == null && /\/camp$/.test(b) && a && /\/march$/.test(a)) o.arrive = d0;
        o.last = b;
      }
      for (const [id] of pre) if (!seen.has(id)) { const o = rec.wars[id]; if (o && o.end == null) { o.end = d0; touched.push(o); } }
      flushLogs(touched);
    } catch (e) { err(e); }
    return r;
  };
  return war;
};
// ── 교전 층 ──
const FS = new WeakMap();   // 교전(f) → 관찰 상태(세계 어댑터 셈 · 지금 마디)
function wrapWorld(f, st) {
  const wd = f.ctx && f.ctx.world; if (!wd || st.wd === wd) return;
  st.wd = wd; const c = st.wc;
  for (const [k, cnt, hit] of [['losBlocked', 'los', 'losB'], ['blocked', 'blk', 'blkB'], ['coverAt', 'cov', 'covB']]) {
    const fn = wd[k]; if (typeof fn !== 'function') continue;
    wd[k] = function () { const v = fn.apply(this, arguments); c[cnt]++; if (v) c[hit]++; return v; };
  }
  const fa = wd.advance; if (typeof fa === 'function') wd.advance = function () { const v = fa.apply(this, arguments); c.adv++; if (!v) c.advN++; return v; };
}
function sideTypes(f, s) {
  const o = {}; for (const u of f.ctx.units) { if (u.side !== s) continue; const t = o[u.type] || (o[u.type] = { n: 0, dead: 0, rout: 0 }); t.n++; if (u.hp <= 0) t.dead++; else if (u.routing) t.rout++; } return o;
}
function aliveTypes(f, s) { const o = {}; for (const u of f.ctx.units) { if (u.side !== s || u.hp <= 0) continue; o[u.type] = (o[u.type] || 0) + 1; } return o; }
function minCross(f) {
  let md = Infinity; const U = f.ctx.units;
  for (const a of U) { if (a.side !== 'A' || a.hp <= 0) continue; for (const b of U) { if (b.side !== 'B' || b.hp <= 0) continue; const d = (b.x - a.x) ** 2 + (b.y - a.y) ** 2; if (d < md) md = d; } }
  return md === Infinity ? null : r2(Math.sqrt(md));
}
function hpSum(f, s) { let h = 0; for (const u of f.ctx.units) if (u.side === s && u.hp > 0) h += u.hp; return h; }
function closeSeg(f, st, kind, day) {
  const g = st.seg; if (!g) return;
  const S = f.ctx.sides;
  g.end = kind; g.dayEnd = day; g.tEnd = r2(f.t); g.dur = r2(f.t - g.t0);
  g.deadA = (S.A.dead | 0) - g.dA0; g.deadB = (S.B.dead | 0) - g.dB0; g.startA = S.A.start | 0; g.startB = S.B.start | 0;
  g.hpLossA = r2(g.hpA0 - hpSum(f, 'A') - 0); g.hpLossB = r2(g.hpB0 - hpSum(f, 'B'));
  let rA = 0, rB = 0; for (const u of f.ctx.units) { if (u.hp > 0 && u.routing) { if (u.side === 'A') rA++; else rB++; } } g.routA = rA; g.routB = rB;
  g.endTypes = { A: aliveTypes(f, 'A'), B: aliveTypes(f, 'B') };
  const c = st.wc, c0 = g._wc0; g.world = {}; for (const k of Object.keys(c)) g.world[k] = c[k] - (c0[k] || 0);
  delete g._wc0; st.seg = null;
}
const cwl = WLM.createWarLive;
WLM.createWarLive = function (opts) {
  const WL = cwl.apply(this, arguments);
  rec.hooked.live++; rec.tickHz = WL.TICK_HZ;
  const dayOf = (opts && typeof opts.dayOf === 'function') ? opts.dayOf : () => _today;
  const sf = WL.stepFight, oa = WL.orderAdvance, se = WL.settle;
  const ST = (f) => { let st = FS.get(f); if (!st) { st = { wd: null, wc: { los: 0, losB: 0, blk: 0, blkB: 0, cov: 0, covB: 0, adv: 0, advN: 0 }, seg: null, n: 0 }; FS.set(f, st); } wrapWorld(f, st); return st; };
  WL.orderAdvance = function (f, side) {
    let st = null;
    try { st = ST(f); if (st.seg) closeSeg(f, st, 'reorder', dayOf() | 0); } catch (e) { err(e); }
    const r = oa.apply(this, arguments);
    try {
      const o = W(f.w);
      if (o && st) {
        const S = f.ctx.sides;
        st.seg = { day: dayOf() | 0, adv: side, holder: f.holder || null, t0: r2(f.t), steps: 0, engSteps: 0, cSteps: 0, tC: null, rel: null,
          dA0: S.A.dead | 0, dB0: S.B.dead | 0, hpA0: hpSum(f, 'A'), hpB0: hpSum(f, 'B'),
          typesAt0: { A: aliveTypes(f, 'A'), B: aliveTypes(f, 'B') }, first: null, _wc0: Object.assign({}, st.wc) };
        o.seg.push(st.seg);
      }
    } catch (e) { err(e); }
    return r;
  };
  WL.stepFight = function (f) {
    const ev = sf.apply(this, arguments);
    try {
      rec.hooked.step++;
      const st = ST(f), g = st.seg;
      if (g) {
        g.steps++;
        if (f.state === 'engaged') g.engSteps++;
        if (ev.contact) {
          g.cSteps++;
          if (g.tC == null) {
            g.tC = r2(f.t - g.t0);
            const ca = WL.centroid(f, 'A'), cb = WL.centroid(f, 'B'), M = WL.M_PER_CELL;
            const dv = f.w && f.w.def ? { x: (f.w.def.ccx + 0.5) * M, y: (f.w.def.ccy + 0.5) * M } : null;
            const mid = (ca && cb) ? { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 } : (ca || cb);
            let rects = null; const S = vstate();
            if (S && S._warRects && mid) { rects = 0; const cx = mid.x / M, cy = mid.y / M; for (const r of S._warRects) { const dx = Math.max(r[0] - cx, 0, cx - r[2] - 1), dy = Math.max(r[1] - cy, 0, cy - r[3] - 1); if (dx * dx + dy * dy <= 900) rects++; } }
            g.first = { types: { A: aliveTypes(f, 'A'), B: aliveTypes(f, 'B') }, mc: minCross(f), gap: (ca && cb) ? r2(Math.hypot(ca.x - cb.x, ca.y - cb.y)) : null,
              dVil: (mid && dv) ? r2(Math.hypot(mid.x - dv.x, mid.y - dv.y)) : null, rects30: rects,
              ammo: { A: [f.ctx.sides.A.arrows | 0, f.ctx.sides.A.stones | 0], B: [f.ctx.sides.B.arrows | 0, f.ctx.sides.B.stones | 0] } };
          }
        }
        if (g.rel == null && f.adv && f.adv.released) g.rel = r2(f.t - g.t0);
        if (ev.standoff) closeSeg(f, st, 'standoff', dayOf() | 0);
        else if (ev.rout) g.routEv = ev.rout;
      }
    } catch (e) { err(e); }
    return ev;
  };
  WL.settle = function (f, why, winner) {
    const done = !!(f && f.settled);
    const r = se.apply(this, arguments);
    try {
      rec.hooked.settle++;
      const st = FS.get(f); if (st && st.seg) closeSeg(f, st, 'settle:' + why, dayOf() | 0);
      const o = W(f.w);
      if (o && !done) o.set.push({ day: dayOf() | 0, why, winner: winner || null, t: r2(f.t), engagedOnce: !!f.engagedOnce, contacts: f.contacts | 0, standoffs: f.standoffs | 0,
        types: { A: sideTypes(f, 'A'), B: sideTypes(f, 'B') }, start: { A: f.ctx.sides.A.start | 0, B: f.ctx.sides.B.start | 0 }, dead: { A: f.ctx.sides.A.dead | 0, B: f.ctx.sides.B.dead | 0 },
        world: st ? Object.assign({}, st.wc) : null, qA: f.quality && f.quality.A ? r3(f.quality.A.weapQ) : null, qB: f.quality && f.quality.B ? r3(f.quality.B.weapQ) : null });
    } catch (e) { err(e); }
    return r;
  };
  return WL;
};
process.on('exit', () => {
  try {
    // 끝까지 안 닫힌 마디(판 끝 진행 중) — 표만
    for (const o of Object.values(rec.wars)) for (const g of o.seg) if (g._wc0) { g.end = 'open'; delete g._wc0; }
    fs.writeFileSync(OUT, JSON.stringify(rec));
  } catch (e) { /* 관측 실패는 판을 안 건드린다 */ }
});
