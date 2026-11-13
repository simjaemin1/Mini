'use strict';
const fs = require('fs'), path = require('path');
// Observe the actual OS child exit in the native runner, without changing its arguments.
if (/t577-server-run\.js$/.test(process.argv[1] || '')) {
  const cp = require('child_process'), spawn = cp.spawn;
  cp.spawn = function(command, args, options) {
    const child = spawn.apply(this, arguments);
    if ((args || []).some(a => /server[\\/]zone\.js$/.test(a)) && options && options.env && options.env.T577_OUT) {
      const out = options.env.T577_OUT;
      child.once('exit', (code, signal) => fs.writeFileSync(out + '.zone-exit.json', JSON.stringify({ code, signal, pid: child.pid })));
    }
    return child;
  };
  return;
}
// Only the zone child loads the canonical economy fingerprint hook.
if (!process.env.T577_OUT || !/server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
process.env.SBC_HOOK = '1';
require(path.join(__dirname, 'server-baseline-check.js'));
process.on('exit', code => fs.writeFileSync(process.env.T577_OUT + '.t1274-meta.json', JSON.stringify({
  exitEventCode: code,
  cpu: process.cpuUsage(), uptimeSeconds: process.uptime(),
  clock: typeof global.__t745 === 'function' ? global.__t745() : null,
  requestedDays: process.env.T577_DAYS, seed: process.env.T577_SEED,
  npcCapEnvironment: process.env.VILLAGE_NPC_CAP || null
})));
