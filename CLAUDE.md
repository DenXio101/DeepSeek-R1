# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a **documentation and model release repository** for DeepSeek-R1 — there is no application source code, build system, or test suite. The repository contains:
- `README.md` — primary documentation
- `DeepSeek_R1.pdf` — the research paper
- `figures/` — benchmark images
- `.github/workflows/stale.yml` — automated stale issue management (runs daily)

Any changes here are documentation changes. There are no build, lint, or test commands to run.

## Model Family

DeepSeek-R1 consists of two tiers:

**Full MoE Models (671B total / 37B activated, 128K context):**
- `DeepSeek-R1-Zero` — trained purely with RL, no SFT
- `DeepSeek-R1` — RL with cold-start SFT data; production model

Both are built on `DeepSeek-V3-Base`. Architecture details live in the [DeepSeek-V3 repo](https://github.com/deepseek-ai/DeepSeek-V3). Hugging Face Transformers does **not** directly support these models.

**Distilled Dense Models** (fine-tuned from open-source bases using DeepSeek-R1-generated data):

| Model | Base |
|---|---|
| DeepSeek-R1-Distill-Qwen-1.5B | Qwen2.5-Math-1.5B |
| DeepSeek-R1-Distill-Qwen-7B | Qwen2.5-Math-7B |
| DeepSeek-R1-Distill-Llama-8B | Llama-3.1-8B |
| DeepSeek-R1-Distill-Qwen-14B | Qwen2.5-14B |
| DeepSeek-R1-Distill-Qwen-32B | Qwen2.5-32B |
| DeepSeek-R1-Distill-Llama-70B | Llama-3.3-70B-Instruct |

Distill models use slightly modified configs/tokenizers vs. their base models — always use the DeepSeek-published settings.

## Running Models Locally

**Full models (R1 / R1-Zero):** See the DeepSeek-V3 repository.

**Distill models** — treat them like their base model family (Qwen or Llama):

```shell
# vLLM
vllm serve deepseek-ai/DeepSeek-R1-Distill-Qwen-32B --tensor-parallel-size 2 --max-model-len 32768 --enforce-eager

# SGLang
python3 -m sglang.launch_server --model deepseek-ai/DeepSeek-R1-Distill-Qwen-32B --trust-remote-code --tp 2
```

## Critical Usage Recommendations

These apply to all DeepSeek-R1 series models:

1. **Temperature:** Use 0.5–0.7 (0.6 recommended). Values outside this range cause repetition or incoherence.
2. **No system prompt:** All instructions must be in the user prompt.
3. **Force reasoning:** Always prefix model output with `<think>\n` to prevent the model from skipping its thinking phase (empty `<think>\n\n</think>` degrades performance).
4. **Math problems:** Include "Please reason step by step, and put your final answer within `\boxed{}`." in the prompt.
5. **Benchmarking:** Use temperature 0.6, top-p 0.95, 64 responses per query for pass@1 estimation, max 32,768 generation tokens.

## Official Prompt Templates

**File upload:**
```
[file name]: {file_name}
[file content begin]
{file_content}
[file content end]
{question}
```

**Web search** uses `{search_results}`, `{cur_date}`, `{question}` — separate templates exist for Chinese and English queries (see README.md §6).

## Licensing Notes

- Repository and model weights: MIT License (commercial use allowed, distillation allowed)
- Qwen-based distill models additionally governed by Apache 2.0
- Llama-3.1-based distill model additionally governed by Llama 3.1 license
- Llama-3.3-based distill model additionally governed by Llama 3.3 license
