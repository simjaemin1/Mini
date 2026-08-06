// 비옥도 → 타일 외형 램프 시안: 0(암반)→1000(초원+풀포기)
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
const imgs={};let pend=0;
for(const k in A){pend++;const im=new Image();im.onload=()=>{imgs[k]=im;if(--pend===0)go();};im.src=A[k];}
function go(){
  const W=210,H=190, stages=[0,150,300,450,600,800,900,1000];
  const cv=document.createElement('canvas'); cv.width=W*stages.length; cv.height=(H+40)*2+26;
  const g=cv.getContext('2d');
  g.fillStyle='#14181c'; g.fillRect(0,0,cv.width,cv.height);
  g.fillStyle='#cbd'; g.font='bold 14px sans-serif'; g.textAlign='left';
  g.fillText('일반 타일 (비옥도만)', 10, (H+40)+2);
  g.fillText('산이었던 타일 — 기본이 암반인 별도 램프: 비옥도는 이끼·틈새 풀만 늘림(풀밭이 되지 않음)', 10, (H+40)*2+18);
  [0,1].forEach(row=>{
  stages.forEach((f,i)=>{
    const x0=i*W, y0=row*(H+40)+(row?26:0);
    g.save(); g.beginPath(); g.rect(x0+6,y0+30,W-12,H-40); g.clip();
    // 층위: 암반(진흙톤 어둡게) → 맨흙 → 마른풀 → 초원 — 비옥도로 알파 블렌드
    const drawPat=(im,alpha,scale)=>{ if(alpha<=0)return;
      g.globalAlpha=Math.min(1,alpha);
      const p=g.createPattern(im,'repeat'); const m=new DOMMatrix(); m.a=scale; m.d=scale; m.e=x0; m.f=y0; p.setTransform(m);
      g.fillStyle=p; g.fillRect(x0+6,y0+30,W-12,H-40); };
    drawPat(imgs.mud,1,0.3);
    if(f<300){ g.globalAlpha=(300-f)/300*0.55; g.fillStyle='#3a3733'; g.fillRect(x0+6,y0+30,W-12,H-40); } // 암반 어둡힘
    drawPat(imgs.dry, f<=150?0:(f-150)/450, 0.3);
    drawPat(imgs.grass, f<=450?0:(f-450)/550, 0.295);
    g.globalAlpha=1;
    // 자갈(저비옥) · 풀포기(고비옥) 소품
    const nR=f<400?Math.round(8*(400-f)/400):0;
    for(let k2=0;k2<nR;k2++){ const im=imgs.rock; const sc=(14+16*hash(i,k2,5))/im.height;
      g.drawImage(im, x0+16+hash(i,k2,1)*(W-44), y0+40+hash(i,k2,2)*(H-70), im.width*sc, im.height*sc); }
    const nT=f>700?Math.round(14*(f-700)/300):0;
    for(let k2=0;k2<nT;k2++){
      const bx=x0+16+hash(i,k2,11)*(W-40), by=y0+52+hash(i,k2,12)*(H-76);
      g.strokeStyle=['#4e7a3c','#5d8a46','#6b8f4e'][(hash(i,k2,13)*3)|0]; g.lineWidth=1.4;
      for(let b3=0;b3<3;b3++){ const ox=(hash(i,k2,20+b3)-0.5)*6, hgt=6+8*hash(i,k2,30+b3), ln=(hash(i,k2,40+b3)-0.5)*6;
        g.beginPath(); g.moveTo(bx+ox,by); g.quadraticCurveTo(bx+ox+ln*0.4,by-hgt*0.6,bx+ox+ln,by-hgt); g.stroke(); }
    }
    if(row===1){
      // ★산터 램프 [재민 "기본적으로 돌이되, 비옥해지면 풀이 조금"] — 기본 재질이 암반인 별도 축.
      //   흙 램프를 덮고 암반을 처음부터 다시 그린다. 비옥도는 이끼·틈새 풀 '만' 늘린다.
      g.globalAlpha=1;
      // 암반 바탕: 회색 + 결정론 얼룩 + 균열
      g.fillStyle='#6b665e'; g.fillRect(x0+6,y0+30,W-12,H-40);
      for(let k2=0;k2<260;k2++){ const rx=x0+6+hash(i,k2,81)*(W-12), ry=y0+30+hash(i,k2,82)*(H-40);
        const v=hash(i,k2,83); g.fillStyle=v<0.5?'rgba(52,49,44,0.5)':'rgba(122,116,106,0.45)';
        g.fillRect(rx,ry,2+4*hash(i,k2,84),1.6+3*hash(i,k2,85)); }
      g.strokeStyle='rgba(38,35,31,0.7)'; g.lineWidth=1.3;
      for(let k2=0;k2<5;k2++){ let cxp=x0+10+hash(i,k2,86)*(W-24), cyp=y0+34+hash(i,k2,87)*(H-52);
        g.beginPath(); g.moveTo(cxp,cyp);
        for(let st=0;st<5;st++){ cxp+=(hash(i,k2*7+st,88)-0.5)*34; cyp+=8+hash(i,k2*7+st,89)*16; g.lineTo(cxp,cyp); }
        g.stroke(); }
      // 이끼: f≥450부터 얼룩
      if(f>=450){ const nM=Math.round(26*(f-450)/550);
        for(let k2=0;k2<nM;k2++){ g.fillStyle='rgba(74,96,52,'+(0.25+0.3*hash(i,k2,91))+')';
          const mx=x0+10+hash(i,k2,92)*(W-30), my=y0+36+hash(i,k2,93)*(H-52);
          g.beginPath(); g.ellipse(mx,my,3+7*hash(i,k2,94),2+4*hash(i,k2,95),0,0,6.3); g.fill(); } }
      // 틈새 풀: f≥800부터 '조금' (일반 줄의 절반 이하) — 균열 근처 느낌으로
      const nT2=f>=800?Math.round(6*(f-800)/200)+2:0;
      for(let k2=0;k2<nT2;k2++){
        const bx=x0+18+hash(i,k2,96)*(W-42), by=y0+50+hash(i,k2,97)*(H-72);
        g.strokeStyle=['#4e7a3c','#5d8a46'][(hash(i,k2,98)*2)|0]; g.lineWidth=1.3;
        for(let b3=0;b3<3;b3++){ const ox=(hash(i,k2,99+b3)-0.5)*5, hgt=5+6*hash(i,k2,102+b3), ln=(hash(i,k2,105+b3)-0.5)*5;
          g.beginPath(); g.moveTo(bx+ox,by); g.quadraticCurveTo(bx+ox+ln*0.4,by-hgt*0.6,bx+ox+ln,by-hgt); g.stroke(); }
      }
    }
    g.restore();
    g.fillStyle='#ddd'; g.font='bold 15px sans-serif'; g.textAlign='center';
    g.fillText('비옥도 '+f, x0+W/2, y0+22);
    const label=row===1
      ?(f===0?'갓 깨진 암반':f===150?'부서진 돌밭':f===300?'암반':f===450?'이끼 시작':f===600?'이끼 낀 암반':f===800?'★산 파괴 직후·틈새 흙':f===900?'틈새 풀':'틈새 풀 상한(돌밭 그대로)')
      :(f===0?'암반(채굴 직후)':f===150?'자갈밭':f===300?'맨흙':f===450?'마른 땅':f===600?'회복 중':f===800?'회복 양호':f===900?'풀 돋음':'초원(완전 회복)');
    g.fillStyle='#9a9'; g.font='12px sans-serif';
    g.fillText(label, x0+W/2, y0+H+22);
  });
  });
  cv.id='strip'; document.body.appendChild(cv); document.title='READY';
}
</script></body></html>`;
fs.writeFileSync('/tmp/fert-strip.html',html);
(async()=>{
  const {chromium}=require('playwright');
  const b=await chromium.launch({headless:true});
  const pg=await (await b.newContext({viewport:{width:1900,height:400}})).newPage();
  pg.on('pageerror',e=>console.log('[err]',String(e.message).slice(0,200)));
  await pg.goto('file:///tmp/fert-strip.html');
  await pg.waitForFunction(()=>document.title==='READY',{timeout:30000});
  const el=await pg.$('#strip');
  await el.screenshot({path:'/tmp/fert-strip.png'});
  console.log('done');
  await b.close();
})();
