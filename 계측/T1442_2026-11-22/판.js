'use strict';
// (계측 자 · 판정 0) T1442 할 일 1 — 존을 띄워 픽스처 전쟁 하나(`WAR_FIXTURE`)를 돌리고 계측기 `scripts/t1442-army-probe.js` 가 행군 길 위에
//   울타리 줄(고개) · 벽 + 문 줄(주둔 링과 방어 마을 사이 — 돌격 길)을 놓은 뒤 병사 · 지휘관이 그 줄을 지나가는지 센다.
//   존 띄우기 = `test-war-world` ⓖ 그 틀(central + zone · 마을 8 · 하루 60초 · 도적 0 · 벽시계 · 관측자 선택).
//   node 계측/T1442_2026-11-22/판.js <태그> <시드> <assault|siege> <관측자 0|1> <출력 폴더> [상한 초]
//   관측자 1 = 계측기가 놓은 고개 줄 자리에 관측자 하나(그 둘레 청크가 깬다) · 0 = 보는 사람 없음(다 잠든 청크).
const path = require('path'), fs = require('fs'), os = require('os'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const [TAG, SEED, FIX, OBS, DIR, CAP] = process.argv.slice(2);
const capS = +(CAP || 900);
fs.mkdirSync(DIR, { recursive: true });
const OUT = path.join(DIR, `${TAG}.json`), LOG = path.join(DIR, `${TAG}.log`);
try { fs.unlinkSync(OUT); } catch (e) {}
const LP = require(path.join(ROOT, 'scripts', 'lib-port'));
const CPORT = LP.port(3510), ZPORT = LP.port(3520);
const CDB = path.join(os.tmpdir(), `t1442-c-${TAG}-${process.pid}.db`), ZDB = path.join(os.tmpdir(), `t1442-z-${TAG}-${process.pid}.db`);
const SECRET = 't1442-' + TAG;
const procs = [];
const kill = () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } for (const f of [CDB, ZDB]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };
process.on('exit', kill);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const c = spawn(process.execPath, [path.join(ROOT, 'server', 'central.js')], { cwd: ROOT, stdio: 'ignore', env: Object.assign({}, process.env, { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
  procs.push(c);
  await sleep(2500);
  const out = fs.openSync(LOG, 'w');
  const pre = [`--require ${path.join(ROOT, 'scripts', 't577-server-hook.js')}`, `--require ${path.join(ROOT, 'scripts', 't1442-army-probe.js')}`].join(' ');
  const z = spawn(process.execPath, [path.join(ROOT, 'server', 'zone.js')], { cwd: ROOT, stdio: ['ignore', out, out], env: Object.assign({}, process.env, {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CPORT), CENTRAL_SECRET: SECRET,
    ENABLE_VILLAGES: '1', VILLAGE_MAX: process.env.T1442_VILLAGES || '8', VILLAGE_DAY_MS: process.env.T1442_DAY_MS || '60000', ENABLE_BANDITS: '0',
    WAR_FIXTURE: FIX, WAR_FIXTURE_DAY: '1', VILLAGE_WAR_LOG: '1', T577_SEED: String(SEED), T1442_PROBE_OUT: OUT, NODE_OPTIONS: pre }) });
  procs.push(z);
  const t0 = Date.now(); let ws = null, pinger = null, ended = false;
  while ((Date.now() - t0) / 1000 < capS) {
    await sleep(3000);
    let rec = null; try { rec = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { continue; }
    const W = Object.values(rec.wars || {});
    if (OBS === '1' && !ws && W.length && W[0].groups && W[0].groups.pass) {
      const at = W[0].groups.pass.at, WS = require(path.join(ROOT, 'node_modules', 'ws'));
      ws = new WS(`ws://localhost:${ZPORT}/?observer=1&vx=${at[0] * 32 + 16}&vy=${at[1] * 32 + 16}`); ws.on('error', () => {}); ws.on('message', () => {});
      pinger = setInterval(() => { try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} }, 5000);
    }
    if (W.length && W.every((w) => w.endDay != null)) { ended = true; await sleep(4000); break; }
  }
  if (pinger) clearInterval(pinger); try { if (ws) ws.close(); } catch (e) {}
  try { z.kill('SIGINT'); } catch (e) {} await sleep(3000);
  let rec = null; try { rec = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) {}
  if (rec) { rec.driver = { tag: TAG, seed: +SEED, fixture: FIX, observer: OBS === '1', ended, wallS: Math.round((Date.now() - t0) / 1000) }; fs.writeFileSync(OUT, JSON.stringify(rec)); }
  console.log(TAG, ended ? '끝' : '상한', Math.round((Date.now() - t0) / 1000) + '초', rec ? JSON.stringify(rec.pen) : '기록 없음');
  kill(); process.exit(0);
})();
