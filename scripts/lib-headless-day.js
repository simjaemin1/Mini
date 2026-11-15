'use strict';
// === scripts/lib-headless-day.js — `_lifeHeadlessDay` 를 **돌려서** 묻는 판 자 (T1328 · 글자 핀 → 뜻 단언) ======================
//
// ★왜: `test-farm-act` ⑤ · `test-t1212-farm-clock` ③ · `test-t1224-econ-farm` ⑤ 는 `server/villages.js` `_lifeHeadlessDay` 의 줄을 **글자 그대로** 정규식으로 떠
//   "끔이면 종전 두 절(일괄 개간 · 일괄 작물) 그대로" 를 지켰다. 그 뜻과 무관한 손(T1284 `_t84` · T1212 · T1224 · T1243 이 같은 줄에 조건을 하나씩 더함)이
//   착지할 때마다 핀이 깨졌다(T1317 — 야간 11-15 빨강 셋의 뿌리). 이 자는 원문 함수를 **그대로 잘라** vm 에서 돌리고, 부른 일(개간 · 작물 · 신축)을 적는다.
//   하네스는 "몸 갈래 · 걷음 · 손잡이 조합마다 무엇이 몇 번 · 어떤 수로 불렸나" 를 단언한다 — 줄 모양이 바뀌어도 뜻이 같으면 초록이다.
//
// 쓰는 법:
//   const HD = require('./lib-headless-day');
//   const r = HD.run({ walk: false, awake: false, cut: false, t84: false, econFarm: false, rest: true, farmers: 3, others: 2, econFarmers: 5 });
//   r.clear  — `_lifeClearDay(vil, n)` 부른 n 들(차례대로) · r.farm — `lifeFarmDay(vil, day, n, …)` 부른 [day, n, extra…] · r.order — 부른 차례 이름
//   r.unknown — 원문이 부르는데 이 자가 모르는 이름(기본 = undefined 를 돌려준다 · 끔과 같은 쪽) — 하네스가 줄에 찍는다(판정 밖)
//
// 규약:
//   · 원문 글자를 바꾸지 않는다(잘라서 그대로 · `new vm.Script`) — 사본 0.
//   · 손잡이 · 술어는 시나리오가 준다: walk = `_t368Walk()` · awake = `_t368ZoneAwake(vil)` · cut = `_t1243On() && _t1243Live()` 의 값(둘 다 같은 값으로) ·
//     t84 = `_t1284On() && _t1221On()`(둘 다) · econFarm = `T1224_ECON_FARM` · rest = `T1212_FARM_REST`.
//   · 원문이 쓰는 이름 가운데 위 표에 없는 것은 자유 이름으로 찾아(acorn) 기본값을 준다 — 함수면 아무것도 안 하고 `undefined`, 상수면 `undefined`(= 거짓 · 끔 쪽).
//     새 손잡이가 끼어도 끔 쪽으로 돌아 "끔 = 종전" 을 그대로 묻는다. 그 이름은 `r.unknown` 에 남는다.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let _src = null;
function source() {
  if (_src) return _src;
  const S = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  const a = S.indexOf('\nfunction _lifeHeadlessDay(vil) {');
  if (a < 0) throw new Error('_lifeHeadlessDay 정본을 못 찾았다');
  const b = S.indexOf('\n}\n', a);
  _src = S.slice(a + 1, b + 2);
  return _src;
}
function freeNames(fnSrc) {
  const acorn = require('acorn');
  const ast = acorn.parse(fnSrc, { ecmaVersion: 'latest' });
  const declared = new Set(['vil', 'arguments', 'undefined', 'Math', 'Object', 'Number', 'Array', 'Set', 'Map', 'JSON', 'console', 'Infinity', 'NaN', 'String', 'Boolean']);
  const used = new Set();
  const walk = (n, parent, key) => {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier') declared.add(n.id.name);
    if (n.type === 'FunctionDeclaration' && n.id) declared.add(n.id.name);
    if (n.type === 'Identifier') {
      const isProp = parent && ((parent.type === 'MemberExpression' && key === 'property' && !parent.computed) || (parent.type === 'Property' && key === 'key' && !parent.computed));
      if (!isProp) used.add(n.name);
    }
    for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach((c) => walk(c, n, k)); else if (v && typeof v === 'object' && v.type) walk(v, n, k); }
  };
  walk(ast, null, null);
  return [...used].filter((x) => !declared.has(x));
}
function run(scn) {
  const S = Object.assign({ walk: false, awake: false, cut: false, t84: false, econFarm: false, rest: true, farmers: 3, others: 2, econFarmers: null, site: false }, scn || {});
  const src = source();
  const order = [], clear = [], farm = [], unknown = new Set();
  const players = new Map(), npcPids = [];
  let id = 0;
  for (let i = 0; i < S.farmers; i++) { const pid = 'f' + (id++); npcPids.push(pid); players.set(pid, { pid, simJob: 'farmer', _t1212N: S.didEach || 0 }); }
  for (let i = 0; i < S.others; i++) { const pid = 'o' + (id++); npcPids.push(pid); players.set(pid, { pid, simJob: 'smith' }); }
  const vil = { npcPids, econ: { counts: { farmer: S.econFarmers == null ? S.farmers : S.econFarmers } }, _site: S.site ? { stage: 0 } : null };
  const stat = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : 0), set: (t, k, v) => { t[k] = v; return true; } });
  const known = {
    state: { dayMs: 1440000, deps: { players } },
    T731_ON: false, _ledgerDay: () => 7, _dayNow: () => 0, gameDayOf: () => 7,
    _t1276Stand: () => {}, _lifeVL: () => {},
    _t368Walk: () => !!S.walk, _t368ZoneAwake: () => !!S.awake,
    _t1243On: () => !!S.cut, _t1243Live: () => !!S.cut, _t1243Stat: stat(),
    T1224_ECON_FARM: !!S.econFarm, T1212_FARM_REST: !!S.rest,
    _t1221On: () => !!S.t84, _t1284On: () => !!S.t84, _t1221DayS: () => 100, _lifeTasksPerFarmerDay: () => 10,
    _t1224Stat: stat(), _t1212Rest: stat(),
    _lifeClearDay: (v, n) => { order.push('clear'); clear.push(n); return 0; },
    lifeFarmDay: (v, d, n, x, b) => { order.push('farm'); farm.push(b === undefined ? [d, n] : [d, n, b]); return 0; },
    _farmDay: (v, d) => d,
    _lifeEcon: () => ({ T400_BUILD_ACT: false }),
    LIFE_CREW: 2, LIFE_STAGE_PDAY: 1,
    _lifeAdvanceSite: (v) => { order.push('site'); v._site = null; },
  };
  const ctx = {};
  for (const n of freeNames(src)) {
    if (n in known) ctx[n] = known[n];
    else { unknown.add(n); ctx[n] = (typeof globalThis[n] !== 'undefined') ? globalThis[n] : (function () { return undefined; }); if (/^[A-Z0-9_]+$/.test(n)) ctx[n] = undefined; }
  }
  for (const k of Object.keys(known)) if (!(k in ctx)) ctx[k] = known[k];
  vm.createContext(ctx);
  new vm.Script(src + '\nglobalThis.__hd = _lifeHeadlessDay;').runInContext(ctx);
  ctx.__hd(vil);
  return { clear, farm, order, unknown: [...unknown], day: 7, farmers: S.farmers };
}
module.exports = { run, source, freeNames };
