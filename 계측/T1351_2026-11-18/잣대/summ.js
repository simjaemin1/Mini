const fs=require('fs');function load(dir,re){const m=new Map();for(const f of fs.readdirSync(dir).filter(f=>re.test(f))){const o=JSON.parse(fs.readFileSync(dir+'/'+f));for(const r of o.rows){const x={};o.cols.forEach((c,i)=>x[c]=r[i]);m.set(r[0],x);}}return m;}
for(const s of [1020,42]){const b=load('body-'+s,/^seg-\d+\.t1276\.json$/),out=[`몸 ${s}`];
 for(const a of ['F','FH']){const f=load(`srv/${a}-${s}`,/\.t1276\.json$/);out.push(`${a}: ${[60,110,115].map(d=>d+'='+(f.get(d)||{}).fdDead).join(' ')}`);}
 out.unshift(`body: ${[60,110,115].map(d=>d+'='+(b.get(d)||{}).fdDead).join(' ')} pop115 ${(b.get(115)||{}).pop}`);console.log(out.join(' | '));}
const T='/tmp/t1351wt/계측/T1326_2026-11-15/';const zlib=require('zlib');
for(const s of [1020,42]){const o=JSON.parse(zlib.gunzipSync(fs.readFileSync(T+`몸세계-${s}.t1276.json.gz`)));const C=o.cols;console.log('T1326몸',s,[60,100,110,115,200,300,365,400].map(d=>{const r=o.rows[d-1];return `${d}:p${r[C.indexOf('pop')]} v${r[C.indexOf('vils')]} fd${r[C.indexOf('fdDead')]}`}).join(' '));}
