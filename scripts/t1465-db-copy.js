#!/usr/bin/env node
'use strict';
// Fresh synthetic DB copy: actual village centres and canonical old-map ore fields.
// Other fields are preservation sentinels. Never opens a production DB.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const dir=process.argv[2],out=process.argv[3],oldMap=process.argv[4];
if(!dir||!out||!oldMap)throw Error('usage: t1465-db-copy.js SCRATCH OUTPUT OLD_TERRAIN_JSON');
fs.mkdirSync(dir,{recursive:true});
const {DatabaseSync}=require('node:sqlite'),Module=require('module'),load=Module._extensions['.json'];
const file=require.resolve('../server/hanbando-terrain.json');
Module._extensions['.json']=function(m,f){if(f!==file)return load(m,f);m.exports=JSON.parse(fs.readFileSync(oldMap,'utf8'));};
const M=require('./migrate-db-ore-only'),readOre=M.canonicalOreReader('hanbando');
const centres=JSON.parse(fs.readFileSync(path.join(__dirname,'../계측/T1465_2026-11-23/광맥-진단.json'))).villages;
const dbPath=path.join(dir,'old-map-copy.db');if(fs.existsSync(dbPath))throw Error('Refusing to overwrite fixture');
const db=new DatabaseSync(dbPath);db.exec('CREATE TABLE villages(id INTEGER PRIMARY KEY,name TEXT,cx INTEGER,cy INTEGER,zone TEXT,econ_state TEXT,population INTEGER,day INTEGER)');
const put=db.prepare('INSERT INTO villages VALUES(?,?,?,?,?,?,?,?)');let i=0;
for(const v of centres){const row={cx:v.ccx,cy:v.ccy,id:++i};put.run(i,v.name,v.ccx,v.ccy,'hanbando',JSON.stringify({land:{fertility:1+i/100,water:.7,wood:.9,territory:[[v.ccx,v.ccy]],...readOre(row)},storage:{food:123},marker:'preserve'}),8,0);}
db.close();const bytes=fs.readFileSync(dbPath);fs.writeFileSync(out,JSON.stringify({kind:'fresh synthetic old-map DB copy; canonical old-map ore fields; sentinel unrelated fields',rows:centres.length,dbPath,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),oldTerrainSha256:crypto.createHash('sha256').update(fs.readFileSync(oldMap)).digest('hex')},null,2));
