#!/usr/bin/env node
// @regress
'use strict';
// Three requested contracts through real zone functions, with integration baits.
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict'),{spawnSync}=require('child_process');
const root=path.join(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'t1248-contracts-'));let checks=0;
for(const profile of ['exact','nonzero']){
 const dir=path.join(tmp,profile);fs.mkdirSync(dir);const childStatus=path.join(dir,'child.json');
 const env={...process.env,T1241_DES:'1',T1241_PROBE:'1',T1243_FARM_ON:'1',T1197_MEAL_BODY:profile==='exact'?'0':'1',T1248_BODY_PROFILE:profile,T1248_CHILD_STATUS:childStatus,T1241_OUT:path.join(dir,'legacy'),T745_VCLOCK:'1',VILLAGE_MAX:'1',VILLAGE_DAY_MS:'1440000',VILLAGE_NPC_CAP:'Infinity',T577_DIR:dir,T577_TAG:profile,T577_PAR:'1',T699_ROUTE_CACHE:process.env.T699_ROUTE_CACHE||path.join(os.tmpdir(),'durango-route-cache')};
 env.NODE_OPTIONS=['t1248-child-status.js','t1248-observe.js','t1248-body-hook.js','t745-vclock.js'].map(f=>'--require '+path.join(root,'scripts',f)).join(' ');
 const run=spawnSync(process.execPath,[path.join(root,'scripts/t577-server-run.js'),'3','1020'],{cwd:root,env,encoding:'utf8',timeout:300000});fs.writeFileSync(path.join(dir,'wrapper.log'),run.stdout||'');
 const child=JSON.parse(fs.readFileSync(childStatus,'utf8')),result=JSON.parse(fs.readFileSync(path.join(dir,profile+'-1020.json.contracts.json'),'utf8'));
 assert.equal(child.code,0,JSON.stringify(child));assert.equal(child.signal,null);assert.equal(result.fail,0,JSON.stringify(result));assert.equal(result.pass,profile==='exact'?5:1);
 for(const row of result.results){assert(row.pass,row.name);checks++;console.log('PASS '+row.name);}
 console.log('ZONE '+profile+' actual child=0; fixture stops after contract checks; generic wrapper='+run.status);
}
console.log('RESULT '+checks+' passed / 0 failed');console.log('ARTIFACTS '+tmp);
if(process.env.T1248_KEEP!=='1')fs.rmSync(tmp,{recursive:true,force:true});
