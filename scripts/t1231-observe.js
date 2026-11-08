'use strict';
// (@regress 없음 — 러너 밖 · T1231 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1231-observe.js — NPC 하루: 무엇에 몇 시간 · 상태마다 npcStep µs — 서버 판 자(`t577-server-run.js`) 곁 프리로드 =================
//   쓰는 법(아이 존만 · 판 JSON 곁 `<판>-<시드>.t1231.json`):
//     NODE_OPTIONS="-r $PWD/scripts/t1231-observe.js -r $PWD/scripts/t745-vclock.js" T745_VCLOCK=1 node scripts/t577-server-run.js <날> <시드>
//     ⚠이 관찰기를 가상 시계(`t745-vclock`)보다 **먼저** 싣는다 — 가상 시계가 `process.hrtime` 을 V 로 갈아 끼우기 전에 진짜 시계를 붙잡는다(µs 는 진짜 시계로 잰다 · 세계는 V 그대로).
//   ⓐ 존 소스(`server/zone.js`)를 **메모리에서만** 고쳐 `npcStep` 을 감싼다(`Module._compile` — 파일은 한 글자도 안 바뀐다 · 감싼 함수는 몸에 아무것도 안 쓴다).
//   ⓑ 한 사람 한 틱(npcStep 한 부름)마다 — 걸음 **뒤** 상태(`_lifeAct` · `behavior` · 속도)로 가른다:
//      일(직업 일 · 제자리) · 걸음(출근 · 귀가 · 운반 · 일 라벨인데 움직임) · 배회 · 쉼(휴식 · 요양 · 라벨 없이 섬) · 잠(취침) · 먹기(식사) · 그 밖(교전 · 피신 · 대피 · 장마당 · 캐러밴)
//      낮 · 밤 = 그 몸의 현지 해 몫(`worldPhase(V) + simLonOff`) > `dayPhaseRatio` 면 밤.
//   ⓒ 갈래마다 사람-틱 수 · 걸린 ns(진짜 시계) — 상태 × 낮밤 · × 직업 · × 철(econ 달) · × 마을 크기(<5 · 5-19 · 20-99 · ≥100) · × 전쟁 중 마을
//      · 라벨 날것(상태 × 라벨) · 시계 자체 몫(빈 감싸기 ns — 32,768 부름마다 한 번 잰다).
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1231.json' : '';
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const RH = process.hrtime;   // 진짜 시계(가상 시계보다 먼저 붙잡는다)
const now = () => RH.bigint();

// ── ⓐ npcStep 감싸기 — 메모리 안 소스만 ──
const Module = require('module');
const _comp = Module.prototype._compile;
const ZONE = path.join(ROOT, 'server', 'zone.js');
let wrapped = false;
Module.prototype._compile = function (content, filename) {
  if (filename === ZONE && !wrapped) {
    const H = 'function npcStep(npc, dt, now) {';
    const i = content.indexOf(H);
    if (i >= 0 && content.indexOf(H, i + 1) < 0) {
      content = content.slice(0, i) + 'function npcStep(npc, dt, now) { return global.__t1231 ? global.__t1231(npc, dt, now, __t1231Inner) : __t1231Inner(npc, dt, now); }\nfunction __t1231Inner(npc, dt, now) {' + content.slice(i + H.length);
      wrapped = true;
    }
  }
  return _comp.call(this, content, filename);
};

// ── ⓑ 상태 가르기 ──
const WORK = new Set(['경작', '수확', '낚시', '드리움', '놓침', '낚음', '벌목', '채석', '채광', '제작', '수색', '채집', '파종', '모내기', '김매기', '추수', '사냥']);
const WALK = new Set(['출근', '귀가', '운반', '저장']);
const REST = new Set(['휴식', '요양']);
const OTHER = new Set(['대피', '장마당']);
function stateOf(npc) {
  const act = npc._lifeAct || '', beh = npc.behavior || '';
  const mv = Math.hypot(npc.vx || 0, npc.vy || 0) > 1;
  if (beh === 'fight' || beh === 'flee' || OTHER.has(act) || npc.canadiaTask) return 'other';
  if (act === '취침') return mv ? 'walk' : 'sleep';
  if (act === '식사') return 'eat';
  if (WALK.has(act)) return 'walk';
  if (WORK.has(act) || beh === 'gather' || beh === 'plant' || beh === 'harvest') return mv ? 'walk' : 'work';
  if (REST.has(act)) return mv ? 'wander' : 'rest';
  if (act === '배회' || act === '') return mv ? 'wander' : 'rest';
  return mv ? 'wander' : 'rest';   // 모르는 라벨 — 아래 라벨 표에 날것으로 남는다
}

// ── ⓒ 셈 ──
const ZC = require(path.join(ROOT, 'server', 'zone-config'));
const DPR = ZC.WORLD.dayPhaseRatio;
const rec = { ver: 1, seed: +process.env.T577_SEED, dayMs: process.env.VILLAGE_DAY_MS, cap: process.env.VILLAGE_NPC_CAP || 'Infinity', wrapped: false,
  calls: 0, ns: 0, overNs: 0, overN: 0, byState: {}, byJob: {}, bySeason: {}, bySize: {}, byWar: {}, labels: {}, days: {}, err: null };
const add = (tab, k, ns) => { const e = tab[k] || (tab[k] = [0, 0]); e[0]++; e[1] += ns; };
let VIL = null, B = null, vmap = new Map(), vmapAt = -1, warSet = new Set();
function refresh() {
  try {
    if (!VIL) { VIL = require.cache[path.join(ROOT, 'server', 'villages.js')]?.exports || null; }
    if (VIL && !B) B = VIL.__p3Bind({});
    const st = B && B.state; if (!st) return;
    vmap = new Map(); for (const v of (st.villages || [])) vmap.set(v.dbId, v);
    warSet = new Set(); for (const w of ((st.world && st.world._warWars) || [])) { if (w && w.atk && w.atk.name) warSet.add(w.atk.name); if (w && w.def && w.def.name) warSet.add(w.def.name); }
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 300); }
}
let Crops = null;
function seasonOf(day) {
  try { if (!Crops) Crops = require(path.join(ROOT, 'server', 'crops')); const m = Crops.monthOf(day); return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter'; } catch (e) { return '?'; }
}
const sizeOf = (n) => (n < 5 ? 's<5' : n < 20 ? 's5-19' : n < 100 ? 's20-99' : 's100+');
global.__t1231 = function (npc, dt, t, inner) {
  rec.wrapped = true;
  const t0 = now();
  try { return inner(npc, dt, t); }
  finally {
    const ns = Number(now() - t0);
    try {
      rec.calls++; rec.ns += ns;
      if ((rec.calls & 1023) === 1) refresh();
      if ((rec.calls & 32767) === 1) { const a = now(); const b = now(); rec.overNs += Number(b - a); rec.overN++; }   // 시계 한 번 읽는 몫
      const st = stateOf(npc);
      const ph = (ZC.worldPhase(t) + (npc.simLonOff || 0)) % 1, dn = (ph < 0 ? ph + 1 : ph) > DPR ? 'n' : 'd';
      const k = dn + ':' + st;
      add(rec.byState, k, ns);
      add(rec.byJob, (npc.simJob || '-') + '|' + k, ns);
      const vil = vmap.get(npc.simVillageId);
      const day = (B && B.state && B.state.world && B.state.world.day) | 0;
      add(rec.bySeason, seasonOf(day) + '|' + k, ns);
      if (vil) { const n = (vil.econ && vil.econ.npcs ? vil.econ.npcs.length : 0); add(rec.bySize, sizeOf(n) + '|' + k, ns); if (warSet.has(vil.name)) add(rec.byWar, 'war|' + k, ns); }
      add(rec.labels, k + '|' + (npc._lifeAct || '·') + '|' + (npc.behavior || '·'), ns);
      const dd = rec.days[day] || (rec.days[day] = 0); rec.days[day] = dd + 1;
    } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 300); }
  }
};
// 마을 몸 · econ 사람(관측자 곁 ↔ 일괄 — 몸이 econ 사람의 몇 몫인가) · 30초마다 덤프
function dump() {
  try {
    refresh();
    if (B && B.state) rec.vill = (B.state.villages || []).map((v) => ({ n: v.name, econ: (v.econ && v.econ.npcs ? v.econ.npcs.length : 0), bodies: (v.npcPids || []).length }));
    fs.writeFileSync(OUT, JSON.stringify(rec));
  } catch (e) {}
}
process.on('exit', dump);
setInterval(dump, 30000).unref();
