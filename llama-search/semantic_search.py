"""
語義搜尋 CLI — 輕量 HTTP client，需先啟動 search_server.py。
用法：
  python semantic_search.py "查詢文字"
  python semantic_search.py --file /path/to/file.md
啟動 server：
  python search_server.py
"""

import sys
import argparse
import json
from pathlib import Path
from urllib import request, error

SERVER_URL = "http://127.0.0.1:8765"


def load_query_text(args) -> str:
    if args.file:
        file_path = Path(args.file)
        if not file_path.exists():
            print(f"[ERROR] 找不到檔案：{file_path}", file=sys.stderr)
            sys.exit(1)
        return file_path.read_text(encoding="utf-8")
    return " ".join(args.query)


def check_server() -> bool:
    try:
        with request.urlopen(f"{SERVER_URL}/health", timeout=2) as resp:
            data = json.loads(resp.read())
            return data.get("ready", False)
    except error.URLError:
        return False


def main():
    parser = argparse.ArgumentParser(description="語義搜尋工具")
    parser.add_argument("query", nargs="*", help="查詢文字（直接輸入）")
    parser.add_argument("--file", "-f", help="查詢來源檔案路徑")
    parser.add_argument("--top-k", type=int, default=5, help="回傳前 N 筆結果")
    args = parser.parse_args()

    if not args.query and not args.file:
        parser.print_help()
        sys.exit(1)

    if not check_server():
        print("[ERROR] Server 未啟動，請先執行：", file=sys.stderr)
        print("  python search_server.py", file=sys.stderr)
        sys.exit(1)

    query_text = load_query_text(args)

    payload = json.dumps({"query": query_text, "top_k": args.top_k}).encode()
    req = request.Request(
        f"{SERVER_URL}/search",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
    except error.URLError as e:
        print(f"[ERROR] 搜尋失敗：{e}", file=sys.stderr)
        sys.exit(1)

    print("=" * 60)
    print("【相關來源節點】")
    print("=" * 60)
    for i, result in enumerate(data["results"], 1):
        score = f"{result['score']:.4f}" if result["score"] is not None else "N/A"
        print(f"\n[{i}] 相似度分數：{score}")
        print(result["text"])

    print("\n" + "=" * 60)
    print("【Top 3 最相關關鍵字】")
    print("=" * 60)
    for kw in data["keywords"]:
        print(f"  • {kw}")
    print()


if __name__ == "__main__":
    main()
