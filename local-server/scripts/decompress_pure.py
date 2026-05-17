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

compressed = 'N4IgLgngDgpiBcIYA8DGBDANgSwCYCd0B3EAGhADcZ8BnbAewDsEAmcm+gV31TkQAswYKDXgB6MQHNsYfpwBGAOlT0AtmIBeNCtlQbs6RmPry6uA4wC0KDDgLFLUTJ2lH8MTDHQ0YNMWHRJMRZFAEYADkUWMiRPVRhGMBoEAG0AXXJ0KCgAZQCwPlBJfDwc7A0+Rk5MTHIdGCIAIXRUAGtirkZcAGF6THp8BBAAYgAzcYmQAF8poA==='

result = decompress_from_base64(compressed)

if result:
    print("=== RAW DECOMPRESSED ===")
    print(result)
    print()
    try:
        parsed = json.loads(result)
        print("=== FORMATTED JSON ===")
        print(json.dumps(parsed, indent=2, ensure_ascii=False))
    except json.JSONDecodeError as e:
        print(f"Not valid JSON: {e}")
else:
    print("Decompression failed - returned None or empty")
