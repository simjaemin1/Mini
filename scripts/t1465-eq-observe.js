'use strict';
// Each eq-run child gets separate observational outputs. Parent/make process inert.
if (!/scripts[\\/]t17-metrics\.js$/.test(process.argv[1]||'') || !process.env.T1420_OBS) return;
const base=process.env.T1420_OBS.replace(/\.json$/,'');
process.env.T1465_ATTACH='1';process.env.T1465_EMPTY_WATCH='1';
process.env.T1465_OBS=base+'.stock.json';
process.env.T1385_LAB_OUT=base+'.probe.json';
process.env.T1407_LAB_OUT=base+'.t1407.json';
process.env.T1398_OUT=base+'.band.json';
require('./t1398-observe');require('./t1385-lab-probe');require('./t1407-observe');require('./t1465-observe');
