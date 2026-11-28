'use strict';
// Static source reader: no product modules or functions are executed.
const fs=require('fs'),acorn=require('acorn');
const [file,...names]=process.argv.slice(2);
if(!file||!names.length)throw Error('usage: node read-functions.cjs file function...');
const source=fs.readFileSync(file,'utf8'),comments=[];
const ast=acorn.parse(source,{ecmaVersion:'latest',sourceType:'script',locations:true,onComment:comments});
const found=new Map(names.map(n=>[n,[]]));
function walk(n){
 if(!n||typeof n.type!=='string')return;
 if(n.type==='FunctionDeclaration'&&n.id&&found.has(n.id.name))found.get(n.id.name).push(n);
 for(const [k,v] of Object.entries(n))if(k!=='loc'){
  if(Array.isArray(v))for(const x of v)walk(x);else if(v&&typeof v.type==='string')walk(v);
 }
}
walk(ast);
for(const name of names){
 const hits=found.get(name);if(hits.length!==1)throw Error(name+': '+hits.length+' declarations');
 const n=hits[0];let s='',at=n.start;
 for(const c of comments.filter(c=>c.start>=n.start&&c.end<=n.end)){
  s+=source.slice(at,c.start)+source.slice(c.start,c.end).replace(/[^\n]/g,' ');at=c.end;
 }
 s+=source.slice(at,n.end);
 s.split('\n').forEach((line,i)=>{if(line.trim())process.stdout.write(file+':'+(n.loc.start.line+i)+' '+line.trimEnd()+'\n');});
}
