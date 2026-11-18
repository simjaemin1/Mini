const url = process.argv[2]; const n = +process.argv[3] || 3;
const ws = new WebSocket(url); let id = 0; const pend = new Map();
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const scripts = new Map(); let pausedRes;
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Debugger.scriptParsed') scripts.set(m.params.scriptId, m.params.url);
  if (m.method === 'Debugger.paused' && pausedRes) { pausedRes(m.params); pausedRes = null; } };
ws.onopen = async () => {
  await send('Debugger.enable');
  for (let k = 0; k < n; k++) {
    const p = new Promise((r) => { pausedRes = r; }); await send('Debugger.pause'); const P = await p;
    console.log(`--- sample ${k + 1}`);
    for (const f of P.callFrames.slice(0, 14)) console.log(`  ${f.functionName || '(anon)'}  ${(scripts.get(f.location.scriptId) || f.url || '').replace(/.*\/t1357\/main\//, '')}:${f.location.lineNumber + 1}`);
    await send('Debugger.resume'); await new Promise((r) => setTimeout(r, 1500));
  }
  await send('Debugger.disable'); ws.close(); process.exit(0);
};
