#!/usr/bin/env node
'use strict';
// @regress
const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..'),out=process.env.T1248_NOPOLL_DIR||fs.mkdtempSync('/tmp/t1248-nopoll-');
let pass=0,fail=0;
for(const [name,flags,bait] of [['normal',{},false],['alternate',{T385_ONE_SWEEP:'0',T689_GC:'1'},false],['bait',{T1248_NOPOLL_BAIT:'1'},true]]){
  const dir=path.join(out,name);fs.mkdirSync(dir,{recursive:true});
  const env={...process.env,...flags,VILLAGE_MAX:'1',T1241_DES:'1',T1241_PROBE:'1',VILLAGE_DAY_MS:'1440000',VILLAGE_NPC_CAP:'Infinity',T745_VCLOCK:'1',T577_DIR:dir,T577_PAR:'1',
    NODE_OPTIONS:`--require ${path.join(root,'scripts/t1248-nopoll-hook.js')} --require ${path.join(root,'scripts/t745-vclock.js')}`};
  const fd=fs.openSync(path.join(dir,'wrapper.log'),'w'),run=spawnSync(process.execPath,['scripts/t577-server-run.js','1','1020'],{cwd:root,env,stdio:['ignore',fd,fd],timeout:900000});fs.closeSync(fd);
  let result=null,child=null;try{result=JSON.parse(fs.readFileSync(path.join(dir,'base-1020.json.nopoll.json')));child=JSON.parse(fs.readFileSync(path.join(dir,'base-1020.json.child.json')));}catch(e){}
  const owned=result&&result.ticks===100&&result.stillOwned&&result.originalMaps&&result.heap&&result.sameBodyResetExcluded;
  const valid=!!(owned&&child&&child.clock.errs===0&&(bait?child.code===1&&!result.pass&&result.visits.sepNPC===100:child.code===0&&result.pass&&Object.keys(result.visits).length===0));
  fs.writeFileSync(path.join(dir,'check.json'),JSON.stringify({valid,bait,wrapperExit:run.status,child,result,note:'100-tick fixture; no full T577 day claim'},null,2));
  if(valid)pass++;else fail++;console.log((valid?'PASS ':'FAIL ')+name+' '+JSON.stringify({wrapperExit:run.status,childCode:child&&child.code,result}));
}
console.log(`${pass} pass / ${fail} fail · ${out}`);process.exit(fail?1:0);
