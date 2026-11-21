# Native V8 profile

Weights = elapsed sample intervals; inclusive categories overlap. OS CPU is recorded separately by day.

| function | source:line | self sample sec | inclusive sample sec |
|---|---|---:|---:|
| (anonymous) | file:///tmp/t1411/fast/server/zone.js:17711 | 157.938 | 1284.913 |
| _wwPre | file:///tmp/t1411/fast/server/zone.js:17328 | 119.584 | 231.780 |
| _wwPreOne | file:///tmp/t1411/fast/server/zone.js:17315 | 81.765 | 91.353 |
| _moveOne | file:///tmp/t1411/fast/server/zone.js:18103 | 56.329 | 137.872 |
| sepNpcs | file:///tmp/t1411/fast/server/zone.js:5143 | 54.238 | 54.238 |
| pump | file:///tmp/t1411/fast/scripts/t745-vclock.js:100 | 48.470 | 1344.177 |
| rebuildSpatialIndex | file:///tmp/t1411/fast/server/zone.js:1427 | 43.883 | 85.343 |
| _sweepOne | file:///tmp/t1411/fast/server/zone.js:18553 | 43.129 | 86.600 |
| (garbage collector) | :0 | 38.675 | 38.675 |
| _t1322Skip | file:///tmp/t1411/fast/server/zone.js:5827 | 37.074 | 113.851 |
| _rebuildSpatialInc | file:///tmp/t1411/fast/server/zone.js:1373 | 35.947 | 41.455 |
| _t1295Walk | file:///tmp/t1411/fast/server/zone.js:5205 | 34.309 | 36.742 |
| _decOne | file:///tmp/t1411/fast/server/zone.js:17830 | 29.814 | 309.991 |
| _t1348Walk | file:///tmp/t1411/fast/server/zone.js:5588 | 29.479 | 31.854 |
| stampCell | file:///tmp/t1411/fast/server/roads.js:98 | 22.700 | 40.865 |
| npcLifeTick | file:///tmp/t1411/fast/server/villages.js:19188 | 22.268 | 87.376 |
| _flushStepLazy | file:///tmp/t1411/fast/server/roads.js:446 | 20.600 | 40.992 |
| upsertRoadCell | file:///tmp/t1411/fast/server/zone-local-db.js:592 | 20.151 | 20.151 |
| npcStep | file:///tmp/t1411/fast/server/zone.js:5862 | 18.595 | 148.510 |
| _t1182Walk | file:///tmp/t1411/fast/server/villages.js:6257 | 16.585 | 25.450 |
| _t774Act | file:///tmp/t1411/fast/server/zone.js:1362 | 16.231 | 17.864 |
| decideNpcBehavior | file:///tmp/t1411/fast/server/zone.js:4420 | 12.890 | 109.570 |
| onGameTick | file:///tmp/t1411/fast/server/villages.js:11349 | 12.015 | 116.114 |
| tickCaravanBodies | file:///tmp/t1411/fast/server/villages.js:6308 | 11.172 | 48.346 |
| _stairStepP | file:///tmp/t1411/fast/server/zone.js:18273 | 10.708 | 10.708 |
| wasm-function[6] | wasm://wasm/4e8a109e:1 | 9.351 | 9.366 |
| queryRect | file:///tmp/t1411/fast/server/quadtree.js:67 | 8.772 | 8.772 |
| _t374Held | file:///tmp/t1411/fast/server/villages.js:15241 | 8.688 | 8.688 |
| _t1322Dusk | file:///tmp/t1411/fast/server/zone.js:5818 | 7.871 | 7.876 |
| _i688Touch | file:///tmp/t1411/fast/server/roads.js:219 | 7.559 | 13.477 |
