'use strict';
// Supplemental one-day attribution of the primary profile's residual category.
// Load BEFORE profile.cjs; the 30-day profiles do not load this module.
if (!process.env.T577_SEED || !/zone\.js$/.test(process.argv[1]||'')) return;
const Module=require('node:module'),fs=require('node:fs'),path=require('node:path');
const A=require(path.join(process.env.T1262_DEPS,'acorn')),compile=Module.prototype._compile;
Module.prototype._compile=function(src,file){if(file===path.join(process.env.T1248_ROOT,'server/zone.js')){
 const ast=A.parse(src,{ecmaVersion:'latest'});let tick;
 function walk(n){if(!n||typeof n!=='object')return;if(n.type==='CallExpression'&&n.callee.name==='setInterval'&&n.arguments[1]?.name==='TICK_MS')tick=n.arguments[0];for(const[k,v]of Object.entries(n)){if(k==='start'||k==='end')continue;if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}}
 walk(ast);if(!tick)throw Error('supplemental tick missing');const edits=[],map={};let index=0;
 for(const n of tick.body.body){if(!['ExpressionStatement','IfStatement','BlockStatement','ForOfStatement','ForStatement'].includes(n.type))continue;
  const text=src.slice(n.start,n.end);if(text.includes('__t1262Token')||text.includes('global.__t1262.frame()'))continue;
  const id='residual:'+index++;map[id]={line:src.slice(0,n.start).split('\n').length,statement:text.slice(0,240)};
  edits.push([n.start,`{const __t1262Residual=global.__t1262.enter("other",${JSON.stringify(id)});try{`],[n.end,'}finally{global.__t1262.leave(__t1262Residual);}}']);
 }
 for(const[at,value]of edits.sort((a,b)=>b[0]-a[0]))src=src.slice(0,at)+value+src.slice(at);
 fs.writeFileSync(path.join(process.env.T1262_OUT,'residual-map.json'),JSON.stringify(map,null,2));
 }return compile.call(this,src,file);};
