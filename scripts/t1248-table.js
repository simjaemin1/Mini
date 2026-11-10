#!/usr/bin/env node
'use strict';
// T1248 관측 자료만 읽는다. 공식 SBC 지문과 원문 차이, 몸 자리, 비용을 구분한다.
const fs = require('fs'), path = require('path');
const [left, right] = process.argv.slice(2);
if (!left || !right) throw Error('usage: t1248-table.js tick-directory des-directory');
const read = p => fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
const lines = p => fs.existsSync(p) ? fs.readFileSync(p,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
function load(dir) {
  const server = path.join(dir,'server');
  const file = fs.readdirSync(server).find(n => n.endsWith('.json.sbc.json'));
  return { sbc: file ? read(path.join(server,file)) : null, raw:lines(path.join(dir,'days.jsonl')),
    body:lines(path.join(dir,'body.1020.jsonl')), meta:read(path.join(dir,'days.jsonl.meta.json')), source:read(path.join(dir,'source.json')) };
}
const A=load(left), B=load(right), names=['warehouse','people','housing','treasury'];
function firstValue(a,b,key='') {
  if (JSON.stringify(a)===JSON.stringify(b)) return null;
  if (a && b && typeof a==='object' && typeof b==='object') {
    for (const k of new Set([...Object.keys(a),...Object.keys(b)])) {
      const d=firstValue(a[k],b[k],key+'/'+k); if(d) return d;
    }
  }
  return {path:key,tick:a===undefined?'[absent]':a,des:b===undefined?'[absent]':b};
}
const byDay=new Map(B.sbc.days.map(r=>[r[0],r]));let compared=0,same=0,first=null;
for(const a of A.sbc.days) {
  const b=byDay.get(a[0]);if(!b)continue;compared++;
  if(a[1]===b[1] && a[2]===b[2] && JSON.stringify(a[3])===JSON.stringify(b[3])){same++;continue;}
  if(first)continue;
  first={day:a[0],econ:[a[1],b[1]],villages:[]};
  for(let i=0;i<Math.max(a[3].length,b[3].length);i++) {
    const x=a[3][i]||'',y=b[3][i]||'';if(x===y)continue;
    const parts=names.filter((_,j)=>x.slice(j*4,j*4+4)!==y.slice(j*4,j*4+4));
    first.villages.push({name:A.sbc.names[i]||B.sbc.names[i],parts});
  }
}
if(first) {
  const a=A.raw.find(r=>r.day===first.day),b=B.raw.find(r=>r.day===first.day);
  if(a&&b) for(const row of first.villages) {
    const x=a.villages.find(v=>v.name===row.name),y=b.villages.find(v=>v.name===row.name);
    row.firstValues=row.parts.map(part=>({part,...firstValue(x&&x.parts[names.indexOf(part)],y&&y.parts[names.indexOf(part)])}));
  }
}
const errors=[],cp=[],cpB=new Map(B.body.filter(r=>r.cp!=null).map(r=>[r.cp,r]));let labels=0,missingA=0,missingB=0;
const quantile=(v,q)=>v.length?v[Math.min(v.length-1,Math.floor(v.length*q))]:null;
for(const a of A.body.filter(r=>r.cp!=null)) {
  const b=cpB.get(a.cp);if(!b)continue;const mb=new Map(b.b.map(r=>[r[0],r])),local=[];
  for(const r of a.b){const s=mb.get(r[0]);if(!s){missingB++;continue;}mb.delete(r[0]);
    const e=Math.hypot(r[1]-s[1],r[2]-s[2])/32;errors.push(e);local.push(e);labels+=r[3]===s[3];}
  missingA+=mb.size;local.sort((x,y)=>x-y);cp.push({day:a.cp,n:local.length,medianM:quantile(local,.5),maxM:quantile(local,1)});
}
errors.sort((x,y)=>x-y);
function costs(o) {
  const rows=o.body.filter(r=>r.d!=null),last=rows.at(-1),s=last&&last.st;
  if(!s)return null;
  const clock=last.clk||0,bodyTicks=s.bodyTicks||s.steps+s.held;
  const measuredNs=(s.nsStep||0)+(s.nsMove||0)+(s.nsQueue||0)+(s.nsHeld||0);
  return {lastDay:last.d,farm:last.farm,pop:last.pop,cpuSeconds:o.meta&&o.meta.cpuSeconds,
    wallSeconds:o.meta&&o.meta.wallSeconds,bodyTicks,steps:s.steps,holdChecks:s.holdChecks||0,
    awakeStepShare:s.steps/bodyTicks,bodyDispatchUs:measuredNs/bodyTicks/1000,
    clockAdjustedBodyDispatchUs:(measuredNs-clock*((s.nStep||0)+(s.nHeld||0)+(s.nMoveTicks||0)))/bodyTicks/1000,
    nsStep:s.nsStep,nsMove:s.nsMove,nsQueue:s.nsQueue||0,workKinds:s.workKinds,queue:s.queue};
}
const hashMatch=A.source&&B.source&&JSON.stringify(A.source.source)===JSON.stringify(B.source.source);
console.log(JSON.stringify({left,right,sourceHashesEqual:hashMatch,official:{compared,same,first},
  positions:{checkpoints:cp.length,bodies:errors.length,medianM:quantile(errors,.5),p90M:quantile(errors,.9),maxM:quantile(errors,1),labelShare:errors.length?labels/errors.length:null,onlyTick:missingB,onlyDes:missingA,rows:cp},
  costs:{tick:costs(A),des:costs(B)}},null,2));
