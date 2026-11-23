'use strict';
// (@regress 없음 — 러너 밖 · T1449 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1449-observe.js — 칼과 쥘 사람: 마을마다 전사 · 칼을 찾는 병사(징집 편성 · 지키는 판) · 근접검 · 청동 → 쥘 사람 없는 칼 ==========
//   쓰는 법(랩):     T1449_LAB_OUT=<out.json> node -r scripts/t1449-observe.js scripts/t176-ab.js 800 1020
//   쓰는 법(서버 자): NODE_OPTIONS="… -r $PWD/scripts/t1449-observe.js" node scripts/t577-server-run.js 400 1020 → 판 JSON 곁 `<판>-<시드>.t1449.json`
//   econ 마을 틱(`tickVillage`)을 감싸 그날 첫 부름(어제 하루가 다 돈 곳간)에 열흘마다 읽는다(t1407 관찰기 꼴 · 값표 · 값 함수는 안 부른다 — 캐시를 건드리지 않게).
//   칼을 찾는 병사 = war-core `_warConscriptIndividual` 의 그 차례(직업 → 무기 `warJobWeaponType` · 농부 넷째마다 칼 · 우선 차례 · 징집 수 `WAR_LEVY`) — 편성 함수를 안 부른다
//     (그 함수는 주민에 숙련 · 무기 꼬리표를 쓴다). 쥔 칼 셈은 그 편성 줄 그대로: 정예 = min(청동, 전사, 찾는 병사) · 단검 = 남은 찾는 병사와 석검(끔) / 석검 + 남는 청동(켬 — PM 결정).
//   줄(`vcols`): 사람 · 전사 · 찾는 병사(싸움 · 지킴) · 근접검 · 청동 · 안 쥔 칼(끔 싸움 · 켬 싸움 · 끔 지킴 · 켬 지킴) · 무기 곳간 · 청동 몫.
//   ⚠값을 바꾸지 않는다 — 읽기만 · 훅은 감싸 부른다.
const path = require('path'), fs = require('fs');
const A1 = process.argv[1] || '';
const SERVER = !!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1));
const OUT = SERVER ? (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1449.json' : '') : (process.env.T1449_LAB_OUT || '');
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const WC = require(path.join(ROOT, 'sim', 'war-core'));
const TIN = !!(process.env.T1385_BRONZE_NOCAP === '1' || process.env.T1385_BRONZE_NOCAP_TINGATE === '1');   // war-core `_T1385_TIN` 그 식
const EVERY = +(process.env.T1449_OBS_EVERY || 10);
const rec = {
  mode: SERVER ? 'server' : 'lab', knobs: Object.fromEntries(Object.keys(process.env).filter((k) => /^T1(385|398|333|407|449)_/.test(k) && !/_OUT$/.test(k)).map((k) => [k, process.env[k]])),
  names: null, vcols: ['N', 'W', 'Kwar', 'Kdef', 'S', 'B', 'uOffWar', 'uOnWar', 'uOffDef', 'uOnDef', 'weapon', 'q'], day: {}, err: null,
};
const r3 = (x) => (x == null || !isFinite(+x) ? null : +(+x).toFixed(3));
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const PRIO = (j) => (j === 'warrior' ? 1000 : 0) + (j === 'hunter' ? 800 : 0) + (j === 'fisher' ? 90 : 0) + (j === 'miner' ? 85 : 0) + (j === 'lumberjack' ? 80 : 0) + (j === 'forager' ? 70 : 0) + (j === 'farmer' ? 40 : 0) + (j === 'smith' || j === 'weaponsmith' || j === 'armorsmith' ? 120 : 0) + 30;   // war-core `prio` 그 식
function seekers(v, force) {   // 칼을 찾는 병사 수 — 편성 차례 그대로(읽기만)
  const pool = (v.npcs || []).filter((n) => n && !n.captive);
  if (!pool.length || force < 1) return 0;
  const idx = new Map(); pool.forEach((n, i) => idx.set(n, i));
  const s = pool.slice().sort((a, b) => PRIO(b.currentJob) - PRIO(a.currentJob) || idx.get(a) - idx.get(b)).slice(0, Math.min(force, pool.length));
  let k = 0; for (const n of s) { let want = WC.warJobWeaponType(n.currentJob); if (n.currentJob === 'farmer' && idx.get(n) % 4 === 0) want = 'sword'; if (want === 'sword') k++; }
  return k;
}
function held(S, B, W, K, on) {   // 안 쥔 칼 — 정예 · 단검 셈(편성 줄 그대로)
  const champ = Math.min(B, W, K), stone = Math.max(0, S - B);
  const dag = Math.min(K - champ, stone + (on ? B - champ : 0));
  return Math.max(0, S - champ - dag);
}
function snap(W0, day) {
  const vils = (W0 && W0.villages) || []; if (!vils.length) return;
  if (!rec.names) rec.names = vils.map((v) => v.name);
  const rows = [];
  for (const v of vils) {
    const e = v.econ || v, N = (e.npcs || []).length;
    if (!N) { rows.push(null); continue; }
    const c = e.counts || {}, W = Math.round(c.warrior || 0);
    const weapon = (e.storage && e.storage.weapon) || 0, sf = e._swordFrac != null ? e._swordFrac : 0.5;
    const S = Math.floor(weapon * sf);
    let B = 0;
    if (TIN) B = Math.min(S, Math.round(S * clamp01(e._t1344Q || 0)));
    else { const wq = e._weapQ != null ? e._weapQ : 0.5; try { if (WC._warBronzeCapable(e) && wq > WC.WAR_BRONZE_WEAPQ_TH) B = Math.min(S, Math.round(S * clamp01((wq - WC.WAR_BRONZE_WEAPQ_TH) / (WC.WAR_BRONZE_WEAPQ_CAP - WC.WAR_BRONZE_WEAPQ_TH)))); } catch (x) { B = 0; } }
    let fw = W + Math.round((N - W) * WC.WAR_LEVY); fw = Math.min(fw, N - 2); if (fw < WC.WAR_RAID_MIN) fw = 0;
    const Kw = seekers(e, fw), Kd = seekers(e, Math.max(1, N - 1));
    rows.push([N, W, Kw, Kd, S, B, held(S, B, W, Kw, false), held(S, B, W, Kw, true), held(S, B, W, Kd, false), held(S, B, W, Kd, true), r3(weapon), r3(e._t1344Q || 0)]);
  }
  rec.day[day] = rows;
}
function write() { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 자리 */ } }
let W = null, lastDay = null;
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  try {
    if (!W && v && v._world) W = v._world;
    if (day !== lastDay) { const prev = lastDay; lastDay = day; if (W && prev != null && (prev % EVERY === 0)) { snap(W, prev); if (prev % 100 === 0) write(); } }
  } catch (e) { rec.err = rec.err || ('snap ' + String(e && e.stack || e).slice(0, 400)); }
  return _t.apply(this, arguments);
};
process.on('exit', () => { try { if (W && lastDay != null) snap(W, lastDay); write(); } catch (e) { /* 자리 */ } });
