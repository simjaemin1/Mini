#!/usr/bin/env node
// =============================================================================
// 시안 — 바이옴 10종 × 비옥도 램프 대조표 [배치 20 C]
//
// ★왜 시안이 필요한가: **한반도(forest)만 라이브다.** 나머지 9종은 재민이 게임에서 볼 수 없다.
//   눈으로 못 본 값을 9개 확정하는 건 이 프로젝트에서 금지된 "실측 없는 결정"이다.
//   ⇒ 한 장에 나란히 깔아 놓고 고르게 한다.
//
// ★그림은 **정본 표**(public/soil-base.js BIOME)와 **정본 램프 수식**을 쓴다.
//   여기서 수식을 다시 쓰면 시안과 게임이 갈린다 — 시안이 예뻐도 게임은 다르게 나온다.
//
// 산출: /tmp/biome-ramps.png  (줄 = 바이옴 · 가로 = 토양치 0→1000 · 아래줄 = 그 바이옴의 산터)
// 사용: node scripts/mock-biome-ramps.js
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SB = require(path.join(ROOT, 'public', 'soil-base.js'));

function b64(p) { return 'data:image/png;base64,' + fs.readFileSync(p).toString('base64'); }
const A = {
  grass: b64(path.join(ROOT, 'public/assets/terrain/grass_angled.png')),
  dry: b64(path.join(ROOT, 'public/assets/terrain/dry_angled.png')),
  mud: b64(path.join(ROOT, 'public/assets/terrain/mud_angled.png')),
};
const BIOMES = ['forest', 'plains', 'jungle', 'savanna', 'taiga', 'tundra', 'desert', 'mountain', 'archipelago'];
const TABLE = {}; for (const b of BIOMES) TABLE[b] = SB.BIOME[b];

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{background:#14181c;margin:0;font:13px -apple-system,sans-serif;color:#ccc}</style></head><body><script>
const A=${JSON.stringify(A)}, T=${JSON.stringify(TABLE)}, BIOMES=${JSON.stringify(BIOMES)};
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
  const W=1580, RH=104, RH2=52, GAP=10, LAB=120;
  const cv=document.createElement('canvas');
  cv.width=LAB+W; cv.height=(RH+RH2+GAP)*BIOMES.length+56;
  const g=cv.getContext('2d');
  g.fillStyle='#14181c'; g.fillRect(0,0,cv.width,cv.height);
  const drawPat=(im,alpha,sc,x,y,w,h)=>{ if(alpha<=0.004)return; g.globalAlpha=Math.min(1,alpha);
    const p=g.createPattern(im,'repeat'); const m=new DOMMatrix(); m.a=sc; m.d=sc; p.setTransform(m);
    g.fillStyle=p; g.fillRect(x,y,w,h); g.globalAlpha=1; };

  BIOMES.forEach((bn,bi)=>{
    const B=T[bn], y0=28+bi*(RH+RH2+GAP);
    // ── 일반 지질 램프 ──
    drawPat(imgs.grass,1,0.295,LAB,y0,W,RH);
    for(let x=0;x<W;x+=3){
      const f=x/W*1000;
      for(let yy=0;yy<RH;yy+=4){
        const nz=vnoise((x+bi*97)/38,yy/38), nz2=vnoise((x+bi*97)/13+31,yy/13+7);
        const jit=(nz-0.5)*260+(nz2-0.5)*90;
        const xv=f+jit;
        const grA=smooth(B.grass[0],B.grass[1],xv)*B.capG;   // ★정본과 같은 식(capG 포함)
        const dryA=1-grA, mudA=1-smooth(B.dry[0],B.dry[1],xv);
        g.save(); g.beginPath(); g.rect(LAB+x,y0+yy,3,4); g.clip();
        drawPat(imgs.dry,dryA,0.3,LAB+x,y0+yy,3,4);
        drawPat(imgs.mud,mudA,0.3,LAB+x,y0+yy,3,4);
        g.restore();
      }
      g.globalAlpha=B.tintA; g.fillStyle=B.tint; g.fillRect(LAB+x,y0,3,RH); g.globalAlpha=1;
    }
    // 소품 — 자리별 고유 문턱(정본과 같은 사고)
    for(let k=0;k<420;k++){
      const px=LAB+10+hash(k,bi,11)*(W-20), py=y0+12+hash(k,bi,12)*(RH-22), f=(px-LAB)/W*1000;
      const thrR=400*hash(k,bi,13), aR=1-smooth(thrR,thrR+80,f);
      if(aR>0.03){ const rr=(2.2+2.6*hash(k,bi,14))*(0.5+0.5*aR);
        g.globalAlpha=Math.min(1,aR); g.fillStyle=B.propR;
        g.beginPath(); g.ellipse(px,py,rr,rr*0.62,0,0,6.3); g.fill();
        g.fillStyle='rgba(48,45,41,0.55)'; g.beginPath(); g.ellipse(px,py+rr*0.35,rr*0.9,rr*0.35,0,0,6.3); g.fill(); g.globalAlpha=1; }
      const thrT=700+300*hash(k,bi,15), aT=smooth(thrT,thrT+60,f)*B.capG;
      if(aT>0.03){ g.globalAlpha=aT; g.lineWidth=1.3; g.strokeStyle=B.propG[(hash(k,bi,16)*3)|0];
        for(let b3=0;b3<3;b3++){ const ox=(hash(k,bi,71+b3)-0.5)*6, hgt=(6+8*hash(k,bi,81+b3))*aT, ln=(hash(k,bi,91+b3)-0.5)*6;
          g.beginPath(); g.moveTo(px+ox,py); g.quadraticCurveTo(px+ox+ln*0.4,py-hgt*0.6,px+ox+ln,py-hgt); g.stroke(); }
        g.globalAlpha=1; }
    }
    // ── 산터(암반) 램프 ──
    const y1=y0+RH+2;
    g.fillStyle='#6b665e'; g.fillRect(LAB,y1,W,RH2);
    for(let k=0;k<5200;k++){ const rx=LAB+hash(k,bi,81)*W, ry=y1+hash(k,bi,82)*RH2;
      g.fillStyle=hash(k,bi,83)<0.5?'rgba(52,49,44,0.5)':'rgba(122,116,106,0.45)';
      g.fillRect(rx,ry,2+4*hash(k,bi,84),1.6+3*hash(k,bi,85)); }
    for(let k=0;k<420;k++){
      const px=LAB+hash(k,bi,91)*W, py=y1+6+hash(k,bi,92)*(RH2-12), f=(px-LAB)/W*1000;
      const thr=B.rock[0]+(B.rock[1]-B.rock[0])*hash(k,bi,93);
      const a=smooth(thr,thr+90,f)*(0.28+0.3*hash(k,bi,94));
      if(a>0.02){ g.fillStyle='rgba(74,96,52,'+a.toFixed(3)+')';
        g.beginPath(); g.ellipse(px,py,3+7*hash(k,bi,95),2+4*hash(k,bi,96),0,0,6.3); g.fill(); } }
    // 라벨
    g.fillStyle='#dfe6ee'; g.font='bold 14px sans-serif'; g.textAlign='left';
    g.fillText(bn, 8, y0+18);
    g.fillStyle='#8b96a2'; g.font='11px sans-serif';
    g.fillText('풀 '+B.grass[0]+'~'+B.grass[1], 8, y0+36);
    g.fillText('상한 '+(B.capG*100).toFixed(0)+'%', 8, y0+52);
    g.fillText('흙 '+B.dry[0]+'~'+B.dry[1], 8, y0+68);
    g.fillStyle='#6b7681'; g.fillText('산터 이끼', 8, y1+18);
    g.fillText(B.rock[0]+'~'+B.rock[1], 8, y1+34);
  });
  g.fillStyle='#cbd5e1'; g.font='bold 15px sans-serif'; g.textAlign='left';
  g.fillText('바이옴 × 비옥도 램프 — 가로 = 토양치 0 → 1000 (윗줄 일반 지질 · 아랫줄 산터 암반)', 8, 18);
  g.fillStyle='#8b96a2'; g.font='12px sans-serif'; g.textAlign='center';
  for(const f of [0,250,500,750,1000]) g.fillText(''+f, LAB+f/1000*W, cv.height-10);
  cv.id='sheet'; document.body.appendChild(cv); document.title='READY';
}
</script></body></html>`;
fs.writeFileSync('/tmp/biome-ramps.html', html);
(async () => {
  const { chromium } = require('playwright');
  const b = await chromium.launch({ headless: true });
  const pg = await (await b.newContext({ viewport: { width: 1760, height: 1700 } })).newPage();
  pg.on('pageerror', (e) => console.log('[err]', String(e.message).slice(0, 200)));
  await pg.goto('file:///tmp/biome-ramps.html');
  await pg.waitForFunction(() => document.title === 'READY', { timeout: 60000 });
  await (await pg.$('#sheet')).screenshot({ path: '/tmp/biome-ramps.png' });
  console.log('시안 → /tmp/biome-ramps.png');
  await b.close();
})();
