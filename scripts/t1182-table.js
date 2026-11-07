'use strict';
// T1182 계측 결과 모으기(판정 없음). 인자: 서버 로그 폴더, 랩 JSON 폴더.
const fs=require('fs'),path=require('path');
const serverRoot=process.argv[2],labRoot=process.argv[3];
if(!serverRoot||!labRoot)throw new Error('node scripts/t1182-table.js <server-root> <lab-root>');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),server=[],lab=[];
for(const name of fs.readdirSync(serverRoot).filter(n=>/-(plan|800)\.log$/.test(n)).sort()){
 const log=fs.readFileSync(path.join(serverRoot,name),'utf8'),dir=(log.match(/ · 판 (\/[^\s]+)/)||[])[1];
 if(!dir||!fs.existsSync(dir))continue;
 for(const f of fs.readdirSync(dir).filter(n=>/^sbc-\d+\.json$/.test(n)).sort()){
  const p=path.join(dir,f),d=read(p),o=fs.existsSync(p+'.t1182.json')?read(p+'.t1182.json'):null;
  const elapsed=(log.match(new RegExp('시드 '+d.seed+' '+d.days+'일 판 ([0-9]+)초'))||[])[1];
  server.push({mode:name.replace(/\.log$/,''),seed:d.seed,days:d.days,elapsedSec:elapsed?+elapsed:null,elapsedUsPerDay:elapsed?+elapsed*1e6/d.days:null,pop:d.eight.pop,empty:d.empty,starved:d.bodyExit?.died?.starve??null,econStarved:d.deadTot,dissolved:d.dissolved,trade:o?.trade??null,tradeNoBody:o?.tradeNoBody??null,arrive:o?.arrive??null,arriveNoBody:o?.arriveNoBody??null,deposit:o?.deposit??null,depositNoBody:o?.depositNoBody??null,moveUs:o?.moveUs??null,tickUs:o?.tickUs??null,meanBodies:o?.meanBodies??null,meanActors:o?.meanActors??null,errors:o?.errors??null,file:p});
 }
}
for(const mode of fs.readdirSync(labRoot).sort()){
 const dir=path.join(labRoot,mode);if(!fs.statSync(dir).isDirectory())continue;
 for(const f of fs.readdirSync(dir).filter(n=>/^\d+\.json\.t1182\.json$/.test(n)).sort()){
  const p=path.join(dir,f),d=read(p);lab.push({mode,seed:+f.split('.')[0],...d,file:p});
 }
}
console.log(JSON.stringify({server,lab},null,2));
