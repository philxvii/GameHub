"""Reconstruction image(s) -> GLB via le Space Hugging Face trellis-community/TRELLIS.

Usage : python tools/trellis1.py models/trellis1-front.glb refs/avaturn/00-frontal.jpg [autres vues...]
Avec plusieurs vues, TRELLIS les fusionne (multidiffusion).
"""
import shutil, sys, time
from gradio_client import Client, handle_file

dst, srcs = sys.argv[1], sys.argv[2:]
t0 = time.time()
c = Client("trellis-community/TRELLIS", verbose=False)
c.predict(api_name="/start_session")
first = c.predict(handle_file(srcs[0]), api_name="/preprocess_image")
multi = [{"image": handle_file(s), "caption": None} for s in srcs[1:]]
print("preprocess ok", round(time.time() - t0), "s", flush=True)
_, glb, dl = c.predict(first, multi, 0, 7.5, 12, 3.0, 12, "multidiffusion", 0.9, 2048,
                       api_name="/generate_and_extract_glb")
shutil.copy(dl or glb, dst)
print("glb ok", dst, round(time.time() - t0), "s", flush=True)
