'use strict';
// T1181: same body carries materials from source to site. Caller owns sites/recipes.
// Time/distance/capacity are supplied from existing village/carry rules.
function step(p, task, ctx) {
  const S=p._t1181Haul;
  if(!ctx.awake){if(S)S.at=null;if(S&&S.n>0){ctx.home();return true;}return false;}
  if(!task && !S)return false;
  let s=S;
  if(!s){s=p._t1181Haul={key:task.key,leg:'source',at:null,n:0,item:null,source:task.source};}
  // A removed/replaced site returns its owned load at the original source.
  const cancelled=!!s.returning||!task||s.key!==task.key;
  if(cancelled&&!s.n){p._t1181Haul=undefined;return false;}   // ★[T1314 · T1293 회부 ③] `delete` 는 몸을 사전 모드로 떨어뜨린다(날 80 ~ 92 하루 CPU ×1.4) — 같은 칸 `undefined`(읽는 자리는 참거짓 · `?.` · 저장은 `undefined` 를 안 싣는다 — 바이트 같음)
  const goal=cancelled||s.leg==='source'?s.source:task.target;
  ctx.move(goal,s.n>0?'운반':'출근');
  if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.hypot(p.x-goal.x,p.y-goal.y)>ctx.reach){s.at=null;return true;}
  if(s.at===null || ctx.now-s.at>ctx.maxGap+ctx.storeMs+ctx.drawMs)s.at=ctx.now;
  const wait=cancelled||s.leg==='site'?ctx.storeMs:ctx.drawMs;
  ctx.act(cancelled?'저장':s.leg==='source'?'인출':'건축');
  if(ctx.now-s.at<wait)return true;
  if(s.n>0){
    const got=Math.min(s.n,Math.max(0,p.inventory?.[s.item]||0));
    if(cancelled)ctx.refund(s.item,got);else ctx.place(s.item,got);
    p.inventory[s.item]=Math.max(0,(p.inventory[s.item]||0)-got);s.n=0;s.item=null;s.leg='source';s.at=null;
    if(cancelled)p._t1181Haul=undefined;   // ★[T1314] 위와 같은 까닭
    return true;
  }
  if(s.leg==='source'){
    const load=ctx.pick();if(!load){s.leg='site';s.at=null;return true;}
    const n=ctx.take(load.item,load.n);if(n>0){p.inventory=p.inventory||{};p.inventory[load.item]=(p.inventory[load.item]||0)+n;s.item=load.item;s.n=n;s.leg='site';s.at=null;}return true;
  }
  // No cargo: only time actually spent at the site counts as construction work.
  ctx.work(Math.max(0,ctx.now-s.at-wait));s.at=ctx.now-wait;
  if(ctx.needsLoad()){s.leg='source';s.at=null;}
  return true;
}
module.exports={step};
