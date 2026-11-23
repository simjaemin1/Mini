#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert'),crypto=require('crypto'),{DatabaseSync}=require('node:sqlite');
const M=require('./migrate-db-ore-only'),dir=process.argv[2],out=process.argv[3];
if(!dir||!out)throw Error('usage: t1465-db-verify.js SCRATCH OUTPUT');
const original=path.join(dir,'old-map-copy.db'),dbPath=path.join(dir,'apply-copy.db'),backupPath=path.join(dir,'ore-before.json');
if(fs.existsSync(dbPath))throw Error('Refusing to overwrite apply copy');fs.copyFileSync(original,dbPath);
const read=()=>{const db=new DatabaseSync(dbPath,{readOnly:true});try{return db.prepare('SELECT * FROM villages ORDER BY id').all();}finally{db.close();}};
const rows0=read(),bytes0=fs.readFileSync(dbPath),preview=M.migrate({dbPath});assert.deepStrictEqual(fs.readFileSync(dbPath),bytes0,'preview changed DB bytes');assert(!fs.existsSync(backupPath));
const applied=M.migrate({dbPath,apply:true,backupPath}),rows1=read(),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),backupSha=sha(fs.readFileSync(backupPath));
let protectedRows=0;
for(let i=0;i<rows0.length;i++){
 const a={...rows0[i]},b={...rows1[i]},e0=JSON.parse(a.econ_state),e1=JSON.parse(b.econ_state);delete a.econ_state;delete b.econ_state;assert.deepStrictEqual(a,b);
 for(const k of M.FIELDS){delete e0.land[k];delete e1.land[k];}assert.deepStrictEqual(e0,e1,'unrelated state changed '+a.name);protectedRows++;
}
const second=M.migrate({dbPath,apply:true,backupPath});assert.strictEqual(second.changed,0,'second apply changed fields');assert.strictEqual(sha(fs.readFileSync(backupPath)),backupSha,'backup overwritten');
const rollbackPreview=M.migrate({dbPath,rollbackPath:backupPath});const rolled=M.migrate({dbPath,apply:true,rollbackPath:backupPath});assert.deepStrictEqual(read(),rows0,'rollback content differs');
const source=JSON.parse(fs.readFileSync(path.join(path.dirname(out),'DB-사본.json')));assert.strictEqual(sha(fs.readFileSync(original)),source.sha256,'original synthetic DB changed');
fs.writeFileSync(out,JSON.stringify({fixture:source.kind,rows:rows0.length,previewChanged:preview.changed,changedNames:applied.changes.map(c=>c.name),protectedRows,previewByteIdentical:true,originalUntouched:true,secondApplyChanged:second.changed,backupUnchanged:true,rollbackPreviewChanged:rollbackPreview.changed,rollbackChanged:rolled.changed,rollbackRowsIdentical:true,preview},null,2));
