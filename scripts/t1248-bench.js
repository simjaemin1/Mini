#!/usr/bin/env node
'use strict';
// 커널만의 실측이다. NPC 생활층/공간색인/존 전체 한 틱 값으로 부르지 않는다.
const { BodyQueue }=require('../server/des-work'),fs=require('fs');
const clock=process.hrtime.bigint,results=[];
for(const n of [3900,16000]){
 const empty=[],burst=[];
 for(let round=0;round<20;round++){
  const q=new BodyQueue(),actors=new Map();let completed=0;
  for(let id=0;id<n;id++){const body={id};actors.set(id,body);q.hold(id,body,1e7,{kind:'work'});}
  let t=clock();for(let i=0;i<10000;i++)q.run(i,id=>actors.get(id),()=>completed++);empty.push(Number(clock()-t)/1e6/10000);
  t=clock();q.run(1e7,id=>actors.get(id),()=>completed++);burst.push(Number(clock()-t)/1e6);
  if(completed!==n||q.owned.size!==0||q.ready.size!==n)throw Error('nontrivial queue dispatch failed');
 }
 const summary=a=>{a.sort((x,y)=>x-y);return{medianMs:a[a.length>>1],p95Ms:a[Math.floor(a.length*.95)],minMs:a[0],maxMs:a.at(-1)};};
 results.push({bodies:n,scope:'BodyQueue only; not a zone tick',emptyTick:summary(empty),allDueSameTime:summary(burst)});
}
const out={node:process.version,results};if(process.env.T1248_BENCH_OUT)fs.writeFileSync(process.env.T1248_BENCH_OUT,JSON.stringify(out,null,2));console.log(JSON.stringify(out));
