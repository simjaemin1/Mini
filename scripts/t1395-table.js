#!/usr/bin/env node
'use strict';
// T1395 전수표 자: 제품을 실행/수정하지 않고 선언 인덱스·고정 대조 목록·사람이 검토한 규칙 행을 묶는다.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),L=require('./lib-lab-diff');
const root=path.join(__dirname,'..'),out=process.argv[2];if(!out)throw Error('출력 폴더 필요');
const read=p=>fs.readFileSync(path.join(root,p),'utf8'),load=n=>JSON.parse(fs.readFileSync(path.join(out,n),'utf8'));
const inv=load('선언목록.json'),rules=load('규칙대조.json'),hist=load('갈림-이력.json'),history=new Map(hist.rows.map(r=>[r.id,r]));
if(hist.shallow!=='false')throw Error('얕은 이력의 경계를 갈린 날로 사용할 수 없음');
const textCache=new Map();function text(f){if(!textCache.has(f))textCache.set(f,read(f));return textCache.get(f);}
function loc(file,re){const rel=file.split('#')[0],raw=text(rel),part=L.readRoot(file),m=re.exec(part);if(!m)throw Error(file+' '+re);const start=raw.length-part.length+m.index;return {file:rel,line:raw.slice(0,start).split('\n').length,start,end:start+m[0].length,needle:m[0]};}
function manualLoc(pair,side){if(!pair)return null;const[file,needle]=pair,raw=text(file);const from=side==='lab'&&/마을실험실|전쟁실험실/.test(file)&&!needle.startsWith('id=')?Math.max(0,raw.indexOf('<!-- ENGINE-BUNDLE-END -->')):0;const at=raw.indexOf(needle,from);if(at<0)throw Error(file+' '+needle);return {file,line:raw.slice(0,at).split('\n').length,start:at,end:at+needle.length};}
const same=L.checkSame(),different=L.checkDiffs();if(same.some(r=>!r.ok)||different.some(r=>!r.found||r.same))throw Error('대조 줄이 빨강');
const rows=[];
for(const [i,p]of L.SAME.entries())rows.push({id:p.id,category:'같음',what:p.what,lab:loc(...p.lab),srv:loc(...p.srv),labValue:same[i].lab,serverValue:same[i].srv,pedigree:'갈림 없음(현재 식 대조); 수치의 역사적 승인까지 뜻하지 않음',guard:true});
for(const [i,p]of L.DIFFS.entries())rows.push({id:p.id,category:p.knob?'다름(손잡이 뒤)':'다름(손잡이 없이)',what:p.what,lab:loc(...p.lab),srv:loc(...p.srv),labValue:different[i].lab,serverValue:different[i].srv,knob:p.knob||'',pedigree:p.id==='D1-TERR_START_CAP'?'족보 875: 랩 식이 목표. 서버 차이를 유지하라는 승인은 아님':'다르게 두기로 한 족보 승인 미확인; 임의 허락 처리하지 않음',guard:false});
for(const [i,p]of inv.inline.entries())rows.push({id:'I'+(i+1),category:'같음',what:'공용 인라인 글자 '+p.canonical,lab:{file:p.file,line:p.line},srv:{file:p.canonical,line:1},labValue:'같은 글자 SHA256 '+p.sha256,serverValue:'같은 글자',pedigree:'econ/path/battle 인라인 도구 및 8블록 바이트 대조; 호출 입력 동일은 별도',inline:true});
for(const p of rules)rows.push({...p,lab:manualLoc(p.lab,'lab'),srv:manualLoc(p.srv,'srv')});
const counts={};for(const r of rows)counts[r.category]=(counts[r.category]||0)+1;
const md=[];const put=s=>md.push(s);const esc=s=>String(s??'—').replace(/\|/g,'&#124;').replace(/\n/g,' ');
function val(s){s=String(s??'—');return s.length>180?'표/식 전체 '+s.length+'자 · SHA256 '+crypto.createHash('sha256').update(s).digest('hex').slice(0,16):s;}
function link(p){return p?'['+p.file+':'+p.line+'](../../'+p.file+'#L'+p.line+')':'—';}
function provenance(r){const h=history.get(r.id);if(!h)return r.category==='같음'?'현재 같음 / 갈림 없음':'해당 없음(랩/서버 독립 도구·상태)';return ['lab','srv'].filter(k=>h[k]).map(k=>k+': '+(h[k].log.split('\n')[0]||'해당 글자의 출현 커밋 없음')).join(' / ');}
function table(rs){put('| ID · 항목 | 랩 자리 | 서버 자리 | 판정 · 손잡이/기본 | 랩 값/경로 ↔ 서버 값/경로 | 언제 갈렸나(`git log -S`) · 승인 근거 |');put('|---|---|---|---|---|---|');for(const r of rs)put('| '+[r.id+' '+r.what,link(r.lab),link(r.srv),r.category+(r.knob?' · '+r.knob:''),val(r.labValue)+' ↔ '+val(r.serverValue),provenance(r)+' · '+r.pedigree].map(esc).join(' | ')+' |');put('');}
put('# T1395 랩 ↔ 서버 전수표');put('');put('판정 행 '+rows.length+' = '+Object.entries(counts).map(([k,v])=>k+' '+v).join(' · ')+'; 손 사본 대조 '+L.SAME.length+'줄. 제품 값 변경 0.');put('');
put('네 HTML의 script를 구문 분석했다. econ/battle/equilibrium/army-morale의 완전 동일 인라인 6블록과 path 2블록은 같은 글자로 묶었다. 인라인을 제외한 상수/표 선언은 '+inv.constants.filter(c=>c.file.startsWith('lab/')).length+'개이며 아래 선언 목록으로 빠짐없이 연결한다. 함수 인덱스도 선언목록.json에 보존하지만 UI/렌더 함수 전부를 서버 규칙이라고 세지는 않는다.');put('');
put('숫자/식이 같다는 행은 그 자리만의 대조다. 처음 지도·역할·손잡이·몸/일괄·입력 명부가 달라 전체 세계 결과가 다를 수 있다. 랩만/서버만은 해당 어댑터·도구·상태가 한쪽에만 있다는 뜻이며, 기능 전체가 상대편에 없다는 뜻은 아니다.');put('');
put('이력은 완전한 로컬 이력에서 현재 글자에 git log -S를 실행한 결과다. 최초 설계일이나 의미상 갈림 날짜를 증명하지 않는다. 행의 출현/삭제·이동/포맷 변경 후보를 그대로 표시하고, 다르게 두라는 족보가 없으면 승인 미확인으로 남긴다. 실제 검색문·두 커밋은 갈림-이력.json에 있다.');put('');
put('## 1. 처음 조건·일일 규칙·서버/랩 전용 연결');put('');table(rows.filter(r=>/^R/.test(r.id)));
put('## 2. 값/기하가 다른 자리 — 허락 목록 후보');put('');table(rows.filter(r=>/^D/.test(r.id)));
put('## 3. 같은 글자 인라인');put('');table(rows.filter(r=>r.inline));
put('## 4. 손으로 옮긴 같은 값·식·표 — 배선 [P]의 실제 대조 줄');put('');table(rows.filter(r=>r.guard));
const byRule=new Map(rules.map(r=>[r.id,r]));
function group(c){const n=c.name;if(n==='MU')return 'R33';if(/^(WAR_|WARS|TRIBUTES|AUX|LEVY_)/.test(n))return c.file.includes('마을실험실')?'R29':'R32';if(/^(MOB_|HUNT_|SP_W)/.test(n))return 'R23';if(/^(BDT_|BANDITS|DENS)/.test(n))return 'R28';if(/^(HOUSE_|LAND_PER|HALL_|LOT_|FARM_GAP|ALLEY_|LIFE_HOUSE|YARD_|AISLE|STREAM_GUARD)/.test(n))return 'R06';if(/^(L_MKT|MKT_)/.test(n))return 'R20';if(/CROP|L_(YEAR|MOSTART|SEASONS|START)/.test(n))return 'R09';if(/L_(CLEAR|FRONTIER|LAND)/.test(n))return 'R17';if(/(WOOD|TREE|CHOP|FRUIT)/.test(n))return 'R26';if(/(ORE|MINE|HAUL|FORAGE|FISH|L_FORAGE|F_MAX)/.test(n))return 'R28';if(/^(NPC_|BODY_|BX_)/.test(n))return 'R25';if(/^(G_|L_FLOOR|L_HGAP|L_MAXFL|L_BUILD|PSITE|HUT_)/.test(n))return 'R16';if(/L_T7|L_LON/.test(n))return 'R10';if(/^(L_|JOBACT|BEDO)/.test(n))return 'R08';if(c.file.includes('사냥실험실'))return 'R38';if(c.file.includes('전투실험실'))return 'R37';return 'R39';}
put('## 5. 상수·표 선언의 전수 인덱스');put('');put('이 표는 상수 이름만 셌다는 주장을 막는 피복표다. 직접 대조로 보호되는 것은 P/D ID, 나머지 로컬 상태·도구·레거시/어댑터 선언은 위 규칙 행(R)에 연결했다. **R 연결은 그 선언 값이 서버와 같다는 판정이 아니다.** 식 전문·범위·소스 해시는 선언목록.json에 있다.');put('');put('| 랩 선언 | 값/식 | 직접 대조 또는 규칙 행 |');put('|---|---|---|');
let direct=0,grouped=0;
for(const c of inv.constants.filter(c=>c.file.startsWith('lab/'))){const hit=rows.filter(r=>(r.guard||/^D/.test(r.id))&&r.lab.file===c.file&&r.lab.start<=c.start&&r.lab.end>=c.end);if(hit.length)direct++;else grouped++;put('| '+[link(c)+' `'+c.name+'`',val(c.expr),hit.length?hit.map(r=>r.id).join(', '):group(c)+' '+byRule.get(group(c)).what+'(로컬 선언; 개별 값 동일 판정 아님)'].map(esc).join(' | ')+' |');}
put('');put('직접 비교에 걸린 선언 '+direct+' / 규칙·로컬 상태에 연결한 선언 '+grouped+' / 빠진 선언 0.');
const result={counts,total:rows.length,manualGuards:L.SAME.length,scalarDiffs:L.DIFFS.length,inline:inv.inline.length,labDeclarations:direct+grouped,directDeclarations:direct,groupedDeclarations:grouped,rows};
fs.writeFileSync(path.join(out,'전수표.md'),md.join('\n')+'\n');fs.writeFileSync(path.join(out,'대조요약.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({counts,total:rows.length,manualGuards:L.SAME.length,labDeclarations:direct+grouped,directDeclarations:direct,groupedDeclarations:grouped}));
