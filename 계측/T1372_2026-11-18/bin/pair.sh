#!/bin/bash
# pair.sh NAME SEED DAYS EVERY [env...] — 끊고 이은 판(B) → 그 첫 틱 V 로 한 번에 돈 판(A) 덤프 → 견줌
N=$1; S=$2; D=$3; E=$4; shift 4; T=/tmp/claude-0/-home-user-Mini/50ba9fcd-2b52-5ec9-af27-d0dfef1c6ab2/scratchpad/t1372; R=${R:-/home/user/Mini}
rm -rf $T/$N-b $T/$N-a $T/$N-b.out $T/$N-a.out
$T/fast.sh $T/$N-b $D $S $E "$@"
V=$(python3 -c "import json;print(repr(json.load(open('$T/$N-b/seg-$E.json.t1340-ready.json'))['V']))")
$T/fast.sh $T/$N-a $D $S $D T1340_AT_V=$V "$@"
cd $R && node scripts/t1340-moment-cmp.js $T/$N-a/seg-0.json.t1340-at.json $T/$N-b/seg-$E.json.t1340-ready.json --json $T/$N-m.json > $T/$N-m.txt 2>&1
node scripts/t1308-cmp.js $T/$N-a $T/$N-b > $T/$N-c.txt 2>&1
echo done > $T/$N.done
