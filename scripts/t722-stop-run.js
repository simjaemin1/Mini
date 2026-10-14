#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T722 계측기 · 제품 무변)
// === scripts/t722-stop-run.js — 서버 판 자(T577 · T650 조건)에 **멈춤 팔**: S 날에 내렸다 같은 DB 로 다시 띄워 끝 날까지 ==========
//   쓰는 법:
//     node scripts/t722-stop-run.js <판 이름> [--days 400] [--seed 1020] [--stop 200] [--catch k] [--persist seed,ids] [--crash] [--gap-ms 0]
//     ⇒ /tmp/t722/runs/<판>/ — p1.t650.json(1~S) · p2.t650.json(S+1~) · all.t650.json(합침 · t650-diff 로 기준 판과 견준다) · stop.json · resume.json
//   판 조건은 T650 자 그대로: VILLAGE_DAY_MS=250 · T315_MAPBEDS=0 · VILLAGE_NPC_CAP=1 · T400_BUILD_ACT=0 · VILLAGE_CARAVAN_MAX=0 · T640_BOOT_SLICE=0.
//   ⚠--catch k = 안 ⓐ 사본(계측기가 적재 때 사본 글자만 바꾼다 — 제품 무변). k = 멈춘 실분 N 의 게임일 몫(N ÷ 24 · 60× 캐논)을 그대로 준다.
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');

const a = process.argv.slice(2);
const TAG = a[0];
const opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const DAYS = parseInt(opt('days', '400'), 10), SEED = parseInt(opt('seed', '1020'), 10), STOP = parseInt(opt('stop', '200'), 10);
const CATCH = parseInt(opt('catch', '0'), 10), PERSIST = opt('persist', ''), CRASH = a.includes('--crash'), GAP = parseInt(opt('gap-ms', '0'), 10);
const DIR = path.join(process.env.T722_DIR || '/tmp/t722/runs', TAG);
fs.mkdirSync(DIR, { recursive: true });
const DB = path.join(DIR, 'w.db');
for (const f of [DB, DB + '-wal', DB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

function boot(phase, extra) {
  return new Promise((resolve) => {
    const out = path.join(DIR, `${phase}`);
    const env = Object.assign({}, process.env, {
      ZONE_ID: 'hanbando', PORT: String(39100 + ((process.pid * 7 + (phase === 'p1' ? 0 : 1)) % 700)), DB_PATH: DB,
      ENABLE_VILLAGES: '1', CENTRAL_URL: 'http://localhost:1', VILLAGE_DAY_MS: '250', T315_MAPBEDS: '0', VILLAGE_NPC_CAP: '1',
      T400_BUILD_ACT: '0', VILLAGE_CARAVAN_MAX: '0', T640_BOOT_SLICE: '0',
      T577_SEED: String(SEED), T577_DAYS: String(DAYS), T577_OUT: out + '.json',
      NODE_OPTIONS: `--require ${path.join(__dirname, 't722-stop-hook.js')} --require ${path.join(__dirname, 't650-print.js')}`,
    }, extra);
    const t0 = Date.now();
    const child = spawn(process.execPath, ['-r', path.join(__dirname, 't577-server-hook.js'), path.join(ROOT, 'server', 'zone.js')], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const lf = fs.createWriteStream(out + '.log'); child.stdout.pipe(lf); child.stderr.pipe(lf);
    const up = FB.waitUp(child, /zone server up on/, { name: `zone ${phase}`, capMs: 300000 });
    child.on('exit', async (code) => { const u = await up; resolve({ code, up: u.ok, sec: (Date.now() - t0) / 1000 }); });
  });
}

(async () => {
  console.log(`=== T722 멈춤 팔 ${TAG} — ${DAYS}일 · 시드 ${SEED} · 멈춤 날 ${STOP}${CRASH ? '(크래시)' : ''} · 따라잡기 ${CATCH} · 영속 흉내 ${PERSIST || '없음'} ===`);
  const r1 = await boot('p1', { T722_STOP_DAY: String(STOP), T722_DUMP: path.join(DIR, 'stop.json'), T722_CRASH: CRASH ? '1' : '', T722_RAWTERM: a.includes('--rawterm') ? '1' : '' });
  console.log(`  p1 — 끝 코드 ${r1.code} · ${r1.sec.toFixed(1)}초`);
  if (GAP) await new Promise((r) => setTimeout(r, GAP));
  const r2 = await boot('p2', { T722_RESUME: path.join(DIR, 'stop.json'), T722_DUMP: path.join(DIR, 'resume.json'), T722_CATCH: CATCH ? String(CATCH) : '', T722_PERSIST: PERSIST });
  console.log(`  p2 — 끝 코드 ${r2.code} · ${r2.sec.toFixed(1)}초`);
  // 날 지문 합치기: p1 의 S 날까지 + p2 의 S 뒤
  const P1 = JSON.parse(fs.readFileSync(path.join(DIR, 'p1.json.t650.json'), 'utf8'));
  const P2 = JSON.parse(fs.readFileSync(path.join(DIR, 'p2.json.t650.json'), 'utf8'));
  const last1 = P1.days.length ? P1.days[P1.days.length - 1].d : -1;
  const days = P1.days.concat(P2.days.filter((r) => r.d > last1));
  fs.writeFileSync(path.join(DIR, 'all.t650.json'), JSON.stringify({ keys: P1.keys, days }));
  console.log(`  지문 날: p1 ${P1.days.length}(끝 ${last1}) · p2 ${P2.days.length}(${P2.days.length ? P2.days[0].d + '~' + P2.days[P2.days.length - 1].d : '—'}) → all ${days.length}`);
})().catch((e) => { console.error(e); process.exit(1); });
