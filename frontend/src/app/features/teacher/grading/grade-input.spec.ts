import { fileSize, parseGrade } from './grade-input';

describe('parseGrade', () => {
  it.each([
    ['0', 100, 0],
    ['85', 100, 85],
    [' 100 ', 100, 100],
  ])('%s con máximo %s -> %s', (raw, max, expected) => expect(parseGrade(raw, max)).toBe(expected));

  it.each(['', '  ', '-1', '8.5', '8,5', 'abc', '1e2'])('rechaza «%s»', (raw) =>
    expect(parseGrade(raw, 100)).toBeNull(),
  );

  it('rechaza lo que pasa del máximo', () => {
    expect(parseGrade('101', 100)).toBeNull();
    expect(parseGrade('4', 3)).toBeNull();
  });
});

describe('fileSize', () => {
  it.each([
    [500, '500 B'],
    [2048, '2 KB'],
    [1_572_864, '1,5 MB'],
  ])('%s -> %s', (bytes, expected) => expect(fileSize(bytes)).toBe(expected));
});
