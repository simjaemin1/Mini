'use strict';
// Meter-only experiment. No game process or completed simulation day.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const out=path.resolve(process.argv[2]);fs.mkdirSync(out,{recursive:true});
process.env.T577_SEED='1020';process.env.T1270_ROOT='/tmp/t1270-main';process.env.T1270_OUT=out;process.env.T1270_DEPS=path.resolve(__dirname,'../../node_modules');process.argv[1]='/tmp/t1270-calibration-zone.js';require('./profile.cjs');
const P=global.__t1270;P.frame();const rounds=[],n=100000;
for(let r=0;r<5;r++){const c=process.cpuUsage();for(let i=0;i<n;i++){const t=P.stmt('other','calibration:empty','T1270 meter only');P.leave(t);}const used=process.cpuUsage(c);rounds.push({n,cpuUs:used.user+used.system,usPerPair:(used.user+used.system)/n});}
P.finish(0);fs.writeFileSync(path.join(out,'calibration.json'),JSON.stringify({kind:'meter only, not a world or completed day',node:process.version,profileSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'profile.cjs'))).digest('hex'),rounds},null,2));console.log(JSON.stringify(rounds));
