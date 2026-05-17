import json
import math

KEY_STR = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="

def get_base_value(char):
    return KEY_STR.index(char)

def decompress_from_base64(input_str):
    if input_str is None:
        return ""
    if input_str == "":
        return None

    length = len(input_str)
    reset_value = 32

    dictionary = {}
    enlarge_in = 4
    dict_size = 4
    num_bits = 3
    entry = ""
    result = []

    data_val = get_base_value(input_str[0])
    data_position = reset_value
    data_index = 1

    for i in range(3):
        dictionary[i] = i

    def read_bit():
        nonlocal data_val, data_position, data_index
        resb = data_val & data_position
        data_position >>= 1
        if data_position == 0:
            data_position = reset_value
            data_val = get_base_value(input_str[data_index])
            data_index += 1
        return 1 if resb > 0 else 0

    def read_bits(n):
        bits = 0
        power = 1
        for _ in range(n):
            bits |= read_bit() * power
            power <<= 1
        return bits

    bits = read_bits(2)
    if bits == 0:
        c = chr(read_bits(8))
    elif bits == 1:
        c = chr(read_bits(16))
    elif bits == 2:
        return ""

    dictionary[3] = c
    w = c
    result.append(c)

    while True:
        if data_index > length:
            return ""

        bits = read_bits(num_bits)
        c = bits

        if c == 0:
            dictionary[dict_size] = chr(read_bits(8))
            dict_size += 1
            c = dict_size - 1
            enlarge_in -= 1
        elif c == 1:
            dictionary[dict_size] = chr(read_bits(16))
            dict_size += 1
            c = dict_size - 1
            enlarge_in -= 1
        elif c == 2:
            return "".join(result)

        if enlarge_in == 0:
            enlarge_in = int(math.pow(2, num_bits))
            num_bits += 1

        if c in dictionary:
            entry = dictionary[c]
        else:
            if c == dict_size:
                entry = w + w[0]
            else:
                return None

        result.append(entry)
        dictionary[dict_size] = w + entry[0]
        dict_size += 1
        enlarge_in -= 1

        if enlarge_in == 0:
            enlarge_in = int(math.pow(2, num_bits))
            num_bits += 1

        w = entry

compressed = """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="""

result = decompress_from_base64(compressed)

if result:
    print("=== RAW DECOMPRESSED ===")
    try:
        parsed = json.loads(result)
        elements = parsed.get("elements", [])
        text_elements = [e for e in elements if e.get("type") == "text"]
        print(f"Total elements: {len(elements)}")
        print(f"Text elements: {len(text_elements)}")
        
        type_counts = {}
        for e in elements:
            t = e.get("type", "unknown")
            type_counts[t] = type_counts.get(t, 0) + 1
        print(f"Element types: {type_counts}")
        
        if text_elements:
            print("\n=== TEXT CONTENT ===")
            for i, te in enumerate(text_elements):
                text = te.get("text", "") or te.get("originalText", "")
                print(f"  [{i+1}] {text}")
        
        print("\n=== FULL JSON (first 5000 chars) ===")
        print(json.dumps(parsed, indent=2, ensure_ascii=False)[:5000])
    except json.JSONDecodeError as e:
        print(f"Not valid JSON: {e}")
        print(result[:2000])
else:
    print("Decompression failed")
