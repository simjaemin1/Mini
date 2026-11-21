# Native V8 profile

Weights = elapsed sample intervals; inclusive categories overlap. OS CPU is recorded separately by day.

| function | source:line | self sample sec | inclusive sample sec |
|---|---|---:|---:|
| (anonymous) | server/zone.js:17709 | 147.176 | 1228.957 |
| _wwPre | server/zone.js:17327 | 109.481 | 215.813 |
| _wwPreOne | server/zone.js:17314 | 78.352 | 86.703 |
| _moveOne | server/zone.js:18101 | 53.596 | 132.491 |
| sepNpcs | server/zone.js:5142 | 52.154 | 52.154 |
| pump | scripts/t745-vclock.js:100 | 45.997 | 1287.621 |
| rebuildSpatialIndex | server/zone.js:1426 | 40.337 | 78.838 |
| _sweepOne | server/zone.js:18550 | 39.264 | 80.364 |
| (garbage collector) | :0 | 38.849 | 38.849 |
| _t1322Skip | server/zone.js:5826 | 34.143 | 113.372 |
| _rebuildSpatialInc | server/zone.js:1372 | 33.042 | 38.493 |
| _t1295Walk | server/zone.js:5204 | 31.988 | 33.148 |
| _t1348Walk | server/zone.js:5587 | 29.489 | 31.973 |
| _decOne | server/zone.js:17828 | 28.044 | 309.921 |
| stampCell | server/roads.js:98 | 24.312 | 41.938 |
| npcLifeTick | server/villages.js:19166 | 22.319 | 94.141 |
| _flushStepLazy | server/roads.js:446 | 19.753 | 38.737 |
| upsertRoadCell | server/zone-local-db.js:592 | 18.790 | 18.790 |
| npcStep | server/zone.js:5861 | 17.902 | 151.610 |
| _t1182Walk | server/villages.js:6255 | 17.320 | 26.587 |
| _t774Act | server/zone.js:1361 | 14.455 | 16.030 |
| decideNpcBehavior | server/zone.js:4419 | 12.131 | 114.712 |
| onGameTick | server/villages.js:11327 | 11.772 | 111.587 |
| tickCaravanBodies | server/villages.js:6306 | 11.447 | 51.371 |
| _stairStepP | server/zone.js:18270 | 11.106 | 11.106 |
| _t1329Crew | server/villages.js:7737 | 10.019 | 13.278 |
| wasm-function[6] | wasm://wasm/4e8a109e:1 | 9.197 | 9.218 |
| _t374Held | server/villages.js:15219 | 8.683 | 8.683 |
| queryRect | server/quadtree.js:67 | 8.391 | 8.391 |
| isWaterCellLocal | server/terrain.js:353 | 8.117 | 14.969 |
