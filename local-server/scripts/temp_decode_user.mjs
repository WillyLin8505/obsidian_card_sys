const keyStrBase64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

function getBaseValue(alphabet, character) {
  return alphabet.indexOf(character);
}

function _decompress(length, resetValue, getNextValue) {
  const dictionary = [];
  let enlargeIn = 4;
  let dictSize = 4;
  let numBits = 3;
  let entry = "";
  let result = [];
  let w;
  let bits, resb, maxpower, power;
  let c;

  const data = { val: getNextValue(0), position: resetValue, index: 1 };

  for (let i = 0; i < 3; i++) {
    dictionary[i] = i;
  }

  bits = 0;
  maxpower = Math.pow(2, 2);
  power = 1;
  while (power !== maxpower) {
    resb = data.val & data.position;
    data.position >>= 1;
    if (data.position === 0) {
      data.position = resetValue;
      data.val = getNextValue(data.index++);
    }
    bits |= (resb > 0 ? 1 : 0) * power;
    power <<= 1;
  }

  switch (bits) {
    case 0:
      bits = 0;
      maxpower = Math.pow(2, 8);
      power = 1;
      while (power !== maxpower) {
        resb = data.val & data.position;
        data.position >>= 1;
        if (data.position === 0) {
          data.position = resetValue;
          data.val = getNextValue(data.index++);
        }
        bits |= (resb > 0 ? 1 : 0) * power;
        power <<= 1;
      }
      c = String.fromCharCode(bits);
      break;
    case 1:
      bits = 0;
      maxpower = Math.pow(2, 16);
      power = 1;
      while (power !== maxpower) {
        resb = data.val & data.position;
        data.position >>= 1;
        if (data.position === 0) {
          data.position = resetValue;
          data.val = getNextValue(data.index++);
        }
        bits |= (resb > 0 ? 1 : 0) * power;
        power <<= 1;
      }
      c = String.fromCharCode(bits);
      break;
    case 2:
      return "";
  }

  dictionary[3] = c;
  w = c;
  result.push(c);

  while (true) {
    if (data.index > length) return "";

    bits = 0;
    maxpower = Math.pow(2, numBits);
    power = 1;
    while (power !== maxpower) {
      resb = data.val & data.position;
      data.position >>= 1;
      if (data.position === 0) {
        data.position = resetValue;
        data.val = getNextValue(data.index++);
      }
      bits |= (resb > 0 ? 1 : 0) * power;
      power <<= 1;
    }

    switch (c = bits) {
      case 0:
        bits = 0;
        maxpower = Math.pow(2, 8);
        power = 1;
        while (power !== maxpower) {
          resb = data.val & data.position;
          data.position >>= 1;
          if (data.position === 0) {
            data.position = resetValue;
            data.val = getNextValue(data.index++);
          }
          bits |= (resb > 0 ? 1 : 0) * power;
          power <<= 1;
        }
        dictionary[dictSize++] = String.fromCharCode(bits);
        c = dictSize - 1;
        enlargeIn--;
        break;
      case 1:
        bits = 0;
        maxpower = Math.pow(2, 16);
        power = 1;
        while (power !== maxpower) {
          resb = data.val & data.position;
          data.position >>= 1;
          if (data.position === 0) {
            data.position = resetValue;
            data.val = getNextValue(data.index++);
          }
          bits |= (resb > 0 ? 1 : 0) * power;
          power <<= 1;
        }
        dictionary[dictSize++] = String.fromCharCode(bits);
        c = dictSize - 1;
        enlargeIn--;
        break;
      case 2:
        return result.join("");
    }

    if (enlargeIn === 0) {
      enlargeIn = Math.pow(2, numBits);
      numBits++;
    }

    if (dictionary[c]) {
      entry = dictionary[c];
    } else {
      if (c === dictSize) {
        entry = w + w.charAt(0);
      } else {
        return null;
      }
    }
    result.push(entry);

    dictionary[dictSize++] = w + entry.charAt(0);
    enlargeIn--;

    if (enlargeIn === 0) {
      enlargeIn = Math.pow(2, numBits);
      numBits++;
    }

    w = entry;
  }
}

function decompressFromBase64(input) {
  if (input == null) return "";
  if (input === "") return null;
  return _decompress(input.length, 32, function (index) {
    return getBaseValue(keyStrBase64, input.charAt(index));
  });
}

const compressed = `N4KAkARALgngDgUwgLgAQQQDwMYEMA2AlgCYBOuA7hADTgQBuCpAzoQPYB2KqATLZMzYBXUtiRoIACyhQ4zZAHoFAc0JRJQgEYA6bGwC2CgF7N6hbEcK4OCtptbErHALRY8RMpWdx8Q1TdIEfARcZgRmBShcZQUebQBGAA5tAGYaOiCEfQQOKGZuAG1wMFAwMogSbggAOQAJGAAGACkANgBWAEdEgFVCHJT9ACVJABFJAGlsdLLIWEQqwOwojmVg6fLMbmceBriG+IBOA5aW+J4eABYWlIB2fnKYLfiWi+0WxIOLm542q9v3lL3SAUEjqbjxG4XIFSBCEZTScEXQHFSDWVbiVANaHMKCkNgAawQAGE2Pg2KQqgBieIIGk09aQTS4bD45R4oQcYgkskUiS46zMOC4QK5BkQABmhHw+AAyrA1hJBB4xTi8YSAOqgyTcPgoiCqgkIOUwBXoJWVaHs+EccL5NDxaFsIXYNSPe0NLF6tnCOAASWIdtQBQAutDxeRsv7uBwhNLoYROVgqrgGmL2ZybcxA6UZtB4BiUiiAL7YhAIYjgs4fA6XG5taGMFjsLhoc4NpisTjVThicE8G43Bo1ut3PWEZgjTJQcvcXFCBDQzTCTkAUWC2VygZjcb1QjgxFw04r9pu7ySEJSbRuB2RuaIHHx0dj+GhZJZM7Q4oIYWKJeKOcgSoJGIHgV3iAArfcAH19GcfAACEABUADF1WwAAtacoCoaE5gxCBFmWdExU2NBnAheJUlPJJEgaD4ziORJoTdVBXkSZ5GO+U8DiHW9yhBYgwXtRI4g+C4b0Sd4eGOA4biYvVJFheEoHBNpKMuHgUhveIIV2EToTRU1PVzA1CW5ckqTpWkkEXZlWXTLlSQsvlyA4QVhRyFSwylWV5Xw80K2xXFDU1QTtVbIK1SNPyqgCtNhGtW1uGM8onWZV1wQ9aFvT3f1AxDMMIwQKM0G3F8x0TUj0FweJ4o5YhM2zFFZnzbhCxmP8TLLY9eH2C5xLU652ybThuBvYbOw4bsOF7e0jhSC54kvIaxwnKcP1QOcFz1Jd6rXLJPK3Z9oT3A8j3BU92PYut9niKE9XvR9SuOh62HfHqv3wH8yiLcBQzoXA4DgOVDwxHNoEU7IqiIZT1gYPoKHguycs5czeXQSlxSx7G4ewEQRSgX1p30OUorRyzrPpe4IDx0gCaJrIkZZFHHJ5Kp+TcoUCdx/HPIZ/RkJ841TX1UkLWKGnedyfnSZCrUdWp2n6eJ2XCWF/yxcCiWlb54nBgSyRGuSxWpcJ4mAHlnQy90UslundayZDOCgZDcH0KUWPrbXTf5p3chlQgjAxHYTft6XicQrAoAAQRhlt0GCcUvO9sOzayEHSBjum2AoRTcB6srQ+VrIV05aPs9zkIeogYU8RwlPi/0cu68Q1qJAcnnU99or9dNQuJeYbA8WlAANbgkQObRaNuJJIVPC41Opwfh/wABNStXkOBobniIdrmvcTR3KIw2AMbgAIYAh5x1X8i4doZlwapL28fuG2RIAOg51W33+IOUEDgNwL25Rf4AFk2DEAQKXXAmhggfW/NtEBpASDkzQBfeCpJq6kGUEyAAFDwCE1BeCEOIXcTE2g2gAEoxSDAQMoWMwoFg4NwPglIWJeBsKIZpdhDQKHUNvg3TyqsECWygM2I6O5yjhjdggWhiZkErHPnqHIMC4GzlIPOaE2AiCALQFtaEHAZHqM0XqYQUB7wYn0XqfQwpCSkGqEYvRGjEHlBsaQOx0DYEbS2gI1KmhwIICWMwGUhi4DgMgZ4tRn4EHU2ZGIxgiFT74CUbmPCsVMhLGbGKPGOIDCt3mM9SR5Q3yEngV9FxkBwwGBlBksRo1onlNfKEGOmSElJKfNKXxkBHDMFUcSZ2UdQE5CENwT631OoSilOEc+v0ixAA=`;

const result = decompressFromBase64(compressed);

if (!result) {
  console.error("Decompression failed");
  process.exit(1);
}

try {
  const data = JSON.parse(result);
  const elements = data.elements || [];
  const textElements = elements.filter(e => e.type === "text");

  console.log("TOTAL ELEMENTS:", elements.length);
  console.log("TEXT ELEMENTS:", textElements.length);
  console.log();

  if (textElements.length > 0) {
    console.log("=== TEXT CONTENT ===");
    textElements.forEach((te, i) => {
      const text = te.text || te.originalText || "";
      console.log(`[${i + 1}] ${text}`);
    });
  }

  console.log();
  const typeCounts = {};
  elements.forEach(e => {
    typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
  });
  console.log("=== ELEMENT TYPES ===");
  Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([t, c]) => console.log(`  ${t}: ${c}`));

} catch (e) {
  console.log("Raw output (not JSON):");
  console.log(result.substring(0, 5000));
}
