#!/usr/bin/env node
// === scripts/launch-all.js ===
// central + dispatcher + 모든 존을 zone-config 기준으로 일괄 기동한다.
//   - 옛 package.json/ecosystem 의 stale 존 ID(france/china/korea…) 문제 해결:
//     항상 server/zone-config.js 의 ZONES 를 그대로 spawn → 설정과 절대 안 어긋남.
//   - ENABLED_ZONES="hanbando,nippon,..." 로 일부만 띄울 수 있다(central /zones 와 동일 필터).
//   - 각 프로세스는 --experimental-sqlite 로 실행(central·zone 이 sqlite 사용).
// 사용:  node scripts/launch-all.js     (전체)
//        ENABLED_ZONES="hanbando,nippon" node scripts/launch-all.js   (일부)
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const { ZONES, CENTRAL } = require('../server/zone-config');

const ROOT = path.join(__dirname, '..');
const NODE_ARGS = ['--experimental-sqlite'];
const DISPATCHER_PORT = process.env.DISPATCHER_PORT || '3000';

const enabledStr = process.env.ENABLED_ZONES;
const enabled = enabledStr ? new Set(enabledStr.split(',').map(s => s.trim())) : null;
const zoneIds = Object.keys(ZONES).filter(id => !enabled || enabled.has(id));

const children = [];
function launch(name, script, env) {
  const child = spawn('node', [...NODE_ARGS, path.join(ROOT, script)], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  child.on('exit', (code, sig) => console.log(`[launch] ✖ ${name} 종료 code=${code} sig=${sig}`));
  children.push({ name, child });
  return child;
}

console.log(`[launch] central(:${CENTRAL.port}) + dispatcher(:${DISPATCHER_PORT}) + ${zoneIds.length}개 존 기동`);
console.log(`[launch] zones: ${zoneIds.join(', ')}`);

// central 먼저 (존이 player 저장을 central 로 fire-and-forget) → dispatcher → 존들
launch('central', 'server/central.js', { PORT: String(CENTRAL.port) });
setTimeout(() => launch('dispatcher', 'server/dispatcher.js', { PORT: String(DISPATCHER_PORT) }), 800);
zoneIds.forEach((id, i) => {
  setTimeout(
    () => launch(`zone:${id}`, 'server/zone.js', { ZONE_ID: id, PORT: String(ZONES[id].port) }),
    1200 + i * 150,
  );
});

setTimeout(() => {
  console.log(`\n[launch] ✅ 기동 완료 — 브라우저: http://localhost:${DISPATCHER_PORT}  (또는 http://localhost:${CENTRAL.port})`);
  console.log('[launch] 종료하려면 Ctrl+C');
}, 1200 + zoneIds.length * 150 + 500);

function shutdown() {
  console.log('\n[launch] 종료 — 자식 프로세스 정리…');
  for (const { child } of children) { try { child.kill('SIGTERM'); } catch (e) {} }
  setTimeout(() => process.exit(0), 600);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
