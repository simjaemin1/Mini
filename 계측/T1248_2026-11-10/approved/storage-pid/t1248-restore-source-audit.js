'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto'),acorn=require('/workspace/Mini/node_modules/acorn');
const root='/workspace/Mini',base='/tmp/t1248-final-v6',snapshot='/tmp/t1248-final-v7',out={baseCommit:'e1e65d6abf75363982061dad6d540db80811198c',currentSnapshot:snapshot,files:{}};
const read=(r,f)=>fs.readFileSync(path.join(r,f),'utf8'),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function fn(s,name){const ast=acorn.parse(s,{ecmaVersion:'latest',sourceType:'script'}),n=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert(n,name);return {start:n.start,end:n.end,text:s.slice(n.start,n.end)};}
for(const f of ['server/des.js','server/des-body.js','server/zone.js','server/villages.js']){
 const old=read(base,f),now=read(root,f);assert.equal(now,read(snapshot,f),'snapshot '+f);let normalized=now;
 if(f==='server/zone.js'){
  const a=fn(old,'_desRestore'),b=fn(now,'_desRestore');normalized=normalized.slice(0,b.start)+a.text+normalized.slice(b.end);
  const guard='  if(npc._desRestoreUnsafe)return; // An unverified restored owner stays on ticks for this process.\n';assert.equal(normalized.split(guard).length,2);normalized=normalized.replace(guard,'');
 }else if(f==='server/villages.js'){
  const n=fn(now,'desRestoreOwners'),comment='// Runtime pids are recreated at boot. Rekey canonical requests once (including\n// pid swaps), then require both the saved and restored owner before parking.\n';assert.equal(now.slice(n.start-comment.length,n.start),comment);normalized=normalized.slice(0,n.start-comment.length)+normalized.slice(n.end+1);normalized=normalized.replace('module.exports.desRestoreOwners=desRestoreOwners;\n','');
 }
 assert.equal(normalized,old,'all other bytes unchanged: '+f);out.files[f]={baseSHA256:sha(old),currentSHA256:sha(now),unchangedOutsideRestoreAndUnsafeGuard:true};
}
out.limit='Long performance measurements remain baseCommit measurements; added guard cost was not measured there. Fresh run counters prove the restore-only functions and unsafe branch are unentered, not equal timing.';
console.log(JSON.stringify(out,null,2));
