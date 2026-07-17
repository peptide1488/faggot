# PixelLab — locked settings for Grimoire

## Style target (THE look)

User-approved wizard (this is the bar for all units):

**https://www.pixellab.ai/create-character/d04f2a44-b68a-4698-a319-8cf128469903**

| Field | Value |
|-------|--------|
| Mode | `pixen_v3` |
| View | high top-down |
| Template | mannequin |
| Canvas | 248×248 exported (content ~62×123; we ship 96×128 frames) |
| Local refs | `sprites/hq/_style_ref/wizard_*.png`, `STYLE_ANCHOR.png` |

**Anchor prompt pattern:**
```
[concrete subject with colors/clothing/features]. standing, arms at side.
Classic high fantasy [role] design. top down isometric angle
```

Example (wizard):
> A wizard with a long, flowing white beard and sharp, intelligent eyes.
> Wearing a voluminous, oversized deep purple robe embroidered with subtle
> gold star patterns and a matching wide-brimmed pointed wizard hat.
> standing, arms at side. Classic high fantasy mage design. top down isometric angle

That wizard is already shipped as `sprites/hq/characters/wizard.png` (4×4 sheet).

## Characters / monsters (Character Creator UI)

Matches the PixelLab web UI exactly:

| Setting | Value |
|---------|--------|
| Tab | Create from Text |
| Character Type | **Humanoid** (`template_id: mannequin`) — animals use dog/bear/cat |
| Generation Mode | **v3** → `POST /create-character-v3` |
| Camera View | **High Top-Down** |
| Sprite Size | **96 × 128** |
| Detail | **Highly detailed** |
| Outline | **Black outline** (`single color black outline`) |
| Cost | ~3 generations each |

```python
# tools/pixellab_style.py → character_v3_body()
{
  "description": "<short class/monster description>",
  "image_size": {"width": 96, "height": 128},
  "view": "high top-down",
  "template_id": "mannequin",
  "outline": "single color black outline",
  "detail": "highly detailed",
  "no_background": True,
  "enhance_prompt": True,
}
```

Game ships a **4×4 walk sheet** (rows S/W/E/N) built from the 8 v3 rotations.

```bash
python tools/pixellab_gen.py --pack characters --workers 3
python tools/pixellab_gen.py --pack monsters --workers 3
python tools/pixellab_gen.py --only fighter,goblin --force
```

## Props (not the character creator)

- `POST /map-objects` — trees, bushes, rocks, barrels  
- Or Pro `POST /generate-image-v2` for max quality singles  

## Terrain

- Prefer `POST /create-tiles-pro` `square_topdown` @ 32px  
- Avoid freeform 32px “logo” textures  

## Concurrency

Max **3** jobs at once. Checkpoint: `tools/_pixellab_state.json`.
