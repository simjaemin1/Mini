// (@regress 없음 — 계측 훅 · 러너 밖 · T1415 · 판정 0)
// === scripts/t1415-stamp-hook.cjs — 마을 바뀜 도장(T1399)이 판에서 몇 번 타나 · 탄 쓰기가 다 도장을 찍었나 ===
//
// 쓰는 법(존 아이 프리로드 — 생활층 글자를 읽을 때만 끼운다 · 제품 파일 무접촉):
//   몸 전부 판:  T1294_PRELOAD=$PWD/scripts/t1415-stamp-hook.cjs T1415_STAMP_OUT=/tmp/s-%p.json node scripts/t1294/run.cjs <out> 30
//   끈 판:       NODE_OPTIONS="--require $PWD/scripts/t1415-stamp-hook.cjs" T1415_STAMP_OUT=/tmp/s-%p.json node scripts/server-baseline-check.js …
//   · 도장 자리(부른 줄)마다 · 날마다 수 — 그 줄이 그 마을의 장부 날이 바뀐 틱(하루 문)에 탔나(`edge`) · 낮 가운데 탔나(`mid`)
//   · 놓친 쓰기 — 틱마다(생활층 `onGameTick` 뒤) 마을마다 판정이 읽는 마을 문 칸의 지문을 떠, 지문이 바뀌었는데 도장이 그대로면 그 칸 이름을 센다(`miss`)
//   ⚠세계에 쓰지 않는다(읽기만). 바꿀 자리가 없으면 아무것도 안 끼운다(로그 한 줄).
'use strict';
const OUT = process.env.T1415_STAMP_OUT;
if (OUT && /zone\.js$/.test(process.argv[1] || '')) {
  const Module = require('module'), _c = Module.prototype._compile, VP = require('path').join('server', 'villages.js');
  const A = 'function t1399Bump(vil) {';
  Module.prototype._compile = function (content, filename) {
    if (filename.endsWith(VP)) {
      if (content.split(A).length !== 2 || content.indexOf('\nmodule.exports = {') < 0) { console.log('[T1415 도장 훅] 끼울 자리 없음'); return _c.call(this, content, filename); }
      content = content.replace(A, A + ' if (globalThis.__t1415B) globalThis.__t1415B(vil, new Error().stack);');
      content += `
;(function () {   // [T1415 도장 훅 · 계측기가 박았다 · 제품엔 없다]
  const fs = require('fs'), f = ${JSON.stringify(OUT)}.replace('%p', String(process.pid));
  const R = { bump: {}, day: {}, edge: 0, mid: 0, miss: {}, missEx: [], checks: 0, changes: 0 };
  const lastDay = new Map(), sig = new Map(), gen = new Map(), ids = new WeakMap(); let idn = 0;
  const id = (o) => { if (!o || typeof o !== 'object') return String(o); let v = ids.get(o); if (!v) { v = ++idn; ids.set(o, v); } return v; };
  globalThis.__t1415B = (vil, st) => {
    const l = ((st.split('\\n')[2] || '').match(/villages\\.js:(\\d+)/) || [])[1] || '?';
    R.bump[l] = (R.bump[l] || 0) + 1;
    const d = state.world ? state.world.day : 0; R.day[d] = (R.day[d] || 0) + 1;
    const ld = vil && vil._t731Day; if (vil && lastDay.has(vil.dbId) && lastDay.get(vil.dbId) !== ld) R.edge++; else R.mid++;
  };
  const F = (v) => {
    const e = v.econ || {};
    return { q: v._t529Q ? v._t529Q.length : 0, mkt: id(v._mkt) + ':' + (v._mkt && v._mkt.at ? v._mkt.at.size : 0), cc: v._clearCrew, site: id(v._site), bc: v._buildCrew,
      t400: (v._t400Crew || []).join(','), ps: id(v._psite), psc: v._psiteCrew, farm: v._farmSet ? v._farmSet.size : 0, terr: v._terrSet ? v._terrSet.size : 0,
      gp: id(v._granPend), gl: v._granList ? v._granList.length : 0, pids: (v.npcPids || []).join(','), t1207: v._t1207Pend ? v._t1207Pend.length : 0, war: (e._warThreat || 0) > 0 ? 1 : 0 };
  };
  const tick = () => {
    for (const v of state.villages || []) {
      const s = F(v), g = _t1399G.get(v.dbId) || 0, p = sig.get(v.dbId); R.checks++;
      if (p) { const ch = Object.keys(s).filter((k) => s[k] !== p[k]); if (ch.length) { R.changes++; if (gen.get(v.dbId) === g) for (const k of ch) { R.miss[k] = (R.miss[k] || 0) + 1; if (R.missEx.length < 20) R.missEx.push({ v: v.dbId, k, day: state.world && state.world.day, a: String(p[k]).slice(0, 40), b: String(s[k]).slice(0, 40) }); } } }
      sig.set(v.dbId, s); gen.set(v.dbId, g); lastDay.set(v.dbId, v._t731Day);
    }
  };
  const ogt = module.exports.onGameTick;
  module.exports.onGameTick = function () { const r = ogt.apply(this, arguments); try { tick(); } catch (e) {} return r; };
  const put = () => { try { fs.writeFileSync(f, JSON.stringify(R)); } catch (e) {} };
  process.on('exit', put); setInterval(put, 60000).unref();
})();
`;
      console.log('[T1415 도장 훅] 끼움');
    }
    return _c.call(this, content, filename);
  };
}
