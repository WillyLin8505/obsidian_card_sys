// LZ-String decompressFromBase64 implementation
const keyStrBase64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

function getBaseValue(alphabet, character) {
  const idx = alphabet.indexOf(character);
  return idx;
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

const compressed = `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`;

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
