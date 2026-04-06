import { describe, it, expect } from 'vitest';
import { tokenize } from '../../src/matching/tokenizer.js';

describe('tokenizer', () => {
  it('splits basic words and lowercases', () => {
    expect(tokenize('Hello World')).toEqual(['hello', 'world']);
  });

  it('preserves hyphens within words', () => {
    expect(tokenize('co-opt the plan')).toEqual(['co-opt', 'the', 'plan']);
  });

  it('preserves apostrophes within words', () => {
    const tokens = tokenize("I don't know");
    expect(tokens).toEqual(['i', "don't", 'know']);
  });

  it('strips surrounding punctuation', () => {
    expect(tokenize('Hello, world!')).toEqual(['hello', 'world']);
    expect(tokenize('"posit" this.')).toEqual(['posit', 'this']);
  });

  it('handles empty string', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('handles punctuation-only input', () => {
    expect(tokenize('!!! ...')).toEqual([]);
  });

  it('handles mixed case', () => {
    expect(tokenize('I POSIT That')).toEqual(['i', 'posit', 'that']);
  });

  it('handles numbers in words', () => {
    expect(tokenize('web3 is here')).toEqual(['web3', 'is', 'here']);
  });
});
