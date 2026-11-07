'use strict';
// T1171 관찰 전용 preload. 제품 파일은 바꾸지 않고 진짜 함수의 앞뒤를 읽는다.
// NODE_OPTIONS="--require $PWD/scripts/t1171-unload-probe.js" node scripts/server-baseline-check.js --make ... --war --days 50
if (process.env.T577_SEED) {
  const fs = require('fs'), Module = require('module'), path = require('path');
  const target = path.resolve(__dirname, '../server/villages.js');
  const rec = { seed: +process.env.T577_SEED, events: [], errors: [] };
  globalThis.__t1171 = (stage, before, after, result) => rec.events.push({ stage, before, after, result });
  globalThis.__t1171Error = e => rec.errors.push(String(e && e.stack || e));
  const old = Module._extensions['.js'];
  Module._extensions['.js'] = function (m, file) {
    if (file !== target) return old(m, file);
    const compile = m._compile;
    m._compile = function (src, name) {
      src += `
;(() => {
  function snap(w, body) {
    body = body || (state.warBodies && state.warBodies.get(w.id));
    const P = state.deps.players;
    const rows = (body && body.pids || []).map(pid => {
      const p = P.get(pid); if (!p) return {pid, missing: true};
      const h = w.atk, hx = h.ccx * SZ + SZ / 2, hy = h.ccy * SZ + SZ / 2;
      return { pid, x:p.x, y:p.y, homeM:Math.hypot(p.x-hx,p.y-hy)/SZ,
        inventory:{...p.inventory}, pack:p._warPackOf };
    });
    const end=body && body._t1089 && body._t1089.end;
    const lead=body && body.retGroup && body.retGroup.commander;
    return { target:end ? {x:end.x,y:end.y}:null, leader:lead ? {x:lead.x,y:lead.y}:null,
      targetDistanceM:end && lead ? Math.hypot(end.x/SZ-lead.x,end.y/SZ-lead.y):null,
      returnDone:body && body._t1089 ? body._t1089.done:null,
      day:state.world.day, war:w.id, atk:w.atk.name, def:w.def.name,
      phase:w.phase, bodyPhase:body && body.phase, prog:body && body.prog, len:body && body.len,
      storage:{...w.atk.econ.storage}, book:w._rationBook && JSON.parse(JSON.stringify(w._rationBook)), rows };
  }
  function wrap(fn, stage, bodyArg) {
    return function(...args) {
      const body = bodyArg ? args[0] : null, w = bodyArg ? body && body.w : args[0];
      if (!w) return fn.apply(this,args);
      let before; try { before = snap(w,body); } catch(e) { globalThis.__t1171Error(e); }
      const result = fn.apply(this,args);
      try { globalThis.__t1171(stage,before,snap(w,body),result); } catch(e) { globalThis.__t1171Error(e); }
      return result;
    };
  }
  _warRationCollect = wrap(_warRationCollect,'collect-before-t681',false);
  _warRationLayDownBody = wrap(_warRationLayDownBody,'body-laydown',true);
  _warCleanupBody = wrap(_warCleanupBody,'cleanup',true);
})();`;
      return compile.call(this, src, name);
    };
    return old(m, file);
  };
  process.on('exit', () => {
    fs.writeFileSync(process.env.T577_OUT.replace(/\.json$/, '.t1171.json'), JSON.stringify(rec));
  });
}
