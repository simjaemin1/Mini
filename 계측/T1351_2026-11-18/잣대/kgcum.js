// 몸 세계 seg-*.t1351.json bodyKg(마디마다 0부터) → 날별 누계 · 판 F 은 그대로 누계
const fs=require('fs');const[, ,dir]=process.argv;const fs2=fs.readdirSync(dir).filter(f=>/^seg-\d+\.t1351\.json$/.test(f)).sort((a,b)=>+a.match(/\d+/)[0]-+b.match(/\d+/)[0]);
let base=0;const out={};for(const f of fs2){const o=JSON.parse(fs.readFileSync(dir+'/'+f));const K=o.cols.indexOf('bodyKg'),S=o.cols.indexOf('bodySw');let last=0;for(const r of o.rows){out[r[0]]=Math.round(base+r[K]);last=r[K];}base+=last;}
console.log(JSON.stringify(out));
