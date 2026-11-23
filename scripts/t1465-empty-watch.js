'use strict';
// Daily read-only exhaustion witness. Does not advance/write the product book.
const fs=require('fs'),S=require('../server/specialty'),T=require('../server/terrain'),SZ=require('../server/pathfind').CELL;
const state={scannedDays:0,firstDay:null,lastDay:null,firstEmptyCellDay:{},firstDepletedVeinDay:{},maxEmptyCells:0},membership=new Map();
let D=null,index=null,OUT=null;
function scan(world,day,out){
 if(state.lastDay===day)return;
 if(!D){D=JSON.parse(fs.readFileSync(require('path').join(__dirname,'../계측/T1465_2026-11-23/광맥-진단.json')));index=new Map(T._getHardcoded()[D.zone].ores.map((o,i)=>[o,i]));OUT=out+'.empty-events.json';}
 state.firstDay??=day;state.lastDay=day;state.scannedDays++;
 const emptyByVein={};let emptyCells=0;
 for(const[key,r]of Object.entries(world._oreStock?.cells||{})){
  const stock=S.oreRegen(r.s,Math.max(0,day-r.day));if(stock>=1)continue;
  emptyCells++;state.firstEmptyCellDay[key]??=day;
  let ids=membership.get(key);if(!ids){const split=key.lastIndexOf(':'),z=key.slice(0,split),[cx,cy]=key.slice(split+1).split(',').map(Number);ids=T.oreCandidatesAt(z,cx*SZ+SZ/2,cy*SZ+SZ/2).map(c=>index.get(c.o));if(ids.some(i=>i==null))throw Error('Unknown physical vein '+key);membership.set(key,ids);}
  for(const i of ids)emptyByVein[i]=(emptyByVein[i]||0)+1;
 }
 state.maxEmptyCells=Math.max(state.maxEmptyCells,emptyCells);
 for(const[i,n]of Object.entries(emptyByVein)){const vein=D.veins[i];if(vein.cells>0&&n===vein.cells)state.firstDepletedVeinDay[vein.name]??=day;}
 if(state.scannedDays%365===0)write();
}
function write(){if(!OUT)return;const tmp=OUT+'.tmp-'+process.pid;fs.writeFileSync(tmp,JSON.stringify({definition:'All canonical physical candidate cells of a vein have stock below the body threshold1; untouched cells are full. Daily at completed economy-day boundary; canonical lazy refill evaluated without writing product records.',...state}));fs.renameSync(tmp,OUT);}
process.on('exit',write);
module.exports={scan};
