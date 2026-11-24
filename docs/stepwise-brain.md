# Stepwise Brain: build brief

Paste everything below the line into Claude Code on the Windows 11 PC, from an empty folder. It is written to be self-contained.

---

## Goal

Build **Stepwise Brain**: a small, fine-tuned language model that turns a student's computer-science question into the exact Stepwise tool and its inputs, as JSON. It must run **in the browser** (WebGPU, via Transformers.js), so Stepwise's "Ask" feature works without paid or rate-limited APIs.

The model never computes answers. Stepwise's deterministic engines compute them. The model only has to:
1. pick the right tool out of 89,
2. fill in that tool's URL parameters correctly,
3. say whether the user wants to see it, solve it, or understand a concept.

Output format (one JSON object, nothing else):

```json
{ "tool": "page-replacement", "params": { "algo": "lru", "f": 3, "r": "7 0 1 2 0 3 0 4" }, "intent": "solve" }
```

`intent` is one of `"show"`, `"solve"` or `"explain"`.

## The source of truth: the Stepwise repo

Clone it first: `git clone https://github.com/jash2884/stepwise` (public). Node 24+ is needed to run its JavaScript.

What matters in it:
- `public/js/ai/tool-schemas.js`: `SCHEMAS` (all 89 tools: slug, params with types, formats, ranges, defaults, examples) and `SCHEMA_BY_SLUG`; `check(schema, params)` validates params by running the real engine and returns `{ ok, error, answer }`; `describe(schema)` gives a compact text description; `toUrl(...)` builds the tool URL. Per-subject files are in `public/js/ai/schemas/`.
- `public/js/gate-questions.js` and `public/js/gate/*.js`: 72 seeded GATE-style question generators. `generate(slug, seed)` returns `{ stem, options?, answer, replay }`. **The `replay` URL is a perfect label**: its path is the tool and its query string is the params. This gives unlimited, engine-checked training pairs.
- `public/js/tools.js` (+ `public/js/subjects/*.js`): titles, summaries and descriptions of every tool (for "show me…" and conceptual phrasings).
- `scripts/eval-ask.mjs`: a 40-case golden set (typed, Hinglish, textbook-with-options, conceptual). The cloud model currently scores 98% tool accuracy on it. Use these cases as part of the held-out test set and **never train on them**.
- `src/ai/ask/`: how the production router prompts the cloud model today (useful for the system prompt and output format).

## Rules

- **No scraping.** Do not scrape GeeksforGeeks, LeetCode or any site whose terms forbid it. Use the repo's generators, its own text, and only openly licensed material (e.g. Wikipedia CC BY-SA, *Open Data Structures* CC BY, Jeff Erickson's *Algorithms* CC BY) for phrasing variety, credited in the dataset card.
- Optional paraphrasing with an LLM API is fine using my own free keys (I'll provide them if asked), respecting their rate limits and terms.
- Keep large files (datasets, checkpoints, ONNX, GGUF) out of git: use `.gitignore`.
- Make every step re-runnable with one command and record random seeds.

## Step 0: check the machine and pick the path

Detect: GPU (`nvidia-smi`), VRAM, RAM, free disk, Python, Node, and whether WSL2 is available. Then choose:

- **NVIDIA GPU with 6 GB or more VRAM:** train locally. Prefer **WSL2 Ubuntu + CUDA** with Unsloth (fastest, least VRAM) or Hugging Face TRL + PEFT. Native Windows with PyTorch CUDA + TRL + PEFT is the fallback if WSL2 isn't possible.
- **No suitable GPU:** prepare everything locally (dataset, eval) and produce a ready-to-run **Kaggle notebook** (free T4 GPUs, about 30 hours a week) or Google Colab notebook for the training step. I'll upload and run it.

Tell me which path you chose and why before installing anything large. Use a Python virtual environment (Python 3.11).

## Step 1: dataset (target about 30,000 training examples)

Write `data/build.mjs` (Node) that produces JSONL with `{ "messages": [system, user, assistant] }` chat records:

1. **Generator questions:** for each of the 72 GATE topics and many seeds, take `stem` (+ options) as the user text and parse `replay` into `{ tool, params }`, intent `"solve"`. Run `check()` on every label; drop any that fail.
2. **Templated requests:** for every tool, sample valid params from its schema (defaults, examples, and random values inside the stated ranges, validated with `check()`), and render them through many phrasing templates: imperative ("Run LRU with 3 frames on 1 2 3 4"), questions, casual student style, exam style, abbreviations (RR, SJF, LRU, 2PL, BCNF), **Hinglish** ("LRU me 3 frames ke saath faults kitne?"), and light noise (typos, missing spaces, OCR-like errors). Intent `"show"` or `"solve"`.
3. **Conceptual questions:** "why does SJF starve long jobs?", "difference between B tree and B+ tree", built from tool titles, summaries and outcomes, with intent `"explain"` and the best tool plus a demonstrating preset.
4. **Hard negatives:** near-miss pairs that test tool confusion (B-tree vs B+ tree, SSTF vs SCAN, LL(1) vs LR, Prim vs Kruskal, paging vs page replacement).
5. Balance tools so no tool has fewer than about 150 examples; cap the largest.
6. **Split by generator seed range and template id** (not by random row) into train / validation / test, so test phrasings and inputs are unseen. Add the 40 golden cases to test only.
7. Write `data/DATASET_CARD.md`: sources, licences, counts per tool and intent, split method.

The system prompt must be short (it costs tokens on every call): the task, the JSON format, and a compact list of tools. Don't paste all 89 full schemas into every example. Either include only a one-line catalogue of tool slugs, or (better) teach param formats through the data and keep the prompt tiny. Measure both if time allows.

## Step 2: baseline

Before training, run the **untrained** base model on the test set with the same prompt and scorer, so the improvement is provable.

Scorer `eval/score.mjs` (Node, uses the repo's `check()`):
- **tool accuracy:** exact match of `tool`;
- **JSON validity:** parses as one object with the right keys;
- **param validity:** `check()` passes;
- **answer accuracy:** for solve cases with a known answer, the engine's answer from the predicted params equals the gold answer;
- **intent accuracy**;
- breakdown by subject, phrasing kind (typed, Hinglish, textbook, concept) and the most confused tool pairs.

## Step 3: fine-tune

- Base model: **Qwen/Qwen2.5-0.5B-Instruct** (Apache-2.0). If param validity on validation stays under about 90% after a good run, try **Qwen2.5-1.5B-Instruct**.
- Method: LoRA (QLoRA 4-bit if VRAM is tight). Starting point: rank 16, alpha 32, dropout 0.05, all linear layers, learning rate 2e-4 with cosine decay, warmup 3%, 2 to 3 epochs, max sequence 1024, **loss on the assistant turn only**, effective batch size about 32, bf16 or fp16 as the GPU allows.
- Evaluate on validation every few hundred steps with the scorer (sample of 300) and keep the best checkpoint by answer accuracy, not loss.
- Merge the LoRA into the base model at the end.

## Step 4: evaluate properly

Run the full scorer on the test set for: the base model, the fine-tuned model, and (if I give a key) one cloud model, using greedy decoding. Write `eval/REPORT.md` with the table, the confusion pairs, 10 typical failures with what went wrong, latency per question on this PC, and model size. Be honest about weak areas; don't tune on the test set.

## Step 5: export for the browser

- Export the merged model to **ONNX** for Transformers.js (Hugging Face `optimum`, task text-generation with past key values), then quantise to **q4** (or q4f16 for WebGPU). Target size about 350 to 450 MB.
- Verify the exported model in Node with `@huggingface/transformers` (exact version, e.g. 3.x): same scorer, same test subset, accuracy within about 1 to 2 points of the PyTorch model.
- Also produce a **GGUF** (Q4_K_M) with llama.cpp for a possible server fallback, and test it with llama.cpp on this PC.
- Write a `MODEL_CARD.md`: base model and licence, data sources, training settings, eval table, intended use (routing questions to Stepwise tools; not for answering questions directly), limitations.

## Step 6: hand-off

Leave a folder `stepwise-brain/` with: `data/` (scripts + card, not the big JSONL), `train/` (script or notebook + config), `eval/` (scorer, report), `export/` (scripts), `MODEL_CARD.md`, and `README.md` with exact commands for every step. Tell me:
- where the final ONNX q4 files are and their total size;
- the eval table;
- what hosting the model files needs (Hugging Face Hub repo or Cloudflare R2, both need my account, so ask me).

The Stepwise side (loading the model in the browser with Transformers.js + WebGPU, asking the user before the one-time download, validating the output with `check()`, and falling back to `/api/ai/ask`) will be integrated in the Stepwise repo afterwards; you don't need to edit Stepwise itself.
