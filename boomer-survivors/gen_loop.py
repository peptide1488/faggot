"""Loop-safe sprite sheet from ONE still - the VELVET VICE LTX 2.5 method rebuilt on NATIVE nodes
(the Velvet Vice custom nodes are not loaded on this server and the user launches ComfyUI, so
no restart). What the pack does, and what this does the same way:

  * LTX 2.5 I2V: LTXVImgToVideoInplace with the still as the FIRST frame
  * loop conditioning: the SAME still as the LAST frame via LTXVAddGuide(frame_idx=-1, 1.0) -
    that is exactly what VelvetViceLTX25SpriteLoopGuide implements (read the source)
  * 8-sigma distilled schedule, euler_ancestral, dual CFG 1/1, 24 fps, 4 s = 97 frames
  * LTXVCropGuides after sampling drops the appended guide latent
  * frames are saved as PNGs; frame selection / palette / keying / stitching is done in
    make_sheet.py (loop-safe: the duplicated final frame is excluded)

  python gen_loop.py boomer_mower "the mower wheels roll, ..." [--frames 97] [--size 512]
"""
import json, sys, time, urllib.request, urllib.error, os, shutil, glob, argparse

HOST = "http://127.0.0.1:8188"
OUT = r"C:\Users\andrew\Documents\comywilly1\output"
COMFY_IN = r"C:\Users\andrew\Documents\comywilly1\input"
HERE = os.path.dirname(os.path.abspath(__file__))

NEG = "pc game, console game, video game, cartoon, childish, ugly, blurry, camera movement, zoom, pan, background change, text"


def graph(image_name, prompt, w, h, frames, seed, prefix, first_strength=0.7, loop_strength=1.0):
    return {
        "L1": {"class_type": "LoadImage", "inputs": {"image": image_name}},
        "L2": {"class_type": "LTXVPreprocess", "inputs": {"image": ["L1", 0], "img_compression": 18}},
        "M1": {"class_type": "UNETLoader", "inputs": {"unet_name": "ltx-2.5-22b-distilled-int8-convrot.safetensors", "weight_dtype": "default"}},
        "V1": {"class_type": "VAELoader", "inputs": {"vae_name": "ltx25_video_vae_conv_bf16.safetensors"}},
        "V2": {"class_type": "VAELoader", "inputs": {"vae_name": "ltx25_audio_vae_bf16.safetensors"}},
        "C1": {"class_type": "CLIPLoader", "inputs": {"clip_name": "ltx25_gemma4_12b_int8_convrot.safetensors", "type": "ltxv", "device": "default"}},
        "P": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["C1", 0], "text": prompt}},
        "N": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["C1", 0], "text": NEG}},
        "CO": {"class_type": "LTXVConditioning", "inputs": {"positive": ["P", 0], "negative": ["N", 0], "frame_rate": 24.0}},
        "E": {"class_type": "EmptyLTXVLatentVideo", "inputs": {"width": w, "height": h, "length": frames, "batch_size": 1}},
        "I2V": {"class_type": "LTXVImgToVideoInplace", "inputs": {"vae": ["V1", 0], "image": ["L2", 0], "latent": ["E", 0], "strength": first_strength, "bypass": False}},
        # the loop guide: same still pinned to the LAST frame
        "G": {"class_type": "LTXVAddGuide", "inputs": {"positive": ["CO", 0], "negative": ["CO", 1], "vae": ["V1", 0],
               "latent": ["I2V", 0], "image": ["L2", 0], "frame_idx": -1, "strength": loop_strength}},
        "A": {"class_type": "LTXVEmptyLatentAudio", "inputs": {"frames_number": frames, "frame_rate": 24.0, "batch_size": 1, "audio_vae": ["V2", 0]}},
        "AV": {"class_type": "LTXVConcatAVLatent", "inputs": {"video_latent": ["G", 2], "audio_latent": ["A", 0]}},
        "GU": {"class_type": "LTXVDualCFGGuider", "inputs": {"model": ["M1", 0], "positive": ["G", 0], "negative": ["G", 1], "video_cfg": 1.0, "audio_cfg": 1.0}},
        "NS": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
        "KS": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler_ancestral"}},
        "SG": {"class_type": "ManualSigmas", "inputs": {"sigmas": "1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0"}},
        "S": {"class_type": "SamplerCustomAdvanced", "inputs": {"noise": ["NS", 0], "guider": ["GU", 0], "sampler": ["KS", 0], "sigmas": ["SG", 0], "latent_image": ["AV", 0]}},
        "SEP": {"class_type": "LTXVSeparateAVLatent", "inputs": {"av_latent": ["S", 0]}},
        "CR": {"class_type": "LTXVCropGuides", "inputs": {"positive": ["G", 0], "negative": ["G", 1], "latent": ["SEP", 0]}},
        "D": {"class_type": "VAEDecodeTiled", "inputs": {"samples": ["CR", 2], "vae": ["V1", 0], "tile_size": 512, "overlap": 64, "temporal_size": 64, "temporal_overlap": 16}},
        "SV": {"class_type": "SaveImage", "inputs": {"filename_prefix": f"boomer_survivors/loop/{prefix}/f", "images": ["D", 0]}},
        "MP": {"class_type": "VHS_VideoCombine", "inputs": {"images": ["D", 0], "frame_rate": 24.0, "loop_count": 0,
               "filename_prefix": f"boomer_survivors/loop/{prefix}_preview", "format": "video/h264-mp4", "pingpong": False, "save_output": True}},
    }


def submit(g):
    req = urllib.request.Request(HOST + "/prompt", data=json.dumps({"prompt": g, "client_id": "bsurv_loop"}).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        return json.load(urllib.request.urlopen(req, timeout=120))["prompt_id"]
    except urllib.error.HTTPError as e:
        print("REJECTED", e.read().decode()[:1500]); return None


def wait(pid, limit=3600):
    t0 = time.time()
    while time.time() - t0 < limit:
        try:
            h = json.load(urllib.request.urlopen(f"{HOST}/history/{pid}", timeout=60))
        except Exception:
            time.sleep(4); continue
        if pid in h:
            for m in h[pid].get("status", {}).get("messages", []):
                if "error" in str(m[0]).lower():
                    print("ERROR", json.dumps(m)[:1200]); return None
            outs = h[pid].get("outputs") or {}
            imgs = [a for o in outs.values() for a in (o.get("images") or [])]
            print(f"ok {time.time()-t0:.0f}s  {len(imgs)} frames", flush=True)
            return imgs
        time.sleep(4)
    print("TIMEOUT"); return None


def run(name, prompt, size=512, frames=97, seed=777, first_strength=0.7, loop_strength=1.0, tag=""):
    src = os.path.join(HERE, "raw", name + "_in.png")
    if not os.path.exists(src): src = os.path.join(HERE, "raw", name + ".png")
    dst = os.path.join(COMFY_IN, f"bsurv_{name}.png")
    shutil.copy2(src, dst)
    prefix = name + (("_" + tag) if tag else "")
    pid = submit(graph(os.path.basename(dst), prompt, size, size, frames, seed, prefix, first_strength, loop_strength))
    if not pid:
        return None
    print("queued", pid, prefix, flush=True)
    imgs = wait(pid)
    if not imgs:
        return None
    folder = os.path.join(OUT, "boomer_survivors", "loop", prefix)
    return folder


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("name"); ap.add_argument("prompt")
    ap.add_argument("--size", type=int, default=512); ap.add_argument("--frames", type=int, default=97)
    ap.add_argument("--seed", type=int, default=777); ap.add_argument("--first", type=float, default=0.7)
    ap.add_argument("--loop", type=float, default=1.0); ap.add_argument("--tag", default="")
    a = ap.parse_args()
    print(run(a.name, a.prompt, a.size, a.frames, a.seed, a.first, a.loop, a.tag))
