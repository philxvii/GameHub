"""Reconstruction image -> GLB via le Space Hugging Face stabilityai/stable-fast-3d (rapide, peu de GPU).

Usage : python tools/sf3d.py refs/avaturn/00-frontal-rgba.png  (image RGBA detouree) models/sf3d-front.glb
"""
import shutil, sys, time
from gradio_client import Client, handle_file

src, dst = sys.argv[1], sys.argv[2]
t0 = time.time()
c = Client("stabilityai/stable-fast-3d", verbose=False)
out = c.predict(handle_file(src), 0.85, "None", -1, 2048, api_name="/run_button")
print("run ok", round(time.time() - t0), "s", str(out)[:200], flush=True)
path = out[-1] if isinstance(out, (list, tuple)) else out
shutil.copy(path, dst)
print("glb ok", dst, flush=True)
