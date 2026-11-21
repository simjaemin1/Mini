'use strict';
// T1411 measurement only. Add V8's native profiler to the actual zone child.
// No game source transform, scheduling change, or substituted product function.
if (!/t1308-long-run\.js$/.test(process.argv[1] || '')) return;
const cp = require('node:child_process'), fs = require('node:fs'), path = require('node:path');
const spawn = cp.spawn;
cp.spawn = function (command, args, options) {
  const zone = (args || []).some(a => /server[\\/]zone\.js$/.test(a));
  let actual = args;
  if (zone && process.env.T1411_CPU_PROF === '1') {
    const dir = path.resolve(process.env.T1411_PROFILE_DIR);
    fs.mkdirSync(dir, { recursive: true });
    actual = ['--cpu-prof', '--cpu-prof-dir=' + dir].concat(args);
  }
  const child = spawn.call(this, command, actual, options);
  if (zone && options?.env?.T577_OUT) {
    child.once('exit', (code, signal) => fs.writeFileSync(options.env.T577_OUT + '.zone-exit.json',
      JSON.stringify({ code, signal, pid: child.pid, nativeCpuProfile: actual !== args })));
  }
  return child;
};
