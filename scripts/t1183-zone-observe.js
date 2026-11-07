'use strict';
// 읽기 전용: 실제 zone 프로세스의 교전 첫 사격·접촉·사기 곡선.
// T1183_ZONE_OUT=<파일> NODE_OPTIONS="-r <이 파일>" node scripts/test-war-world.js
if (!process.env.T1183_ZONE_OUT || !/[\\/]server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
const fs = require('fs');
const crypto = require('crypto');
const BC = require('../sim/battle-core');
const WL = require('../server/war-live');
const create = WL.createWarLive;
const rec = { node: process.version, flatFixture: process.env.T1183_FLAT_ENCOUNTER === '1', source: Object.fromEntries(['villages.js','war-live.js'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(require('path').join(__dirname,'..','server',f))).digest('hex')])), fights: [] };
const flush = () => fs.writeFileSync(process.env.T1183_ZONE_OUT, JSON.stringify(rec, null, 2)+'\n');
// 선택적 동일 조건 판: 임시 DB의 기존 WAR_FIXTURE 군대를 창3·궁3으로 고정한다.
// 실제 존의 NPC·소집·전이·틱은 그대로 쓰고, 첫 교전의 초기 위치만 빈 들판에 준다.
if (rec.flatFixture) {
  if (!process.env.WAR_FIXTURE) throw new Error('빈 들판 대조에는 WAR_FIXTURE가 필요합니다');
  const WC = require('../sim/war-core'), createWar = WC.createWar;
  WC.createWar = function (...args) {
    const war = createWar.apply(this,args), mobilize = war.warMobilize, conscript = war.conscript;
    war.warMobilize = function (...a) {
      const ok = mobilize.apply(this,a);
      if (ok) { const w=war.WARS[war.WARS.length-1]; w.composition={spear:3,archer:3}; w.force=6; w.warriors=3; }
      return ok;
    };
    war.conscript = function (...a) { const out=conscript.apply(this,a); return out ? Object.assign({},out,{composition:{spear:3,archer:3}}) : out; };
    return war;
  };
}
function flatStart(f, api, row) {
  if (!rec.flatFixture || row.flatReady || !f.ctx.units.some(u=>u.side==='A') || !f.ctx.units.some(u=>u.side==='B')) return;
  const H=require('../server/villages').__p3Bind({}), st=H.state, body=st.warBodies.get(f.w.id);
  if (!body || !body.atkGroup || !body.defGroup) return;
  st._warNoCollide=true; st._warRects=[]; st._warRectCells=new Set();
  st._warTerrMemo=new Map(); st._warTreeMemo=new Map();
  st.deps.isTerrainBlockedLocal=()=>false; st.deps.treeCellBlocked=()=>false;
  const origin=1500;
  for (const [side,g,x,h] of [['A',body.atkGroup,40,0],['B',body.defGroup,70,Math.PI]]) {
    g.cmd={cx:origin+x,cy:origin+40}; g.holdPt={...g.cmd}; g.heading=h;
    for (const u of g.units) { const t=H._t790Place(g,u); u.x=t[0];u.y=t[1]; if(u.bu)u.bu.face=h; }
  }
  body.cmd={...body.atkGroup.cmd}; body.campPt={...body.atkGroup.cmd};
  body.pts=[{x:(origin+40)*32,y:(origin+40)*32},{x:(origin+70)*32,y:(origin+40)*32}];
  f.route=body.pts.map(p=>({x:p.x/32,y:p.y/32}));f.home={A:{x:origin+40,y:origin+40},B:{x:origin+70,y:origin+40}};f.objective=f.home.B;
  f.adv={side:'A',released:false,formed:true,s:null}; f.state='advance'; f.holder='B';
  row.flatReady=true; row.origin=origin; row.startT=f.t;
}
function replay(row) {
  const ctx=BC.createContext(); ctx.sides=JSON.parse(JSON.stringify(row.sides));
  ctx.rng=WL._muRng(row.seed); for(let i=0;i<row.rngAtStart;i++)ctx.rng();
  ctx.units=row.initial.map(it=>{const u={...it.primitive,ctl:false};for(const k of ['x','y','_px','_py','_ox','_oy'])if(u[k]!=null)u[k]-=row.origin;return u;});
  const out={firstArrow:{},firstHit:{},firstContact:null,morale:[]};let t=0;
  ctx.onArrow=(kind,ar,u)=>{if(kind==='fire'&&out.firstArrow[u.side]==null)out.firstArrow[u.side]=t;if(kind==='hit'&&ar.sh&&out.firstHit[ar.sh.side]==null)out.firstHit[ar.sh.side]=t;};
  for(let tick=1;tick<=300;tick++){
    t=tick/30;BC._trackVel(ctx,1/30);BC._stepBattle(ctx,1/30);
    if(out.firstContact==null&&ctx.units.some(u=>u.st==='shoot'||u.st==='melee'))out.firstContact=t;
    const second=Math.floor(t);
    if(!out.morale.length||out.morale[out.morale.length-1].second!==second){
      const sample={second};for(const side of ['A','B']){const us=ctx.units.filter(u=>u.side===side&&u.hp>0);sample[side]={n:us.length,mean:us.length?us.reduce((a,u)=>a+u.mrl,0)/us.length:null};}out.morale.push(sample);
    }
  }
  return out;
}
WL.createWarLive = function (...args) {
  const api = create.apply(this, args), make = api.makeFight, step = api.stepFight;
  const rows = new WeakMap();
  api.makeFight = function (...a) {
    const f = make.apply(this, a);
    let calls=0; const rng=f.ctx.rng; f.ctx.rng=()=>{calls++;return rng();};
    const row = { rngCalls:()=>calls, id: f.w.id, seed: f.seed, firstArrow: {}, firstHit: {}, firstContact: null, initial: null, morale: [] };
    rec.fights.push(row); rows.set(f, row);
    const arrow = f.ctx.onArrow;
    f.ctx.onArrow = (kind, ar, u) => {
      if (kind === 'fire' && row.firstArrow[u.side] == null) { row.firstArrow[u.side] = f.t; flush(); }
      if (kind === 'hit' && ar.sh && row.firstHit[ar.sh.side] == null) { row.firstHit[ar.sh.side] = f.t; flush(); }
      if (arrow) arrow(kind, ar, u);
    };
    return f;
  };
  api.stepFight = function (f) {
    const row = rows.get(f);
    if (row) flatStart(f,api,row);
    if (row && !row.initial && (!rec.flatFixture || row.flatReady)) { row.rngAtStart=row.rngCalls(); row.sides=JSON.parse(JSON.stringify(f.ctx.sides)); row.initial = f.ctx.units.map(u => ({ type: u.type, side: u.side, x: u.x, y: u.y, mrl: u.mrl, ctl: u.ctl, primitive: Object.fromEntries(Object.entries(u).filter(([k,v])=>v===null || ['number','string','boolean'].includes(typeof v))) })); }
    const ev = step.call(this, f);
    if (row) {
      if (rec.flatFixture && row.flatReady && !row.labReplay && f.t-row.startT>=10) { row.labReplay=replay(row); flush(); }
      if (ev.contact && row.firstContact == null) { row.firstContact = f.t; flush(); }
      const second = Math.floor(f.t);
      if (!row.morale.length || row.morale[row.morale.length-1].second !== second) {
        const sample = { second };
        for (const side of ['A', 'B']) {
          const units = f.ctx.units.filter(u => u.side === side && u.hp > 0);
          sample[side] = { n: units.length, mean: units.length ? units.reduce((s,u)=>s+u.mrl,0)/units.length : null };
        }
        try {
          const H=require('../server/villages').__p3Bind({}), body=H.state.warBodies.get(f.w.id);
          if(body){ sample.advance=f.adv?{...f.adv}:null; sample.groups={};for(const [side,g] of [['A',body.atkGroup],['B',body.defGroup]])if(g){const lag=g.units.filter(u=>!u.dead).map(u=>{const t=H._t790Place(g,u);return {type:u.type,lag:Math.hypot(t[0]-u.x,t[1]-u.y),x:u.x,y:u.y,tx:t[0],ty:t[1]};}).sort((a,b)=>b.lag-a.lag);sample.groups[side]={cmd:{...g.cmd},ready:H._warGroupReady(g),worst:lag.slice(0,3)};}}
        } catch(e) { sample.probeError=String(e); }
        row.morale.push(sample); if (second % 10 === 0) flush();
      }
    }
    return ev;
  };
  return api;
};
process.on('exit', () => fs.writeFileSync(process.env.T1183_ZONE_OUT, JSON.stringify(rec, null, 2)+'\n'));
