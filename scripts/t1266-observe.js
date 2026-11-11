'use strict';
// (@regress 없음 — 러너 밖 · T1266 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1266-observe.js — 광부 원석 양 = 몸이 친 만큼(T1266) — T1256 판 꼴 곁 프리로드(`t1256-observe.js` 뒤에 싣는다) ==========
//   쓰는 법: NODE_OPTIONS="… -r $PWD/scripts/t1256-observe.js -r $PWD/scripts/t1266-observe.js" node scripts/t577-server-run.js 60 1020
//     → 판 JSON 곁 `<판>-<시드>.t1266.json`(10날마다 덮어 쓴다 · 끝에 한 번 더)
//   ① 날 머리(econ `tickVillage` 그날 첫 부름)마다 세계 셈 `rec.g[d]`:
//      · 셀 고르기 까닭(`tickPerf().probe.t724.pk` 마을별 누계 — 부름 · 본 셀 · 재고 < 1 · 집에서 안 닿음 · 닿나 기다림 · 고름 · 못 고름) — 회부 1(어촌14)
//      · 한 시간 값 문(`t1266Stat` 누계 — 물음 · 침 · 멈춤 · 멈춘 뒤 쉰 걸음 · 값 못 매김 · 값 0 · 일한 값 합 · 쉰 값 합 · 단위 합)
//      · 광산 마을 원석 값(`_priceCache` 원석 칸 — 교역 가격표 · 읽기만) · 노 녹임 · 청동 누계 · 작업표 셈 · 인구
//   ② 대장장이 작업표 갈래(회부 6 · `_t1196C` 품목별 · 대장장이만): 몸이 넣은 것(econ `artisanGive` 감쌈 — 든 비율 f 그대로) · 이튿날 일괄(마을 틱 머리에 남은 작업표 — 명목 · 사흘 넘은 것은 f) ·
//      그날 새로 선 작업표(명목) — 재료(`take`)와 낸 것(`give`)을 품목별로 · 대장장이(녹임 = 원석 재료 · 청동 = 무기 낸 것) 따로.
//      날마다 노 녹임 누계(`_smeltedTotal`) · 청동 무기 누계(`_bronzeWeaponMade`)를 같은 줄에(작업표 밖 — 자리 없는 장인의 그날 수식 몫이 섞인 합).
//   ③ 표본(`T1256_BODY_MS` 가상 시계 간격 — t1256 과 같은 박자): 광산 마을 **모든** 광부 몸의 상태(t1256 `stateOf` 그대로) · 마을별 · 그날 합.
//   ⚠값을 바꾸지 않는다 — `artisanGive` 감쌈은 인자 · 돌려준 값 그대로.
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1266.json' : '';
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const OG = require(path.join(ROOT, 'server', 'ore-goods'));
const O56 = require(path.join(__dirname, 't1256-observe.js'));
const stateOf = O56 && O56.stateOf;
let VIL = null, MINES = null;
const rec = { on: !!V1.T1266_ORE_BODY, split: !!V1.T1188_ORE_SPLIT, g: {}, art: {}, st: {}, err: null };
const r4 = (x) => +(+x || 0).toFixed(4);
const _art = (day) => rec.art[day] || (rec.art[day] = {});
function _addTo(o, src, f) { for (const k in src) { const q = (src[k] || 0) * f; if (q) o[k] = r4((o[k] || 0) + q); } }
function _slot(day, vname, kind, job) { const A = _art(day), V = A[vname] || (A[vname] = {}), K = V[kind] || (V[kind] = {}), J = K[job] || (K[job] = { n: 0, take: {}, give: {} }); return J; }
// ── ② 몸이 넣은 작업표(econ export 감쌈 — 생활층이 `E.artisanGive` 로 부른다) ─────────────────────────────────────
const _give = V1.artisanGive;
let _today = 0;
const _nameOf = new Map();   // econ 객체 → 마을 이름
if (typeof _give === 'function') {
  V1.artisanGive = function (v, id) {
    try {
      const Q = v && v._t1196Q; const t = Q && Q.find((x) => x.id === id);
      if (t && t.st === 1 && t.job === 'smith') { const J = _slot(_today, _nameOf.get(v) || '?', 'body', t.job); J.n++; _addTo(J.take, t.take, t.f); _addTo(J.give, t.give, t.f); }
    } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
    return _give.apply(this, arguments);
  };
}
function _isMine(e) { const L = (e && e.land) || {}; return (L.ore || 0) > 0.15 || (L.tin || 0) > 0.15; }
function snap(day) {
  if (!VIL) VIL = require(path.join(ROOT, 'server', 'villages'));
  const P = VIL.__labProbe._t569Probe.setup();
  if (!MINES) { MINES = new Set(); for (const vil of (P.villages || [])) if (_isMine(vil.econ)) MINES.add(vil.name); rec.mines = [...MINES]; }
  for (const vil of (P.villages || [])) if (vil.econ) _nameOf.set(vil.econ, vil.name);
  let pk = null, t66 = null;
  try { const tp = VIL.tickPerf ? VIL.tickPerf() : null; const Q = tp && tp.probe && tp.probe.t724; if (Q && Q.pk) pk = JSON.parse(JSON.stringify(Q.pk)); } catch (e) {}
  try { t66 = VIL.t1266Stat ? VIL.t1266Stat() : null; if (t66) for (const k in t66) t66[k] = r4(t66[k]); } catch (e) {}
  const px = {}, tot = {};
  for (const vil of (P.villages || [])) {
    if (!MINES.has(vil.name)) continue;
    const e = vil.econ || {}, c = e._priceCache || null;
    if (c) { const o = {}; for (const k of (rec.split ? OG.ids : ['ore'])) if (c[k] > 0) o[k] = r4(c[k]); px[vil.name] = o; }
    tot[vil.name] = [r4(e._smeltedTotal || 0), r4(e._bronzeWeaponMade || 0), e._t1196C ? Object.assign({}, e._t1196C) : null, (e.npcs || []).length];   // 녹임 누계 · 청동 무기 누계 · 작업표 셈 · 인구
  }
  rec.g[day] = { pk, t66, px, tot };
  if (day % 10 === 0) write();
}
function write() { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 자리 */ } }
// ── 마을 틱 머리 — 이튿날 일괄이 될 작업표(명목) · 틱 뒤 — 그날 새로 선 작업표(명목) ──────────────────────────────
let last = -1;
const _seen = new WeakMap();   // econ → 본 작업표 id 집합
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  try {
    if (day !== last) { last = day; _today = day; snap(day); }
    const Q = v && v._t1196Q;
    if (Q && Q.length) { const nm = _nameOf.get(v) || '?';
      for (const t of Q) {
        if (t.job !== 'smith') continue;
        if (t.st === 0 && t.day < day) { const J = _slot(day, nm, 'batch', t.job); J.n++; _addTo(J.take, t.take, 1); _addTo(J.give, t.give, 1); }
        else if (t.st === 1 && day - t.day > 3) { const J = _slot(day, nm, 'late', t.job); J.n++; _addTo(J.take, t.take, t.f); _addTo(J.give, t.give, t.f); }
      } }
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  const out = _t.apply(this, arguments);
  try {
    const Q = v && v._t1196Q;
    if (Q && Q.length) { const nm = _nameOf.get(v) || '?'; let S = _seen.get(v); if (!S) _seen.set(v, S = new Set());
      for (const t of Q) if (!S.has(t.id)) { S.add(t.id); if (t.job !== 'smith') continue; const J = _slot(day, nm, 'made', t.job); J.n++; _addTo(J.take, t.take, 1); _addTo(J.give, t.give, 1); } }
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  return out;
};
// ── ③ 표본 — 광산 마을 모든 광부 몸의 상태 ──────────────────────────────────────────────────────────────────────
const BODY_MS = process.env.T1256_BODY_MS == null ? 10000 : +process.env.T1256_BODY_MS;
if (BODY_MS > 0 && typeof stateOf === 'function') {
  setInterval(() => {
    try {
      if (!VIL || !MINES) return;
      const P = VIL.__labProbe._t569Probe.setup(), B = VIL.__p3Bind({});
      const players = (B.state.deps && B.state.deps.players) || new Map();
      const day = (B.state && B.state.world && B.state.world.day) | 0;
      const D = rec.st[day] || (rec.st[day] = { n: 0, v: {} }); D.n++;
      for (const vil of (P.villages || [])) {
        if (!MINES.has(vil.name)) continue;
        for (const pid of (vil.npcPids || [])) {
          const p = players.get(pid); if (!p || p.simJob !== 'miner') continue;
          const s = stateOf(p), o = D.v[vil.name] || (D.v[vil.name] = {}); o[s] = (o[s] || 0) + 1;
        }
      }
    } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  }, BODY_MS);
}
process.on('exit', write);
