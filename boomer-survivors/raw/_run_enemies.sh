for n in bobo zoomer; do
  for d in down up side; do
    python animate.py ${n}_${d} raw/${n}_${d}_in.png --size 96 --walk --seed 9 2>&1 | tail -1
  done
done
echo ALLDONE
