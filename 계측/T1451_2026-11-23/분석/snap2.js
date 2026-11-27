// node snap2.js <arm-seed>... — 덧붙임 하나/둘/셋: 자랄 수 있는 칸(반지름별 · 영토 · 길 둘레 뺀) · 영토 목표/상한 · 갈 수 있는 땅 · 작은 땅 마을
const med=a=>{const b=[...a].sort((x,y)=>x-y);return b.length?b[Math.floor(b.length/2)]:0}, sum=a=>a.reduce((x,y)=>x+y,0);
const RR=[10,20,40,80,120], AREA=RR.map(R=>{let n=0;for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++)if(dx*dx+dy*dy<=R*R)n++;return n;});
for (const n of process.argv.slice(2)) { let r; try { r=require('/tmp/t1451/srv/'+n+'/'+n+'.t1422.json'); } catch(e){ continue; }
  for (const d of Object.keys(r.snap)) { const S=r.snap[d]; if (!S[0] || S[0].length < 15) { console.log(n,d,'(새 칸 없음)'); continue; }
    const g=S.map(x=>RR.map((R,i)=>AREA[i]-x[12][i]-x[13][i]));
    const roadShare=RR.map((R,i)=>{const bl=sum(S.map(x=>x[12][i]+x[13][i]));return bl?sum(S.map(x=>x[13][i]))/bl:0;});
    console.log(n,'날',d,'| 자랄 수 있는 칸 가운데 r10..120',RR.map((R,i)=>med(g.map(a=>a[i]))).join('/'),'| 칸 넓이',AREA.join('/'),'| 막힌 칸 중 길 둘레 몫',roadShare.map(x=>(x*100).toFixed(1)+'%').join('/'));
    // 영토: [lsz, housing, target, econ, cap]
    const cls={full:0,cap:0,short:0}; for(const x of S){ if(!(x[1]>0)) continue; const [lsz,hz,tg,ec,cap]=x[14]; const terr=x[10]; const lim=Math.min(tg,cap); if(terr>=tg) cls.full++; else if(cap<tg && terr>=cap) cls.cap++; else cls.short++; }
    const land=sum(S.map(x=>x[9])), terr=sum(S.map(x=>x[10])), live=S.filter(x=>x[1]>0);
    console.log('   영토 꼴(산 마을',live.length+') 목표 다 참',cls.full,'· 상한에 막힘',cls.cap,'· 목표 · 상한 둘 다 못 닿음(기하 · 이웃 · 물 · 산)',cls.short,'| 땅 합',land,'영토 합',terr,'땅/영토',(land/terr*100).toFixed(1)+'%');
    const small=S.filter(x=>x[9]<=241).map(x=>x[0]+'('+x[9]+'·사람 '+x[1]+'·영토 '+x[10]+'·목표 '+x[14][2]+'·상한 '+x[14][4]+')');
    console.log('   땅 ≤ 241칸 마을',small.length,':',small.join(' '));
  }
}
