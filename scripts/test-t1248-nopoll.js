#!/usr/bin/env node
// @regress
'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict'),{spawnSync}=require('child_process');
const root=path.join(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'t1248-nopoll-'));
for(const bait of [false,true]){
 const d=path.join(dir,bait?'bait':'normal');fs.mkdirSync(d);
 const env={...process.env,T1241_DES:'1',T1241_PROBE:'1',T1243_FARM_ON:'1',T1197_MEAL_BODY:'0',T745_VCLOCK:'1',VILLAGE_MAX:'1',VILLAGE_DAY_MS:'1440000',VILLAGE_NPC_CAP:'Infinity',T577_DIR:d,T577_TAG:'audit',T577_PAR:'1',T1248_NOPOLL_BAIT:bait?'1':'0',T1248_CHILD_STATUS:path.join(d,'child.json'),T699_ROUTE_CACHE:path.join(os.tmpdir(),'durango-route-cache')};
 env.NODE_OPTIONS=['t1248-child-status.js','t1248-nopoll-hook.js','t745-vclock.js'].map(f=>'--require '+path.join(root,'scripts',f)).join(' ');
 const r=spawnSync(process.execPath,[path.join(root,'scripts/t577-server-run.js'),'3','1020'],{cwd:root,env,encoding:'utf8',timeout:300000});fs.writeFileSync(path.join(d,'wrapper.log'),(r.stdout||'')+(r.stderr||''));assert(!r.error,String(r.error));
 const result=JSON.parse(fs.readFileSync(path.join(d,'audit-1020.json.nopoll.json'))),child=JSON.parse(fs.readFileSync(env.T1248_CHILD_STATUS));assert.equal(child.signal,null);assert.equal(child.code,bait?1:0,JSON.stringify(result));assert.equal(result.pass,!bait);assert.equal(result.ticks,100);if(bait)assert(result.visits._inputTOStep>0);
 console.log('PASS '+(bait?'full spatial polling bait is caught':'100 real ticks: held actor never enters eight central per-body helpers')+' '+JSON.stringify(result));
}
console.log('RESULT 2 passed / 0 failed');console.log('ARTIFACTS '+dir);if(process.env.T1248_KEEP!=='1')fs.rmSync(dir,{recursive:true,force:true});
