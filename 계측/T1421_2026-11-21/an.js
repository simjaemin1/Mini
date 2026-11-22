// node an.js <t1408.json> [mode] — 달 표 · 철 몫 · K 풀이 · 늦음
const r=require(process.argv[2]);const C=r.cols,I=c=>C.indexOf(c);const mode=process.argv[3]||'month';
const G=new Map();for(const x of r.rows){const k=x[0]+'|'+x[1];const g=G.get(k);if(!g){G.set(k,x.slice());continue;}for(let i=2;i<C.length;i++){const c=C[i];if(c==='pop')g[i]=x[i];else if(c==='popMin'||c==='fdaysMin')g[i]=Math.min(g[i],x[i]);else if(c==='popMax')g[i]=Math.max(g[i],x[i]);else g[i]+=x[i];}}
const has=c=>I(c)>=0;
const by={};for(const x of G.values()){const ym=x[0],d=x[I('days')];const o=by[ym]||(by[ym]={pop:0,K:0,j:{},fd:0,born:0,fdw:0,emp:0,flow:0,fish:0,hunt:0,forc:0,cells:0,land:0,pc:0,pcn:0,yf:0,g21:0,g74:0,vd:0});
 o.pop+=x[I('pop')];o.K+=x[I('K')]/d;o.fd+=x[I('fd')];o.born+=x[I('born')];o.fdw+=x[I('fdays')]/d*x[I('pop')];if(x[I('pop')]===0)o.emp++;o.vd+=d;o.g74+=x[I('g74')];
 for(const c of C)if(c.startsWith('j_'))o.j[c.slice(2)]=(o.j[c.slice(2)]||0)+x[I(c)]/d;
 if(has('flow')){o.flow+=x[I('flow')]/d;o.fish+=x[I('fishCap')]/d;o.hunt+=x[I('huntCap')]/d;o.forc+=x[I('forCap')]/d;o.cells+=x[I('cells')]/d;o.land+=x[I('land')]/d;const pc=x[I('perCell')]/d;if(pc>0){o.pc+=pc;o.pcn++;}o.yf+=x[I('yearFood')]/d;o.g21+=x[I('g21')];}}
const yms=Object.keys(by).sort();
if(mode==='month'){console.log('ym    pop    K  born  fd emp fdays farm fish hunt forg lj  g74% g21% | flow fishC huntC forC cells land perCell');
for(const ym of yms){const o=by[ym],P=Math.max(1,o.pop),sh=j=>((o.j[j]||0)/P).toFixed(2);console.log(ym,String(o.pop).padStart(5),o.K.toFixed(0).padStart(5),String(o.born).padStart(4),String(o.fd).padStart(4),String(o.emp).padStart(3),(o.fdw/P).toFixed(0).padStart(4),sh('farmer'),sh('fisher'),sh('hunter'),sh('forager'),sh('lumberjack'),(o.g74/o.vd*100).toFixed(0).padStart(4),(o.g21/o.vd*100).toFixed(0).padStart(4),'|',o.flow.toFixed(0).padStart(5),o.fish.toFixed(0).padStart(5),o.hunt.toFixed(0).padStart(5),o.forc.toFixed(0).padStart(4),o.cells.toFixed(0).padStart(5),o.land.toFixed(0).padStart(6),(o.pcn?o.pc/o.pcn:0).toFixed(1).padStart(6));}}
if(r.late){console.log('늦음(칸-날) ym 김매기 물대기 익어기다림 품질');for(const ym of Object.keys(r.late).sort()){const L=r.late[ym];console.log(ym,L[0],L[1],L[2],(L[4]?L[3]/L[4]:0).toFixed(2));}}
