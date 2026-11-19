'use strict';
// (@regress 없음 — 러너 밖 · T1295 탐침 · 제품 무변 · 읽기만)
// === scripts/t1295-probe.js — 밭 세계 판 시계 판: 몸이 한 밭 일 · 일괄 밭 일 셈을 판 끝에 한 줄 JSON 으로 =====================
//   쓰는 법(아이 존만): T1295_PROBE_OUT=<파일> NODE_OPTIONS="-r $PWD/scripts/t1295-probe.js" node scripts/t577-server-run.js <날> <시드>
//   `T1295_PROBE_BAIT=batch` = 미끼 — 존 소스가 아니라 villages.js 를 **메모리에서만** 고쳐 밭 길 일괄 걷음(`_cut`)을 끈다(몸 없이 밭 일 · 하네스 미끼 전용).
const path = require('path'), fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T1295_PROBE_OUT || ''; if (!OUT) return;
const ROOT = path.join(__dirname, '..');
//   ★[T1316] `T1295_PROBE_BAIT=mine` = 미끼 — 광부 한 타만 실 ms 축으로 되돌린 사본(`_SW = S.MINE_SWING_MS`) · 모든 판에서 몸 직업 × 라벨 몸-틱 · 광부 몸 kg 을 함께 적는다.
{
  const Module = require('module'), _comp = Module.prototype._compile, VS = path.join(ROOT, 'server', 'villages.js'), ZS = path.join(ROOT, 'server', 'zone.js');
  const BAIT = process.env.T1295_PROBE_BAIT;
  var BAIT_N = null;
  Module.prototype._compile = function (c, f) {
    if (f === VS) {
      //   ★[T1383] 미끼마다 바꾼 자리 수를 판 JSON(`baitN`)에 싣는다 — 하네스가 "정확히 한 곳"을 미끼 판정 줄에서 본다
      const swap = (a, b) => { BAIT_N = (c.length - c.replaceAll(a, '').length) / a.length; c = c.replace(a, b); };   // (셈은 `replaceAll` 차 — 린트 ⑯ 의 띄우개 글자를 피함)
      if (BAIT === 'batch') swap('const _cut = _t1243On() && _t1243Live();', 'const _cut = false;');
      if (BAIT === 'mine') swap('const _SW = S.MINE_SWING_MS / t1295S(npc);   // ★[T1316] 한 타', 'const _SW = S.MINE_SWING_MS;   // 미끼 한 타');
      //   ★[T1326] `T1295_PROBE_BAIT=hunt` = 미끼 — 사냥꾼만 실 초 축으로 되돌린 사본(문에서 사냥꾼을 다시 뺀다 · 걸음 · 두뇌 둘 다 배율 1)
      if (BAIT === 'hunt') swap("(npc.simJob !== 'hunter' || T1326_HUNT_CLOCK)", "(npc.simJob !== 'hunter')");
      c += '\nmodule.exports.__t1295ProbeT724 = () => (typeof _probe !== "undefined" && _probe.t724) || null;\n';
    }
    if (f === ZS) { const H = 'function npcStep(npc, dt, now) {'; const i = c.indexOf(H);
      if (i >= 0) c = c.slice(0, i) + 'function npcStep(npc, dt, now) { const __r = __t1295Inner(npc, dt, now); if (global.__t1295Lab) global.__t1295Lab(npc); return __r; }\nfunction __t1295Inner(npc, dt, now) {' + c.slice(i + H.length); }
    return _comp.call(this, c, f);
  };
}
const LAB = {};
//   ★[T1326] 곳간 입구가 받은 몫(재화별) — econ 정본 입구 함수를 감싼 계측(회계 아님) · 몸 몫은 마을 `_t325Deliv`
const GOT = {};
try { const E = require(path.join(ROOT, 'sim', 'economy-sim'));
  for (const [fn, k] of [['woodToGranary', 'wood'], ['fishToGranary', 'fish'], ['forageToGranary', 'forage'], ['huntToGranary', 'hunt']]) {
    const o = E[fn]; if (typeof o !== 'function') continue;
    E[fn] = function () { const g = o.apply(this, arguments); if (typeof g === 'number' && g > 0) GOT[k] = +((GOT[k] || 0) + g).toFixed(6); return g; };
  } } catch (e) {}
global.__t1295Lab = (npc) => { if (!npc || !npc.simVillageId) return; const k = (npc.simJob || '?') + '|' + (npc._lifeAct || ''); LAB[k] = (LAB[k] || 0) + 1; };
function dump() {
  try {
    const V = require(path.join(ROOT, 'server', 'villages')), B = V.__p3Bind({});
    let harvN = 0, pop = 0, vils = 0, empty = 0;
    for (const v of (B.state.villages || [])) { const e = v.econ; if (!e) continue; harvN += e._t100HarvestN || 0; const n = (e.npcs || []).length; pop += n; if (n) vils++; else empty++; }
    const o = { day: B.state.world && B.state.world.day, harvN, pop, vils, empty, pick: (B._t1243PStat || {}).pick || 0, reaped: (B._t1243PStat || {}).reaped || 0,
      batchTasks: (B._t1212Rest || {}).batchTasks || 0, batchClear: (B._t1212Rest || {}).batchClear || 0, ghostBatch: (B._t1224Stat || {}).batch || 0,
      cutDays: (B._t1243Stat || {}).cutDays || 0, bodyCells: (B._t1243CStat || {}).bodyCells || 0, walks: (V._t1295Stat || {}).walks || 0, walkPx: Math.round((V._t1295Stat || {}).walkPx || 0),
      wl: (() => { try { const W = require(path.join(ROOT, 'server', 'wildlife')); const st = W._debug && W._debug.stats; return st ? { deaths: st.deaths, hits: st.hits, spawned: st.spawned } : null; } catch (e) { return null; } })(),
      hunt: (() => { try { return V.t1195Stat ? V.t1195Stat() : null; } catch (e) { return null; } })(),
      got: GOT, woodBody: (() => { let w = 0; for (const v of (B.state.villages || [])) w += v._t325Deliv || 0; return +w.toFixed(3); })(),
      t1202: (() => { const S = V.t1202Stat ? V.t1202Stat() : null; return S ? { roster: S.roster, bodies: S.bodies, wood: S.wood, fish: S.fish, forage: S.forage } : null; })(),
      lab: LAB, baitN: typeof BAIT_N === 'undefined' ? null : BAIT_N, mineKg: (() => { const P = V.__t1295ProbeT724 && V.__t1295ProbeT724(); return P ? +P.kg.toFixed(3) : null; })() };
    fs.writeFileSync(OUT, JSON.stringify(o));
  } catch (e) { try { fs.writeFileSync(OUT, JSON.stringify({ err: String(e && e.stack || e).slice(0, 400) })); } catch (_) {} }
}
process.on('exit', dump);
setInterval(dump, 15000).unref();
