'use strict';
// Human-reviewed direct player entry paths. This does not infer transitive economic gates.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),acorn=require('acorn');
const ROOT=path.resolve(__dirname,'../..'),file='server/zone.js',source=fs.readFileSync(path.join(ROOT,file),'utf8');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const ast=acorn.parse(source,{ecmaVersion:'latest',sourceType:'script',locations:true});
const names=['doCraft','doCraftItem','doCraftBuilding','doCook','doPreserve','doBoilSalt','doCraftEquipment',
 'tryFurnaceSmelt','tryKilnBurn','_siteStart','_siteAdvance','tryFurnaceStart','tryFurnaceAdvance',
 'tryKilnStart','tryKilnAdvance','tryWellStart','tryWellAdvance'];
const functions={};
function walk(n){
 if(!n||typeof n.type!=='string')return;
 if(n.type==='FunctionDeclaration'&&n.id&&names.includes(n.id.name)){
  if(functions[n.id.name])throw Error('duplicate function '+n.id.name);
  functions[n.id.name]={file,name:n.id.name,line:n.loc.start.line,endLine:n.loc.end.line,sourceSha256:hash(source.slice(n.start,n.end))};
 }
 for(const [k,v] of Object.entries(n))if(k!=='loc'){
  if(Array.isArray(v))for(const x of v)walk(x);else if(v&&typeof v.type==='string')walk(v);
 }
}
walk(ast);for(const n of names)if(!functions[n])throw Error('missing '+n);
const rows=[];
function add(from,to,entries,note){for(let i=from;i<=to;i++)rows.push({id:'S'+String(i).padStart(2,'0'),
 currentStatus:'manual-entry-reviewed',actorKind:'player',directCostGate:false,directUseGate:false,
 jobValueComparison:'not-applicable-player-choice',functions:entries,note});}
add(1,8,['doCraft'],'플레이어가 레시피를 골라 요청. cost는 재료 개수 검사이며 C=재료값+노동값 비교가 아님. 조잡한 석기 정본은 StoneUses.');
add(9,14,['doCraftItem'],'도구 보유·입력 개수 검사 뒤 변환. 도구 마모와 재료 물리 수율을 값 문으로 세지 않음.');
add(15,25,['doCraftBuilding'],'플레이어가 건축물 아이템을 고름. 망치·자재 개수만 확인. 실제 배치 허가 경로는 별개.');
add(26,31,['doCook'],'플레이어 선택 뒤 시설·소유·입력 개수·대기열 자리 확인. 영양·품질 산출을 생산의 손익 판단으로 세지 않음.');
add(32,38,['doPreserve'],'플레이어가 품목·개수를 요청. 시설·로트·곁재료·신선도·산출·대기열 문. NPC 갈무리(E15~18)와 구분.');
add(39,39,['doBoilSalt'],'플레이어 선택. Salt.canBoil에 재료 가능 여부를 묻고 물리 수율·시간으로 대기열에 넣음.');
add(40,40,['tryFurnaceSmelt'],'플레이어가 노를 누름. 소유·철 정광·숯·시대 수율·시설 작동을 확인하며 NPC 제련(E09)과 구분.');
add(41,41,['tryKilnBurn'],'플레이어가 가마를 누름. 통나무·시설 작동·물리 적재량·시간을 확인하며 NPC 숯가마(E20)와 구분.');
add(42,46,['doCraftEquipment'],'플레이어가 장비·재료·배합을 고름. 시설·원재료·배합 가능 여부를 검사. 합금 품질은 NPC의 이익 최대화와 다른 호출.');
add(47,48,['tryFurnaceStart','tryFurnaceAdvance','_siteStart','_siteAdvance'],'플레이어가 시설·위치를 고름. 시대·부지·도구·단계 자재를 확인.');
add(49,49,['tryKilnStart','tryKilnAdvance','_siteStart','_siteAdvance'],'플레이어가 가마 위치를 고름. 시대·부지·도구·단계 자재를 확인.');
add(52,52,['tryWellStart','tryWellAdvance','_siteStart','_siteAdvance'],'플레이어가 우물 위치를 고름. T509 손잡이·부지·도구·단계 자재를 확인.');
if(rows.length!==50||new Set(rows.map(r=>r.id)).size!==50)throw Error('manual identity coverage');
const result={base:'0e2ae3916acdb7380b7eb615a0f3c85d2b41f61d',
 scope:'직접 플레이어 진입 함수의 읽기 판정만. 전이 호출 전수·NPC 자동 생산·켜진 라이브 설정의 증명이 아님. S50/S51 혼합 행, S53 마을 창설, S54 NPC 다리, 경제층 28줄·랩 1줄은 별도 검토 중.',
 sourceFiles:{[file]:hash(source)},functions,rows};
fs.writeFileSync(path.join(__dirname,'manual-recipes-evidence.json'),JSON.stringify(result,null,1)+'\n');
console.log(JSON.stringify({manualEntriesReviewed:rows.length,worldsLaunched:0}));
