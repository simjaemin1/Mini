'use strict';
if(!/server[\\/]zone\.js$/.test(process.argv[1]||''))return;
const fs=require('fs'),assert=require('assert/strict'),Module=require('module'),compile=Module.prototype._compile;
const counts={restoreEntries:0,ownerEntries:0,unsafeAdmissions:0};global.__t1248RestoreAudit=counts;
Module.prototype._compile=function(s,f){for(const [suffix,anchor,replacement]of [
 ['/server/zone.js','function _desRestore(now) {','function _desRestore(now) { global.__t1248RestoreAudit.restoreEntries++;'],
 ['/server/zone.js','if(npc._desRestoreUnsafe)return;','if(npc._desRestoreUnsafe){global.__t1248RestoreAudit.unsafeAdmissions++;return;}'],
 ['/server/villages.js','function desRestoreOwners(ids) {','function desRestoreOwners(ids) { global.__t1248RestoreAudit.ownerEntries++;']
 ])if(f.endsWith(suffix)){assert.equal(s.split(anchor).length,2);s=s.replace(anchor,replacement);}return compile.call(this,s,f);};
process.on('exit',()=>{fs.writeFileSync(process.env.T577_OUT+'.restore-audit.json',JSON.stringify(counts));});
