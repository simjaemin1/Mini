// 판 계측(스크래치) — 마을마다 자리 찾기 진단
const path = require('path'), { spawn } = require('child_process');
const ROOT = '/home/claude/t1494';
process.chdir(ROOT);
const FB = require(ROOT + '/scripts/fixture-boot');
const base = require(ROOT + '/scripts/lib-port').ports(2, 'spotp'), C = base, Z = base + 1;
const T = process.env.TMPDIR;
const ps = [];
const boot = (f, env) => { const p = spawn(process.execPath, [path.join(ROOT, 'server', f)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] }); p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); ps.push(p); return p; };
process.on('exit', () => ps.forEach((p) => { try { p.kill('SIGKILL'); } catch (e) {} }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const c = boot('central.js', { PORT: String(C), DB_PATH: T + '/sp-c.db', PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const z = boot('zone.js', { PORT: String(Z), ZONE_ID: 'hanbando', DB_PATH: T + '/sp-z.db', CENTRAL_URL: `http://localhost:${C}`, ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', VILLAGE_MAX: process.argv[2] || '3', VILLAGE_DAY_MS: '1500', E2E_GIVE: '1', T1447_PERSON_GRUDGE: '1' });
  await FB.waitUp(c, /central server up on/, { name: 'c' }); await FB.waitUp(z, /zone server up on/, { name: 'z', capMs: 300000 });
  let info = null; for (let i = 0; i < 60 && !info; i++) { try { const r = await fetch(`http://localhost:${Z}/startinfo`); const j = await r.json(); if (j.villages && j.villages.length) info = j; } catch (e) {} if (!info) await sleep(2000); }
  const WS = require(ROOT + '/node_modules/ws');
  const ws = new WS(`ws://localhost:${Z}/?username=spp${process.pid % 1000}&password=x1&name=spp`);
  const got = [];
  ws.on('message', (m) => { try { const o = JSON.parse(String(m)); if (o.type === '__e2e_t1494') got.push(o); } catch (e) {} });
  await new Promise((r) => ws.on('open', r)); await sleep(3000);
  for (const v of info.villages) {
    ws.send(JSON.stringify({ type: 'teleport_debug', x: v.cx * 32 + 16, y: v.cy * 32 + 16 })); await sleep(2500);
    ws.send(JSON.stringify({ type: '__e2e_t1494', op: 'spot', vid: v.vid })); await sleep(1500);
    const o = got.pop(); console.log(v.name, JSON.stringify(o && { types: o.types, tree: o.tree, inTerr: o.inTerr, seen: o.seen, bodies: o.bodies, bld: o.bld, wall: o.wall }));
  }
  process.exit(0);
})();
