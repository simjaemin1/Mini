'use strict';
// Lower-bound cost experiment for the added CPU meter; never subtract as exact overhead.
const fs=require('node:fs'),N=200000,read=()=>{const c=process.threadCpuUsage();return c.user+c.system;};
let last=read(),cur='a';const sums={},calls={};
function enter(cat,id){const t=read();sums[cur]=(sums[cur]||0)+t-last;last=t;const tok={prev:cur,t,id,cat,base:sums[cat]||0};cur=cat;return tok;}
function leave(tok){const t=read();sums[cur]=(sums[cur]||0)+t-last;last=t;cur=tok.prev;const c=calls[tok.id]||(calls[tok.id]={n:0,inclusiveUs:0,categoryUs:0});c.n++;c.inclusiveUs+=t-tok.t;c.categoryUs+=(sums[tok.cat]||0)-tok.base;}
const rounds=[];for(let r=0;r<5;r++){let c=process.cpuUsage();for(let i=0;i<N;i++){const t=enter('b','empty');leave(t);}c=process.cpuUsage(c);rounds.push({n:N,cpuUs:c.user+c.system,usPerPair:(c.user+c.system)/N});}
fs.writeFileSync(process.argv[2],JSON.stringify({node:process.version,rounds,definition:'Empty enter/leave pair including CPU reads and maps; not an exact correction for real callbacks or AST deoptimization.'},null,2));
console.log(JSON.stringify(rounds));
