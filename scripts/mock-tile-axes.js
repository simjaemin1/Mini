// 다축 레이어 합성 시안 — 답압(길)·경작 축의 연속 전이 (기반: 비옥도 900 초원)
const fs=require('fs'); const path=require('path');
const ROOT='/root/minirepo';
function b64(p){return 'data:image/png;base64,'+fs.readFileSync(p).toString('base64');}
const A={ grass:b64(path.join(ROOT,'public/assets/terrain/grass_angled.png')),
          dry:b64(path.join(ROOT,'public/assets/terrain/dry_angled.png')),
          mud:b64(path.join(ROOT,'public/assets/terrain/mud_angled.png')) };
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
  const W=1800,H=170,LAB=34;
  const cv=document.createElement('canvas'); cv.width=W; cv.height=(H+LAB)*2+40;
  const g=cv.getContext('2d');
  g.fillStyle='#14181c'; g.fillRect(0,0,cv.width,cv.height);
  const drawPat=(im,alpha,sc,x,y,w,h)=>{ if(alpha<=0.003)return; g.globalAlpha=Math.min(1,alpha);
    const p=g.createPattern(im,'repeat'); const m=new DOMMatrix(); m.a=sc; m.d=sc; p.setTransform(m);
    g.fillStyle=p; g.fillRect(x,y,w,h); g.globalAlpha=1; };

  // ── 줄 1: 답압(길) 축 — 초원 위로 밟힘값 0→1000: 풀이 깎이고 다져진 흙길 ──
  const y0=LAB;
  drawPat(imgs.grass,1,0.295,0,y0,W,H);
  for(let x=0;x<W;x+=3){
    const wear=x/W*1000;
    for(let yy=0;yy<H;yy+=4){
      // 길은 가운데(세로 중앙)부터 밟힌다 — 중심 가중 + 노이즈
      const cen=1-Math.abs((yy+2)/H-0.5)*2;
      const nz=vnoise(x/26,yy/26), nz2=vnoise(x/9+41,yy/9+13);
      const a=smooth(180,900,wear*(0.45+0.8*cen)+(nz-0.5)*240+(nz2-0.5)*90);
      if(a>0.003){ g.save(); g.beginPath(); g.rect(x,y0+yy,3,4); g.clip();
        drawPat(imgs.mud,a,0.3,x,y0+yy,3,4);
        if(a>0.6){ g.globalAlpha=(a-0.6)*0.5; g.fillStyle='#8a7a5e'; g.fillRect(x,y0+yy,3,4); g.globalAlpha=1; } // 다져진 흙 밝힘
        g.restore(); }
    }
  }
  // ── 줄 2: 경작 축 — 초원 0→1000: 갈아엎음(흙) → 이랑 무늬 또렷 ──
  const y1=(H+LAB)+LAB+32;
  drawPat(imgs.grass,1,0.295,0,y1,W,H);
  for(let x=0;x<W;x+=3){
    const till=x/W*1000;
    // 갈아엎은 흙: 뙈기 전이
    for(let yy=0;yy<H;yy+=4){
      const nz=vnoise(x/22+77,yy/22+5);
      const a=smooth(120,520,till+(nz-0.5)*220);
      if(a>0.003){ g.save(); g.beginPath(); g.rect(x,y1+yy,3,4); g.clip();
        drawPat(imgs.mud,a,0.3,x,y1+yy,3,4); g.restore(); }
    }
  }
  // 이랑: 경작 진행에 따라 또렷해짐 (iso 다이아 방향 대각 줄)
  for(let x=0;x<W;x+=3){
    const till=x/W*1000;
    const rA=smooth(350,950,till);
    if(rA<=0.01) continue;
    g.save(); g.beginPath(); g.rect(x,y1,3,H); g.clip();
    g.globalAlpha=rA*0.55;
    for(let d=-H;d<W/3+H;d+=13){
      g.strokeStyle='#4a3a26'; g.lineWidth=3.2;
      g.beginPath(); g.moveTo(x-6, y1+d); g.lineTo(x+9, y1+d-7.5); g.stroke();   // 대각 이랑 골
      g.strokeStyle='rgba(150,124,90,0.8)'; g.lineWidth=1.6;
      g.beginPath(); g.moveTo(x-6, y1+d-4); g.lineTo(x+9, y1+d-11.5); g.stroke(); // 이랑 등(볕)
    }
    g.globalAlpha=1; g.restore();
  }
  g.fillStyle='#cbd'; g.font='bold 14px sans-serif'; g.textAlign='left';
  g.fillText('답압(길) 축 — 밟힘값 0→1000: 풀이 깎이고 다져진 흙길이 가운데부터 (기존 §16 길 값 그대로 사용)', 10, 20);
  g.fillText('경작 축 — 일굼 0→1000: 갈아엎은 흙 → 이랑 무늬 또렷 (밭 상태값)', 10, y1-10);
  g.textAlign='center'; g.font='12px sans-serif'; g.fillStyle='#9aa';
  for(const f of [0,200,400,600,800,1000]){ const x=Math.max(14,Math.min(W-16,f/1000*W));
    g.fillText(''+f, x, y0+H+16); g.fillText(''+f, x, y1+H+16); }
  cv.id='strip'; document.body.appendChild(cv); document.title='READY';
}
</script></body></html>`;
fs.writeFileSync('/tmp/axes-strip.html',html);
(async()=>{
  const {chromium}=require('playwright');
  const b=await chromium.launch({headless:true});
  const pg=await (await b.newContext({viewport:{width:1900,height:560}})).newPage();
  pg.on('pageerror',e=>console.log('[err]',String(e.message).slice(0,200)));
  await pg.goto('file:///tmp/axes-strip.html');
  await pg.waitForFunction(()=>document.title==='READY',{timeout:60000});
  const el=await pg.$('#strip');
  await el.screenshot({path:'/tmp/axes-strip.png'});
  console.log('done');
  await b.close();
})();
