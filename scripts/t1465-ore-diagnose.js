#!/usr/bin/env node
'use strict';
// T1465 계측기. 정본 지형의 후보/기댓값 몫과 몸의 셀 선정 함수를 읽는다.
// kg는 ORE_K × CHUNK_KG의 기준 덩이 질량이다(숙련별 덩이 질량은 별도).
process.env.ENABLE_VILLAGES = '0';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=path.join(__dirname,'..'),R=p=>require(path.join(ROOT,p));
const T=R('server/terrain'),S=R('server/specialty'),V=R('server/villages'),P=V.__labProbe;
const {ZONES}=R('server/zone-config'),Z='hanbando',zone=ZONES[Z],SZ=P.SZ;
T.setZonesMeta(ZONES);P.setZoneId(Z);
const outArg=process.argv.indexOf('--out'),out=outArg<0?null:process.argv[outArg+1];
const src=fs.readFileSync(path.join(ROOT,'server/terrain.js'),'utf8');
const reach=Number(src.match(/const _ORE_REACH = ([\d.]+);/)[1]);
const source='계측/T1427_2026-11-22/진단-뒤.json';
const prior=JSON.parse(fs.readFileSync(path.join(ROOT,source),'utf8'));
const inside=(x,y)=>x>=0&&y>=0&&x<zone.zoneWidth&&y<zone.zoneHeight;
const water=(x,y)=>!inside(x,y)||!!T.isWaterCellLocal(Z,Math.floor(x/SZ)*SZ+SZ/2,Math.floor(y/SZ)*SZ+SZ/2);
const rock=(x,y)=>!!T.isRockCellLocal(Z,x,y);
const ta=P.makeTerrainAdapter(T,zone,{isTerrainBlockedLocal:(x,y)=>!inside(x,y)||water(x,y)||rock(x,y),isWaterTileLocal:water});
P._t400Probe.setup({ta,zoneId:Z,deps:{oreProbAt:(x,y)=>T.oreProbMajorAt(Z,x,y)}});
const owners=new Map(),villages=prior.villages.map(v=>({...v,cells:[]}));
for(const v of villages){
  const cells=P.oreCellsOf({ccx:v.ccx,ccy:v.ccy});
  v.cells=cells.map(c=>({cx:c.cx,cy:c.cy,p:c.p,mix:T.oreMixAt(Z,c.cx*SZ+SZ/2,c.cy*SZ+SZ/2)}));
  for(const c of cells){const id=c.cx+','+c.cy;if(!owners.has(id))owners.set(id,[]);owners.get(id).push(v.name);}
}
const ores=T._getHardcoded()[Z].ores,veinIndex=new Map(ores.map((o,i)=>[o,i]));
const veins=ores.map((o,i)=>({i,name:o.name,minor:!!o.minor,mineral:o.mineral,center:o.center,radius:o.radius,pk:o.pk,
  cells:0,equivalentCells:0,chunks:0,referenceKg:0,mineralsKg:{},regenMaxKgPer365Days:{},npcAccessibleMineralsKg:{},villages:{},sharedCells:0}));
const totals={cells:0,chunks:0,referenceKg:0,mineralsKg:{},regenMaxKgPer365Days:{},npcAccessibleCells:0,npcAccessibleMineralsKg:{},npcRegenMaxKgPer365Days:{},sharedNpcCells:0};
const add=(o,k,q)=>o[k]=(o[k]||0)+q;
const seen=new Set(),fullKg=S.ORE_K*S.CHUNK_KG,regenKg=(S.ORE_REG0+S.ORE_REG1)*365*S.CHUNK_KG;
for(let i=0;i<ores.length;i++){
  const o=ores[i],r=o.radius*reach;
  for(let cy=Math.max(0,Math.floor((o.center[1]-r)/SZ));cy<=Math.min(Math.floor(zone.zoneHeight/SZ)-1,Math.ceil((o.center[1]+r)/SZ));cy++)
  for(let cx=Math.max(0,Math.floor((o.center[0]-r)/SZ));cx<=Math.min(Math.floor(zone.zoneWidth/SZ)-1,Math.ceil((o.center[0]+r)/SZ));cx++){
    const id=cx+','+cy;if(seen.has(id))continue;
    const x=cx*SZ+SZ/2,y=cy*SZ+SZ/2,cs=T.oreCandidatesAt(Z,x,y);if(!cs.length)continue;seen.add(id);
    const mix=T.oreMixAt(Z,x,y),who=owners.get(id)||[],sum=cs.reduce((a,c)=>a+c.p,0);
    totals.cells++;totals.chunks+=S.ORE_K;totals.referenceKg+=fullKg;
    if(who.length)totals.npcAccessibleCells++;if(who.length>1)totals.sharedNpcCells++;
    for(const [m,f]of Object.entries(mix||{})){add(totals.mineralsKg,m,fullKg*f);add(totals.regenMaxKgPer365Days,m,regenKg*f);if(who.length){add(totals.npcAccessibleMineralsKg,m,fullKg*f);add(totals.npcRegenMaxKgPer365Days,m,regenKg*f);}}
    for(let j=0;j<cs.length;j++){
      const c=cs[j],idx=veinIndex.get(c.o);if(idx==null)throw Error('canonical vein identity missing');
      const row=veins[idx],w=sum>0?c.p/sum:(j===0?1:0);row.cells++;row.equivalentCells+=w;row.chunks+=S.ORE_K*w;row.referenceKg+=fullKg*w;
      const dist=c.o.minerals||{[c.o.mineral]:1},den=Object.values(dist).reduce((a,f)=>a+Math.max(0,f),0);
      for(const [m,f]of Object.entries(dist))if(f>0){const fraction=w*f/den;add(row.mineralsKg,m,fullKg*fraction);add(row.regenMaxKgPer365Days,m,regenKg*fraction);if(who.length)add(row.npcAccessibleMineralsKg,m,fullKg*fraction);}
      for(const name of who)row.villages[name]=(row.villages[name]||0)+1;if(who.length>1)row.sharedCells++;
    }
  }
  if(i%100===0)console.error('veins',i,'/',ores.length,'unique cells',seen.size);
}
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,f))).digest('hex');
const result={scope:'all canonical vein candidate cells, clipped to zone; overlapping veins share one physical cell, attributed by oreMineralAt expected shares',zone:Z,constants:{MINE_TEAM:Number(fs.readFileSync(path.join(ROOT,'server/villages.js'),'utf8').match(/const MINE_TEAM = (\d+);/)[1]),ORE_K:S.ORE_K,CHUNK_KG:S.CHUNK_KG,ORE_REG0:S.ORE_REG0,ORE_REG1:S.ORE_REG1,yearDays:365,oreReachReadFromTerrain:reach},
  units:'oreMineralAt conditional mineral shares × reference raw chunk kg, not refined metal; maximum refill is empty-cell instantaneous rate maintained by extraction, not an idle one-year refill',
  topologySource:{file:source,sha256:sha(source),note:'T1427 canonical seeded centres; implementation begins from the identical terrain and code, main merge changed documentation only'},
  sourceHashes:Object.fromEntries(['server/hanbando-terrain.json','server/terrain.js','server/specialty.js','server/villages.js'].map(f=>[f,sha(f)])),totals,veins,villages};
if(out){fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result));}
console.log(JSON.stringify({veins:veins.length,totals},null,2));
