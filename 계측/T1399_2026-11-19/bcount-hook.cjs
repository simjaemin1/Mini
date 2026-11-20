const Module = require('module'), _c = Module.prototype._compile, VP = require('path').join('server', 'villages.js');
const C = {}; global.__bc = C;
process.on('exit', () => { try { require('fs').writeFileSync('/tmp/t1399/bcount/c-' + process.pid + '.json', JSON.stringify(C)); } catch (e) {} });
Module.prototype._compile = function (content, filename) {
  if (filename.endsWith(VP)) content = content.replace('function t1399Bump(vil) {', 'function t1399Bump(vil) { { const l = (new Error().stack.split("\\n")[2] || "").replace(/.*villages\\.js:/, "").replace(/:\\d+\\)?$/, ""); global.__bc[l] = (global.__bc[l] || 0) + 1; }');
  return _c.call(this, content, filename);
};
