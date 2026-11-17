#!/bin/bash
cd /tmp/t1340
./pair.sh f30-1020 1020 30 10 T1308_KEEP=0 &
./pair.sh f30-7 7 30 10 T1308_KEEP=0 &
wait
./pair.sh f30-42 42 30 10 T1308_KEEP=0
echo all > f30.done
