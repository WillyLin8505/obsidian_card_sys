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

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const zlib = require('zlib');

const compressed = 'N4IgLgngDgpiBcIYA8DGBDANgSwCYCd0B3EAGhADcZ8BnbAewDsEAmcm+gV31TkQAswYKDXgB6MQHNsYfpwBGAOlT0AtmIBeNCtlQbs6RmPry6uA4wC0KDDgLFLUTJ2lH8MTDHQ0YNMWHRJMRZFAEYADkUWMiRPVRhGMBoEAG0AXXJ0KCgAZQCwPlBJfDwc7A0+Rk5MTHIdGCIAIXRUAGtirkZcAGF6THp8BBAAYgAzcYmQAF8poA===';

console.log("=== Method 1: LZ-String decompressFromBase64 ===");
const lzResult = decompressFromBase64(compressed);
if (lzResult && lzResult.length > 0) {
  console.log("SUCCESS! Length:", lzResult.length);
  console.log();
  try {
    const parsed = JSON.parse(lzResult);
    console.log(JSON.stringify(parsed, null, 2));
  } catch {
    console.log("(Not valid JSON, raw output:)");
    console.log(lzResult);
  }
} else {
  console.log("LZ-String returned null/empty, trying zlib methods...");
  console.log();

  const buf = Buffer.from(compressed, 'base64');

  const methods = [
    ['inflate', () => zlib.inflateSync(buf)],
    ['inflateRaw', () => zlib.inflateRawSync(buf)],
    ['gunzip', () => zlib.gunzipSync(buf)],
    ['brotli', () => zlib.brotliDecompressSync(buf)],
  ];

  let success = false;
  for (const [name, fn] of methods) {
    try {
      const result = fn();
      const text = result.toString('utf8');
      console.log(`=== Method 2: zlib ${name} - SUCCESS ===`);
      console.log("Length:", text.length);
      console.log();
      try {
        const parsed = JSON.parse(text);
        console.log(JSON.stringify(parsed, null, 2));
      } catch {
        console.log("(Not valid JSON, raw output:)");
        console.log(text);
      }
      success = true;
      break;
    } catch (e) {
      console.log(`${name} failed: ${e.message}`);
    }
  }

  if (!success) {
    console.log();
    console.log("All decompression methods failed.");
    console.log("First 40 hex bytes:", buf.toString('hex').substring(0, 80));
    console.log("Buffer length:", buf.length);
  }
}
