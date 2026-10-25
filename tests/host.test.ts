import { expect, test } from 'vitest';
import { parseLevelParam } from '../src/host';

test('?level=N is a 1-based level index, ignored when out of range', () => {
  expect(parseLevelParam('?level=1', 8)).toBe(0);
  expect(parseLevelParam('?level=8', 8)).toBe(7);
  expect(parseLevelParam('?level=9', 8)).toBe(null);
  expect(parseLevelParam('?level=0', 8)).toBe(null);
  expect(parseLevelParam('?level=2.5', 8)).toBe(null);
  expect(parseLevelParam('?touch', 8)).toBe(null);
  expect(parseLevelParam('?stall=3', 8, 'stall')).toBe(2);
});
