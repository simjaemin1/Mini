#!/bin/bash
W=/tmp/claude-0/-home-user-Mini/50ba9fcd-2b52-5ec9-af27-d0dfef1c6ab2/scratchpad/t1372; cd $W
one() { rm -rf $W/$1 $W/$1.done; EXTRA_R="-r $W/t1372-moment-hook.js" R=/home/user/Mini ./fast.sh $W/$1 30 $2 $3 T1308_KEEP=0 > /dev/null 2>&1; echo done > $W/$1.done; }
( cd /home/user/Mini && timeout 1500 node scripts/test-t1372-resume.js > $W/h2.out 2>&1; echo rc=$? >> $W/h2.out )
one h1020e5 1020 5 & one h1020e10 1020 10 & wait
one h7e5 7 5 & one h7e10 7 10 & wait
cd /home/user/Mini; for p in "d1020-a h1020e5" "d1020-a h1020e10" "d7-a h7e5" "d7-a h7e10"; do set -- $p; node scripts/t1308-cmp.js $W/$1 $W/$2 2>&1 | sed -n '3,4p' | cut -c1-400; done > $W/final.txt
echo all > $W/final.done
