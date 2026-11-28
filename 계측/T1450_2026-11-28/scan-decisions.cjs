'use strict';
// Read source/AST only: no product modules, worlds, or timers are loaded.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),acorn=require('acorn');
const ROOT=path.resolve(__dirname,'../..');
const FILES=['sim/economy-sim.js','sim/economy-sim-v2.js','sim/war-core.js','server/villages.js'];
const rows=[],counts={};
function hash(s){return crypto.createHash('sha256').update(s).digest('hex');}
for(const file of FILES){
 const src=fs.readFileSync(path.join(ROOT,file),'utf8');
 const ast=acorn.parse(src,{ecmaVersion:'latest',sourceType:'script',locations:true,allowReturnOutsideFunction:true});
 const before=rows.length,seen=new Set();
 const text=n=>n?src.slice(n.start,n.end):'';
 const numeric=n=>!!n&&(n.type==='Literal'&&typeof n.value==='number'||Object.keys(n).some(k=>k!=='loc'&&(Array.isArray(n[k])?n[k].some(x=>x&&typeof x.type==='string'&&numeric(x)):n[k]&&typeof n[k].type==='string'&&numeric(n[k]))));
 function record(kind,node,expr,scope,name){
  const code=text(expr);if(!code||seen.has(kind+':'+expr.start))return;seen.add(kind+':'+expr.start);
  const pop=/\b(?:N|N0|pop|population|users|nPeople|nHunters|armed|warriors)\b|npcs\.length|npcPids\.length|\.counts\b/.test(code);
  const policy=/target|reserve|cap|buffer|keep|stock|payback|crisis|rich|_PC\b|PC_|PER_POP|glut|ratio|thin|guard|limit|desired|floor|quota|cooldown|hyster|max_|min_|_max|_min|_pct|frac|secf|days|speed|rate/i.test(code+' '+(name||''));
  rows.push({file,scope,name:name||null,kind,line:expr.loc.start.line,endLine:expr.loc.end.line,source:code.length>1800?code.slice(0,1800):code,sourceTruncated:code.length>1800,sourceSha256:hash(code),populationExpression:pop,namedPolicy:policy,hasNumber:numeric(expr),classification:'unreviewed'});
 }
 function visit(n,scope='(module)',parent=null,key=''){
  if(!n||typeof n.type!=='string')return;
  let sc=scope;
  if(n.type==='FunctionDeclaration')sc=n.id?n.id.name:scope+'/<fn>';
  else if(/FunctionExpression|ArrowFunctionExpression/.test(n.type))sc=parent&&parent.type==='VariableDeclarator'&&parent.id.type==='Identifier'?parent.id.name:scope+'/<callback>';
  if(n.type==='VariableDeclarator'&&n.id.type==='Identifier'&&n.init){
   const name=n.id.name;
   if(/^[A-Z_][A-Z_0-9]*$/.test(name)&&numeric(n.init))record('constant',n,n.init,scope,name);
   else if(!['FunctionExpression','ArrowFunctionExpression','ObjectExpression','ArrayExpression'].includes(n.init.type)&&numeric(n.init)&&!['i','j','k'].includes(name))record('numeric-variable',n,n.init,scope,name);
   if(/(?:_PC|_TARGET|_CAP|_KEEP|_BUFFER|_STOCK|_DAYS|_MIN|_MAX)\b/.test(name)&&n.init.type==='ObjectExpression'){
    for(const p of n.init.properties)if(p.type==='Property'&&numeric(p.value))record('policy-map-entry',p,p.value,scope,name+'.'+(p.key.name||p.key.value));
   }
  }
  if(n.type==='IfStatement'||n.type==='ConditionalExpression')record(n.type==='IfStatement'?'if':'ternary',n,n.test,scope);
  if(n.type==='ReturnStatement'&&n.argument&&['LogicalExpression','BinaryExpression'].includes(n.argument.type)&&/[<>]|===|!==/.test(text(n.argument)))record('return-predicate',n,n.argument,scope);
  if(n.type==='ReturnStatement'&&n.argument&&numeric(n.argument)&&(/cap|target|terr|floor|room|keep|reserve|plan|desired|limit|crew|stock|price|buy|sell|expand|job/i.test(scope)||/npcs\.length|\b(?:N|_pop|population|people)\b/.test(text(n.argument))))record('numeric-return',n,n.argument,scope);
  if(n.type==='ReturnStatement'&&n.argument&&!numeric(n.argument)&&/cap|target|floor|keep|reserve|desired|limit/i.test(scope)&&!['FunctionExpression','ArrowFunctionExpression','ObjectExpression','ArrayExpression','Literal'].includes(n.argument.type))record('derived-bound-return',n,n.argument,scope);
  if(n.type==='CallExpression'&&/^(?:Math\.(?:min|max)|clamp|clamp01)$/.test(text(n.callee)))record('clamp',n,n,scope);
  if(['ForStatement','WhileStatement','DoWhileStatement'].includes(n.type)&&n.test&&numeric(n.test))record('bounded-loop',n,n.test,scope);
  for(const k of Object.keys(n))if(k!=='loc'){
   const v=n[k];if(Array.isArray(v)){for(const c of v)if(c&&typeof c.type==='string')visit(c,sc,n,k);}
   else if(v&&typeof v.type==='string')visit(v,sc,n,k);
  }
 }
 visit(ast);counts[file]={lines:src.split('\n').length,candidates:rows.length-before,sourceSha256:hash(src)};
}
const result={kind:'unclassified-source-candidates',warning:'Candidate expressions are not final policy decisions or a completed census; classify context before reporting totals.',worldsLaunched:0,files:counts,rows};
fs.writeFileSync(path.join(__dirname,'decision-candidates.json.gz'),require('zlib').gzipSync(JSON.stringify(result,null,1),{level:9}));
const c={};for(const r of rows)c[r.kind]=(c[r.kind]||0)+1;
console.log(JSON.stringify({files:counts,kinds:c,candidates:rows.length,prioritize:rows.filter(r=>r.populationExpression||r.namedPolicy).length,worldsLaunched:0}));
