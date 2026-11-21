// node an2.js <t1408.json> [해 1|2] — 덧붙임 표: 철마다 ① 밭이 일을 부른 날 ② 안 부른 날 농부 ③ 세 나눗수 농부 값 ↔ 다른 일 값 ④ 농부 몫 · 인구 · 굶음
const r=require(process.argv[2]);const Y=+process.argv[3]||2;const C=r.cols,I=c=>C.indexOf(c);
const S={봄:[3,4,5],여름:[6,7,8],가을:[9,10,11],겨울:[12,1,2]};const sOf=m=>Object.keys(S).find(k=>S[k].includes(m));const yrOf=ym=>{const y=Math.floor(ym/100),m=ym%100;return m<=2?y-1:y;};
const A={};const vil={};
for(const x of r.rows){const ym=x[0];if(yrOf(ym)!==Y)continue;const s=sOf(ym%100);const o=A[s]||(A[s]={vd:0,call:0,idleF:0,callF:0,dropI:0,dropC:0,labD:0,fD:0,pd:0,fd:0,popE:0,cv:{},fv:[0,0,0,0]});
 const d=x[I('days')];o.vd+=d;o.call+=x[I('call')];o.idleF+=x[I('idleF')];o.callF+=x[I('callF')];o.dropI+=x[I('dropI')];o.dropC+=x[I('dropC')];o.labD+=x[I('labD')];o.fD+=x[I('j_farmer')];o.pd+=x[I('pop')]*d;o.fd+=x[I('fd')];
 const k=x[1]+'|'+s;vil[k]=(vil[k]||[0,0]);vil[k][0]+=d;vil[k][1]+=d-x[I('call')];}
for(const ym in r.cand){if(yrOf(+ym)!==Y)continue;const o=A[sOf(ym%100)];if(!o)continue;for(const j in r.cand[ym]){const z=r.cand[ym][j];const q=o.cv[j]||(o.cv[j]=[0,0]);q[0]+=z[0];q[1]+=z[1];}}
for(const ym in (r.fv||{})){if(yrOf(+ym)!==Y)continue;const o=A[sOf(ym%100)];if(!o)continue;const F=r.fv[ym];for(let i=0;i<4;i++)o.fv[i]+=F[i];}
console.log('철 | 부른 마을-날 % · 안 부른 날/마을(가운데) | 안 부른 날 농부-날 % · 빠짐/100농부-날 안부름 · 부름 | 밭 일손 날 ÷ 농부-날 | 농부 값 ⓐ ⓑ ⓒ (표본) | 실현 값 농부 사냥 어부 나무 채집 | 농부 몫 · 굶음');
for(const s of ['봄','여름','가을','겨울']){const o=A[s];if(!o)continue;const un=Object.entries(vil).filter(([k])=>k.endsWith('|'+s)).map(([,v])=>v[1]).sort((a,b)=>a-b);const med=un.length?un[Math.floor(un.length/2)]:0;
 const cv=j=>o.cv[j]&&o.cv[j][1]?(o.cv[j][0]/o.cv[j][1]).toFixed(0):'-';const fv=i=>o.fv[3]?(o.fv[i]/o.fv[3]).toFixed(0):'-';
 console.log(s,'|',(o.call/o.vd*100).toFixed(0)+'%',med,'|',(o.idleF/Math.max(1,o.fD)*100).toFixed(0)+'%',(o.dropI/Math.max(1,o.idleF)*100).toFixed(2),(o.dropC/Math.max(1,o.callF)*100).toFixed(2),'|',(o.labD/Math.max(1,o.fD)).toFixed(2),'|',fv(0),fv(1),fv(2),'('+o.fv[3]+')','|',cv('farmer'),cv('hunter'),cv('fisher'),cv('lumberjack'),cv('forager'),'|',(o.fD/Math.max(1,o.pd)).toFixed(2),o.fd);}
