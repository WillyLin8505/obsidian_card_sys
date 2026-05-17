const zlib = require('zlib');
const compressed = 'N4IgLgngDgpiBcIYA8DGBDANgSwCYCd0B3EAGhADcZ8BnbAewDsEAmcm+gV31TkQAswYKDXgB6MQHNsYfpwBGAOlT0AtmIBeNCtlQbs6RmPry6uA4wC0KDDgLFLUTJ2lH8MTDHQ0YNMWHRJMRZFAEYADkUWMiRPVRhGMBoEAG0AXXJ0KCgAZQCwPlBJfDwc7A0+Rk5MTHIdGCIAIXRUAGtirkZcAGF6THp8BBAAYgAzcYmQAF8poA===';
const buf = Buffer.from(compressed, 'base64');

try {
  const result = zlib.inflateSync(buf);
  console.log('INFLATE:', result.toString('utf-8'));
} catch(e) {
  console.log('inflate failed:', e.message);
}

try {
  const result = zlib.inflateRawSync(buf);
  console.log('INFLATE_RAW:', result.toString('utf-8'));
} catch(e) {
  console.log('inflateRaw failed:', e.message);
}

try {
  const result = zlib.gunzipSync(buf);
  console.log('GUNZIP:', result.toString('utf-8'));
} catch(e) {
  console.log('gunzip failed:', e.message);
}

console.log('First 40 hex bytes:', buf.toString('hex').substring(0, 80));
console.log('Buffer length:', buf.length);
