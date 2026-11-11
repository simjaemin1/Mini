'use strict';
// Auxiliary registry audit only. No CPU from this run goes into the 30-day table.
if(!process.env.T577_SEED||!/zone\.js$/.test(process.argv[1]||''))return;
const fs=require('node:fs'),path=require('node:path'),original=global.setInterval,rows=[];
global.setInterval=function(fn,ms,...args){const r={periodMs:Number(ms),source:String(fn).slice(0,320),stack:new Error().stack.split('\n').slice(2,7),calls:0};rows.push(r);return original(function(){r.calls++;return fn.apply(this,arguments);},ms,...args);};require('node:timers').setInterval=global.setInterval;
process.on('exit',code=>fs.writeFileSync(path.join(process.env.T1270_OUT,'timer-audit.json'),JSON.stringify({kind:'auxiliary interval registry; not the 30-day CPU sample',code,clock:global.__t745?.(),rows},null,2)));
