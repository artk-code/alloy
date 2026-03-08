export function fizzbuzzLine(value) {
  if (value % 3 === 0) {
    return 'Fizz';
  }
  if (value % 5 === 0) {
    return 'Buzz';
  }
  if (value % 15 === 0) {
    return 'FizzBuzz';
  }
  return String(value);
}

export function generateFizzBuzz(limit = 100) {
  const lines = [];
  for (let value = 1; value <= limit; value += 1) {
    lines.push(fizzbuzzLine(value));
  }
  return lines;
}
