for x in "$@"; do IFS=: read a s d <<< "$x"; bash /tmp/t1421d/q/run.sh $a $s $d; done
