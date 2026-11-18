const ws = new WebSocket(process.argv[2]); let id = 0; const pend = new Map(); let pr;
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Debugger.paused' && pr) { pr(m.params); pr = null; } };
const ev = async (cf, ex) => { const r = await send('Debugger.evaluateOnCallFrame', { callFrameId: cf, expression: ex, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : JSON.stringify(r); };
ws.onopen = async () => {
  await send('Debugger.enable');
  for (let k = 0; k < 2; k++) {
    const p = new Promise((r) => { pr = r; }); await send('Debugger.pause'); const P = await p;
    const f = P.callFrames.find((c) => c.functionName === '_t681Flush');
    if (f) console.log(new Date().toISOString().slice(11, 19), await ev(f.callFrameId, 'JSON.stringify({day:state.world.day, war:w.id, left:body._t681q.left, side:body.fight.adv.side, formed:!!body.fight.adv.formed, released:!!body.fight.adv.released, t:body.fight.t, nr:(()=>{const A=body.fight.adv,g=A.side==="A"?body.atkGroup:body.defGroup;let c=0,mx=0,blk=0,inb=0;for(const u of g.units){if(u.dead)continue;const p=_t790Place(g,u),dd=Math.hypot(p[0]-u.x,p[1]-u.y);if(dd>(u.cmd?state.warLive.MU.FOLLOW_SNAP:state.warLive.MU.FORM_R)){c++;mx=Math.max(mx,dd);if(_warBlockedCell(p[0],p[1]))blk++;if(_warBlockedCell(u.x,u.y))inb++;}}return {c,mx:+mx.toFixed(1),slotBlocked:blk,inBlocked:inb,n:g.units.length};})()})'));
    else console.log('no flush frame', P.callFrames.slice(0, 4).map((c) => c.functionName).join('<'));
    await send('Debugger.resume'); if (!k) await new Promise((r) => setTimeout(r, 30000));
  }
  await send('Debugger.disable'); ws.close(); process.exit(0);
};
