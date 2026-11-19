// 사다리 표: node an.js <step> <seed...>
const fs=require('fs');const [,,st,...seeds]=process.argv;
const SRC={farm:'농부 수식',farmBy:'부산물',harvest:'앵커 수확',garden:'텃밭 하한',crop:'밭 작물',fish:'어부',hunt:'사냥',forage:'채집',start:'시작 부존',gain:'들여옴·그 밖'};
for(const s of seeds){const D=`/tmp/t1388/srv/${st}-${s}`,f=`${D}/${st}-${s}.t1388.json`;if(!fs.existsSync(f)){console.log(st,s,'없음');continue;}
 const o=JSON.parse(fs.readFileSync(f));const C=o.cols,I=c=>C.indexOf(c);const R=JSON.parse(fs.readFileSync(`${D}/${st}-${s}.json`));const FD=JSON.parse(fs.readFileSync(`${D}/${st}-${s}.fd-deaths.json`));
 const popAt=d=>{const r=R.rows.find(x=>x[0]===d)||R.rows[R.rows.length-1];return [r[1].reduce((a,c)=>a+c,0),r[1].filter(x=>x===0).length,r[0]];};
 const fdAt=d=>{const r=FD.rows.find(x=>x[0]===d)||FD.rows[FD.rows.length-1];return r[1];};
 const peak=new Array(51).fill(0);for(const r of R.rows)r[1].forEach((p,i)=>{if(p>peak[i])peak[i]=p;});const last=R.rows[R.rows.length-1][1];
 let worst=null;last.forEach((p,i)=>{const q=peak[i]?p/peak[i]:1;if(!worst||q<worst[1])worst=[R.names?R.names[i]:i,q,p,peak[i]];});
 const eat=o.rows.reduce((a,r)=>a+r[I('eat')],0);const by={};for(const k of o.src)by[k]=o.rows.reduce((a,r)=>a+(r[I('e_'+k)]||0),0);
 const farmIn=['farm','farmBy','harvest','garden','crop'].reduce((a,k)=>a+o.rows.reduce((b,r)=>b+(I('i_'+k)>=0?r[I('i_'+k)]:0),0),0);
 const fD=o.rows.reduce((a,r)=>a+r[I('fDays')],0),pD=o.rows.reduce((a,r)=>a+r[I('pDays')],0);
 const lastYm=Math.max(...o.rows.map(r=>r[0]));const cellsEnd=o.rows.filter(r=>r[0]===lastYm).reduce((a,r)=>a+r[I('cells')],0);
 const p365=popAt(365),p730=popAt(730),p800=popAt(800);
 console.log(JSON.stringify({st,s,p365,p730,p800,fd:[fdAt(365),fdAt(730)-fdAt(365),fdAt(800)],empty800:p800[1],worst:[worst[0],+worst[1].toFixed(2),worst[2],worst[3]],eat:Math.round(eat),share:Object.fromEntries(Object.entries(by).map(([k,v])=>[SRC[k]||k,+(v/eat).toFixed(3)])),perFarmerDay:+(farmIn/Math.max(1,fD)).toFixed(3),cellsPerPerson:+(cellsEnd/Math.max(1,p800[0])).toFixed(2),farmerShare:+(fD/Math.max(1,pD)).toFixed(3)}));}
