# Native V8 profile

Weights = elapsed sample intervals; inclusive categories overlap. OS CPU is recorded separately by day.

| function | source:line | self sample sec | inclusive sample sec |
|---|---|---:|---:|
| (anonymous) | server/zone.js:17709 | 227.633 | 1883.562 |
| _wwPre | server/zone.js:17327 | 183.674 | 288.979 |
| sepNpcs | server/zone.js:5142 | 74.950 | 75.000 |
| pump | scripts/t745-vclock.js:100 | 73.900 | 1984.560 |
| _wwPreOne | server/zone.js:17314 | 71.752 | 78.465 |
| rebuildSpatialIndex | server/zone.js:1426 | 66.822 | 112.164 |
| _sweepOne | server/zone.js:18550 | 57.077 | 99.804 |
| _moveOne | server/zone.js:18101 | 53.578 | 147.625 |
| (garbage collector) | :0 | 52.964 | 52.964 |
| _flushStepLazy | server/roads.js:446 | 49.103 | 88.512 |
| _t1322Skip | server/zone.js:5826 | 48.583 | 147.059 |
| _rebuildSpatialInc | server/zone.js:1372 | 43.154 | 45.267 |
| _decOne | server/zone.js:17828 | 42.772 | 478.061 |
| _searchStep | sim/path-core.js:351 | 40.814 | 104.821 |
| upsertRoadCell | server/zone-local-db.js:592 | 36.794 | 36.794 |
| npcLifeTick | server/villages.js:19166 | 33.549 | 167.147 |
| _t1182Walk | server/villages.js:6255 | 31.737 | 46.740 |
| _t1348Walk | server/zone.js:5587 | 30.510 | 32.543 |
| stampCell | server/roads.js:98 | 29.918 | 60.083 |
| _t1295Walk | server/zone.js:5204 | 29.826 | 34.282 |
| npcStep | server/zone.js:5861 | 29.267 | 264.633 |
| tickCaravanBodies | server/villages.js:6306 | 25.636 | 91.318 |
| onGameTick | server/villages.js:11327 | 21.667 | 241.414 |
| _isPointInRiver | server/terrain.js:305 | 21.606 | 23.564 |
| pop | sim/path-core.js:72 | 21.125 | 21.125 |
| isWaterCellLocal | server/terrain.js:353 | 20.351 | 41.144 |
| decideNpcBehavior | server/zone.js:4419 | 18.800 | 201.890 |
| _distMatrixGen | server/villages.js:4262 | 17.664 | 68.980 |
| queryRect | server/quadtree.js:67 | 16.508 | 16.508 |
| _t774Act | server/zone.js:1361 | 15.983 | 17.631 |
