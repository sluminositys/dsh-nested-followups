# Demo recording guide

The shipped [`assets/demo.gif`](assets/demo.gif) is assembled from screenshots
of a real DeepSeek Harness session. The conversation, branch sessions, Tree
View layout, progressive collapse, and Chat/Tree View transitions are all real.
Only the short captions, pointer, click rings, and crossfades are added in post.

## Capture setup

| Setting | Value |
| --- | --- |
| Window | 1440 × 900 px |
| DSH | Unmodified `0.1.1-rc.2`, web profile |
| Plugin | Locally installed `dsh-nested-followups` |
| Language | English |
| Theme | Light |
| Sidebar | Collapsed before the first capture |
| Root access mode | Read Only |
| Final GIF | 1120 × 700 px, 8 fps, 13.5 seconds, looping |

Do not record a personal work session. Create a dedicated throwaway session
with neutral example content and no file paths, repository names, tokens, or
other private data.

## Example conversation

Create three turns in the main chat:

1. `We are adding retry logic to an API client. Give me a three-step implementation plan in under 90 words. Do not inspect files or run tools; answer only.`
2. `Make step 2 concrete: what state should the retry loop track? Keep it under 70 words. Answer only.`
3. `Now define three acceptance criteria for the main retry implementation. Keep it under 60 words. Answer only.`

Create the side trail in Tree View. The third step demonstrates the recursive
rule: an answer inside the side trail becomes another independent fork point,
and every answer produced below it can repeat the same action at any depth.

1. On **A1**, use **Ask follow-up**: `What does idempotent mean here? Explain it in one sentence.`
2. On **A1.1**, use **Continue this branch**: `Give one concrete API example in one sentence.`
3. On **A1.1 #2**, use **Ask follow-up**: `Why is POST usually unsafe to retry? One sentence.`

This creates a six-message main trunk, a four-message first branch, and a
two-message nested branch. Verify that the root session still reports exactly
three turns before recording.

## 13.5-second edit

| Time | Screen and mouse action | Caption |
| --- | --- | --- |
| 0.0–1.6 s | Chat view, pointer near **Tree View** | `MAIN TASK · 3 LINEAR TURNS` |
| 1.6–2.8 s | Open Tree View; branches fully folded | `PICK AN EARLIER ANSWER` |
| 2.8–4.5 s | Open **Ask follow-up** beside A1 and type the question | `ASK A SIDE QUESTION` |
| 4.5–5.7 s | Show the first branch as a capsule | `FIRST ISOLATED SIDE BRANCH` |
| 5.7–7.3 s | Expand branch 1.1, including its continued second turn | `KEEP TALKING INSIDE IT` |
| 7.3–8.5 s | Reveal branch 1.1.1 from the answer inside branch 1.1 | `THE SIDE ANSWER RAISES ANOTHER QUESTION` |
| 8.5–10.4 s | Expand branch 1.1.1 | `KEEP BRANCHING AT ANY DEPTH` |
| 10.4–11.5 s | Select **Collapse all** | `COLLAPSE THE SIDE TRAIL` |
| 11.5–13.5 s | Return to Chat; keep the three-turn counter visible | `MAIN TASK · STILL ONLY 3 TURNS` |

Use semantic clicks on the actual controls. Do not animate fabricated cards or
replace the DSH interface with a mock. It is fine to recreate the submitted
question in the composer and cancel it before revealing the already-generated
branch, as long as both states come from the same real session.

## Framing and export

- Capture the full 1440 × 900 viewport.
- Crop only the 54 px collapsed icon rail; keep the DSH header, Tree View tab,
  canvas, minimap, and composer visible.
- Downscale to 1120 × 700 with a high-quality filter.
- Keep captions in one small dark pill below the toolbar. Do not cover cards.
- Use a white pointer with a dark outline and a restrained blue click ring.
- Quantize to 96 colors and optimize the GIF. Target less than 8 MB.
- Export to `assets/demo.gif` and verify the first, middle, and final states at
  full size before committing.

The static companion screenshot is `assets/tree-view.png`. Social crops are
`assets/social-preview.png` (1280 × 640) and `assets/banner.png` (1600 × 900).
