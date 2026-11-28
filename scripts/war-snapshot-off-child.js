'use strict';
const fs=require('fs'),F=require('./lib-war-snap-fixture');
const f=F.create(1020);if(process.env.WAR_SNAP_NO_WAR!=='1'){f.mobilize();f.day();for(let i=0;i<600;i++)f.tick();}else{f.villages[1].ccx=100000;for(let d=0;d<10;d++){for(let i=0;i<900;i++)f.tick();f.day();}require('assert').strictEqual(f.war.WARS.length,0,'two far villages remain a no-war host fixture');}
const result=f.at(()=>({meta:f.H._t728Meta(),econs:f.villages.map(v=>f.H.serializeEcon(v.econ))}));
fs.writeFileSync(process.argv[2],JSON.stringify(result));
