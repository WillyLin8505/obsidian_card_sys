"""
Standalone LZ-string decompressFromBase64 implementation.
No external dependencies required - just run: python decompress_standalone.py
"""
import json
import math

KEY_STR_BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="

def _get_base_value(alphabet, character):
    return alphabet.index(character)

def _decompress(length, reset_value, get_next_value):
    dictionary = {}
    enlarge_in = 4
    dict_size = 4
    num_bits = 3
    entry = ""
    result = []

    data_val = get_next_value(0)
    data_position = reset_value
    data_index = 1

    for i in range(3):
        dictionary[i] = i

    bits = 0
    maxpower = math.pow(2, 2)
    power = 1
    while power != maxpower:
        resb = data_val & data_position
        data_position >>= 1
        if data_position == 0:
            data_position = reset_value
            data_val = get_next_value(data_index)
            data_index += 1
        bits |= (1 if resb > 0 else 0) * power
        power <<= 1

    next_val = bits
    if next_val == 0:
        bits = 0
        maxpower = math.pow(2, 8)
        power = 1
        while power != maxpower:
            resb = data_val & data_position
            data_position >>= 1
            if data_position == 0:
                data_position = reset_value
                data_val = get_next_value(data_index)
                data_index += 1
            bits |= (1 if resb > 0 else 0) * power
            power <<= 1
        c = chr(bits)
    elif next_val == 1:
        bits = 0
        maxpower = math.pow(2, 16)
        power = 1
        while power != maxpower:
            resb = data_val & data_position
            data_position >>= 1
            if data_position == 0:
                data_position = reset_value
                data_val = get_next_value(data_index)
                data_index += 1
            bits |= (1 if resb > 0 else 0) * power
            power <<= 1
        c = chr(bits)
    elif next_val == 2:
        return ""

    dictionary[3] = c
    w = c
    result.append(c)

    while True:
        if data_index > length:
            return ""

        bits = 0
        maxpower = math.pow(2, num_bits)
        power = 1
        while power != maxpower:
            resb = data_val & data_position
            data_position >>= 1
            if data_position == 0:
                data_position = reset_value
                data_val = get_next_value(data_index)
                data_index += 1
            bits |= (1 if resb > 0 else 0) * power
            power <<= 1

        c_val = bits
        if c_val == 0:
            bits = 0
            maxpower = math.pow(2, 8)
            power = 1
            while power != maxpower:
                resb = data_val & data_position
                data_position >>= 1
                if data_position == 0:
                    data_position = reset_value
                    data_val = get_next_value(data_index)
                    data_index += 1
                bits |= (1 if resb > 0 else 0) * power
                power <<= 1
            dictionary[dict_size] = chr(bits)
            dict_size += 1
            c_val = dict_size - 1
            enlarge_in -= 1
        elif c_val == 1:
            bits = 0
            maxpower = math.pow(2, 16)
            power = 1
            while power != maxpower:
                resb = data_val & data_position
                data_position >>= 1
                if data_position == 0:
                    data_position = reset_value
                    data_val = get_next_value(data_index)
                    data_index += 1
                bits |= (1 if resb > 0 else 0) * power
                power <<= 1
            dictionary[dict_size] = chr(bits)
            dict_size += 1
            c_val = dict_size - 1
            enlarge_in -= 1
        elif c_val == 2:
            return "".join(result)

        if enlarge_in == 0:
            enlarge_in = math.pow(2, num_bits)
            num_bits += 1

        if c_val in dictionary:
            entry = dictionary[c_val]
        else:
            if c_val == dict_size:
                entry = w + w[0]
            else:
                return None

        result.append(entry)
        dictionary[dict_size] = w + entry[0]
        dict_size += 1
        enlarge_in -= 1

        if enlarge_in == 0:
            enlarge_in = math.pow(2, num_bits)
            num_bits += 1

        w = entry

    return "".join(result)


def decompress_from_base64(compressed):
    if compressed is None or compressed == "":
        return ""

    input_data = []
    for i in range(0, len(compressed)):
        input_data.append(_get_base_value(KEY_STR_BASE64, compressed[i]))

    return _decompress(len(input_data), 32, lambda index: input_data[index])


if __name__ == "__main__":
    data = 'N4IgLgngDgpiBcIYA8DGBDANgSwCYCd0B3EAGhADcZ8BnbAewDsEAmcm+gV31TkQAswYKDXgB6MQHNsYfpwBGAOlT0AtmIBeNCtlQbs6RmPry6uA4wC0KDDgLFLUTJ2lH8MTDHQ0YNMWHRJMRZFAEYADkUAZjIkT1UYRjAaBABtAF1ydCgoAGUAsD5QSXw8XOwNPkZOTExyHRgiACF0VABrEq5GXABhekx6fAQQAGIAMwnJkABfaaA='

    result = decompress_from_base64(data)

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
