'use strict';
// (@regress 없음 — 하네스가 쓰는 정본 · 쓰는 자: `e2e-xzone-caravan.js` ⓚ · `t1292-xzone-live.js analyze`)
// === scripts/fixture-xz-bodylog.js — [T1292] 존을 넘는 캐러밴 몸이 **사라지거나 둘이 되는가** — 적기 · 맞대기 정본 ==========================
//
// ★왜(캐논 797 — 모든 NPC 는 언제나 몸이 있다 · 경계에서 사라지거나 둘이 되면 안 된다):
//   T1292 두 존 판이 잡았다 — 종전 넘김은 받는 존이 몸을 세운 **뒤** 보낸 존이 답을 듣고서야 지웠다 ⇒ 넘김마다 같은 몸이 두 존에 함께 보였다.
//   이 정본이 두 존의 몸 표를 **한 시계**로 적고 맞대 그 틈과 겹침을 센다(한 기계의 두 프로세스 — `performance.timeOrigin + now()` 가 같은 시계).
//
// ① 적기(존 프로세스에 `-r` 또는 NODE_OPTIONS `--require` · env `XZ_BODYLOG=<파일>` 이 있을 때만 깬다 — 없으면 아무것도 안 한다):
//    villages.js 적재 순간 끝에 한 줄(`globalThis.__xzBodyLog = () => state` — 읽는 창 · 동작 0)을 붙이고, 사건이 나는 **그 자리에서** 한 줄씩:
//      몸 표(`state.caravanBodies`)의 넣기 `set` · 빼기 `del`(경계를 아는 몸 `_xz` 만 · 열쇠) · 경계 표(`state.xzone.trace`)의 줄 전부 `tr`(hide · unhide · out · back · in · home · gone …)
//    미끼(`XZ_BAIT` — 메모리에서만 villages.js 글자를 바꾼다 · 바꿀 글자가 없으면 크게 죽는다 = 미끼가 낡으면 안 숨는다):
//      `nodel`   넘김 답(받았다)을 듣고도 보낸 존이 몸을 안 지운다
//      `nospawn` 받는 존이 기록만 받고 몸을 안 세운다
// ② 맞대기(`analyze(사건들)`) — 논리 몸 = (집 존, 캐러밴 id): 집 존 열쇠 `id` · 이웃 존 열쇠 `xz:<집>:<id>`.
//    보이는 구간 = 표에 있고 숨기지 않은 때(`hide` ~ `unhide`/빼기는 빠진다 — 숨긴 몸은 그 존에 없다: 사람 넘기 껍데기 `handingOff` 와 같은 뜻 ·
//      안 보이고 · 안 맞고 · 짐승 · 도적 눈에 없다). 표 구간 = 표에 있는 때(숨김 포함 — 데이터상 몸).
//    · 두 존 동시(both)   — 같은 몸의 보이는 구간이 두 존에서 겹친 때(ms) — 0 이어야
//    · 넘김(handoffs)     — 보이는 구간을 시작 순으로 놓아 존이 바뀌는 이음마다 틈 = 다음 시작 − 앞 끝(+ 어디에도 안 보임 · − 두 존 동시)
//    · 사라짐(vanished)   — 넘기려고 끝난 보이는 구간(숨김 · 'out'/'back' 이 같이 선 빼기) 뒤에 어느 존에서도 다시 안 선 몸
//                          (판 끝 `tailMs` 안의 것은 넘는 중 — 안 센다 · 집 존에서 그냥 빠진 몸 = 집에 닿음 · 은퇴 — 넘김이 아니다)
//    · 표 틈(mapGap)      — 같은 몸이 어느 존 표에도 없던 때(표 구간의 합이 끊김 · 넘김 안에서) — 0 이어야(데이터상 몸은 언제나 있다)
//    · 숨김(hidden)       — 숨긴 때 ~ 풀린 때(빼기 · 드러냄) · 판 끝에도 안 풀린 것(`left` · `tailMs` 밖) — 0 이어야
const fs = require('fs');
const path = require('path');

const VJS = path.join('server', 'villages.js');
const BAITS = {
  nodel: [['walked = body._xzWalked || null;} despawnCaravanNpc(body); state.caravanBodies.delete(key); }', 'walked = body._xzWalked || null;} }']],
  nospawn: [['try { _xzBodyIn(r, g, peer, data.esc); } catch (e) {', 'try { if (0) _xzBodyIn(r, g, peer, data.esc); } catch (e) {']],
};

let _isMain = true; try { _isMain = require('worker_threads').isMainThread; } catch (e) {}
if (process.env.XZ_BODYLOG && _isMain) install(process.env.XZ_BODYLOG, process.env.XZ_BAIT || '');

function install(FILE, BAIT) {
  const Module = require('module');
  const _compile = Module.prototype._compile;
  const bait = BAIT ? BAITS[BAIT] : null;
  if (BAIT && !bait) throw new Error(`fixture-xz-bodylog: 모르는 미끼 ${BAIT}`);
  Module.prototype._compile = function (content, filename) {
    if (filename.endsWith(VJS)) {
      if (bait) for (const [a, b] of bait) {
        if (content.split(a).length !== 2) throw new Error(`fixture-xz-bodylog: 미끼 ${BAIT} 글자가 villages.js 에 한 번이 아니다(하네스가 낡았다)`);
        content = content.replace(a, b);
      }
      content += '\n;globalThis.__xzBodyLog = function () { return state; };\n';
    }
    return _compile.call(this, content, filename);
  };
  const { performance } = require('perf_hooks');
  const NOW = () => performance.timeOrigin + performance.now();
  let buf = [];
  const ev = (o) => { o.t = +NOW().toFixed(3); buf.push(JSON.stringify(o)); };
  const flush = () => { if (!buf.length) return; try { fs.appendFileSync(FILE, buf.join('\n') + '\n'); } catch (e) {} buf = []; };
  if (BAIT) ev({ z: process.env.ZONE_ID || null, op: 'bait', bait: BAIT });
  let wMap = null, wTrace = null;
  const iv = setInterval(() => {
    const st = typeof globalThis.__xzBodyLog === 'function' ? globalThis.__xzBodyLog() : null;
    if (!st) return;
    const M = st.caravanBodies;
    if (M && M !== wMap) {   // 표가 갈리면(새 Map) 다시 감싼다
      wMap = M;
      const _set = M.set.bind(M), _del = M.delete.bind(M);
      M.set = function (k, b) { const had = M.has(k); const r = _set(k, b); if (!had && b && b._xz) ev(Object.assign({ z: st.zoneId, op: 'set', key: String(k), ph: b.phase || null }, escOf(st, b))); return r; };
      M.delete = function (k) { const b = M.get(k); const r = _del(k); if (r && b && b._xz) ev({ z: st.zoneId, op: 'del', key: String(k), ph: b.phase || null }); return r; };
    }
    const X = st.xzone;
    if (X && X.trace && X.trace !== wTrace) {   // 고리(400) 밖으로 밀리기 전에 그 자리에서 받아 적는다
      wTrace = X.trace;
      const T = X.trace;
      T.push = function (...a) { for (const e of a) { const o = Object.assign({ z: st.zoneId, op: 'tr' }, e); if (e.k === 'hide' && e.key != null) Object.assign(o, escOf(st, M.get(e.key))); ev(o); } return Array.prototype.push.apply(T, a); };
    }
  }, 20);
  const fv = setInterval(flush, 200);
  if (iv.unref) iv.unref(); if (fv.unref) fv.unref();
  process.on('exit', flush);
}

//   호위 몸 수 — 표에 든 그 순간(`set` — 막 세운 호위 · `_xzMakeBody` 가 호위를 단 뒤 표에 넣는다)과 넘기려 숨는 그 순간(`hide` — 보내는 순간 산 호위)의
//     몸 표 열쇠의 호위(`escN` 단 수 · `escA` 산 수 — 사람 표 `players` 에 있고 hp > 0). 사람 표는 존 `deps.players`(villages.js 가 쓰는 그 표 · 읽기만).
function escOf(st, b) {
  const P = st && st.deps && st.deps.players, E = (b && b.escorts) || [];
  let a = 0; if (P) for (const e of E) { const p = P.get(e.pid); if (p && p.hp > 0) a++; }
  return { escN: E.length, escA: a };
}

// ── 맞대기 ──────────────────────────────────────────────────────────────────────────────────────────────
function readFiles(files) {
  const EV = [];
  for (const f of files) { let L = []; try { L = fs.readFileSync(f, 'utf8').split('\n'); } catch (e) {} for (const l of L) if (l) { try { EV.push(JSON.parse(l)); } catch (e) {} } }
  return EV;
}
function analyze(EV0, o) {
  o = o || {};
  const tailMs = o.tailMs != null ? o.tailMs : 10000;
  const EV = EV0.slice().sort((a, b) => a.t - b.t);
  const tEnd = o.tEnd != null ? o.tEnd : (EV.length ? EV[EV.length - 1].t : 0);
  const logical = (z, key) => { const s = String(key); if (s.startsWith('xz:')) { const p = s.split(':'); return { lid: `${p[1]}:${p.slice(2).join(':')}`, home: p[1] }; } return { lid: `${z}:${s}`, home: z }; };
  const B = new Map();   // lid → { home, z: { zone: { inMap, hidden, v, m, h } }, vis: [], map: [], hid: [] }
  const get = (lid, home) => { let b = B.get(lid); if (!b) { b = { home, z: {}, vis: [], map: [], hid: [] }; B.set(lid, b); } return b; };
  const zs = (b, z) => b.z[z] || (b.z[z] = { inMap: false, hidden: false, v: null, m: null, h: null });
  const handTr = [];     // 넘김 줄(out · back) — 그 빼기가 넘김 빼기인지 가른다
  const step = (b, z, t, why, x) => {
    const s = zs(b, z), vis = s.inMap && !s.hidden;
    if (vis && s.v == null) s.v = { a: t, from: why, escIn: (why === 'set' && x && x.escN != null) ? x.escN : null };
    else if (!vis && s.v != null) { b.vis.push({ z, a: s.v.a, b: t, from: s.v.from, end: why, escIn: s.v.escIn, escOut: (why === 'hide' && x && x.escA != null) ? x.escA : null }); s.v = null; }
    if (s.inMap && s.m == null) s.m = t;
    else if (!s.inMap && s.m != null) { b.map.push({ z, a: s.m, b: t }); s.m = null; }
    if (s.inMap && s.hidden && s.h == null) s.h = t;
    else if (!(s.inMap && s.hidden) && s.h != null) { b.hid.push({ z, a: s.h, b: t, end: why }); s.h = null; }
  };
  for (const e of EV) {
    if (e.op === 'set' || e.op === 'del') {
      const L = logical(e.z, e.key), b = get(L.lid, L.home), s = zs(b, e.z);
      s.inMap = e.op === 'set'; if (e.op === 'set') s.hidden = false;
      step(b, e.z, e.t, e.op, e);
    } else if (e.op === 'tr' && (e.k === 'hide' || e.k === 'unhide') && e.key != null) {
      const L = logical(e.z, e.key), b = get(L.lid, L.home), s = zs(b, e.z);
      s.hidden = e.k === 'hide';
      step(b, e.z, e.t, e.k, e);
    } else if (e.op === 'tr' && (e.k === 'out' || e.k === 'back') && e.id != null) {
      const key = e.k === 'out' ? String(e.id) : `xz:${e.toZone}:${e.id}`;   // 'out' = 집 존이 민 몸(열쇠 id) · 'back' = 이웃 존이 돌려보낸 몸(열쇠 xz:<집>:<id>)
      handTr.push({ lid: logical(e.z, key).lid, z: e.z, t: e.t });
    }
  }
  for (const [, b] of B) for (const [z, s] of Object.entries(b.z)) {   // 판 끝에 열린 구간
    if (s.v != null) b.vis.push({ z, a: s.v.a, b: tEnd, from: s.v.from, end: 'open', escIn: s.v.escIn, escOut: null });
    if (s.m != null) b.map.push({ z, a: s.m, b: tEnd, open: true });
    if (s.h != null) b.hid.push({ z, a: s.h, b: tEnd, end: 'open' });
  }
  const handDel = (lid, z, t) => handTr.some((h) => h.lid === lid && h.z === z && Math.abs(h.t - t) < 1000);
  const both = [], hand = [], vanished = [], mapGap = [], hidden = [], hiddenLeft = [], esc = [], escWay = [], within = [];
  let mapBothMs = 0, mapBothN = 0;
  for (const [lid, b] of B) {
    const V = b.vis.slice().sort((x, y) => x.a - y.a);
    for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) {
      if (V[i].z === V[j].z) continue;
      const a = Math.max(V[i].a, V[j].a), e = Math.min(V[i].b, V[j].b);
      if (e > a) both.push({ lid, ms: +(e - a).toFixed(3), za: V[i].z, zb: V[j].z, at: +a.toFixed(3) });
    }
    for (let i = 0; i + 1 < V.length; i++) {
      if (V[i].z !== V[i + 1].z) {
        const dir = V[i].z === b.home ? 'out' : 'back';
        hand.push({ lid, from: V[i].z, to: V[i + 1].z, dir, ms: +(V[i + 1].a - V[i].b).toFixed(3), endWhy: V[i].end, startWhy: V[i + 1].from });
        //   어디에도 안 보인 틈 ≤ 한 넘김 시간(보낸 존이 숨긴 때 ~ 답을 듣고 지운 때) — 숨김으로 끝난 구간만(숨김 끔 판은 넘김 시간을 모른다)
        if (V[i].end === 'hide') { const h = b.hid.find((x) => x.z === V[i].z && Math.abs(x.a - V[i].b) < 0.001); if (h) within.push({ lid, gap: V[i + 1].a - V[i].b, hand: h.b - h.a, open: h.end === 'open' }); }
        //   호위 몸 수 — 보내는 순간 산 호위(숨김 `escA`) ↔ 받는 존이 세운 호위(`set` `escN`) · 둘 다 적힌 넘김만(숨김 끔 판 · 적기 앞 판은 없다)
        if (V[i].escOut != null && V[i + 1].escIn != null) esc.push({ lid, dir, out: V[i].escOut, in: V[i + 1].escIn, d: V[i + 1].escIn - V[i].escOut });
      }
    }
    //   한 존 안 길 위 — 그 존이 세운 호위(`set`) ↔ 그 존을 떠나며 숨는 순간 산 호위(길 위에서 죽은 호위)
    for (const v of V) if (v.escIn != null && v.escOut != null) escWay.push({ lid, z: v.z, in: v.escIn, out: v.escOut, d: v.escOut - v.escIn });
    const last = V[V.length - 1];
    if (last && last.end !== 'open') {
      const handing = last.end === 'hide' || (last.end === 'del' && handDel(lid, last.z, last.b));
      if (handing && tEnd - last.b > tailMs) vanished.push({ lid, z: last.z, t: +last.b.toFixed(3), why: last.end });
    }
    const M = b.map.slice().sort((x, y) => x.a - y.a);
    let reach = M.length ? M[0].b : null;
    for (let i = 1; i < M.length; i++) {
      if (M[i].a > reach) mapGap.push({ lid, ms: +(M[i].a - reach).toFixed(3), z: M[i].z, at: +reach.toFixed(3) });
      reach = Math.max(reach, M[i].b);
    }
    for (let i = 0; i < M.length; i++) for (let j = i + 1; j < M.length; j++) {
      if (M[i].z === M[j].z) continue;
      const a = Math.max(M[i].a, M[j].a), e = Math.min(M[i].b, M[j].b);
      if (e > a) { mapBothN++; mapBothMs += e - a; }
    }
    for (const h of b.hid) {
      if (h.end === 'open') { if (tEnd - h.a > tailMs) hiddenLeft.push({ lid, z: h.z, since: +h.a.toFixed(3), ms: +(tEnd - h.a).toFixed(3) }); }
      else hidden.push({ lid, z: h.z, ms: +(h.b - h.a).toFixed(3), end: h.end });
    }
  }
  const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2) : null; };
  const st = (a) => ({ n: a.length, p50: q(a, 0.5), p95: q(a, 0.95), max: a.length ? +Math.max(...a).toFixed(2) : null });
  const pos = hand.filter((h) => h.ms >= 0).map((h) => h.ms);
  return {
    logical: B.size, handoffs: hand.length,
    byDir: { out: hand.filter((h) => h.dir === 'out').length, back: hand.filter((h) => h.dir === 'back').length },
    byWhy: hand.reduce((m, h) => { const k = `${h.endWhy}→${h.startWhy}`; m[k] = (m[k] || 0) + 1; return m; }, {}),   // 보낸 존 구간 끝 까닭 → 받는 존 구간 시작 까닭(숨김 켬 판 = hide→set)
    neither: Object.assign(st(pos), { le100ms: pos.filter((x) => x <= 100).length, le1s: pos.filter((x) => x > 100 && x <= 1000).length, le5s: pos.filter((x) => x > 1000 && x <= 5000).length, gt5s: pos.filter((x) => x > 5000).length }),
    both: Object.assign(st(both.map((x) => x.ms)), { totalMs: +both.reduce((s, x) => s + x.ms, 0).toFixed(2), sample: both.slice(0, 5) }),
    vanished: { n: vanished.length, sample: vanished.slice(0, 8) },
    mapGap: Object.assign(st(mapGap.map((x) => x.ms)), { sample: mapGap.slice(0, 5) }),
    mapBoth: { n: mapBothN, totalMs: +mapBothMs.toFixed(2) },
    //   어디에도 안 보인 틈이 한 넘김 시간(숨김 ~ 지움) 안인가 — `over` 0 이어야(카드 "어디에도 없는 틱 ≤ 한 넘김 시간")
    within: { n: within.length, over: within.filter((x) => !x.open && x.gap > x.hand + 0.001).length, overSample: within.filter((x) => !x.open && x.gap > x.hand + 0.001).slice(0, 3) },
    hidden: Object.assign(st(hidden.map((x) => x.ms)), { left: hiddenLeft.length, leftSample: hiddenLeft.slice(0, 5), byEnd: hidden.reduce((m, x) => (m[x.end] = (m[x.end] || 0) + 1, m), {}) }),
    //   호위 몸 수 보존 — 넘김마다 보낸 산 호위 = 받는 존이 세운 호위여야(+ = 경계에서 생김 · − = 경계에서 사라짐)
    esc: { n: esc.length, same: esc.filter((x) => x.d === 0).length, more: esc.filter((x) => x.d > 0).length, less: esc.filter((x) => x.d < 0).length,
      sumOut: esc.reduce((s, x) => s + x.out, 0), sumIn: esc.reduce((s, x) => s + x.in, 0),
      byDir: { out: esc.filter((x) => x.dir === 'out' && x.d !== 0).length, back: esc.filter((x) => x.dir === 'back' && x.d !== 0).length },
      moreSample: esc.filter((x) => x.d > 0).slice(0, 5), lessSample: esc.filter((x) => x.d < 0).slice(0, 5),
      way: { n: escWay.length, died: escWay.filter((x) => x.d < 0).length, diedSum: escWay.reduce((s, x) => s + Math.max(0, -x.d), 0) } },
    tEnd: +tEnd.toFixed(3), tailMs,
  };
}

module.exports = { analyze, readFiles, escOf, BAITS };
