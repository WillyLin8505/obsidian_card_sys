"""Capture temp_user_decode.py stdout to temp_user_decode_stdout.txt (same as running the script)."""
import io
from contextlib import redirect_stdout
from pathlib import Path

def main():
    script = Path(__file__).resolve().parent / "temp_user_decode.py"
    code = compile(script.read_text(encoding="utf-8"), str(script), "exec")
    buf = io.StringIO()
    with redirect_stdout(buf):
        exec(code, {"__name__": "__main__"})
    text = buf.getvalue()
    out = script.parent / "temp_user_decode_stdout.txt"
    out.write_text(text, encoding="utf-8")
    print(text, end="")


if __name__ == "__main__":
    main()
