#!/usr/bin/env node
'use strict';
// Render the measured rows, retaining full typed inputs/outputs in the adjacent JSON.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),L=require('./lib-lab-diff'),S=require('./lib-t1409-source');
const out=process.argv[2];if(!out)throw Error('output directory required');
const policy=require('./t1409-closures.json'),rows=JSON.parse(fs.readFileSync(path.join(out,'같은입력-측정.json'))),facts=new Map(L.checkDiffs().map(r=>[r.id,r]));
const esc=s=>String(s??'—').replace(/\|/g,'&#124;').replace(/\n/g,' '),brief=v=>{const s=JSON.stringify(v);return s.length<220?s:s.slice(0,170)+'… [sha256 '+crypto.createHash('sha256').update(s).digest('hex').slice(0,12)+']';};
function sources(r){if(r.spans)return r.spans.map(s=>{const n=S.locate(s.file,s.selector);if(!n)throw Error(r.id+' missing source');return s.file+':'+n.line+' `'+n.text.slice(0,110)+'`';}).join('<br>');
 const p=L.DIFFS.find(p=>p.id===r.id);return ['lab','srv'].map(side=>{const [file,re]=p[side],rel=file.split('#')[0],raw=fs.readFileSync(path.join(__dirname,'..',rel),'utf8'),offset=file.endsWith('#body')?raw.indexOf('<!-- ENGINE-BUNDLE-END -->'):0,src=L.sourceCode(raw.slice(offset),rel.endsWith('.html')),m=re.exec(src);if(!m)throw Error(r.id+' missing scalar');return rel+':'+(raw.slice(0,offset+m.index).split('\n').length)+' `'+m[0].slice(0,160)+'`';}).join('<br>');}
const status={shared:'같은 계산 공유(호스트 경계 보존)',flag:'LAB → 서버 규칙 후보 · OFF 기본',allow:'사유 있는 차이 보존',refer:'회부 · 종전 보존(정본 선택 보류)'};
let text='# T1409 서른네 줄: 실제 소스·같은 입력·이력·처리\n\n';
text+='전체 입력/출력은 [같은입력-측정.json](같은입력-측정.json), 재실행한 `git log -S` 검색문/양쪽 결과는 [서른네줄-이력.json](서른네줄-이력.json). 여기의 소스 줄은 현재 제품 기준이며 이력 검색은 변경 전 1aa63e63 기준이다. LAB c7778a49는 저장소 편입일이다. 외부 원본의 의미상 수정일 또는 서버보다 최신이라는 증명이 아니다.\n\n';
text+='34행은 계수와 호스트 경계를 섞은 기존 조사 단위다. 같은 부분 함수 결과가 나와도 전체 호스트 동작이 같은 것은 아니다. R02·R12·R29·R34는 입력/실행 계약이 달라 비교 가능한 범위를 명시했다. 허락12와 회부17은 별개이며, 회부를 승인된 수치로 세지 않는다.\n\n';
text+='|행 · 내용|현재 LAB / 서버 글자(파일:줄)|실제 입력|LAB → 서버 결과|이력(양쪽)|처리 · 까닭|\n|---|---|---|---|---|---|\n';
for(const r of rows){const h=r.history||{},history=['lab','srv'].map(k=>k+': '+(h[k]?.log||'검색 결과 원문 참조')).join('<br>');const f=facts.get(r.id);text+='|'+[r.id+' '+r.what,sources(r),brief(r.input),(!r.comparable?'계약/프로필 경계: ':'')+(r.equal?'부분 결과 같음: ':'다름: ')+brief(r.lab)+' → '+brief(r.server)+'<br>'+r.note,history,status[r.disposition]+'<br>'+r.reason+(f?.knob?'<br>'+f.knob:'')].map(esc).join('|')+'|\n';}
text+='\nR28은 광맥 수학식만 공유하고 숲/어장/좌표 상태의 호스트 어댑터는 유지한다. 서버 0일 guard도 유지한다. R32는 개인 명부 편성 → 집계 폴백의 디스패치만 공유한다. R16·R31·R33의 부분 결과 같음은 몸 이동/존 입력/막힌 지형까지 같다는 인증이 아니다. R12는 수정한 초기 스냅샷 계측기로 같은 초기 상태와 첫날 결과를 확인했지만 서버의 스케줄러 모드 선택까지 결론내리지 않는다.\n\n';
text+='## 랩만6 · 서버만4\n\n|행|기존 구분 · 자리|분류|근거 · 처리|\n|---|---|---|---|\n';
for(const r of policy.extras)text+='|'+[r.id+' '+r.what,r.category+' '+[r.lab,r.srv].filter(Boolean).map(s=>s.file+':'+s.line).join(' / '),r.classification,r.classificationReason+(r.knob?' / '+r.knob:'')].map(esc).join('|')+'|\n';
text+='\n화면/실험 입력/레거시6 · 서버 I/O2 · 기존 손잡이 뒤 서버 몸/일괄 계산1 · 이미 생성 공유된 수종 표1. 새로 확인된 규칙 이식 빠짐0. 특히 R27은 T1395의 미확인을 정정한다. `server/trees.json`의 `_source`와 생성기, 실제 8종 전 필드 일치가 근거다. 나무 몸 생태 전체의 일치를 뜻하지 않는다.\n';
fs.writeFileSync(path.join(out,'서른네줄.md'),text);
const arms=[];for(const lab of ['war','village'])for(const arm of ['before','off','water',...(lab==='village'?['raid','march']:[])]){const j=JSON.parse(fs.readFileSync(path.join(out,`browser-${lab}-${arm}.json`)));arms.push({lab,arm,seed:j.meta.seed,days:j.meta.days,pop:j.final.reduce((n,v)=>n+v.pop,0),food:j.final.reduce((n,v)=>n+v.food,0),empty:j.final.filter(v=>v.empty).length,parameters:j.parameters});}
const parity={};for(const lab of ['war','village']){const get=arm=>JSON.parse(fs.readFileSync(path.join(out,`browser-${lab}-${arm}.json`)));parity[lab]=JSON.stringify(get('before').series)===JSON.stringify(get('off').series);}
const t17=JSON.parse(fs.readFileSync(path.join(out,'t17-after.json'))),closure=L.checkClosure();
fs.writeFileSync(path.join(out,'요약.json'),JSON.stringify({base:policy.base,counts:{shared:closure.shared.length,flag:closure.flagged.length,allow:closure.allowed.length,refer:closure.referred.length,unflagged:closure.unflagged.length,reasonList:closure.allowanceCount,unexplained:closure.errors.length},catalogEqual:closure.catalogEqual,arms,selectedDailyHashParity100:parity,t17:{pop:t17.base.pop,byteEqual:fs.readFileSync(path.join(out,'t17-before.json')).equals(fs.readFileSync(path.join(out,'t17-after.json')))}},null,2)+'\n');
console.log('34 rows, 10 extras and measured summary rendered');
