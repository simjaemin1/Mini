// 건널목 둘레 그림(1px = 1칸 · ×3 확대) — 물 · 다리 · 바위 · 끔 길(빨강) · 켬 길(초록) · 다리 안(노랑)
const path=require('path'),fs=require('fs'),ROOT='/root/t1327';
const [Z,OFF,OUTD]=process.argv.slice(2);
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const TT = require(path.join(ROOT, 'server', 'terrain')); TT.setZonesMeta(ZONES);
const { PNG } = require(path.join(ROOT,'node_modules','pngjs'));
const ZONE=ZONES[Z],SZ=32,BR=new Set();{const bl=ZONE.bridges||[];for(let i=0;i+1<bl.length;i+=2)BR.add(bl[i]+'_'+bl[i+1]);}
const cached=(f)=>{const C=new Map();return (x,y)=>{const k=Math.floor(x/SZ)*65536+Math.floor(y/SZ);let v=C.get(k);if(v===undefined){v=f(x,y);C.set(k,v)}return v}};
const isW=cached((x,y)=>{try{return !!TT.isWaterCellLocal(Z,Math.floor(x/SZ)*SZ+16,Math.floor(y/SZ)*SZ+16)}catch(e){return false}});
const isR=cached((x,y)=>{try{return !!TT.isRockCellLocal(Z,Math.floor(x/SZ)*SZ+16,Math.floor(y/SZ)*SZ+16)}catch(e){return false}});
const blk=(x,y)=>x<0||y<0||x>=ZONE.zoneWidth||y>=ZONE.zoneHeight||isR(x,y)||isW(x,y);
const mk=(fix)=>{for(const k of Object.keys(require.cache))if(/server[\/\\]villages/.test(k))delete require.cache[k];process.env.T1327_ROUTE_FIX=fix?'1':'0';const V=require(path.join(ROOT,'server','villages'));const B3=V.__p3Bind({}),S=B3.state;S.zoneId=Z;
 const ta=V.__labProbe.makeTerrainAdapter(TT,ZONE,{isTerrainBlockedLocal:blk,isWaterTileLocal:isW,isBridgeLocal:(x,y)=>BR.has(Math.floor(x/SZ)+'_'+Math.floor(y/SZ))});S._distCtx={ta,ZONE};S._route=null;return B3.computeRoutePts;};
const fords=JSON.parse(fs.readFileSync(`/tmp/t1327/fords-${Z}.json`)).filter(f=>f.kind==='cut');
const br=fs.existsSync(`/tmp/t1327/bridge-${Z}.json`)?JSON.parse(fs.readFileSync(`/tmp/t1327/bridge-${Z}.json`)).props:[];
const BRP=new Set();for(const p of br)for(let i=0;i+1<p.cells.length;i+=2)BRP.add(p.cells[i]+'_'+p.cells[i+1]);
const ARM=process.env.ARM;const CR=ARM?mk(ARM==='on'):null;const RT={};const RTF=(a)=>`/tmp/t1327/maps/routes-${Z}-${a}.json`;
fs.mkdirSync(OUTD,{recursive:true});fs.mkdirSync('/tmp/t1327/maps',{recursive:true});
let n=0;for(const f of fords){n++;const s=f.seg,mx=Math.floor((s.a[0]+s.b[0])/2/SZ),my=Math.floor((s.a[1]+s.b[1])/2/SZ),R=60,K=4,W=(2*R+1)*K;
 const img=new PNG({width:W,height:W});const put=(x,y,c)=>{for(let i=0;i<K;i++)for(let j=0;j<K;j++){const px=(x-mx+R)*K+i,py=(y-my+R)*K+j;if(px<0||py<0||px>=W||py>=W)continue;const o=(py*W+px)*4;img.data[o]=c[0];img.data[o+1]=c[1];img.data[o+2]=c[2];img.data[o+3]=255;}};
 for(let y=my-R;y<=my+R;y++)for(let x=mx-R;x<=mx+R;x++){const px=x*SZ+16,py=y*SZ+16;put(x,y,BRP.has(x+'_'+y)?[240,220,0]:BR.has(x+'_'+y)?[200,160,90]:isR(px,py)?[70,70,70]:isW(px,py)?[60,110,170]:[205,205,195]);}
 // 그 마디를 지나는 짧은 길: 마디 두 끝에서 코스 4칸 밖 두 점
 const dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1],L=Math.hypot(dx,dy),ux=dx/L,uy=dy/L;
 let A=[s.a[0]-ux*512,s.a[1]-uy*512],B=[s.b[0]+ux*512,s.b[1]+uy*512];
 const draw=(pts,c)=>{if(!pts)return;for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],m=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/8));for(let q=0;q<=m;q++)put(Math.floor((a.x+(b.x-a.x)*q/m)/SZ),Math.floor((a.y+(b.y-a.y)*q/m)/SZ),c);}};
 if(ARM){RT[n]=CR(A[0],A[1],B[0],B[1]);continue;}
 const off=JSON.parse(fs.readFileSync(RTF('off')))[n],on=JSON.parse(fs.readFileSync(RTF('on')))[n];
 draw(off,[220,30,30]);draw(on,[0,170,0]);
 const f2=path.join(OUTD,`${Z}_건널목${n}_${f.seg.kind}_${s.a.join('-')}.png`);fs.writeFileSync(f2,PNG.sync.write(img));console.log(f2,'끔 길 점',off&&off.length,'켬 길 점',on&&on.length);}
if(ARM){fs.writeFileSync(RTF(ARM),JSON.stringify(RT));const VV=require(path.join(ROOT,"server","villages"));console.log("stat",process.env.T1327_ROUTE_FIX,JSON.stringify(VV.t1327Stat()));}
