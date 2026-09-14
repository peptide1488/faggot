P="pixel art sprite of an old man riding a green lawn tractor, engine idling: the whole machine vibrates gently, the tires turn slowly, the man bobs slightly in his seat and his hands stay on the wheel, flat solid magenta background, camera locked, nothing else changes, no smoke"
for d in s se e ne n nw w sw; do
  python gen_loop.py b8_$d "$P" --frames 49 --first 1.0 --seed 5 2>&1 | tail -1
  python make_sheet.py sheet "C:/Users/andrew/Documents/comywilly1/output/boomer_survivors/loop/b8_$d" b8_$d --frames 8 --size 128 2>&1 | tail -1
done
echo ALLDONE
