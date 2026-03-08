const SYMBOLS = [
  [1000, 'M'],
  [500, 'D'],
  [100, 'C'],
  [50, 'L'],
  [10, 'X'],
  [5, 'V'],
  [1, 'I']
];

const VALUES = new Map([
  ['I', 1],
  ['V', 5],
  ['X', 10],
  ['L', 50],
  ['C', 100],
  ['D', 500],
  ['M', 1000]
]);

export function toRoman(value) {
  if (!Number.isInteger(value) || value <= 0 || value >= 4000) {
    throw new RangeError('Roman numerals only support integers from 1 to 3999.');
  }

  let remainder = value;
  let result = '';
  for (const [amount, symbol] of SYMBOLS) {
    while (remainder >= amount) {
      result += symbol;
      remainder -= amount;
    }
  }
  return result;
}

export function fromRoman(input) {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new TypeError('Roman numeral input must be a non-empty string.');
  }

  const roman = input.trim().toUpperCase();
  let total = 0;
  for (const symbol of roman) {
    const value = VALUES.get(symbol);
    if (!value) {
      throw new TypeError(`Invalid Roman numeral symbol: ${symbol}`);
    }
    total += value;
  }
  return total;
}
