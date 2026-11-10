#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawnSync}=require('child_process');
const root=process.env.T1248_ROOT||path.resolve(__dirname,'..'),out=path.resolve(process.env.T1248_OUT||'/tmp/t1248/run');
const days=Number(process.argv[2]||30),seed=String(process.argv[3]||1020);fs.mkdirSync(out,{recursive:true});
// 대체된 후보의 아직 시작하지 않은 진단만 명시적으로 취소한다. 완료/통과로 세지 않는다.
const skip=path.join(out,'SKIP_REQUESTED.json');
if(fs.existsSync(skip)){const reason=JSON.parse(fs.readFileSync(skip,'utf8'));fs.writeFileSync(path.join(out,'status.json'),JSON.stringify({valid:false,skipped:true,days,seed,root,reason},null,2));console.log('SKIP '+JSON.stringify(reason));process.exit(77);}
const source={};for(const name of ['server/zone.js','server/villages.js','server/des.js','server/des-work.js','scripts/t577-server-run.js'])if(fs.existsSync(path.join(root,name)))source[name]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex');
const observationSource={};for(const name of ['t1248-hook.js','t1248-run.js'])observationSource[name]=crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,name))).digest('hex');
fs.writeFileSync(path.join(out,'source.json'),JSON.stringify({root,days,seed,source,observationSource},null,2));
const env={...process.env,T1241_DES:process.env.T1241_DES||'1',T1241_PROBE:'1',T1241_OUT:path.join(out,'body'),T1248_TRACE:path.join(out,'days.jsonl'),T1248_ROOT:root,T745_VCLOCK:'1',VILLAGE_DAY_MS:'1440000',VILLAGE_NPC_CAP:'Infinity',T577_PAR:'1',T577_DIR:path.join(out,'server'),SBC_HOOK:'1',NODE_OPTIONS:`--require ${path.join(__dirname,'t1248-hook.js')} --require ${path.join(root,'scripts/t745-vclock.js')} --require ${path.join(root,'scripts/server-baseline-check.js')}`};
const fd=fs.openSync(path.join(out,'controller.log'),'w');const r=spawnSync(process.execPath,[path.join(root,'scripts/t577-server-run.js'),String(days),seed],{cwd:root,env,stdio:['ignore',fd,fd]});fs.closeSync(fd);
const dir=path.join(out,'server'),name=fs.readdirSync(dir).find(n=>n.endsWith('-'+seed+'.json')),p=path.join(dir,name||'missing-'+seed+'.json'),meta=path.join(out,'days.jsonl.meta.json');
const o=fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):null,m=fs.existsSync(meta)?JSON.parse(fs.readFileSync(meta,'utf8')):null;
// T577의 40마을 시딩 조건은 VILLAGE_MAX=1 진단 판에 적용하지 않는다. 종료·날수·계측 오류는 독립 확인한다.
const valid=!!(o&&o.days>=days&&m&&m.code===0&&m.clock&&m.clock.errs===0&&o.seedPop.every(n=>n>0));
const bench=m&&m.tickBenchmark,fixtureValid=!!(Number(env.T1248_BENCH_TICKS)>0&&m&&m.clock&&m.code===0&&m.clock.errs===0&&bench&&bench.fixtureStop&&bench.window.measuredTicks===Number(env.T1248_BENCH_TICKS)&&bench.wall.samples===Number(env.T1248_BENCH_TICKS));
const result={valid:valid||fixtureValid,fullDaysCompleted:valid,benchmarkFixtureCompleted:fixtureValid,runnerExit:r.status,note:fixtureValid?'Intentional tick-window fixture shutdown; not a completed T577 day':r.status===1&&Number(env.VILLAGE_MAX)<40?'T577 fixed 40-village assertion; subset validated independently':null,days,seed,cpuSeconds:m&&m.cpuSeconds,wallSeconds:m&&m.wallSeconds};fs.writeFileSync(path.join(out,'status.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));process.exit(valid||fixtureValid?0:1);
