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

const compressed = `N4IgLgngDgpiBcIYA8DGBDANgSwCYCd0B3EAGhADcZ8BnbAewDsEAmcm+gV31TkQAswYKDXgB6MQHNsYfpwBGAOlT0AtmIBeNCtlQbs6RmPry6uA4wC0KDDgLFLUTJ2lH8MTDHQ0YNMWHRJMRZFAEYADkUWMiRPVRhGMBoEAG0AXXJ0KCgAZQCwPlBJfDwc7A0+Rk5MTHIdGCIAIXRUAGtirkZcAGF6THp8BBAAYgAzcYmQAF8poA===`;

const result = decompressFromBase64(compressed);

if (!result) {
  console.error("Decompression failed - returned null/empty");
  process.exit(1);
}

console.log("=== RAW DECOMPRESSED LENGTH ===");
console.log(result.length);
console.log();

try {
  const data = JSON.parse(result);
  console.log("=== SUCCESSFULLY PARSED JSON ===");
  console.log();

  const elements = data.elements || [];
  const textElements = elements.filter(e => e.type === "text");

  console.log(`=== TOTAL ELEMENTS: ${elements.length} ===`);
  console.log(`=== TEXT ELEMENTS: ${textElements.length} ===`);
  console.log();

  if (textElements.length > 0) {
    console.log("=== TEXT CONTENT ===");
    textElements.forEach((te, i) => {
      const text = te.text || te.originalText || "";
      console.log(`  [${i + 1}] ${text}`);
    });
    console.log();
  }

  const typeCounts = {};
  elements.forEach(e => {
    typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
  });
  console.log("=== ELEMENT TYPE SUMMARY ===");
  Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([t, c]) => console.log(`  ${t}: ${c}`));
  console.log();

  console.log("=== FULL DECOMPRESSED JSON ===");
  console.log(JSON.stringify(data, null, 2));
} catch (e) {
  console.log("=== NOT VALID JSON - RAW OUTPUT ===");
  console.log(result);
}
