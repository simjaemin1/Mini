const fs=require('fs');const R=require('path').join(__dirname,'..','..');
const live=require(R+'/계측/T1263_2026-11-11/ON-1020.t1243.json');
const days=[100,200,250,300,325,350,365,400];
const row=(o,d)=>{const r=o.rows.find(r=>r[0]===d);if(!r)return'—';const C=o.cols;return `${r[C.indexOf('pop')]} · ${51-r[C.indexOf('vils')]} · ${Math.round(r[C.indexOf('tfe')]/1000)}k · ${r[C.indexOf('harvN')]}`};
console.log('| 판 | '+days.map(d=>'날 '+d).join(' | ')+' |');console.log('|---|'+days.map(()=>'---').join('|')+'|');
console.log('| 몸 세계(T1263 라이브) | '+days.map(d=>row(live,d)).join(' | ')+' |');
for(const a of process.argv.slice(2)){const f=`/tmp/t1316/srv/${a}-1020/${a}-1020.t1243.json`;if(!fs.existsSync(f))continue;const o=JSON.parse(fs.readFileSync(f));console.log(`| ${a} | `+days.map(d=>row(o,d)).join(' | ')+' |');}
