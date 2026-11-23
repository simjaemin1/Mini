// 사냥판 하나 — 잡음 · 도살 · 잃음 셈(블록 s._mobKills · s._lostK) — T1393 hunt-field 그림
process.env.T1331_BEAST_BODY='1';process.env.T1393_HUNT_CHASE='1';process.env.T1195_HUNT_REAL='1';
const path=require('path');const ROOT=process.env.TREE||path.join(__dirname,'../..');
const BB=require(ROOT+'/server/beast-body.js'),Wl=require(ROOT+'/server/wildlife.js');
let seed=7*2654435761>>>0;const rng=()=>{seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
if(+process.env.S95>1){const V=require(ROOT+'/server/villages');V.t1295S=()=>+process.env.S95;}
const SP=process.env.SP||'deer',NH=+(process.env.NH||3),DAYS=+(process.env.DAYS||2),S95=+(process.env.S95||1);
const B=BB.create({L_GAMEMAX:100,L_GAMER:0.002,huntTake:()=>0,species:[SP],scale:5000});
const R=Math.sqrt(2923/Math.PI),led=new Map();for(let x=-31;x<=31;x++)for(let y=-31;y<=31;y++)if(x*x+y*y<=R*R)led.set((500+x)+','+(500+y),0);
const ks=[...led.keys()];for(const k of ks)led.set(k,58*5000/ks.length);B.migrate('V',led,1);
const mobs=new Map(),players=new Map(),cm={chunkSize:1024,keyOf:(cx,cy)=>cx+'_'+cy,insertMob:()=>{},removeMob:()=>{},updateMobChunk:()=>{}};
for(let i=0;i<NH;i++){const a=i/NH*6.283,wx=500+Math.round(Math.cos(a)*20),wy=500+Math.round(Math.sin(a)*20);players.set('h'+i,{pid:'h'+i,isNpc:true,simJob:'hunter',_huntOn:1,hp:100,x:wx*32,y:wy*32,_workSite:{x:wx*32,y:wy*32},_huntWk:{cx:wx,cy:wy},vx:0,vy:0});}
Wl.init({ZONE_ID:'hanbando',ZONE:{zoneWidth:40000,zoneHeight:40000},TICK_HZ:30,chunkManager:cm,mobs,players,isTerrainBlockedLocal:()=>false,isRockTileLocal:()=>false,terrainMod:{getForestMultiplier:()=>2},getActiveChunkKeys:()=>new Set(),isPositionActive:()=>false,spawnCorpse:()=>null,damagePlayer:(p,d)=>{p.hp=Math.max(1,p.hp-d)},broadcast:()=>{},WORLD:{dayLengthMs:1440000,dayPhaseRatio:0.7,worldEpoch:0},setMobHp:(m,v)=>{m.hp=v},simVillages:()=>[],legacyVillages:[],rng,huntBudgetOf:()=>Infinity,t1393Put:(p,x,y)=>{p.x=x;p.y=y}});
let now=7.2*3600*1000;const stepMs=1000/30*(process.env.STEPMS?+process.env.STEPMS:180);
for(let m=0;m<DAYS*1440;m+=6){now+=6000;Wl.tick(now);for(const p of players.values()){p.hp=100;if(p._t1416Go){p._t1416Go=0;p._t1416H=null;}}}
const st=Wl.t1393Stat(),s16=Wl.t1416Stat();console.log("butch",st.butch,"lost",st.carcLost,JSON.stringify(st.lostWhy));let kil=0;for(const p of players.values())kil+=p._huntKil||0;
console.log(JSON.stringify({SP,NH,died:B.W.st.died,huntKil:kil,hunt:st.hunt,load:s16.load,lost:s16.lostCarc,loadKg:s16.loadKg,cache:s16.cacheKg,fetch:s16.fetchKg,go:s16.goHome}));
