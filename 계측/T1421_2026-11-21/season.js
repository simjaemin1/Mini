const r=require(process.argv[2]);const C=r.cols,I=c=>C.indexOf(c);
const S={봄:[3,4,5],여름:[6,7,8],가을:[9,10,11],겨울:[12,1,2]};const acc={};
for(const x of r.rows){const ym=x[0],y=Math.floor(ym/100),m=ym%100;const yr=(m<=2)?y-1:y;if(yr!==(+process.argv[3]||2))continue;const s=Object.keys(S).find(k=>S[k].includes(m));const d=x[I('days')];const o=acc[s]||(acc[s]={pd:0,farmer:0,fisher:0,hunter:0,forager:0,lumberjack:0});o.pd+=x[I('pop')]*d;for(const j of ['farmer','fisher','hunter','forager','lumberjack'])o[j]+=x[I('j_'+j)];}
console.log(Object.entries(acc).map(([s,o])=>s+' '+['farmer','fisher','hunter','forager','lumberjack'].map(j=>(o[j]/Math.max(1,o.pd)).toFixed(2)).join('/')).join(' · '));
