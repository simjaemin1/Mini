#!/usr/bin/env node
'use strict';
// T1248 실제 native 재기동의 큐→안정 신원 바인딩 진단. 검증 실패를 expected-pass로 바꾸지 않는다.
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),{spawn}=require('child_process');
const ROOT=process.env.T1248_ROOT||path.resolve(__dirname,'..');
const OUT=process.env.T1248_RESTART_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'t1248-restart-'));
const hook=path.join(__dirname,'t1248-restart-audit-hook.js');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const sources=()=>Object.fromEntries(['server/zone.js','server/villages.js','server/des.js','server/des-work.js'].map(f=>[f,hash(path.join(ROOT,f))]));
const initial=sources();fs.mkdirSync(OUT,{recursive:true});
fs.writeFileSync(path.join(OUT,'source.json'),JSON.stringify({root:ROOT,game:initial,hookSHA256:hash(hook),driverSHA256:hash(__filename),evaluatorSHA256:hash(require.resolve('./t1248-restart-evaluate')),fixture:'p2 nextPid shifted by100000 only in explicit renumbered case; native world/DB save and reload; no body or queue repair'},null,2));
async function boot(dir,phase,shift,epoch){
 const output=path.join(dir,phase+'.audit.json'),fd=fs.openSync(path.join(dir,phase+'.log'),'w');
 const env={...process.env,ZONE_ID:'hanbando',PORT:'0',DB_PATH:path.join(dir,'world.db'),CENTRAL_URL:'http://127.0.0.1:1',ENABLE_VILLAGES:'1',VILLAGE_MAX:'1',VILLAGE_DAY_MS:'1440000',T315_MAPBEDS:'1',T577_SEED:'1020',T577_DAYS:'99999',T577_OUT:path.join(dir,phase+'.json'),T745_VCLOCK:'1',T1241_DES:'1',T1241_PROBE:'1',T1243_FARM_ON:'1',T1248_RESTART_AUDIT:output,T1248_RESTART_SHIFT:String(shift),NODE_OPTIONS:`--require ${path.join(ROOT,'scripts/t745-vclock.js')} --require ${hook}`};
 delete env.VILLAGE_NPC_CAP;if(epoch!==undefined)env.T745_V0=String(epoch);else delete env.T745_V0;
 const start=process.hrtime.bigint();
 return await new Promise(resolve=>{
  const child=spawn(process.execPath,['-r',path.join(ROOT,'scripts/t577-server-hook.js'),path.join(ROOT,'server/zone.js')],{cwd:ROOT,env,stdio:['ignore',fd,fd]});
  let timedOut=false;const limit=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},300000);
  child.on('exit',(code,signal)=>{clearTimeout(limit);fs.closeSync(fd);resolve({code,signal,timedOut,wallSeconds:Number(process.hrtime.bigint()-start)/1e9,audit:fs.existsSync(output)?read(output):null});});
 });
}
const validate=require('./t1248-restart-evaluate');

(async()=>{
 const results={};
 for(const [name,shift]of[['natural',0],['renumbered',100000]]){
  const dir=path.join(OUT,name);fs.mkdirSync(dir,{recursive:true});if(fs.existsSync(path.join(dir,'world.db')))throw Error('Use a fresh fixture directory');
  const first=await boot(dir,'p1',0),second=first.audit?await boot(dir,'p2',shift,first.audit.clock.V):{code:null,audit:null};
  const result=validate(first,second);results[name]=result;fs.writeFileSync(path.join(dir,'binding-result.json'),JSON.stringify(result,null,2));console.log(name,JSON.stringify(result));
 }
 const unchanged=JSON.stringify(initial)===JSON.stringify(sources());const passed=unchanged&&Object.values(results).every(r=>r.passed);
 fs.writeFileSync(path.join(OUT,'status.json'),JSON.stringify({diagnosticCompleted:true,bindingRequirementPassed:passed,gameSourceUnchanged:unchanged,results},null,2));console.log('T1248 restart binding',passed?'PASS':'FAIL',OUT);process.exitCode=passed?0:1;
})().catch(e=>{console.error(e);process.exitCode=1;});
