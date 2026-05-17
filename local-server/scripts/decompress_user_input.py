import json
import subprocess
import sys

try:
    from lzstring import LZString
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "lzstring"])
    from lzstring import LZString

data = 'N4IgLgngDgpiBcIYA8DGBDANgSwCYCd0B3EAGhADcZ8BnbAewDsEAmcm+gV31TkQAswYKDXgB6MQHNsYfpwBGAOlT0AtmIBeNCtlQbs6RmPry6uA4wC0KDDgLFLUTJ2lH8MTDHQ0YNMWHRJMRZFAEYADkUAZjIkT1UYRjAaBABtAF1ydCgoAGUAsD5QSXw8XOwNPkZOTExyHRgiACF0VABrEq5GXABhekx6fAQQAGIAMwnJkABfaaA='

lz = LZString()
result = lz.decompressFromBase64(data)
print("=== RAW RESULT ===")
print(result)
if result:
    try:
        parsed = json.loads(result)
        print("\n=== FORMATTED JSON ===")
        print(json.dumps(parsed, indent=2, ensure_ascii=False))
    except json.JSONDecodeError as e:
        print(f"\nNot valid JSON: {e}")
else:
    print("Decompression returned None/empty")
