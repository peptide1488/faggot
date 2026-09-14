"""BOOMER SURVIVORS asset generator - Krea-2 turbo text-to-image on the local ComfyUI
(user 2026-09-14: "make it yourself using krea2"). Config = the proven solstice banner graph
(krea2 turbo, AuraFlow shift 3, 8 steps, cfg 1, euler/simple). Every sprite is rendered
straight top-down on a solid magenta background so it can be keyed and rotated for 8 dirs.

  python gen_assets.py            # everything not yet in raw/
  python gen_assets.py boomer     # only prompts whose name contains 'boomer'
"""
import json, sys, time, urllib.request, urllib.error, os, shutil

HOST = "http://127.0.0.1:8188"
OUT = r"C:\Users\andrew\Documents\comywilly1\output"
RAW = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw")

# Stardew Valley camera: three-quarter top-down, seen from slightly above and in front - faces
# readable, tops of heads and shoulders visible ("its TOO top down" - user on the birds-eye v1)
PIX = ("Stardew Valley style pixel art sprite, 16-bit SNES style, crisp hard pixels, limited palette, "
       "thick dark outline, three-quarter top-down RPG perspective seen from slightly above and in front, "
       "full body, centered, isolated on a solid flat bright magenta background, nothing else in frame")
TILE = ("seamless tileable pixel art ground texture, 16-bit SNES style, crisp hard pixels, limited palette, "
        "straight top-down birds-eye view, fills the whole frame edge to edge")

BOOMER = ("an overweight baby boomer man riding a red riding lawnmower: red baseball cap with white S&P "
          "letters, black wraparound sunglasses, patchy stubble, smug closed-mouth smirk, a lit cigarette, "
          "gray tank top over a big belly, khaki cargo shorts, hands on the steering wheel, the mower with "
          "a red hood, seat, black wheels and a cutting deck")
DIRS = {"down": "facing the viewer, driving toward the camera", "up": "seen from behind, driving away from the camera",
        "side": "in profile facing right, driving to the right"}
ENEMIES = {
 "zoomer": "a skinny zoomer teenager walking, broccoli haircut, oversized hoodie, baggy jeans, phone held out in one hand",
 "soyjak": "a pale bald soyjak cartoon man walking, round wire glasses, patchy beard, open mouth, gray t-shirt, jeans",
 "karen": "an angry middle-aged HOA Karen woman walking, short blonde asymmetric bob, sunglasses on her head, pink cardigan, clipboard in one hand",
 "bobo": "a chubby brown cartoon bear walking on two legs, round ears, red t-shirt, dark shorts",
 "biden": "an old man in a wheelchair, white hair, aviator sunglasses, navy suit, a small American flag on the wheelchair",
}
CDIRS = {"down": "facing the viewer, walking toward the camera", "up": "seen from behind, walking away from the camera",
         "side": "in profile facing right, walking to the right"}

PROMPTS = []
for d, dd in DIRS.items():
    PROMPTS.append((f"boomer_{d}", f"{BOOMER}, {dd}, {PIX}", 1024, 1024))
for e, desc in ENEMIES.items():
    for d, dd in CDIRS.items():
        PROMPTS.append((f"{e}_{d}", f"{desc}, {dd}, {PIX}", 1024, 1024))
PROMPTS += [
 ("proj_beer", f"a single silver beer can, red and white label, {PIX}", 512, 512),
 ("proj_golfball", f"a single white dimpled golf ball, {PIX}", 512, 512),
 ("proj_weedwhacker", f"a gas-powered weed whacker string trimmer, orange body, long shaft, spinning string head, {PIX}", 1024, 1024),
 ("proj_flag", f"a small American flag on a wooden stick, {PIX}", 512, 512),
 ("pickup_dollar", f"a single green dollar bill, {PIX}", 512, 512),
 ("pickup_cap", f"a red baseball cap with white S&P letters, {PIX}", 512, 512),
 ("pickup_beer6", f"a six-pack of silver beer cans in a cardboard carrier, {PIX}", 512, 512),
 ("pickup_burger", f"a cheeseburger, sesame bun, {PIX}", 512, 512),
 ("prop_mailbox", f"a black American mailbox on a wooden post, red flag up, {PIX}", 512, 512),
 ("prop_flamingo", f"a pink plastic lawn flamingo, {PIX}", 512, 512),
 ("prop_tree", f"a round leafy green oak tree with a brown trunk, {PIX}", 1024, 1024),
 ("prop_shrub", f"a small trimmed green hedge shrub, {PIX}", 512, 512),
 ("prop_grill", f"a black barbecue grill with the lid open and glowing coals, {PIX}", 512, 512),
 ("prop_fence", f"a short white picket fence segment, {PIX}", 512, 512),
 ("prop_house", f"a small suburban house front with a garage door and a porch, {PIX}", 1024, 1024),
 ("tile_lawn", f"freshly mowed green suburban lawn grass with faint mowing stripes, {TILE}", 512, 512),
 ("tile_lawn_long", f"overgrown long green grass with a few dandelions, {TILE}", 512, 512),
 ("tile_sidewalk", f"gray concrete sidewalk slabs with dark seams, {TILE}", 512, 512),
 ("tile_driveway", f"dark asphalt driveway, {TILE}", 512, 512),
 ("tile_dirt", f"brown dirt with small pebbles, {TILE}", 512, 512),
]

NEG = ("photo, photorealistic, 3d render, blurry, soft, gradient, drop shadow, birds-eye view, straight top-down, "
       "isometric, text, watermark, multiple objects, cropped")


def graph(name, prompt, w, h, seed):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "krea2_turbo_int8_convrot.safetensors", "weight_dtype": "default"}},
        "1b": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": 3.0}},
        "8": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen3vl_4b_fp8_scaled.safetensors", "type": "krea2", "device": "default"}},
        "9": {"class_type": "VAELoader", "inputs": {"vae_name": "qwen_image_vae.safetensors"}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["8", 0], "text": prompt}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["8", 0], "text": NEG}},
        "4": {"class_type": "EmptySD3LatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
        "5": {"class_type": "KSampler", "inputs": {"model": ["1b", 0], "positive": ["2", 0], "negative": ["3", 0],
               "latent_image": ["4", 0], "seed": seed, "steps": 8, "cfg": 1.0, "sampler_name": "euler",
               "scheduler": "simple", "denoise": 1.0}},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["9", 0]}},
        "7": {"class_type": "SaveImage", "inputs": {"filename_prefix": f"boomer_survivors/{name}", "images": ["6", 0]}},
    }


def run(name, prompt, w, h, seed):
    req = urllib.request.Request(HOST + "/prompt", data=json.dumps({"prompt": graph(name, prompt, w, h, seed), "client_id": "bsurv"}).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        pid = json.load(urllib.request.urlopen(req, timeout=120))["prompt_id"]
    except urllib.error.HTTPError as e:
        print("REJECTED", name, e.read().decode()[:600]); return None
    t0 = time.time()
    while time.time() - t0 < 900:
        try:
            h_ = json.load(urllib.request.urlopen(f"{HOST}/history/{pid}", timeout=60))
        except Exception:
            time.sleep(2); continue
        if pid in h_:
            for m in h_[pid].get("status", {}).get("messages", []):
                if "error" in str(m[0]).lower():
                    print("ERROR", name, json.dumps(m)[:500]); return None
            files = [a for o in (h_[pid].get("outputs") or {}).values() for a in (o.get("images") or [])]
            if files:
                src = os.path.join(OUT, files[0].get("subfolder", ""), files[0]["filename"])
                dst = os.path.join(RAW, name + ".png")
                shutil.copy2(src, dst)
                print(f"ok {time.time()-t0:.0f}s {name} -> raw/{name}.png", flush=True)
                return dst
        time.sleep(2)
    print("TIMEOUT", name); return None


if __name__ == "__main__":
    want = sys.argv[1:]
    os.makedirs(RAW, exist_ok=True)
    for i, (name, prompt, w, h) in enumerate(PROMPTS):
        if want and not any(x in name for x in want):
            continue
        if not want and os.path.exists(os.path.join(RAW, name + ".png")):
            print("skip", name); continue
        run(name, prompt, w, h, 31000 + i)
