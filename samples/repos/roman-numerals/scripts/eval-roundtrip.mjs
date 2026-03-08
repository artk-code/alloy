import { fromRoman, toRoman } from '../src/roman.js';

const checks = [
  [4, 'IV'],
  [9, 'IX'],
  [14, 'XIV'],
  [44, 'XLIV'],
  [90, 'XC'],
  [944, 'CMXLIV'],
  [1994, 'MCMXCIV'],
  [3999, 'MMMCMXCIX']
];

const failures = [];
for (const [value, numeral] of checks) {
  const encoded = toRoman(value);
  const decoded = fromRoman(numeral);
  if (encoded !== numeral) {
    failures.push(`toRoman(${value}) expected ${numeral} but received ${encoded}`);
  }
  if (decoded !== value) {
    failures.push(`fromRoman(${numeral}) expected ${value} but received ${decoded}`);
  }
}

for (let value = 1; value <= 50; value += 1) {
  const numeral = toRoman(value);
  const decoded = fromRoman(numeral);
  if (decoded !== value) {
    failures.push(`roundtrip ${value} -> ${numeral} -> ${decoded}`);
    break;
  }
}

if (failures.length > 0) {
  process.stderr.write(`Roman numeral evaluation failed on ${failures.length} check(s).\n`);
  process.stderr.write(failures.slice(0, 10).join('\n') + '\n');
  process.exit(1);
}

process.stdout.write('Roman numeral conversions match the canonical fixtures.\n');
