#!/usr/bin/env node
'use strict';
// Compare the exact SBC field serialization, and analytical position snapshots.
const fs=require('fs');
const read=f=>fs.readFileSync(f,'utf8').trim().split('\n').filter(Boolean).map(s=>JSON.parse(s));
const [aa,bb]=process.argv.slice(2);if(!aa||!bb)throw Error('usage: t1248-table.js tick.jsonl des.jsonl');
const A=read(aa),B=read(bb),days=a=>a.filter(x=>x.day!=null),a=days(A),b=days(B),bm=new Map(b.map(x=>[x.day,x]));let same=0,compared=0,first=null;
const perDay=[];
for(const x of a){const y=bm.get(x.day);if(!y)continue;compared++;const yes=x.hash===y.hash;if(yes)same++;perDay.push([x.day,yes]);if(!yes&&!first){const fields=[];for(let i=0;i<x.villages.length;i++){const v=x.villages[i],w=y.villages[i];if(!w||v.name!==w.name){fields.push({name:v.name,field:'village-order'});continue;}for(let j=0;j<4;j++)if(v.fields[j]!==w.fields[j])fields.push({name:v.name,field:['st','pp','hs','tr'][j],tickHash:v.fields[j],desHash:w.fields[j],tickRaw:v.raw?.[j],desRaw:w.raw?.[j]});}first={day:x.day,fields};}}
const cpB=new Map(B.filter(x=>x.checkpoint!=null).map(x=>[x.checkpoint,x])),errs=[];let unmatchedTick=0,unmatchedDes=0,checkpoints=0;
for(const x of A.filter(x=>x.checkpoint!=null)){const y=cpB.get(x.checkpoint);if(!y)continue;checkpoints++;const m=new Map(y.bodies.map(v=>[v[0],v]));for(const v of x.bodies){const w=m.get(v[0]);if(!w){unmatchedTick++;continue;}errs.push(Math.hypot(v[1]-w[1],v[2]-w[2])/32);m.delete(v[0]);}unmatchedDes+=m.size;}
errs.sort((x,y)=>x-y);const q=p=>errs.length?errs[Math.min(errs.length-1,Math.floor(errs.length*p))]:null;
const cpu=rs=>rs.reduce((s,x)=>s+(x.day>1?x.cpuSec:0),0),timing=rs=>rs.find(x=>x.tickTiming)?.tickTiming||null;
const out={expectedDays:400,compared,same,complete:a.length===400&&b.length===400,firstDifference:first,perDay,position:{checkpoints,matched:errs.length,unmatchedTick,unmatchedDes,p50M:q(.5),p90M:q(.9),maxM:q(1)},cpuSecExcludingBoot:[cpu(a),cpu(b)],tickTiming:[timing(A),timing(B)],lastStats:[a.at(-1)?.stats,b.at(-1)?.stats],lastRuntime:b.at(-1)?.runtime};
console.log(JSON.stringify(out,null,2));
