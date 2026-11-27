// (@regress 없음 — 러너 밖 · T1471 라이브 사본 부팅 자 · 제품 무변) node scripts/t1471-live-fit.js <존 DB 사본> <존> <0|1> <out.json> [몸 볼 마을]
//   사본의 사본으로 존을 띄워(손잡이 `T1471_LAND_FIT` 0 · 1) 마을 적재 직후 지문 · [T1471] 줄 · (주면) 그 마을 몸의 집 · 침대 · 일터가 산 · 물인가를 out 에.
'use strict';
const path = require('path'), fs = require('fs'), { spawn } = require('child_process');
const [SRC, ZONE, ON, OUT, BODY] = process.argv.slice(2);
const ROOT = path.join(__dirname, '..'), WD = fs.mkdtempSync('/tmp/t1471live-'), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const zdb = path.join(WD, 'z.db'), cdb = path.join(WD, 'c.db'), rec = path.join(WD, 'rec.json'), logf = path.join(WD, 'zone.log');
  for (const s of ['', '-wal']) { try { fs.copyFileSync(SRC + s, zdb + s); } catch (e) {} }
  const port = require('./lib-port').ports(20, 25900), SECRET = 't1471l-' + process.pid;
  const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore', env: Object.assign({}, process.env, { PORT: String(port), DB_PATH: cdb, PUBLIC_HOST: 'localhost', ENABLED_ZONES: ZONE, CENTRAL_SECRET: SECRET, NODE_OPTIONS: '' }) });
  const lf = fs.openSync(logf, 'w');
  const z = spawn(process.execPath, ['--max-old-space-size=3000', '-r', path.join(__dirname, 't1471-fit-probe.js'), path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', lf, lf],
    env: Object.assign({}, process.env, { T1471_FIT_OUT: rec, T1471_FIT_BODY: BODY || '', PORT: String(port + 10), ZONE_ID: ZONE, DB_PATH: zdb, CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(port), CENTRAL_SECRET: SECRET, ENABLE_VILLAGES: '1', NODE_OPTIONS: '', T1471_LAND_FIT: ON }) });
  let exit = null; z.on('exit', (code, sig) => { exit = { code, sig }; });
  let R = null; for (let i = 0; i < 900 && !exit; i++) { try { R = JSON.parse(fs.readFileSync(rec, 'utf8')); if (R.dump && (!BODY || R.body)) break; } catch (e) {} await sleep(1000); }
  try { z.kill('SIGKILL'); } catch (e) {} try { c.kill('SIGKILL'); } catch (e) {} await sleep(600);
  try { R = JSON.parse(fs.readFileSync(rec, 'utf8')); } catch (e) {}
  const log = fs.readFileSync(logf, 'utf8');
  fs.writeFileSync(OUT, JSON.stringify({ src: SRC, zone: ZONE, on: ON, exit, R, tail: log.split('\n').filter((l) => /T1471|FATAL|Error/.test(l)).slice(0, 40) }, null, 1));
  console.log(`[T1471 라이브] ${ZONE} 켬=${ON} · ${R && R.dump ? '적재 ' + R.dump.length + '곳' : '적재 못 봄 ' + JSON.stringify(exit)} · [T1471] 줄 ${R ? R.lines.length : '?'}`);
  for (const f of fs.readdirSync(WD)) { try { fs.unlinkSync(path.join(WD, f)); } catch (e) {} } try { fs.rmdirSync(WD); } catch (e) {}
  process.exit(0);
})();
