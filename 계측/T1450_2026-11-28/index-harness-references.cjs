'use strict';
// Static text/AST reference index. A mention is NOT proof of a numeric pin.
const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto'),acorn=require('acorn');
const ROOT=path.resolve(__dirname,'../..');
const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'reviewed-policy-rows.json'),'utf8'));
const names=[...new Set([...catalog.rows.map(r=>r.name.split('.')[0]),
 'houseDayBuild','craftLaborTarget','toolDesiredStock','masonTarget','smithTarget','smeltTarget','armorsmithTarget',
 'tailorTarget','cookTarget','warriorTarget','_weaponThin','_terrCap','_terrCapBound','tryExpandTerritory',
 '_targetV2','_priceParamsV2','derivedInputTarget','woodSpare','furnaceCharcoalTarget','_warNpcMobPlan','warMobilize'])].sort();
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const match=new RegExp('(?<![A-Za-z0-9_$])(?:'+names.map(escape).join('|')+')(?![A-Za-z0-9_$])','g');
const refs=s=>[...new Set([...s.matchAll(match)].map(m=>m[0]))].sort();
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const files=fs.readFileSync(path.join(__dirname,'harness-files.txt'),'utf8').trim().split('\n').sort();
if(new Set(files).size!==files.length||files.some(f=>!/^scripts\/test-[^/]+\.(?:js|cjs|mjs)$/.test(f)))throw Error('invalid tracked harness manifest');
const mentions=[],calls=[],parseErrors=[];
for(const file of files){
 const source=fs.readFileSync(path.join(ROOT,file),'utf8'),found=refs(source);
 if(!found.length)continue;
 mentions.push({file,sourceSha256:hash(source),names:found,review:'unreviewed-text-mention'});
 let ast;
 try{ast=acorn.parse(source,{ecmaVersion:'latest',sourceType:file.endsWith('.mjs')?'module':'script',locations:true,allowReturnOutsideFunction:true});}
 catch(e){parseErrors.push({file,error:e.message});continue;}
 function walk(n){
  if(!n||typeof n.type!=='string')return;
  if(n.type==='CallExpression'){
   const callee=source.slice(n.callee.start,n.callee.end);
   if(/^(?:assert(?:\.[A-Za-z]+)?|ok|eq|equal|strictEqual|near|approx|T|check)$/.test(callee)){
    const text=source.slice(n.start,n.end),names=refs(text);
    if(names.length)calls.push({file,line:n.loc.start.line,endLine:n.loc.end.line,callee,names,
     source:text.slice(0,900),sourceTruncated:text.length>900,sourceSha256:hash(text),review:'unreviewed-assertion-candidate'});
   }
  }
  for(const [k,v] of Object.entries(n))if(k!=='loc'){
   if(Array.isArray(v))for(const x of v)walk(x);else if(v&&typeof v.type==='string')walk(v);
  }
 }
 walk(ast);
}
const result={base:catalog.base,scope:'Tracked-current-tree test-* JS-family files in scripts. Text mentions and likely assertions only; not confirmed numeric pins. No tests/products executed.',
 names,filesSearched:files.length,mentions,calls,parseErrors};
fs.writeFileSync(path.join(__dirname,'harness-reference-index.json.gz'),zlib.gzipSync(JSON.stringify(result,null,1),{level:9}));
console.log(JSON.stringify({filesSearched:files.length,filesMentioningNames:mentions.length,assertionCandidates:calls.length,parseErrors:parseErrors.length,worldsLaunched:0}));
