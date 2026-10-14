"""Reconstruction image(s) -> GLB via le Space Hugging Face tencent/Hunyuan3D-2 (mode Turbo).

Usage : python tools/hunyuan2.py models/hunyuan2 refs/avaturn/00-frontal.jpg [gauche] [droite]
"""
import shutil, sys, time
from gradio_client import Client, handle_file

prefix, front = sys.argv[1], sys.argv[2]
left = sys.argv[3] if len(sys.argv) > 3 else None
right = sys.argv[4] if len(sys.argv) > 4 else None
t0 = time.time()
c = Client("tencent/Hunyuan3D-2", verbose=False)
c.predict("Turbo", api_name="/on_gen_mode_change")
res = c.predict(None, handle_file(front), None, None, None, None, 5, 5.0, 1234, 256, api_name="/generation_all")
print("generation ok", round(time.time() - t0), "s", str(res)[:300], flush=True)
for i, f in enumerate(res[:2]):
    p = f if isinstance(f, str) else (f or {}).get("value") or (f or {}).get("path")
    if p:
        shutil.copy(p, f"{prefix}-{i}.{p.rsplit('.', 1)[-1]}")
        print("saved", f"{prefix}-{i}", flush=True)
