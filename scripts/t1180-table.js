'use strict';
// T1180 원자료 집계(판정 없음): node scripts/t1180-table.js <server-root> <lab-root>
const fs=require('fs'),path=require('path'),[serverRoot,labRoot]=process.argv.slice(2),server=[],lab=[];
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
if(!serverRoot||!labRoot)throw new Error('server root and lab root required');
for(const name of fs.readdirSync(serverRoot).filter(n=>/^(off|fish|wood|forage|all|fuel-control|fuel-A)-(plan|800|smoke)\.log$/.test(n)).sort()){
 const log=fs.readFileSync(path.join(serverRoot,name),'utf8'),dir=log.match(/ · 판 (\/[^\s]+)/)?.[1];if(!dir||!fs.existsSync(dir))continue;
 for(const file of fs.readdirSync(dir).filter(n=>/^sbc-\d+\.json$/.test(n)).sort()){
  const p=path.join(dir,file),d=read(p),o=fs.existsSync(p+'.t1180.json')?read(p+'.t1180.json'):null;
  const elapsed=log.match(new RegExp('시드 '+d.seed+' '+d.days+'일 판 ([0-9]+)초'))?.[1];
  const enabled={fisher:o?.flags.T312_FISH_ACT!=='0',lumberjack:o?.flags.T325_WOOD_ACT!=='0',forager:o?.flags.T347_FORAGE_ACT!=='0'};
  const formulaOn=o?Object.entries(o.formula).reduce((n,[k,v])=>n+(enabled[k.split('/')[0]]?v:0),0):null;
  server.push({mode:name.replace(/\.log$/,''),seed:d.seed,days:d.days,pop:d.eight.pop,empty:d.empty,dissolved:d.dissolved,starved:d.bodyExit?.died?.starve??null,econStarved:d.deadTot,elapsedSec:elapsed?+elapsed:null,tickUs:o?.tickUs??null,allIn:o?.allIn??null,bodyIn:o?.bodyIn??null,remoteIn:o?.remoteIn??null,lumberjackZeroDays:o?.days.reduce((n,d)=>n+(d.lumberjackZero||0),0)??null,aliveVillageDays:o?.days.reduce((n,d)=>n+(d.aliveVillages||0),0)??null,formulaOn,formula:o?.formula??null,rejected:o?.rejected??null,errors:o?.errors??null,source:o?.source??null,file:p});
 }
}
for(const mode of fs.readdirSync(labRoot).sort()){const dir=path.join(labRoot,mode);if(!fs.statSync(dir).isDirectory())continue;for(const file of fs.readdirSync(dir).filter(n=>/^\d+\.json\.t1180\.json$/.test(n)).sort()){const p=path.join(dir,file);lab.push({mode,seed:+file.split('.')[0],...read(p),file:p});}}
console.log(JSON.stringify({server,lab},null,2));
