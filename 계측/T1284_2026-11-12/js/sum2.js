// 랩 표 — node sum2.js <디렉터리> <판,…> [시드] ⇒ lab-<판>-<시드>.json(.gz) · .t1230.json · .t176.json (끔 · K 는 계측/T1276_2026-11-12)
const z=require('zlib'),fs=require('fs');
const J=f=>{for(const g of [f,f+'.gz']){try{const b=fs.readFileSync(g);return JSON.parse((g.endsWith('.gz')?z.gunzipSync(b):b).toString())}catch(e){}}return null};
const D=process.argv[2],arms=process.argv[3].split(','),seeds=(process.argv[4]||'1020,7,42').split(',');
let offTot=null;const rows=[];
for(const a of arms){const r={a,pops:[],tot:0,empty:0,ever:0,fd:0,fdOk:true,dead:0,born:0,zh:0,zt:0,gd:[],fe:0,fD:0,popD:0};
 for(const s of seeds){const o=J(`${D}/lab-${a}-${s}.json`),t=J(`${D}/lab-${a}-${s}.t1230.json`),q=J(`${D}/lab-${a}-${s}.t176.json`);if(!o||!t||!q){r.pops.push('—');r.miss=1;continue}
  const C=Object.fromEntries(o.cols.map((c,i)=>[c,i])),T=Object.fromEntries(t.cols.map((c,i)=>[c,i]));const L=o.rows[o.rows.length-1];
  r.pops.push(q.pop);r.tot+=q.pop;r.empty+=q.dead;r.ever+=q.ever;r.fe+=q.fieldFoodEqTot;r.fD+=q.fDaysTot;r.popD+=q.popDaysTot;
  if(C.fdDead!=null)r.fd+=L[C.fdDead];else r.fdOk=false;
  for(const d of [275,640]){const x=o.rows.find(x=>x[C.day]===d);if(x)r.gd.push(x[C.tfe]/x[C.pop]);}
  for(const x of t.rows){r.zh+=x[T.zHouse];r.zt+=['zHouse','zGran','zK','zH','zOther'].reduce((u,k)=>u+x[T[k]],0);r.dead+=x[T.dead];r.born+=x[T.born];}}
 r.gd.sort((x,y)=>x-y);r.gmed=r.gd.length?(r.gd[(r.gd.length-1)>>1]+r.gd[r.gd.length>>1])/2:null;
 if(a==='off')offTot=r.tot;rows.push(r);}
const nf=x=>Math.round(x).toLocaleString('en-US');
console.log('| 판 | '+seeds.join(' | ')+' | 합 | 끔 대비 | 빈 마을 | 출생 | 죽음(전부) | 굶어 죽음 | 주거 문 몫(출생 0 마을-날) | 겨울 들머리 곳간(일치 · 가운데) | 농부 하나가 먹인 사람 | 밭 식량 몫 |');
console.log('|---|'+seeds.map(()=>'---:').join('|')+'|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for(const r of rows)console.log(`| ${r.a} | ${r.pops.map(p=>typeof p==='number'?nf(p):p).join(' | ')} | ${nf(r.tot)} | ${offTot?(100*r.tot/offTot).toFixed(1)+'%':'—'} | ${r.empty} | ${nf(r.born)} | ${nf(r.dead)} | ${r.fdOk?nf(r.fd):'—'} | ${(100*r.zh/r.zt).toFixed(1)}% | ${r.gmed!=null?r.gmed.toFixed(1):'—'} | ${(r.fe/r.fD).toFixed(3)} | ${(r.fe/r.popD).toFixed(3)} |`);
