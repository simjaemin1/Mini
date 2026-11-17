// 막힌 마디 중 "몸이 못 잇는 이음"(코스 두 칸 상자 안 4방 길 없음) = 건널목 · 굴 · 도랑 넘기
const path=require('path'),ROOT='/root/t1327';
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const TT = require(path.join(ROOT, 'server', 'terrain')); TT.setZonesMeta(ZONES);
const V = require(path.join(ROOT, 'server', 'villages'));
const Z=process.argv[2],J=require(process.argv[3]),ZONE=ZONES[Z],SZ=32,ST=4,BR=new Set();{const bl=ZONE.bridges||[];for(let i=0;i+1<bl.length;i+=2)BR.add(bl[i]+'_'+bl[i+1]);}
const cached=(f)=>{const C=new Map();return (x,y)=>{const k=Math.floor(x/SZ)*65536+Math.floor(y/SZ);let v=C.get(k);if(v===undefined){v=f(x,y);C.set(k,v)}return v}};
const isW=(x,y)=>{try{return !!TT.isWaterCellLocal(Z,Math.floor(x/SZ)*SZ+16,Math.floor(y/SZ)*SZ+16)}catch(e){return false}};
const isR=(x,y)=>{try{return !!TT.isRockCellLocal(Z,Math.floor(x/SZ)*SZ+16,Math.floor(y/SZ)*SZ+16)}catch(e){return false}};
const inZ=(x,y)=>x>=0&&y>=0&&x<ZONE.zoneWidth&&y<ZONE.zoneHeight;
const blk0=cached((x,y)=>!inZ(x,y)||isR(x,y)||isW(x,y));
const ta=V.__labProbe.makeTerrainAdapter(TT,ZONE,{isTerrainBlockedLocal:blk0,isWaterTileLocal:isW,isBridgeLocal:(x,y)=>BR.has(Math.floor(x/SZ)+'_'+Math.floor(y/SZ))});
const anchor=(gx,gy)=>{const bx=gx*ST,by=gy*ST;if(!ta.isBlocked(bx+2,by+2))return[bx+2,by+2];for(let dy=0;dy<ST;dy++)for(let dx=0;dx<ST;dx++)if(!ta.isBlocked(bx+dx,by+dy))return[bx+dx,by+dy];return null};
const bfs=(a,b,x0,y0,x1,y1)=>{const seen=new Set([a[0]+','+a[1]]),q=[a];for(let h=0;h<q.length;h++){const[x,y]=q[h];if(x===b[0]&&y===b[1])return true;for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<x0||ny<y0||nx>x1||ny>y1)continue;const k=nx+','+ny;if(seen.has(k)||ta.isBlocked(nx,ny))continue;seen.add(k);q.push([nx,ny])}}return false};
const out=[];
for(const s of J.segs){if(s.kind==='ditch')continue;const ga=[Math.floor(s.a[0]/SZ/ST),Math.floor(s.a[1]/SZ/ST)],gb=[Math.floor(s.b[0]/SZ/ST),Math.floor(s.b[1]/SZ/ST)];
 if(Math.max(Math.abs(ga[0]-gb[0]),Math.abs(ga[1]-gb[1]))!==1){out.push({s,kind:'end-leg'});continue}
 const A=anchor(...ga),B=anchor(...gb);if(!A||!B){out.push({s,kind:'noanchor'});continue}
 const ok=bfs(A,B,Math.min(ga[0],gb[0])*ST,Math.min(ga[1],gb[1])*ST,(Math.max(ga[0],gb[0])+1)*ST-1,(Math.max(ga[1],gb[1])+1)*ST-1);
 out.push({s,kind:ok?'walkable':'cut'});}
const g={};for(const o of out){g[o.kind+'/'+o.s.kind]=(g[o.kind+'/'+o.s.kind]||0)+1}
console.log(Z,JSON.stringify(g));for(const o of out.filter(o=>o.kind==='cut'))console.log(' cut',o.s.kind,o.s.a,o.s.b,'pairs',o.s.pairs,JSON.stringify(o.s.steps));
require('fs').writeFileSync(`/tmp/t1327/fords-${Z}.json`,JSON.stringify(out.filter(o=>o.kind!=='walkable').map(o=>({kind:o.kind,seg:o.s}))));
