#!/usr/bin/env node
// T1395 계측기. @regress 없음 — 제품을 실행하지 않는다.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),A=require('acorn');
// 읽기 전용 전수 선언 자. 생성물은 지정 output 폴더에만 쓴다.
const root=path.join(__dirname,'..'), out=process.argv[2]; if (!out) throw Error('출력 폴더 필요');
fs.mkdirSync(out,{recursive:true});
const labs=['lab/마을실험실.html','lab/전쟁실험실.html','lab/전투실험실.html','lab/원본/사냥실험실_0707.html'];
const canonical=['sim/economy-engine.browser.js','sim/battle-core.js','sim/equilibrium.js','sim/army-morale.js'];
const norm=s=>{try{return [...A.tokenizer(s,{ecmaVersion:'latest'})].map(t=>t.type.label+':'+String(t.value??'')).join('|')}catch{return s.trim()}};
const canon=canonical.map(f=>({file:f,text:fs.readFileSync(path.join(root,f),'utf8')}));
const data={inline:[],constants:[],functions:[],errors:[]};
function parse(src,file,offset=0,base=0){
 let ast;try{ast=A.parse(src,{ecmaVersion:'latest',locations:true,allowReturnOutsideFunction:true})}catch(e){data.errors.push({file,error:e.message});return}
 function walk(n,scope=[],depth=0,parent){
  if(!n||!n.type)return;
  let next=scope;
  const fn=/Function/.test(n.type);
  if(fn){let name=n.id?.name||parent?.id?.name||parent?.key?.name||'<anonymous>';next=[...scope,name];if(name!=='<anonymous>')data.functions.push({file,name,scope:scope.join('/'),line:n.loc.start.line+offset,start:n.start+base,end:n.end+base,code:src.slice(n.start,n.end)});}
  if(n.type==='VariableDeclarator'&&n.id.type==='Identifier'&&n.init&&(/^[A-Z][A-Z0-9_]{2,}$/.test(n.id.name)||n.id.name==='MU'||(n.id.name==='N'&&scope.length===0))&&!/Function/.test(n.init.type)){
   const name=n.id.name;
   if(depth<=1||/^(L_|MOB_|WAR_|BDT_)/.test(name))data.constants.push({file,name,scope:scope.join('/'),line:n.loc.start.line+offset,start:n.init.start+base,end:n.init.end+base,expr:src.slice(n.init.start,n.init.end),key:norm(src.slice(n.init.start,n.init.end)),type:n.init.type});
  }
  for(const [k,v]of Object.entries(n)){if(['loc','start','end'].includes(k))continue;if(Array.isArray(v)){for(const c of v)if(c?.type)walk(c,next,depth+(fn?1:0),n)}else if(v?.type)walk(v,next,depth+(fn?1:0),n)}
 }
 walk(ast);
}
for(const file of labs){const text=fs.readFileSync(path.join(root,file),'utf8');for(const m of text.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script\s*>/g)){const body=m[1],start=m.index+m[0].indexOf('>')+1,line=text.slice(0,start).split('\n').length-1;const c=canon.find(c=>c.text.trim()===body.trim());if(c)data.inline.push({file,line:line+1,canonical:c.file,exact:true,sha256:crypto.createHash('sha256').update(body.trim()).digest('hex')});else { const ms='// ===== PATH-CORE-START', me='// ===== PATH-CORE-END ====='; const a=body.indexOf(ms), b=body.indexOf(me); let code=body; if(a>=0&&b>a){const after=body.indexOf('\n',a)+1, block=body.slice(after,b).trim(), canonical=fs.readFileSync(path.join(root,'sim/path-core.js'),'utf8').trim(); if(block!==canonical)throw Error(file+': path inline differs'); data.inline.push({file,line:line+body.slice(0,after).split('\n').length,canonical:'sim/path-core.js',exact:true,sha256:crypto.createHash('sha256').update(block).digest('hex')});code=body.slice(0,a)+body.slice(a,b+me.length).replace(/[^\n]/g,' ')+body.slice(b+me.length);} parse(code,file,line,start); }}}
for(const file of ['server/village-layout.js','server/villages.js','server/wildlife.js','server/war-live.js','sim/war-core.js','server/sustain.js','server/specialty.js','server/bandits.js','server/livelihood.js','server/roads.js','server/fishing.js','sim/path-core.js']){let t=fs.readFileSync(path.join(root,file),'utf8');parse(t,file)}
data.functions=data.functions.map(({code,...rest})=>({...rest,sha256:crypto.createHash('sha256').update(code).digest('hex')}));
if(data.errors.length)throw Error(JSON.stringify(data.errors));
data.sourceHashes=Object.fromEntries([...new Set([...labs,...data.inline.map(v=>v.canonical)])].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]));
fs.writeFileSync(path.join(out,'선언목록.json'),JSON.stringify(data,null,2)+'\n');
for(const f of labs)console.log(f+': 상수·표 '+data.constants.filter(v=>v.file===f).length+' / 함수 '+data.functions.filter(v=>v.file===f).length);
console.log('같은 글자 인라인 '+data.inline.length+' / 구문 오류 0');
