// node snap.js <arm-seed>... — 둘레 나무(반지름별 가운데 · 합) · 고리 · 땅 · 영토 · 곳간 나무
const med=a=>{const b=[...a].sort((x,y)=>x-y);return b.length?b[Math.floor(b.length/2)]:0}, sum=a=>a.reduce((x,y)=>x+y,0);
for (const n of process.argv.slice(2)) { let r; try { r=require('/tmp/t1451/srv/'+n+'/'+n+'.t1422.json'); } catch(e){ continue; }
  for (const d of Object.keys(r.snap)) { const S=r.snap[d]; const col=i=>S.map(x=>x[i]);
    const live=S.filter(x=>x[1]>0);
    console.log(n,'날',d,'마을',S.length,'산',live.length,'| 고리 가운데',med(col(2)),'| r10/20/40/80/120 가운데',[4,5,6,7,8].map(i=>med(col(i))).join('/'),'합',[4,5,6,7,8].map(i=>sum(col(i))).join('/'),
      '| 땅 가운데',med(col(9)),'합',sum(col(9)),'| 영토 가운데',med(col(10)),'합',sum(col(10)),'| 나무 0 (r40) 마을',S.filter(x=>x[6]===0).length,'| 곳간 나무 가운데',med(col(11)));
  }
}
