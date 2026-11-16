// 온 해(365 ~ 730날 · 농사 해 2) 칸당 거둠 = 그해 거둔 칸 ÷ 365날의 밭 칸 — node fy.js <판,…> [디렉터리(기본 이 계측 폴더)]
const fs=require('fs'),z=require('zlib'),path=require('path');
const J=f=>{for(const g of [f,f+'.gz']){try{const b=fs.readFileSync(g);return JSON.parse((g.endsWith('.gz')?z.gunzipSync(b):b).toString())}catch(e){}}return null};
const D=process.argv[3]||path.join(__dirname,'..');
for(const a of process.argv[2].split(',')){const v=[];for(const s of ['1020','7','42']){const o=J(`${D}/lab-${a}-${s}.json`);if(!o){v.push('—');continue}const C=o.cols,g=(d,k)=>o.rows[d-1][C.indexOf(k)];v.push(((g(730,'harvN')-g(365,'harvN'))/g(365,'cells')).toFixed(3))}console.log(a,v.join(' · '))}
