for(const n of process.argv.slice(2)){const r=require(`/tmp/t1422/srv/${n}/${n}.t1422.json`);let v=0,rs=0,rw=0,s=0,c=0,f=0,w=0,bd=0,er=0,hf=0,sd=0;
for(const k in r.V){const x=r.V[k];v+=x[0];rs+=x[1];rw+=x[2];s+=x[3];c+=x[4];f+=x[5];w+=x[6];}
for(const k in r.D)for(const j in r.D[k]){const x=r.D[k][j];bd+=x[0];er+=x[1];hf+=x[2];sd+=x[3];}
let day={};for(const k in r.T)for(const j in r.T[k])for(const l in r.T[k][j])if(l!=='취침')day[l]=(day[l]||0)+r.T[k][j][l];const D=Object.values(day).reduce((a,b)=>a+b,0);
console.log(n,'휴식',(day['휴식']/D*100).toFixed(1)+'%','귀가',(day['귀가']/D*100).toFixed(0)+'%','순찰경작',(day['경작']/D*100).toFixed(0)+'% | 일찍쉼',(er/bd*100).toFixed(1)+'% 반일',(hf/bd*100).toFixed(1)+'% 남는일',(sd/bd*100).toFixed(1)+'% | 마을-날',v,'쉰',(rs/v*100).toFixed(0)+'%','할일있는데쉰',(rw/v*100).toFixed(0)+'%','집',s,'넓힘',c,'식량',f,'나무',w);}
