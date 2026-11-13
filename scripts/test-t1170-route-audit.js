'use strict';
// @regress
// T1170: 실제 동기/재개 문이 탐색 상한 뒤 종전 규칙으로 다시 파는지 검증.
const fs = require('fs'), path = require('path'), Module = require('module');
const file = path.resolve(__dirname, '../server/villages.js');
const source = fs.readFileSync(file, 'utf8');
function run(mutant) {
  let src = source;
  if (mutant) src = src.replace('if (r.done && !r.path && _routePlainRetry(J))', 'if (false && r.done && !r.path && _routePlainRetry(J))');
  src += `
;module.exports.__t1170 = () => {
  const original = _routeBegin;
  _routeBegin = function(...args) {
    const J = original(...args); if (J && !J.plain) J.S.maxPops = 1; return J;
  };
  state._distCtx = {ta:{isBlocked:()=>false,isWater:()=>false},ZONE:{zoneWidth:4096,zoneHeight:4096}};
  state._route = null;
  const a={dbId:1,ccx:4,ccy:4},b={dbId:2,ccx:100,ccy:100};
  state.byDbId=new Map([[1,a],[2,b]]);
  const pts=computeRoutePts(a.ccx*SZ+SZ/2,a.ccy*SZ+SZ/2,b.ccx*SZ+SZ/2,b.ccy*SZ+SZ/2);
  state.routeCache=new Map([['1_2',pts]]);
  return {found:!!pts,result:routeDebug({resume:1,budget:1}).resume};
};`;
  const m = new Module(file, module); m.filename=file; m.paths=Module._nodeModulePaths(path.dirname(file));
  m._compile(src,file); return m.exports.__t1170();
}
const V = require('./lib-verdict')('test-t1170-route-audit', { strict: true }), assert = V.assert;   // ★[T1301] 공용 판정 줄
const normal=run(false), mutant=run(true);
assert.equal(normal.found,true);
assert.equal(normal.result.n,1);
assert.equal(normal.result.mismatch,0);
assert.ok(normal.result.maxSlices>1);
assert.equal(mutant.result.mismatch,1);
V.end(JSON.stringify({normal,mutant}));
