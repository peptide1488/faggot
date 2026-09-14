"""Rebuild b8_<dir> sheets from ONLY the newest 49 frames of each loop folder (folders accumulate runs; nothing is deleted)."""
import os, glob, shutil, subprocess, sys
LOOP=r"C:\Users\andrew\Documents\comywilly1\output\boomer_survivors\loop"
for d in ['s','se','e','ne','n','nw','w','sw']:
    src=os.path.join(LOOP,f'b8_{d}'); files=sorted(glob.glob(os.path.join(src,'*.png')))
    if len(files)<49: print('skip',d,len(files)); continue
    tmp=os.path.join(LOOP,f'_last_b8_{d}'); shutil.rmtree(tmp,ignore_errors=True); os.makedirs(tmp)
    for f in files[-49:]: shutil.copy2(f,tmp)
    subprocess.check_call([sys.executable,'make_sheet.py','sheet',tmp,f'b8_{d}','--frames','8','--size','128'])
print('resheet done')
