// 비옥도 '연속' 그라디언트 시안 — 왼쪽 0 → 오른쪽 1000, 모든 요소가 f의 연속 함수
const fs=require('fs'); const path=require('path');
const ROOT='/root/minirepo';
function b64(p){return 'data:image/png;base64,'+fs.readFileSync(p).toString('base64');}
const A={ grass:b64(path.join(ROOT,'public/assets/terrain/grass_angled.png')),
          dry:b64(path.join(ROOT,'public/assets/terrain/dry_angled.png')),
          mud:b64(path.join(ROOT,'public/assets/terrain/mud_angled.png')),
          rock:b64(path.join(ROOT,'public/assets/nature/rock02.png')) };
const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{background:#14181c;margin:0;font:13px sans-serif;color:#ccc}</style></head><body><script>
const A=${JSON.stringify(A)};
const hash=(x,y,s)=>{let n=(Math.imul(x|0,374761393)+Math.imul(y|0,668265263)+Math.imul(s|0,1274126177))|0;n=Math.imul(n^(n>>>13),1103515245);n^=n>>>16;return (n>>>0)/4294967296;};
const NG=64,lat=new Float32Array(NG*NG);
for(let j=0;j<NG;j++)for(let i=0;i<NG;i++)lat[j*NG+i]=hash(i,j,777);
function vnoise(u,v){u=((u%NG)+NG)%NG;v=((v%NG)+NG)%NG;
 const i0=u|0,j0=v|0,i1=(i0+1)%NG,j1=(j0+1)%NG,fu=u-i0,fv=v-j0;
 const su=fu*fu*(3-2*fu),sv=fv*fv*(3-2*fv);
 const a=lat[j0*NG+i0],b=lat[j0*NG+i1],c=lat[j1*NG+i0],d=lat[j1*NG+i1];
 return a+(b-a)*su+(c-a)*sv+(a-b-c+d)*su*sv;}
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const imgs={};let pend=0;
for(const k in A){pend++;const im=new Image();im.onload=()=>{imgs[k]=im;if(--pend===0)go();};im.src=A[k];}
function go(){
  const W=1800,H=200,LAB=34;
  const cv=document.createElement('canvas'); cv.width=W; cv.height=(H+LAB)*2+34;
  const g=cv.getContext('2d');
  g.fillStyle='#14181c'; g.fillRect(0,0,cv.width,cv.height);
  const fAt=x=>x/W*1000;

  // ── 줄 1: 일반 타일 — 슬리버 블렌드(노이즈 문턱 = 뙈기 전이) ──
  const y0=LAB;
  const SL=3;
  for(let x=0;x<W;x+=SL){
    const f=fAt(x+SL/2);
    g.save(); g.beginPath(); g.rect(x,y0,SL,H); g.clip();
    const draw=(im,alpha,sc)=>{ if(alpha<=0.003)return; g.globalAlpha=Math.min(1,alpha);
      const p=g.createPattern(im,'repeat'); const m=new DOMMatrix(); m.a=sc; m.d=sc; p.setTransform(m);
      g.fillStyle=p; g.fillRect(x,y0,SL,H); };
    draw(imgs.mud,1,0.3);
    if(f<300){ g.globalAlpha=(300-f)/300*0.5; g.fillStyle='#3a3733'; g.fillRect(x,y0,SL,H); }
    // ★뙈기 전이: 열·행 노이즈가 문턱을 흔든다 — 세로로도 얼룩지게 세부 슬리버
    for(let yy=0;yy<H;yy+=4){
      const nz=vnoise(x/38,yy/38), nz2=vnoise(x/13+31,yy/13+7);
      const dryA=smooth(120,620,f+ (nz-0.5)*260 + (nz2-0.5)*90);
      const grA =smooth(430,980,f+ (nz-0.5)*300 + (nz2-0.5)*110);
      if(dryA>0.003){ g.save(); g.beginPath(); g.rect(x,y0+yy,SL,4); g.clip();
        draw(imgs.dry,dryA,0.3); g.restore(); }
      if(grA>0.003){ g.save(); g.beginPath(); g.rect(x,y0+yy,SL,4); g.clip();
        draw(imgs.grass,grA,0.295); g.restore(); }
    }
    g.restore();
  }
  // 소품: 자리마다 고유 문턱 — f가 문턱을 넘으면 ±40 구간에서 서서히 돋는다
  g.globalAlpha=1;
  for(let k=0;k<340;k++){
    const px=20+hash(k,1,11)*(W-40), py=y0+16+hash(k,2,12)*(H-30);
    const f=fAt(px);
    const thrR=400*hash(k,3,13);                     // 자갈: f<문턱이면 존재(비옥해지며 사라짐)
    const aR=1-smooth(thrR,thrR+80,f);
    if(aR>0.02){ const im=imgs.rock; const sc=(11+13*hash(k,4,14))/im.height;
      g.globalAlpha=aR; g.drawImage(im,px,py,im.width*sc,im.height*sc); }
    const thrT=700+300*hash(k,5,15);                 // 풀포기: f>문턱이면 돋음
    const aT=smooth(thrT,thrT+60,f);
    if(aT>0.02){ g.globalAlpha=aT;
      g.strokeStyle=['#4e7a3c','#5d8a46','#6b8f4e'][(hash(k,6,16)*3)|0]; g.lineWidth=1.3;
      for(let b3=0;b3<3;b3++){ const ox=(hash(k,20+b3,17)-0.5)*6, hgt=(6+8*hash(k,30+b3,18))*aT, ln=(hash(k,40+b3,19)-0.5)*6;
        g.beginPath(); g.moveTo(px+ox,py); g.quadraticCurveTo(px+ox+ln*0.4,py-hgt*0.6,px+ox+ln,py-hgt); g.stroke(); } }
  }
  g.globalAlpha=1;

  // ── 줄 2: 산터 — 암반 기본, 이끼·틈새 풀이 연속으로 ──
  const y1=(H+LAB)+LAB+26;
  g.fillStyle='#6b665e'; g.fillRect(0,y1,W,H);
  for(let k=0;k<9000;k++){ const rx=hash(k,1,81)*W, ry=y1+hash(k,2,82)*H;
    const v=hash(k,3,83); g.fillStyle=v<0.5?'rgba(52,49,44,0.5)':'rgba(122,116,106,0.45)';
    g.fillRect(rx,ry,2+4*hash(k,4,84),1.6+3*hash(k,5,85)); }
  g.strokeStyle='rgba(38,35,31,0.7)'; g.lineWidth=1.3;
  for(let k=0;k<44;k++){ let cxp=hash(k,1,86)*W, cyp=y1+6+hash(k,2,87)*(H*0.4);
    g.beginPath(); g.moveTo(cxp,cyp);
    for(let st=0;st<6;st++){ cxp+=(hash(k*7+st,3,88)-0.5)*40; cyp+=8+hash(k*7+st,4,89)*20; g.lineTo(cxp,Math.min(y1+H-4,cyp)); }
    g.stroke(); }
  // 이끼: 자리별 문턱 400~950 — 연속 증가
  for(let k=0;k<700;k++){
    const px=hash(k,1,91)*W, py=y1+8+hash(k,2,92)*(H-16);
    const f=fAt(px); const thr=400+550*hash(k,3,93);
    const a=smooth(thr,thr+90,f)*(0.28+0.3*hash(k,4,94));
    if(a>0.02){ g.fillStyle='rgba(74,96,52,'+a+')';
      g.beginPath(); g.ellipse(px,py,3+7*hash(k,5,95),2+4*hash(k,6,96),0,0,6.3); g.fill(); }
  }
  // 틈새 풀: 문턱 780~1000, 상한 낮게
  for(let k=0;k<150;k++){
    const px=14+hash(k,1,97)*(W-28), py=y1+22+hash(k,2,98)*(H-34);
    const f=fAt(px); const thr=780+220*hash(k,3,99);
    const a=smooth(thr,thr+70,f);
    if(a>0.02){ g.globalAlpha=a;
      g.strokeStyle=['#4e7a3c','#5d8a46'][(hash(k,4,100)*2)|0]; g.lineWidth=1.3;
      for(let b3=0;b3<3;b3++){ const ox=(hash(k,20+b3,101)-0.5)*5, hgt=(5+6*hash(k,30+b3,102))*a, ln=(hash(k,40+b3,103)-0.5)*5;
        g.beginPath(); g.moveTo(px+ox,py); g.quadraticCurveTo(px+ox+ln*0.4,py-hgt*0.6,px+ox+ln,py-hgt); g.stroke(); } }
  }
  g.globalAlpha=1;

  // 라벨·눈금
  g.fillStyle='#cbd'; g.font='bold 14px sans-serif'; g.textAlign='left';
  g.fillText('일반 타일 — 연속 램프 (뙈기 노이즈 전이 + 소품별 고유 문턱)', 10, 20);
  g.fillText('산터 — 암반 기본 연속 램프 (이끼·틈새 풀이 자리별 문턱으로 서서히)', 10, y1-8);
  g.textAlign='center'; g.font='12px sans-serif'; g.fillStyle='#9aa';
  for(const f of [0,200,400,600,800,1000]){ const x=f/1000*W;
    [y0+H, y1+H].forEach(yb=>{ g.fillText(''+f, Math.max(14,Math.min(W-16,x)), yb+16); }); }
  cv.id='strip'; document.body.appendChild(cv); document.title='READY';
}
</script></body></html>`;
fs.writeFileSync('/tmp/fert-grad.html',html);
(async()=>{
  const {chromium}=require('playwright');
  const b=await chromium.launch({headless:true});
  const pg=await (await b.newContext({viewport:{width:1900,height:600}})).newPage();
  pg.on('pageerror',e=>console.log('[err]',String(e.message).slice(0,200)));
  await pg.goto('file:///tmp/fert-grad.html');
  await pg.waitForFunction(()=>document.title==='READY',{timeout:60000});
  const el=await pg.$('#strip');
  await el.screenshot({path:'/tmp/fert-grad.png'});
  console.log('done');
  await b.close();
})();
