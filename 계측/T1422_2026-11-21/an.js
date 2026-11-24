// node an.js <dir>/<arm-seed> [해 1|2] — T1422 표
const base=process.argv[2];const r=require(base+'.t1422.json');const o=require(base+'.json');
const S=['봄','여름','가을','겨울'];
const sum=(t)=>Object.values(t).reduce((a,b)=>a+b,0);
let all={},day={};for(const s of S){const T=r.T[s]||{};for(const j in T)for(const l in T[j]){all[l]=(all[l]||0)+T[j][l];if(l!=='취침')day[l]=(day[l]||0)+T[j][l];}}
const A=sum(all),Dd=sum(day);
const lab=(k)=>((day[k]||0)/Dd*100).toFixed(1);
console.log('낮 시간 몫(취침 뺌) — 휴식',lab('휴식'),'· 귀가',lab('귀가'),'· 개간',lab('개간'),'· 건축',lab('건축'),'· 경작',lab('경작'),'· 채집',lab('채집'),'· 벌목',lab('벌목'),'· 낚시',lab('낚시'),'· 출근',lab('출근'));
// 철 · 직업 휴식 몫
for(const s of S){const T=r.T[s]||{};const row=[];for(const j of ['farmer','fisher','hunter','forager','mason']){const t=T[j];if(!t)continue;const d=sum(t)-(t['취침']||0);row.push(j+' '+((t['휴식']||0)/Math.max(1,d)*100).toFixed(0)+'%');}
 const Dn=r.D[s]||{};let bd=0,er=0,hf=0,sd=0;for(const j in Dn){bd+=Dn[j][0];er+=Dn[j][1];hf+=Dn[j][2];sd+=Dn[j][3];}
 const V=r.V[s]||[0,0,0,0,0,0,0];
 console.log(s,'| 휴식 낮 몫',row.join(' '),'| 몸-날',bd,'일찍 쉼',(er/Math.max(1,bd)*100).toFixed(0)+'%','반일',(hf/Math.max(1,bd)*100).toFixed(0)+'%','남는일',(sd/Math.max(1,bd)*100).toFixed(0)+'% | 마을-날',V[0],'쉰',V[1],'할 일 있는데 쉰',V[2],'(집',V[3],'넓힘',V[4],'식량',V[5],'나무',V[6]+')');}
const w=r.w||[];const L=w[w.length-1]||[];const lj=w.reduce((a,x)=>a+x[3],0),lv=w.reduce((a,x)=>a+x[2],0),w0=w.reduce((a,x)=>a+x[4],0);
const hv=[...w].reverse().find(x=>x[8]);const med=hv?[...hv[8]].sort((a,b)=>a-b)[Math.floor(hv[8].length/2)]:null;
const cpu=r.cpu?((r.cpu.user+r.cpu.system)/1e6/Math.max(1,r.days)).toFixed(2):'-';
console.log('끝 날',L[0],'인구',o.eight&&o.eight.pop,'빈',o.empty,'죽음',o.deadTot,'| 나무꾼 0 마을-날',(lj/Math.max(1,lv)*100).toFixed(0)+'%','곳간 나무<1 마을-날',(w0/Math.max(1,lv)*100).toFixed(0)+'%','| 영토 칸',L[5],'주거',L[6],'행복 평균',L[7],'가운데',med,'| CPU 초/날',cpu);
console.log('남는 시간 문',JSON.stringify(r.side));
{const at=n=>{let b=null;for(const x of w)if(x[0]-w[0][0]<=n)b=x;return b};const a=at(364);try{const f=require(base+'.fd-deaths.json');const R=f.rows;const fa=d=>{let b=0;for(const x of R)if(x[0]<=d)b=x[1];return b};console.log('한 해 인구',a&&a[1],'빈',a&&(51-a[2]),'| 굶어 죽음 1년',fa(365),'2년',fa(730)-fa(365));}catch(e){}}
