// 건널목 자리마다 다리 안(계획기 v2 규칙: 축 4방 · 폭 2칸 · 가장 짧은 건넘 · 두 끝 뭍) + 다리를 놓은 판의 길 길이(켬)
process.env.T1327_ROUTE_FIX='1';
const path=require('path'),fs=require('fs'),ROOT='/root/t1327';
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const TT = require(path.join(ROOT, 'server', 'terrain')); TT.setZonesMeta(ZONES);
const V = require(path.join(ROOT, 'server', 'villages'));
const S = V.__p3Bind({}).state;
const [Z,OFF,FIX]=process.argv.slice(2);const ZONE=ZONES[Z],SZ=32,BR=new Set();{const bl=ZONE.bridges||[];for(let i=0;i+1<bl.length;i+=2)BR.add(bl[i]+'_'+bl[i+1]);}
const cached=(f)=>{const C=new Map();return (x,y)=>{const k=Math.floor(x/SZ)*65536+Math.floor(y/SZ);let v=C.get(k);if(v===undefined){v=f(x,y);C.set(k,v)}return v}};
const isW=cached((x,y)=>{try{return !!TT.isWaterCellLocal(Z,Math.floor(x/SZ)*SZ+16,Math.floor(y/SZ)*SZ+16)}catch(e){return false}});
const isR=(x,y)=>{try{return !!TT.isRockCellLocal(Z,Math.floor(x/SZ)*SZ+16,Math.floor(y/SZ)*SZ+16)}catch(e){return false}};
const inZ=(x,y)=>x>=0&&y>=0&&x<ZONE.zoneWidth&&y<ZONE.zoneHeight;
const blk0=cached((x,y)=>!inZ(x,y)||isR(x,y)||isW(x,y));
const isBr=(x,y)=>BR.has(Math.floor(x/SZ)+'_'+Math.floor(y/SZ));
S.zoneId=Z;
const ta=V.__labProbe.makeTerrainAdapter(TT,ZONE,{isTerrainBlockedLocal:blk0,isWaterTileLocal:isW,isBridgeLocal:isBr});
S._distCtx={ta,ZONE};
const cw=(cx,cy)=>isW(cx*SZ+16,cy*SZ+16)&&!isR(cx*SZ+16,cy*SZ+16), cl=(cx,cy)=>!blk0(cx*SZ+16,cy*SZ+16);
const fords=JSON.parse(fs.readFileSync(`/tmp/t1327/fords-${Z}.json`)).filter(f=>f.kind==='cut'&&f.seg.kind==='water');
const sites=[];
for(const f of fords){const a=f.seg.a,b=f.seg.b,vert=a[0]===b[0];const mx=Math.floor((a[0]+b[0])/2/SZ),my=Math.floor((a[1]+b[1])/2/SZ);let best=null;
 for(let o=-24;o<=24;o++){ // 강을 따라 옮겨 보며 폭 2칸 축 건넘
  const c0=vert?mx+o:my+o;
  const span=(c)=>{ // c 열(세로 건넘) 또는 행 — 강 가운데에서 양쪽으로 뭍을 찾는다
   const at=(t)=>vert?[c,t]:[t,c];const m=vert?my:mx;if(!cw(...at(m)))return null;let lo=m,hi=m;while(cw(...at(lo-1))&&m-lo<60)lo--;while(cw(...at(hi+1))&&hi-m<60)hi++;
   if(!cl(...at(lo-1))||!cl(...at(hi+1)))return null;return{lo,hi};};
  const s1=span(c0),s2=span(c0+1);if(!s1||!s2)continue;const lo=Math.min(s1.lo,s2.lo),hi=Math.max(s1.hi,s2.hi);
  // 두 열 다 lo..hi 를 물로(다리는 물 위에만) · 두 끝 뭍
  let ok=true;for(const c of [c0,c0+1])for(let t=lo;t<=hi;t++){const p=vert?[c,t]:[t,c];if(!cw(...p)&&!cl(...p))ok=false;}
  for(const c of [c0,c0+1]){const e1=vert?[c,lo-1]:[lo-1,c],e2=vert?[c,hi+1]:[hi+1,c];if(!cl(...e1)||!cl(...e2))ok=false;}
  if(!ok)continue;const sp=hi-lo+1;const sc=sp*100+Math.abs(o);if(!best||sc<best.sc){const cells=[];for(const c of [c0,c0+1])for(let t=lo;t<=hi;t++){const p=vert?[c,t]:[t,c];if(cw(...p))cells.push(p[0],p[1]);}best={sc,span:sp,off:o,axis:vert?'남북':'동서',cells,at:[c0,lo,hi]};}
 }
 sites.push({ford:f.seg,best});}
// 같은 강 둘 이상 건널목이면 다리 안이 같은 자리일 수 있다 — 칸으로 묶는다
const uniq=new Map();for(const s of sites)if(s.best){const k=s.best.cells.join(',');if(!uniq.has(k))uniq.set(k,{span:s.best.span,axis:s.best.axis,cells:s.best.cells,fords:[]});uniq.get(k).fords.push(s.ford.a.concat(s.ford.b))}
const props=[...uniq.values()];
console.log(Z,'건널목',fords.length,'다리 안',props.length,props.map(p=>`${p.axis} ${p.span}칸 칸(${p.cells[0]},${p.cells[1]})…(${p.cells[p.cells.length-2]},${p.cells[p.cells.length-1]}) 건널목 ${p.fords.length}`).join(' | '));
// 다리 놓은 판의 길 길이 — 켬 끔 길이 차가 큰 쌍(>10%)
const A=require(OFF),B=require(FIX);const vil=new Map(A.vil.map(v=>[v.id,v]));
const keys=Object.keys(B.routeLen).filter(k=>A.routeLen[k]&&B.routeLen[k]&&B.routeLen[k]/A.routeLen[k]>(+process.env.THR||1.1));
const rows=[];const walk=(pts)=>{let L=0,b=0;for(let i=1;i<pts.length;i++){const a=pts[i-1],c=pts[i],d=Math.hypot(c.x-a.x,c.y-a.y);L+=d;const k=Math.max(1,Math.ceil(d/8));for(let q=1;q<=k;q++)if(ta.isBlocked(Math.floor((a.x+(c.x-a.x)*q/k)/SZ),Math.floor((a.y+(c.y-a.y)*q/k)/SZ)))b++}return{L:Math.round(L),b}};
for(const p of props)for(let i=0;i+1<p.cells.length;i+=2)BR.add(p.cells[i]+'_'+p.cells[i+1]);
for(const k of keys){const[a,b]=k.split('_').map(Number);const va=vil.get(a),vb=vil.get(b);const pts=V.__labProbe.computeRoutePts?null:null;
 const R=(V.__p3Bind({}).computeRoutePts)(va.ccx*SZ+16,va.ccy*SZ+16,vb.ccx*SZ+16,vb.ccy*SZ+16);const w=R?walk(R):null;rows.push({k,off:A.routeLen[k],fix:B.routeLen[k],bridge:w&&w.L,blk:w&&w.b});}
const pct=(x,y)=>((y/x-1)*100).toFixed(1)+'%';
console.log(rows.map(r=>`${r.k} 끔 ${r.off} · 켬 ${r.fix}(${pct(r.off,r.fix)}) · 켬+다리 ${r.bridge}(${pct(r.off,r.bridge)}) 막힘 ${r.blk}`).join('\n'));
fs.writeFileSync(`/tmp/t1327/bridge-${Z}.json`,JSON.stringify({props,rows}));
