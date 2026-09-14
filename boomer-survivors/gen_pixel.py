"""Local pixel-art generator: Krea-2 turbo + PixelArt_Krea2_5x5_V1 LoRA (trigger 'pixelart').
The LoRA paints on a 5x5 pixel grid, so render at 5x the wanted art size and BOX-downscale by 5.

  python gen_pixel.py t2i  NAME "prompt" --art 256            # 256 art px -> renders 1280
  python gen_pixel.py i2i  NAME in.png "prompt" --art 256 --denoise 0.5   # img2img, keeps structure
Outputs: raw/px_NAME.png (native art size) + raw/px_NAME_full.png (the 5x render).
"""
import json, os, sys, time, shutil, argparse, urllib.request, urllib.error
from PIL import Image

HOST = "http://127.0.0.1:8188"
COMFY = r"C:\Users\andrew\Documents\comywilly1"
OUT = os.path.join(COMFY, "output"); INP = os.path.join(COMFY, "input")
HERE = os.path.dirname(os.path.abspath(__file__)); RAW = os.path.join(HERE, "raw")
NEG = "blurry, smooth gradients, photo, 3d render, anti-aliasing, text, watermark"
LORA = "PixelArt_Krea2_5x5_V1.safetensors"

def graph(name, prompt, w, h, seed, init=None, denoise=1.0, lora_w=1.0, steps=8):
    g = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "krea2_turbo_int8_convrot.safetensors", "weight_dtype": "default"}},
        "1a": {"class_type": "LoraLoaderModelOnly", "inputs": {"model": ["1", 0], "lora_name": LORA, "strength_model": lora_w}},
        "1b": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1a", 0], "shift": 3.0}},
        "8": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen3vl_4b_fp8_scaled.safetensors", "type": "krea2", "device": "default"}},
        "9": {"class_type": "VAELoader", "inputs": {"vae_name": "qwen_image_vae.safetensors"}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["8", 0], "text": "pixelart, " + prompt}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["8", 0], "text": NEG}},
        "5": {"class_type": "KSampler", "inputs": {"model": ["1b", 0], "positive": ["2", 0], "negative": ["3", 0],
               "latent_image": ["4", 0], "seed": seed, "steps": steps, "cfg": 1.0, "sampler_name": "euler",
               "scheduler": "simple", "denoise": denoise}},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["9", 0]}},
        "7": {"class_type": "SaveImage", "inputs": {"filename_prefix": f"boomer_survivors/px_{name}", "images": ["6", 0]}},
    }
    if init:
        g["10"] = {"class_type": "LoadImage", "inputs": {"image": init}}
        g["4"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["10", 0], "vae": ["9", 0]}}
    else:
        g["4"] = {"class_type": "EmptySD3LatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}}
    return g

def submit(g):
    req = urllib.request.Request(HOST + "/prompt", data=json.dumps({"prompt": g, "client_id": "bsurv_px"}).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        return json.load(urllib.request.urlopen(req, timeout=120))["prompt_id"]
    except urllib.error.HTTPError as e:
        raise SystemExit("REJECTED " + e.read().decode()[:800])

def wait(pid, t_max=900):
    t0 = time.time()
    while time.time() - t0 < t_max:
        try:
            h = json.load(urllib.request.urlopen(f"{HOST}/history/{pid}", timeout=60))
        except Exception:
            time.sleep(2); continue
        if pid in h:
            for m in h[pid].get("status", {}).get("messages", []):
                if "error" in str(m[0]).lower():
                    raise SystemExit("ERROR " + json.dumps(m)[:800])
            files = [a for o in (h[pid].get("outputs") or {}).values() for a in (o.get("images") or [])]
            if files:
                return os.path.join(OUT, files[0].get("subfolder", ""), files[0]["filename"])
        time.sleep(2)
    raise SystemExit("timeout")

def finish(name, full_path, art):
    full = Image.open(full_path).convert("RGB")
    shutil.copy2(full_path, os.path.join(RAW, f"px_{name}_full.png"))
    # 5x5 grid -> one art pixel per 5x5 block (BOX = average of the block, which IS the block colour)
    small = full.resize((full.width // 5, full.height // 5), Image.BOX)
    dst = os.path.join(RAW, f"px_{name}.png"); small.save(dst)
    print("->", dst, small.size, "(full", full.size, ")")
    return dst

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("mode", choices=["t2i", "i2i"]); ap.add_argument("name")
    ap.add_argument("rest", nargs="+"); ap.add_argument("--art", type=int, default=256); ap.add_argument("--denoise", type=float, default=0.5)
    ap.add_argument("--seed", type=int, default=7); ap.add_argument("--lora", type=float, default=1.0); ap.add_argument("--steps", type=int, default=8)
    a = ap.parse_args()
    w = h = a.art * 5
    if a.mode == "t2i":
        prompt = " ".join(a.rest); init = None; dn = 1.0
    else:
        src, prompt = a.rest[0], " ".join(a.rest[1:]); dn = a.denoise
        im = Image.open(src).convert("RGB")
        # nearest-upscale the pixel art so every art pixel becomes a 5x5 block the LoRA understands
        im = im.resize((a.art * 5, a.art * 5 * im.height // im.width), Image.NEAREST); w, h = im.size
        init = f"px_init_{a.name}.png"; im.save(os.path.join(INP, init))
    pid = submit(graph(a.name, prompt, w, h, a.seed, init, dn, a.lora, a.steps))
    print("queued", pid, w, "x", h, "denoise", dn)
    finish(a.name, wait(pid), a.art)

if __name__ == "__main__":
    main()
