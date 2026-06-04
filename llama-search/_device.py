"""偵測可用的運算裝置：cuda（NVIDIA）→ mps（Apple Silicon）→ cpu。

原本程式碼寫死 device="cuda"，在沒有 NVIDIA GPU 的機器（如 macOS）會丟出
"Torch not compiled with CUDA enabled"。改用本函式自動選擇。
可用環境變數 LLAMA_SEARCH_DEVICE 強制指定（cuda / mps / cpu）。
"""
import os

import torch


def pick_device() -> str:
    forced = os.environ.get("LLAMA_SEARCH_DEVICE", "").strip().lower()
    if forced:
        return forced
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
        return "mps"
    return "cpu"
