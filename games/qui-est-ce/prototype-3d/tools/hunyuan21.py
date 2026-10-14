"""Reconstruction image -> GLB texture via le Space Hugging Face tencent/Hunyuan3D-2.1.

Usage : python tools/hunyuan21.py refs/avaturn/00-frontal.jpg models/hunyuan21-front
"""
import shutil, sys, time
from gradio_client import Client, handle_file

src, prefix = sys.argv[1], sys.argv[2]
t0 = time.time()
c = Client("tencent/Hunyuan3D-2.1", verbose=False)
res = c.predict(handle_file(src), None, None, None, None, 30, 5.0, 1234, 256, True, 8000, False,
                api_name="/generation_all")
print("generation ok", round(time.time() - t0), "s", res[2][:200] if isinstance(res[2], str) else "", flush=True)
for i, f in enumerate(res[:2]):
    p = f if isinstance(f, str) else (f or {}).get("value") or (f or {}).get("path")
    if p:
        ext = p.rsplit(".", 1)[-1]
        shutil.copy(p, f"{prefix}-{i}.{ext}")
        print("saved", f"{prefix}-{i}.{ext}", flush=True)
print("stats", res[3], flush=True)
