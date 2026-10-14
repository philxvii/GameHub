"""Reconstruction image -> GLB via le Space Hugging Face microsoft/TRELLIS.2.

Usage : python tools/trellis2.py refs/avaturn/00-frontal.jpg models/trellis2-front.glb
"""
import shutil, sys, time
from gradio_client import Client, handle_file

src, dst = sys.argv[1], sys.argv[2]
t0 = time.time()
c = Client("microsoft/TRELLIS.2", verbose=False)
c.predict(api_name="/start_session")
img = c.predict(handle_file(src), api_name="/preprocess_image")
print("preprocess ok", round(time.time() - t0), "s", flush=True)
c.predict(img, 0, "1024", 7.5, 0.7, 12, 5.0, 7.5, 0.5, 12, 3.0, 1.0, 0.0, 12, 3.0, api_name="/image_to_3d")
print("image_to_3d ok", round(time.time() - t0), "s", flush=True)
glb, dl = c.predict(60000, 2048, api_name="/extract_glb")
shutil.copy(dl or glb, dst)
print("glb ok", dst, round(time.time() - t0), "s", flush=True)
