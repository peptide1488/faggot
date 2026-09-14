"""Klein 4B BASE + pixel_4walk_small LoRA: 512x512 spritesheet of a small 32x32 character
(walk up/down/left/right, arms up, jump, lying). Downscale x4 (k-centroid) for pixel-perfect 128x128.

  python gen_sprite_klein.py NAME "prompt" [--ref raw/x.png] [--seed 7] [--steps 20]
Outputs raw/ks_NAME_full.png (512) and raw/ks_NAME.png (128, k-centroid).
"""
import json, os, sys, time, shutil, argparse, urllib.request, urllib.error
import numpy as np
from PIL import Image

HOST = "http://127.0.0.1:8188"
COMFY = r"C:\Users\andrew\Documents\comywilly1"
OUT = os.path.join(COMFY, "output"); INP = os.path.join(COMFY, "input")
HERE = os.path.dirname(os.path.abspath(__file__)); RAW = os.path.join(HERE, "raw")
LORA = "pixel_4walk_small_flux2_klein_base_4b_v1.safetensors"

def graph(name, prompt, seed, steps, ref=None, lora_w=1.0):
    g = {
        "10": {"class_type": "UNETLoader", "inputs": {"unet_name": "flux-2-klein-base-4b-fp8.safetensors", "weight_dtype": "default"}},
        "10b": {"class_type": "LoraLoaderModelOnly", "inputs": {"model": ["10", 0], "lora_name": LORA, "strength_model": lora_w}},
        "11": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen_3_4b.safetensors", "type": "flux2", "device": "default"}},
        "12": {"class_type": "VAELoader", "inputs": {"vae_name": "full_encoder_small_decoder.safetensors"}},
        "30": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["11", 0], "text": prompt}},
        "31": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["30", 0]}},
        "40": {"class_type": "CFGGuider", "inputs": {"model": ["10b", 0], "positive": ["30", 0], "negative": ["31", 0], "cfg": 1.0}},
        "41": {"class_type": "Flux2Scheduler", "inputs": {"steps": steps, "width": 512, "height": 512}},
        "42": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "43": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
        "44": {"class_type": "EmptyFlux2LatentImage", "inputs": {"width": 512, "height": 512, "batch_size": 1}},
        "45": {"class_type": "SamplerCustomAdvanced", "inputs": {"noise": ["43", 0], "guider": ["40", 0], "sampler": ["42", 0], "sigmas": ["41", 0], "latent_image": ["44", 0]}},
        "50": {"class_type": "VAEDecode", "inputs": {"samples": ["45", 0], "vae": ["12", 0]}},
        "51": {"class_type": "SaveImage", "inputs": {"filename_prefix": f"boomer_survivors/ks_{name}", "images": ["50", 0]}},
    }
    if ref:
        g["20"] = {"class_type": "LoadImage", "inputs": {"image": ref}}
        g["21"] = {"class_type": "ImageScaleToTotalPixels", "inputs": {"image": ["20", 0], "upscale_method": "nearest-exact", "megapixels": 0.25, "resolution_steps": 1}}
        g["23"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["21", 0], "vae": ["12", 0]}}
        g["32"] = {"class_type": "ReferenceLatent", "inputs": {"conditioning": ["30", 0], "latent": ["23", 0]}}
        g["40"]["inputs"]["positive"] = ["32", 0]
    return g

def submit(g):
    req = urllib.request.Request(HOST + "/prompt", data=json.dumps({"prompt": g, "client_id": "bsurv_ks"}).encode(), headers={"Content-Type": "application/json"})
    try:
        return json.load(urllib.request.urlopen(req, timeout=120))["prompt_id"]
    except urllib.error.HTTPError as e:
        raise SystemExit("REJECTED " + e.read().decode()[:1200])

def wait(pid, t_max=1200):
    t0 = time.time()
    while time.time() - t0 < t_max:
        try:
            h = json.load(urllib.request.urlopen(f"{HOST}/history/{pid}", timeout=60))
        except Exception:
            time.sleep(2); continue
        if pid in h:
            for m in h[pid].get("status", {}).get("messages", []):
                if "error" in str(m[0]).lower(): raise SystemExit("ERROR " + json.dumps(m)[:1200])
            files = [a for o in (h[pid].get("outputs") or {}).values() for a in (o.get("images") or [])]
            if files: return os.path.join(OUT, files[0].get("subfolder", ""), files[0]["filename"])
        time.sleep(2)
    raise SystemExit("timeout")

def kcentroid(im, f=4, k=2):
    """k-centroid downscale: each f x f block -> the dominant colour of a k-means(k) on that block."""
    a = np.asarray(im.convert("RGB")).astype(np.float32); H, W = a.shape[:2]
    out = np.zeros((H // f, W // f, 3), np.uint8)
    for y in range(H // f):
        for x in range(W // f):
            b = a[y*f:(y+1)*f, x*f:(x+1)*f].reshape(-1, 3)
            c = b[[0, len(b)//2]].copy()
            for _ in range(4):
                d = ((b[:, None, :] - c[None]) ** 2).sum(-1); lab = d.argmin(1)
                for i in range(k):
                    if (lab == i).any(): c[i] = b[lab == i].mean(0)
            big = np.bincount(lab, minlength=k).argmax(); out[y, x] = c[big].round().clip(0, 255)
    return Image.fromarray(out)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("name"); ap.add_argument("prompt"); ap.add_argument("--ref"); ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--steps", type=int, default=20); ap.add_argument("--lora", type=float, default=1.0)
    a = ap.parse_args(); ref = None
    if a.ref:
        ref = f"ks_ref_{a.name}.png"; Image.open(a.ref).convert("RGB").save(os.path.join(INP, ref))
    pid = submit(graph(a.name, a.prompt, a.seed, a.steps, ref, a.lora)); print("queued", pid)
    src = wait(pid); full = os.path.join(RAW, f"ks_{a.name}_full.png"); shutil.copy2(src, full)
    small = kcentroid(Image.open(full)); dst = os.path.join(RAW, f"ks_{a.name}.png"); small.save(dst)
    print("->", full, "and", dst, small.size)

if __name__ == "__main__":
    main()
