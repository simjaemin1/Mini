'use strict';
// (@regress 없음 — 러너 밖 · T1022 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1022-observe.js — 해체 마을 사람은 어디로 — 서버 판 자(`t577-server-run.js`) 곁 프리로드 ===
//   쓰는 법: NODE_OPTIONS="-r $PWD/scripts/diverge-ctl.js -r $PWD/scripts/t1022-observe.js" [T858_NO_SHIELD=1] [DCTL_SKIP=raid:n] node scripts/t577-server-run.js 800 1020
//            (아이 존만 · 판 JSON 곁 `<판>-<시드>.t1022.json` · 표는 `scripts/t1022-table.js`)
//   ★왜 [T984 → T1022 · 판정대기 3] 해체(→ 도적화) 마을의 사람이 실제로 어디로 가나 — 다른 마을 · 도적 · 길 위 죽음 · 그 자리 죽음 · 그대로 — 와 몸이 걸었나.
//   econ 사람은 **낱사람**이다(`vil.econ.npcs` — 객체 하나 = 한 사람 · 나이 `age` · 직업 `currentJob`). 그래서 수가 아니라 사람마다 끝을 쫓는다(객체 신원 · 사본 0).
//   뜨는 것(이미 있는 문 앞에서 읽기만 — 새 수 0):
//     ⓐ 해체 — 도적 하루(`bandits.dayTick` · ★T986 켬 기본 · 끔이면 `onGameTick`) 앞뒤로 마을마다 econ 명부를 견준다: 그날 `_banditized` 0 → 1 이 된 마을 = 해체.
//        빠진 사람 = 도적(그날 새 단 `home` = 그 마을 · 단 id · 은거지 칸) · 남은 사람 = 쫓을 사람.
//     ⓑ 남은 사람의 끝 — 그 마을 명부 배열에 **숨은 칸**(열거 안 됨 · 값 0)으로 `splice`/`pop`/`shift` 감싸개를 단다. 쫓는 사람이 빠지면 부른 자리(호출 스택의
//        제품 함수 이름 — diverge-ctl 문법)로 까닭을 적는다: `tickVillage`(econ 인구식 — 그날 `villageFamine` 이면 굶음 · 아니면 늙음) · `killTrader`(행상 피살) ·
//        `_killWarriors`(호위 전사) · `_warRemoveNpc`(전쟁 죽음) · `warCapture`(포로 → 다른 마을) · bandits `daily`(절망 이탈 → 도적 · 토벌 원정 전사) ·
//        `_t577Walk`(T577 ⓐ 후보 걷기 · 끔 기본) · 그 밖(스택 머리를 적는다). 빠진 뒤 다른 마을 명부에 나타나면 = 다른 마을(어디 · 곧은 거리).
//        판 끝까지 그 마을 명부에 있으면 = 그대로.
//     ⓒ 몸 — 해체 마을의 몸(`npcPids`)을 존 틱(`villages.onGameTick` 뒤)마다 본다: 명부에서 빠진 몸이 걷는 몸(`_bxExit === 'walk'`)이면 걸음을 표본으로 쫓는다.
//        표본 사이 거리 > 존 걸음(`zone.js MOVE_SPEED` 원문) × 그 사이 시간(몸 틱 상한 500ms) = 순간이동 표. 몸이 없어진 자리 ↔ 은거지 거리 · 누운 몸 · 몸 없이 사라짐도 적는다.
//     ⓓ 판정대기 3 근거 — 해체 그 순간 T577 ⓐ 규칙(곧은 거리 최근접 산 마을 · 해체 표 없는 곳)이 고를 마을과 교역로 거리 행렬(`world._distMatrix` — 읽기만)의
//        최근접이 같은가 · 그 길을 존 걸음으로 걸으면 며칠인가(이 판 하루 길이 ↔ 운영 하루 `zone-config dayLengthMs`).
//   ⚠값을 안 바꾼다: 숨은 칸은 배열 원소가 아니다(`JSON.stringify` · `length` · 순회 무변). 감싸개는 원 함수를 같은 인자로 부르고 그 돌려줌을 그대로 돌려준다.
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1022.json' : '';
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const Ev = require(path.join(ROOT, 'server', 'events'));
const SRC = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
const MOVE_SPEED = +((SRC('server/zone.js').match(/const MOVE_SPEED = (\d+(?:\.\d+)?);/) || [])[1] || 0);   // px/s — 존 걸음 정본(원문)
const OP_DAY_MS = (() => { const m = SRC('server/zone-config.js').match(/dayLengthMs:\s*(\d+)\s*\*\s*(\d+)\s*\*\s*(\d+)/); return m ? (+m[1]) * (+m[2]) * (+m[3]) : 0; })();   // 운영 하루(원문)
const TICK_CAP_MS = 500;   // `villages.js tickBodyExits` 의 dtMs 상한(원문 `Math.min(500, …)` — 새 수 아님 · 비교 잣대)
const rec = {
  ver: 1,
  knob: Object.fromEntries(['T858_NO_SHIELD', 'ENABLE_BANDITS', 'DCTL_SKIP', 'DCTL_ARM', 'T577_CAND_WALK', 'T577_RAMP', 'BANDIT_MINDAY', 'BANDIT_FIXTURE', 'VILLAGE_NPC_CAP', 'VILLAGE_DAY_MS', 'T986_BANDIT_DAY']
    .map((k) => [k, process.env[k] != null ? process.env[k] : null])),
  moveSpeed: MOVE_SPEED, opDayMs: OP_DAY_MS, dayMs: null,
  dis: [],          // 해체 마을마다 한 줄(아래 `mkDis`)
  gangsEnd: null,   // 판 끝 단 [id · n · home · born]
  lastDay: null, hooked: { day: 0, tick: 0 }, errs: [],
};
const err = (where, e) => { if (rec.errs.length < 40) rec.errs.push(where + ': ' + String(e && e.message || e)); };
let B = null, VL = null;                 // 제품 모듈(존이 이미 실은 그 인스턴스 — 첫 장부 날에 캐시에서 집는다)
const TR = new Map();                   // econ 사람 객체 → 쫓는 줄
const DIS = new Map();                  // 마을 dbId → 해체 줄(내부 — vil · 명부 · 몸)
const pending = new Set();              // 명부에서 빠졌는데 끝이 아직 안 정해진 사람
let curDay = 0;
const r1 = (x) => Math.round((+x || 0) * 10) / 10;
const _hold = { stack: '' };
const CAUSE = ['formGang', '_t577Walk', 'killTrader', '_killWarriors', '_warRemoveNpc', 'warCapture', '_capComplete', 'tickVillage', 'tickForceEvacuation', 'tickMigration', 'daily'];
function caller() {   // 호출 스택을 위로 훑어 처음 만나는 아는 제품 함수 이름(diverge-ctl `econCaller` 문법)
  const L = Error.stackTraceLimit; Error.stackTraceLimit = 16; Error.captureStackTrace(_hold, caller); Error.stackTraceLimit = L;
  const lines = String(_hold.stack).split('\n').slice(1);
  for (const ln of lines) {
    const m = /at (?:Object\.|Array\.)?([A-Za-z_$][\w$]*)/.exec(ln);
    if (!m) continue;
    if (m[1] === 'daily' && !/bandits\.js/.test(ln)) continue;
    if (m[1] === 'takeOne') return 'warCapture';
    if (CAUSE.includes(m[1])) return m[1];
  }
  return '?' + lines.slice(1, 4).map((s) => s.trim().replace(/^at /, '').replace(/\(.*[\/\\]/, '(')).join(' < ');
}
function noteGone(npc, arr) {
  const t = TR.get(npc); if (!t || t.fate || t.out) return;
  let day = curDay; try { const h = VL.banditHost(); if (h && h.world) day = h.world.day | 0; } catch (e) {}
  t.out = { day, by: caller() };
  const d = arr && arr.__t1022d;
  if (t.out.by === 'tickVillage' && d) { try { t.out.famine = !!VL.villageFamine(d.vil); } catch (e) { t.out.famine = null; } }
  pending.add(npc);
}
function wrapArr(arr, d) {   // 숨은 칸 — 원소 아님 · 열거 안 됨
  if (!arr || arr.__t1022d) return;
  Object.defineProperty(arr, '__t1022d', { value: d, enumerable: false, configurable: true, writable: true });
  for (const fn of ['splice', 'pop', 'shift']) {
    const P = Array.prototype[fn];
    Object.defineProperty(arr, fn, { enumerable: false, configurable: true, writable: true, value: function () {
      const r = P.apply(this, arguments);
      try { if (TR.size) { if (fn === 'splice') { for (const x of r) noteGone(x, this); } else if (r !== undefined) noteGone(r, this); } } catch (e) { err('wrap', e); }
      return r;
    } });
  }
}
// 하루 앞 — 해체 표 없는 마을의 명부 사본(참조만) · 단 id
function before() {
  const host = VL.banditHost(); if (!host) return null;
  const pre = new Map();
  for (const v of host.villages) if (v.econ && !v.econ._banditized && v.econ.npcs.length) pre.set(v, v.econ.npcs.slice());
  return { host, pre, gangs: new Set(B.gangs().map((g) => g.id)), stats: Object.assign({}, B.stats()) };
}
function nearest(host, vil) {   // ⓓ T577 ⓐ 규칙(곧은 거리 · 산 마을 · 해체 표 없는 곳) ↔ 교역로 거리 행렬 최근접(읽기만)
  const V = host.villages, mat = host.world && host.world._distMatrix, iv = V.indexOf(vil);
  let s = null, sd = Infinity, r = null, rd = Infinity;
  V.forEach((v, j) => {
    if (v === vil || !v.econ || !v.econ.npcs.length || v.econ._banditized) return;
    const d = Math.hypot(v.ccx - vil.ccx, v.ccy - vil.ccy);
    if (d < sd) { sd = d; s = j; }
    const m = mat && mat[iv] ? mat[iv][j] : undefined;
    if (m != null && isFinite(m) && m < rd) { rd = m; r = j; }
  });
  const mv = (j) => (j == null ? null : (mat && mat[iv] && mat[iv][j] != null ? (isFinite(mat[iv][j]) ? r1(mat[iv][j] / 2.5) : 'inf') : null));
  const ppd = (ms) => (MOVE_SPEED / 1000) * ms;   // 하루 걸음(px) — `_t765Depart` 의 ppd 그 식
  const days = (cells, ms) => (cells == null || cells === 'inf' || !(ms > 0) ? null : +((cells * 32) / ppd(ms)).toFixed(3));
  const sc = s == null ? null : mv(s);
  return {
    straight: s == null ? null : { to: V[s].name, cells: r1(sd), routeCells: sc, pop: V[s].econ.npcs.length },
    route: r == null ? null : { to: V[r].name, cells: r1(Math.hypot(V[r].ccx - vil.ccx, V[r].ccy - vil.ccy)), routeCells: mv(r), pop: V[r].econ.npcs.length },
    same: s != null && s === r,
    //   길 위 날 — 교역로 거리(셀 · 행렬 = 셀 × 2.5 의 비용 가중 — 몸 길 `getRoute` 길이와 같지 않다 · 크기만) ÷ 하루 걸음 · 이 판 하루 ↔ 운영 하루
    walkDays: { run: days(sc, host.dayMs), op: days(sc, OP_DAY_MS), straightRun: days(s == null ? null : sd, host.dayMs), straightOp: days(s == null ? null : sd, OP_DAY_MS) },
  };
}
function after(P) {
  if (!P) return;
  const { host, pre } = P;
  const day = host.world.day | 0; curDay = day;
  for (const [v, list] of pre) {
    if (!v.econ._banditized) continue;
    const now = new Set(v.econ.npcs);
    const out = list.filter((x) => !now.has(x));
    const g = B.gangs().find((x) => !P.gangs.has(x.id) && x.home === v.name) || null;
    const st = B.stats();
    const d = {
      v: v.name, dbId: v.dbId, day, pop0: list.length, toBandit: out.length,
      gang: g ? { id: g.id, n: g.n, camp: g.camp ? [g.camp.cx, g.camp.cy] : null } : null,
      convDelta: (st.conv || 0) - (P.stats.conv || 0), stay: v.econ.npcs.length,
      peak: v.econ._bdtPeak || null, fall: v.econ._bdtFall || null,
      age0: { bandit: out.map((x) => r1(x.age)), stay: v.econ.npcs.map((x) => r1(x.age)) },
      near: null, people: [], births: 0, popAt: [[day, v.econ.npcs.length]], gangEnd: null, bodies: [], bodyNote: { inVil0: (v.npcPids || []).length },
    };
    try { d.near = nearest(host, v); } catch (e) { err('near', e); }
    //   단의 몸 — 도적 하루 끝(`syncBodies`)이 은거지 곁에 세운 몸(그날 · 마을에서 걸어온 몸이 아니다)
    try { const bm = B._t765Probe && B._t765Probe.bodies(); const pids = (g && bm && bm.get(g.id)) || [];
      d.gangBodies = pids.map((pid) => { const p = host.players && host.players.get(pid); return p ? r1(Math.hypot(p.x / 32 - v.ccx, p.y / 32 - v.ccy)) : null; }); } catch (e) { err('gb', e); }
    for (const x of v.econ.npcs) { const t = { vid: v.dbId, k: d.people.length, age: r1(x.age), job: x.currentJob, fate: null, day: null, cause: null, to: null, cells: null }; d.people.push(t); TR.set(x, t); }
    rec.dis.push(d);
    const inner = { d, vil: v, known: new Set(v.npcPids || []), last: new Map(), walk: new Map(), seen: new Set(v.econ.npcs) };
    for (const pid of inner.known) { const p = host.players && host.players.get(pid); if (p) inner.last.set(pid, [p.x, p.y]); }
    DIS.set(v.dbId, inner);
    wrapArr(v.econ.npcs, inner);
  }
  // 절망 이탈 · 토벌 원정 전사(bandits `daily` 안의 두 줄) — 그날 그 마을 `_bdtExoAt` 로 가른다
  for (const npc of pending) {
    const t = TR.get(npc);
    if (t && t.out && t.out.by === 'daily' && t.out.day === day && t.out.split == null) {
      const inner = DIS.get(t.vid);
      t.out.split = inner && inner.vil.econ._bdtExoAt === day ? 'desert' : 'expedition';
    }
  }
  sweep(host, day);
}
function sweep(host, day) {   // 빠진 사람이 다른 마을에 나타났나 · 길 위 장부(T765)에 있나 → 끝을 정한다
  for (const inner of DIS.values()) {   // 그 마을 명부 — 새 사람(출생 · 받음) 셈 · 인구 줄
    const e = inner.vil.econ;
    if (e.npcs !== inner.arr) { if (inner.arr) wrapArr(e.npcs, inner); inner.arr = e.npcs; }
    for (const x of e.npcs) if (!inner.seen.has(x)) { inner.seen.add(x); if (!TR.has(x)) inner.d.births++; }
    if (day % 10 === 0) inner.d.popAt.push([day, e.npcs.length]);
  }
  if (!pending.size) return;
  const where = new Map();
  for (const v of host.villages) if (v.econ) for (const x of v.econ.npcs) if (TR.has(x)) where.set(x, v);
  let road = null; try { road = new Set(((B._t765Probe && B._t765Probe.ledger()) || []).map((w) => w.npc)); } catch (e) { road = new Set(); }
  for (const npc of [...pending]) {
    const t = TR.get(npc); if (!t || t.fate) { pending.delete(npc); continue; }
    const inner = DIS.get(t.vid);
    const w = where.get(npc);
    if (w && inner && w === inner.vil) { t.out = null; pending.delete(npc); continue; }   // 다시 제 마을(포로 귀향 등)
    if (w) { setFate(t, '다른 마을', t.out ? t.out.by : '?', day, w, inner && inner.vil); pending.delete(npc); continue; }
    if (road.has(npc)) { t.onRoad = t.onRoad || day; continue; }   // 길 위(T765 장부) — 닿는 날 다른 마을
    if (t.out && t.out.day < day - 1) { finalizeGone(t); pending.delete(npc); }   // 하루 넘게 어디에도 없다 = 빠진 문의 끝
  }
}
function setFate(t, fate, cause, day, to, from) {
  t.fate = fate; t.cause = cause; t.day = day;
  if (to) { t.to = to.name; if (from) t.cells = r1(Math.hypot(to.ccx - from.ccx, to.ccy - from.ccy)); }
}
function finalizeGone(t) {
  const o = t.out || {}; const by = o.by || '?';
  const F = {
    formGang: ['도적', '해체 단'], daily: [o.split === 'desert' ? '도적' : '그 밖 죽음', o.split === 'desert' ? '절망 이탈' : '토벌 원정 전사'],
    killTrader: ['길 위 죽음', '행상 피살'], _killWarriors: ['길 위 죽음', '호위 전사'], _warRemoveNpc: ['그 밖 죽음', '전쟁'],
    tickVillage: ['그 자리 죽음', o.famine ? '굶음' : '늙음'], warCapture: ['다른 마을', '포로(편입 전 사라짐)'], _capComplete: ['다른 마을', '포로 귀향'],
    _t577Walk: ['길 위', 'T577 ⓐ 걷기'], tickForceEvacuation: ['다른 마을', '강제 소개'], tickMigration: ['다른 마을', '이주'],
  }[by] || ['모름', by];
  setFate(t, F[0], F[1], o.day);
}
function ganglines() { try { return B.gangs().map((g) => [g.id, g.n, g.home, g.born]); } catch (e) { return null; } }
// ⓒ 몸 — 존 틱 뒤
let prevNow = 0;
function bodyTick(now) {
  if (!DIS.size || !VL) return;
  const host = VL.banditHost(); if (!host || !host.players) return;
  const P = host.players, sp = MOVE_SPEED / 1000;
  for (const inner of DIS.values()) {
    const v = inner.vil, ids = new Set(v.npcPids || []);
    for (const pid of ids) { if (!inner.known.has(pid)) inner.known.add(pid); const p = P.get(pid); if (p) inner.last.set(pid, [p.x, p.y, now]); const W0 = inner.walk.get(pid); if (W0 && !W0.end && W0.kind === 'other') inner.walk.delete(pid); }   // 명부로 돌아온 몸(출정 귀환 등) — 나감 아님
    for (const pid of inner.known) {
      if (ids.has(pid)) continue;
      const p = P.get(pid);
      let W = inner.walk.get(pid);
      if (!W) {
        const l = inner.last.get(pid) || null;
        W = { pid, day0: curDay, kind: p ? (p._bxExit || 'other') : 'gone', from: l ? [Math.round(l[0]), Math.round(l[1])] : null, n: 0, maxR: 0, jumps: 0, len: 0, end: null, day1: null, lastAt: now, lastMv: now, x: p ? p.x : null, y: p ? p.y : null };
        if (p && l) { const dd = Math.hypot(p.x - l[0], p.y - l[1]); const lim = sp * Math.min(TICK_CAP_MS, Math.max(1, now - (l[2] || prevNow))) * 1.001 + 0.01; if (dd > lim) { W.jumps++; W.firstJump = Math.round(dd); } }
        inner.walk.set(pid, W);
        if (!p) { W.end = 'vanish'; W.day1 = curDay; inner.d.bodies.push(W); continue; }
      }
      if (W.end) continue;
      if (!p) {   // 거둬졌다 — 은거지(단) 칸까지 거리
        W.end = 'collected'; W.day1 = curDay;
        const g = inner.d.gang;
        if (g && g.camp && W.x != null) W.toCamp = r1(Math.hypot(W.x - (g.camp[0] * 32 + 16), W.y - (g.camp[1] * 32 + 16)) / 32);
        W.at = [Math.round(W.x), Math.round(W.y)]; delete W.x; delete W.y; delete W.lastAt; delete W.lastMv;
        inner.d.bodies.push(W); continue;
      }
      if (W.kind !== 'walk') { if (p._bxExit === 'walk') W.kind = 'walk'; else { W.x = p.x; W.y = p.y; continue; } }
      const dd = Math.hypot(p.x - W.x, p.y - W.y);
      if (dd > 0) {
        const lim = sp * Math.min(TICK_CAP_MS, Math.max(1, now - W.lastMv)) * 1.001 + 0.01;
        const r = dd / Math.max(1e-9, sp * Math.min(TICK_CAP_MS, Math.max(1, now - W.lastMv)));
        if (r > W.maxR) W.maxR = +r.toFixed(3);
        if (dd > lim) W.jumps++;
        W.len += dd; W.lastMv = now;
      }
      W.n++; W.x = p.x; W.y = p.y; W.lastAt = now;
    }
  }
  prevNow = now;
}
let hooked = false;
function hook() {
  hooked = true;
  B = require(path.join(ROOT, 'server', 'bandits'));
  VL = require(path.join(ROOT, 'server', 'villages'));
  const on986 = (() => { try { return !!B.t986().on; } catch (e) { return true; } })();
  const name = on986 ? 'dayTick' : 'onGameTick';
  const f0 = B[name];
  B[name] = function () {
    let P = null; try { const ld = B.t986().lastDay; const h = VL.banditHost(); if (h && h.world && (h.world.day | 0) !== ld) { P = before(); curDay = h.world.day | 0; } } catch (e) { err('before', e); }
    const r = f0.apply(this, arguments);
    try { if (P) { rec.hooked.day++; after(P); } } catch (e) { err('after', e); }
    return r;
  };
  const g0 = VL.onGameTick;
  VL.onGameTick = function (now) {
    const r = g0.apply(this, arguments);
    try { rec.hooked.tick++; bodyTick(now); } catch (e) { err('tick', e); }
    return r;
  };
  try { const h = VL.banditHost(); if (h) rec.dayMs = h.dayMs; } catch (e) {}
}
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  try { if (!hooked) hook(); } catch (e) { err('hook', e); }   // 장부가 서는 때 — 존이 두 모듈을 이미 실었다(캐시에서 집는다)
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try { if (!hooked) hook(); rec.lastDay = day | 0; if (rec.dayMs == null) { const h = VL.banditHost(); if (h) rec.dayMs = h.dayMs; } } catch (e) { err('scan', e); }
    return sd.apply(this, arguments);
  };
  return L;
};
process.on('exit', () => {
  try {
    const host = VL && VL.banditHost();
    for (const npc of [...pending]) { const t = TR.get(npc); if (t && !t.fate) finalizeGone(t); }
    for (const inner of DIS.values()) {
      const e = inner.vil.econ, here = new Set(e.npcs);
      inner.d.popEnd = e.npcs.length;
      for (const [npc, t] of TR) if (!t.fate && t.vid === inner.d.dbId) {
        if (here.has(npc)) setFate(t, '그대로', '판 끝 제 마을', null);
        else if (t.onRoad) setFate(t, '길 위', '판 끝 길 위', t.onRoad);
        else setFate(t, '모름', '판 끝 어디에도 없음', null);
      }
      for (const W of inner.walk.values()) if (!W.end) { W.end = 'open'; W.at = W.x != null ? [Math.round(W.x), Math.round(W.y)] : null; delete W.x; delete W.y; delete W.lastAt; delete W.lastMv; inner.d.bodies.push(W); }
      const g = inner.d.gang && (B.gangs() || []).find((x) => x.id === inner.d.gang.id);
      inner.d.gangEnd = g ? { n: g.n } : { gone: true };
      for (const W of inner.d.bodies) if (W.len != null) W.len = r1(W.len / 32);
    }
    rec.gangsEnd = ganglines();
    try { rec.bodyExit = VL.bodyExitStats(); } catch (e) {}
    if (host) rec.dayMs = host.dayMs;
    fs.writeFileSync(OUT, JSON.stringify(rec));
  } catch (e) { try { fs.writeFileSync(OUT, JSON.stringify(Object.assign(rec, { exitErr: String(e && e.stack) }))); } catch (e2) {} }
});
