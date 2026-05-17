import base64
import zlib

data = "N4IgLgngDgpiBcIYA8DGBDANgSwCYCd0B3EAGhADcZ8BnbAewDsEAmcm+gV31TkQAswYKDXgB6MQHNsYfpwBGAOlT0AtmIBeNCtlQbs6RmPry6uA4wC0KDDgLFLUTJ2lH8MTDHQ0YNMWHRJMRZFAEYADkUWMiRPVRhGMBoEAG0AXXJ0KCgAZQCwPlBJfDwc7A0+Rk5MTHIdGCIAIXRUAGtirkZcAGF6THp8BBAAYgAzcYmQAF8poA==="

buf = base64.b64decode(data)
print("First bytes (hex):", buf[:20].hex())
print("Length:", len(buf))
print()

# Try different decompression methods
try:
    result = zlib.decompress(buf)
    print("zlib.decompress:", result.decode('utf-8'))
except Exception as e:
    print("zlib.decompress failed:", e)

try:
    result = zlib.decompress(buf, -zlib.MAX_WBITS)
    print("raw deflate:", result.decode('utf-8'))
except Exception as e:
    print("raw deflate failed:", e)

try:
    result = zlib.decompress(buf, zlib.MAX_WBITS | 16)
    print("gzip:", result.decode('utf-8'))
except Exception as e:
    print("gzip failed:", e)

try:
    result = zlib.decompress(buf, zlib.MAX_WBITS)
    print("zlib with wbits:", result.decode('utf-8'))
except Exception as e:
    print("zlib with wbits failed:", e)
