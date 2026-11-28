'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const kind=process.argv[2],filename=path.join(__dirname,'../server/villages.js');process.env.T1517_WAR_SNAP=kind==='off-cell'?'0':'1';
const V=require(filename),F=require('./lib-war-snap-fixture'),f=F.create(42);f.mobilize();f.tick();
if(kind==='legacy'){
 let source=fs.readFileSync(filename,'utf8');const guard="if (!Object.prototype.hasOwnProperty.call(M, 't1517WarSnap')) return;";assert(source.includes(guard));source=source.replace(guard,"if (!Object.prototype.hasOwnProperty.call(M, 't1517WarSnap')) M.t1517WarSnap = { version: 1, complete: true };");
 const m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));m._compile(source,filename);
 const state={...f.H.state,db:{getWorldMeta:()=>({data:JSON.stringify({v:1,anchor:{day:f.world.day}})})}};const H=m.exports.__p3Bind(state);
 assert.doesNotThrow(()=>H._warSnapEarly(),'unsealed legacy bytes must retain legacy behavior');
}else if(kind==='off-cell'){
 let source=fs.readFileSync(filename,'utf8');const name='function _t728Meta() {';assert(source.includes(name));source=source.replace(name,"let _t1517OffOriginal; function _t728Meta() { const raw=_t1517OriginalMeta(); _t1517OffOriginal=raw; const M=JSON.parse(raw); M.v++; return JSON.stringify(M); }\nfunction _t1517OriginalMeta() {");
 const m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));m._compile(source+'\nmodule.exports.__t1517OffBase=()=>_t1517OffOriginal;',filename);const H=m.exports.__p3Bind({...f.H.state});
 const actual=f.at(()=>H._t728Meta()),before=m.exports.__t1517OffBase();const A=JSON.parse(actual),B=JSON.parse(before);assert.deepStrictEqual(Object.keys(A).filter(k=>JSON.stringify(A[k])!==JSON.stringify(B[k])),['v'],'exactly one mutated OFF cell');assert.strictEqual(actual,before,'one OFF save cell changed');
}else assert.fail('unknown policy mutant');
