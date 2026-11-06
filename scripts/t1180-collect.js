#!/usr/bin/env node
'use strict';
// T1180 측정 원문을 DB 없이 보존. 기록별 SHA256은 압축 JSON 내부 manifest에 둔다.
// node scripts/t1180-collect.js /tmp/t1180 계측/T1180_2026-11-06
const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto'),cp=require('child_process');
const [root,out]=process.argv.slice(2);if(!root||!out)throw Error('data root and output stem required');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex'),files={},members={};
function add(name,file){const s=fs.readFileSync(file,'utf8');if(files[name]!==undefined)throw Error('duplicate '+name);files[name]=s;members[name]={bytes:Buffer.byteLength(s),sha256:sha(s)};}
const table=cp.spawnSync(process.execPath,[path.join(__dirname,'t1180-table.js'),path.join(root,'server'),path.join(root,'lab')],{encoding:'utf8'});if(table.status)throw Error(table.stderr);
const summary=JSON.parse(table.stdout);summary.server=summary.server.filter(r=>!r.mode.endsWith('-smoke'));
if(summary.server.length!==26||summary.lab.length!==24)throw Error('incomplete matrix: '+summary.server.length+' server / '+summary.lab.length+' lab');
for(const r of summary.server){const dir=path.dirname(r.file),seed=path.basename(r.file,'.json');for(const suffix of ['.json','.json.sbc.json','.json.t1180.json','.log'])add('server/'+r.mode+'/'+seed+suffix,path.join(dir,seed+suffix));r.file='server/'+r.mode+'/'+seed+'.json';}
for(const r of summary.lab){for(const suffix of ['.json','.json.t1180.json','.log'])add('lab/'+r.mode+'/'+r.seed+suffix,path.join(root,'lab',r.mode,r.seed+suffix));r.file='lab/'+r.mode+'/'+r.seed+'.json.t1180.json';}
for(const f of fs.readdirSync(path.join(root,'server')).filter(x=>/^(off|fish|wood|forage|all|fuel-control|fuel-A)-(plan|800)\.log$/.test(x)))add('controllers/'+f,path.join(root,'server',f));
for(const kind of ['live','short-clock'])for(const f of fs.readdirSync(path.join(root,kind)).filter(x=>/\.(json|log)$/.test(x)))add(kind+'/'+f,path.join(root,kind,f));
for(const f of ['/tmp/t1180-server-final.sh','/tmp/t1180-fuel-server.sh','/tmp/t1180-lab-final.sh','/tmp/t1180-fuel-lab.sh','/tmp/t1180-browser-smoke.js',path.join(root,'base-preload.js')])add('commands/'+path.basename(f),f);
for(const f of fs.readdirSync('/tmp').filter(x=>/^t1180-(?:test-.*|unit-final|check|wiring|build|inline|lab-smoke-.*)\.log$/.test(x)))add('gates/'+f,path.join('/tmp',f));
const code={};for(const f of ['sim/economy-sim.js','sim/economy-sim-v2.js','server/villages.js','server/zone.js','server/fishing.js','scripts/t1180-observe.js','scripts/t1180-lab-observe.js','scripts/t1180-table.js','scripts/test-t1180-produce-defaults.js','sim/economy-engine.browser.js','lab/마을실험실.html','lab/전쟁실험실.html','계측/서버기준선_2026-11-04c.json'])code[f]=sha(fs.readFileSync(f));
const manifest={task:'T1180',reportDate:'2026-11-06',timezone:'Asia/Seoul',productionCommit:'2a77eba4',main:'1db22f04',prerequisite:'52772698',runtime:{node:process.version,v8:process.versions.v8,icu:process.versions.icu},code,members,counts:{server:summary.server.length,lab:summary.lab.length},notes:['Original controller paths retained; replace /workspace/Mini and /tmp/t1180 when reproducing.','DB excluded. live has matched physical/economic day; short-clock is a diagnostic.','Headless lab does not bind physical production host.','Live virtual-clock tickUs is not physical elapsed cost.','Observer added lumberjack-zero counters after live and first OFF server run; use paired fuel runs for that metric.']};
const archive=zlib.gzipSync(JSON.stringify({manifest,files}));fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out+'.raw.json.gz',archive);fs.writeFileSync(out+'.summary.json',JSON.stringify(summary,null,2)+'\n');fs.writeFileSync(out+'.manifest.json',JSON.stringify({...manifest,archive:{file:path.basename(out)+'.raw.json.gz',bytes:archive.length,sha256:sha(archive)}},null,2)+'\n');
const unpack=JSON.parse(zlib.gunzipSync(fs.readFileSync(out+'.raw.json.gz')));for(const [k,v]of Object.entries(unpack.manifest.members))if(sha(unpack.files[k])!==v.sha256)throw Error('archive hash '+k);
console.log(JSON.stringify({members:Object.keys(files).length,bytes:archive.length,sha256:sha(archive),counts:manifest.counts}));
