// node an.js <arm-seed>... — T1451 표: 인구 · 빈 마을 · 굶음 · 나무꾼 0 · 곳간 나무 · 농부 몫 · 부업 % · 벤 그루 · 둘레 나무
const S=['봄','여름','가을','겨울'];
for (const n of process.argv.slice(2)) { const D='/tmp/t1451/srv/'+n+'/'+n; let r, t8, o, f;
 try { r=require(D+'.t1422.json'); t8=require(D+'.t1408.json'); o=require(D+'.json'); f=require(D+'.fd-deaths.json'); } catch(e){ console.log(n,'없음'); continue; }
 const w=r.w; const at=d=>{let b=null;for(const x of w)if(x[0]-w[0][0]<=d)b=x;return b}; const a=at(364), L=w[w.length-1];
 const R=f.rows, fa=d=>{let b=0;for(const x of R)if(x[0]<=d)b=x[1];return b};
 const lj=w.reduce((s,x)=>s+x[3],0), lv=w.reduce((s,x)=>s+x[2],0), w400=at(399);
 // 농부 몫 여름/겨울(t1408 rows j_farmer · 두 해 째)
 const C=t8.cols,I=c=>C.indexOf(c); const sh={s:[0,0],w:[0,0]}; for(const x of t8.rows){const ym=x[0],m=ym%100,y=Math.floor(ym/100);const yy=m<=2?y-1:y;if(yy!==2)continue;const k=[6,7,8].includes(m)?'s':[12,1,2].includes(m)?'w':null;if(!k)continue;sh[k][0]+=x[I('j_farmer')];sh[k][1]+=x[I('pop')]*x[I('days')];}
 // 농부 부업 몸-날 %
 let fb=0,fs=0; for(const s of S){const x=(r.D[s]||{}).farmer;if(x){fb+=x[0];fs+=x[3];}}
 const sd=r.side||{}, s51=r.s51||{};
 const tn=r.tn||[]; const tn0=tn[1]||0, tnL=tn[tn.length-1]||0;
 const cutT=s51.cut||[0,0], ms=s51.cutMs||[0,0];
 console.log(n,'| 인구',a&&a[1],'·',o.eight.pop,'(빈',o.empty+')','| 굶음',fa(365)+'/'+(fa(730)-fa(365)),'| 나무꾼0',(lj/lv*100).toFixed(0)+'%','| 나무<1 마을 400날',w400?w400[4]:'-','끝',L[4],
  '| 농부 여/겨',(sh.s[0]/sh.s[1]).toFixed(2)+'/'+(sh.w[0]/sh.w[1]).toFixed(2),'| 농부 부업',(fs/fb*100).toFixed(1)+'%','| 부업 준 일 개간',sd.clear,'집',sd.build,'식량',sd.food,'땔감',sd.wood,
  '| 벤 그루 전업/부업',cutT.join('/'),'그루당 ms',(cutT[0]?(ms[0]/cutT[0]).toFixed(1):'-')+'/'+(cutT[1]?(ms[1]/cutT[1]).toFixed(1):'-'),'| 고리 나무 첫날/끝',tn0+'→'+tnL,'('+(tn0?(tnL/tn0*100).toFixed(0):'-')+'%)','| 행복',L[7]);
}
