// T1439 관찰 — 존 아이에서 wildlife · villages 계측을 30날마다 · 끝에 덤프(읽기만)
const OUT = process.env.T1439_OBS; if (!OUT || !/server[\/\\]zone\.js$/.test(process.argv[1] || '')) return;
const fs = require('fs'), path = require('path'), ROOT = '/tmp/t1439wt';
function dump() { try { const W = require(path.join(ROOT, 'server', 'wildlife')), V = require(path.join(ROOT, 'server', 'villages'));
  const o = { t1439: W.T1439 ? W.T1439.stat() : null, v1439: V.t1439Stat ? V.t1439Stat() : null, t1416: W.t1416Stat ? W.t1416Stat() : null, t1429: W.t1429Stat ? W.t1429Stat() : null, v1416: V.t1416Stat ? V.t1416Stat() : null, cpu: process.cpuUsage() };
  fs.writeFileSync(OUT, JSON.stringify(o)); } catch (e) { try { fs.writeFileSync(OUT, JSON.stringify({ err: String(e.stack || e).slice(0, 300) })); } catch (_) {} } }
setInterval(dump, 20000).unref(); process.on('exit', dump); process.on('SIGTERM', () => { dump(); process.exit(0); });
