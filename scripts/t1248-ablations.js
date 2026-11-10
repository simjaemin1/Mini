'use strict';
// Diagnostic memory-only mechanism ablations. Not a product feature switch.
if(!process.env.T577_SEED||!/server[\\/]zone\.js$/.test(process.argv[1]||''))return;
const mode=process.env.T1248_ABLATION;if(!mode)return;
if(process.env.T1241_DES!=='1')throw Error('ablation requires the DES test fixture');
const fs=require('fs'),crypto=require('crypto'),Module=require('module'),compile=Module.prototype._compile;
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');let applied=false;
Module.prototype._compile=function(source,filename){let anchor=null,replacement=null;
if(mode==='cap3'&&filename.endsWith('/server/villages.js')){anchor='t.prog=(t.prog||0)+Math.max(0,now-npc._workT)';replacement='t.prog=(t.prog||0)+Math.min(3000,Math.max(0,now-npc._workT))';}
if(mode==='reach44'&&filename.endsWith('/server/zone.js')){anchor="k = 'walk'; until = r.t1;";replacement=anchor+`\n    if(npc._lifeTask&&npc._lifeTask.k==='clear'){const task=npc._lifeTask;for(let j=1;j<r.T.length;j++){if(Math.hypot(r.X[j]-task.px,r.Y[j]-task.py)>44)continue;let lo=r.T[j-1],hi=r.T[j];for(let n=0;n<32;n++){const mid=(lo+hi)/2,q=r.posAt(mid,{});if(Math.hypot(q.x-task.px,q.y-task.py)<=44)hi=mid;else lo=mid;}until=Math.min(until,hi);break;}}`;}
if(mode==='phaseoff'&&filename.endsWith('/server/zone.js')){anchor='for (const th of [dOff, dayR * _desSch.SCH_FARMW_R, dayR * _desSch.SCH_HALF_R, dayR]) { const t = _desNext(npc, now, th); if (t < until) until = t; }';replacement='/* diagnostic: walking-local-phase clip disabled; global-day clip retained */';}
if(anchor){if(applied||source.split(anchor).length!==2)throw Error('ablation must change one exact site: '+mode);const before=hash(source);source=source.replace(anchor,replacement);applied=true;fs.writeFileSync(process.env.T577_OUT+'.ablation.json',JSON.stringify({mode,filename,replacements:1,inputSHA256:before,memorySHA256:hash(source)}));}
return compile.call(this,source,filename);};
process.on('exit',()=>{if(!applied){console.error('ablation never applied: '+mode);process.exitCode=1;}});
