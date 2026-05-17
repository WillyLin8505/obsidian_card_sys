import math

keyStrBase64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="
baseReverseDic = {}
for i, c in enumerate(keyStrBase64):
    baseReverseDic[c] = i

def getBaseValue(char):
    return baseReverseDic.get(char, 0)

def decompress_from_base64(compressed):
    if compressed is None:
        return ""
    if compressed == "":
        return None
    return _decompress(len(compressed), 32, lambda index: getBaseValue(compressed[index]))

def _decompress(length, resetValue, getNextValue):
    dictionary = {}
    enlargeIn = 4
    dictSize = 4
    numBits = 3
    entry = ""
    result = []

    data_val = getNextValue(0)
    data_position = resetValue
    data_index = 1

    for i in range(3):
        dictionary[i] = i

    # Read first 2 bits
    bits = 0
    maxpower = 4  # 2^2
    power = 1
    while power != maxpower:
        resb = data_val & data_position
        data_position >>= 1
        if data_position == 0:
            data_position = resetValue
            data_val = getNextValue(data_index)
            data_index += 1
        bits |= (1 if resb > 0 else 0) * power
        power <<= 1

    next_val = bits
    if next_val == 0:
        bits = 0
        maxpower = 256  # 2^8
        power = 1
        while power != maxpower:
            resb = data_val & data_position
            data_position >>= 1
            if data_position == 0:
                data_position = resetValue
                data_val = getNextValue(data_index)
                data_index += 1
            bits |= (1 if resb > 0 else 0) * power
            power <<= 1
        c = chr(bits)
    elif next_val == 1:
        bits = 0
        maxpower = 65536  # 2^16
        power = 1
        while power != maxpower:
            resb = data_val & data_position
            data_position >>= 1
            if data_position == 0:
                data_position = resetValue
                data_val = getNextValue(data_index)
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
        maxpower = int(math.pow(2, numBits))
        power = 1
        while power != maxpower:
            resb = data_val & data_position
            data_position >>= 1
            if data_position == 0:
                data_position = resetValue
                data_val = getNextValue(data_index)
                data_index += 1
            bits |= (1 if resb > 0 else 0) * power
            power <<= 1

        c = bits
        if c == 0:
            bits = 0
            maxpower = 256
            power = 1
            while power != maxpower:
                resb = data_val & data_position
                data_position >>= 1
                if data_position == 0:
                    data_position = resetValue
                    data_val = getNextValue(data_index)
                    data_index += 1
                bits |= (1 if resb > 0 else 0) * power
                power <<= 1
            dictionary[dictSize] = chr(bits)
            dictSize += 1
            c = dictSize - 1
            enlargeIn -= 1
        elif c == 1:
            bits = 0
            maxpower = 65536
            power = 1
            while power != maxpower:
                resb = data_val & data_position
                data_position >>= 1
                if data_position == 0:
                    data_position = resetValue
                    data_val = getNextValue(data_index)
                    data_index += 1
                bits |= (1 if resb > 0 else 0) * power
                power <<= 1
            dictionary[dictSize] = chr(bits)
            dictSize += 1
            c = dictSize - 1
            enlargeIn -= 1
        elif c == 2:
            return "".join(result)

        if enlargeIn == 0:
            enlargeIn = int(math.pow(2, numBits))
            numBits += 1

        if c in dictionary:
            if isinstance(dictionary[c], int):
                entry = str(dictionary[c])
            else:
                entry = dictionary[c]
        elif c == dictSize:
            entry = w + w[0]
        else:
            return None

        result.append(entry)

        dictionary[dictSize] = w + entry[0]
        dictSize += 1
        enlargeIn -= 1

        if enlargeIn == 0:
            enlargeIn = int(math.pow(2, numBits))
            numBits += 1

        w = entry

compressed = "N4IgLgngDgpiBcIYA8DGBDANgSwCYCd0B3EAGhADcZ8BnbAewDsEAmcm+gV31TkQAswYKDXgB6MQHNsYfpwBGAOlT0AtmIBeNCtlQbs6RmPry6uA4wC0KDDgLFLUTJ2lH8MTDHQ0YNMWHRJMRZFAEYADkUAZjIkT1UYRjAaBABtAF1ydCgoAGUAsD5QSXw8XOwNPkZOTExyHRgiACF0VABrEq5GXABhekx6fAQQAGIAMwnJkABfaaA="
result = decompress_from_base64(compressed)
print(result)
