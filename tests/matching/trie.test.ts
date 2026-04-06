import { describe, it, expect } from 'vitest';
import { MatchTrie } from '../../src/matching/trie.js';

describe('MatchTrie', () => {
  it('finds a single-word match', () => {
    const trie = new MatchTrie();
    trie.insert('posit', ['posit', 'posits', 'posited'], 'direct');

    const matches = trie.search(['i', 'posited', 'that']);
    expect(matches).toHaveLength(1);
    expect(matches[0].canonical).toBe('posit');
    expect(matches[0].matchedForm).toBe('posited');
    expect(matches[0].type).toBe('direct');
  });

  it('finds multi-word phrase', () => {
    const trie = new MatchTrie();
    trie.insert('take for granted', ['take for granted'], 'direct');

    const matches = trie.search(['don\'t', 'take', 'for', 'granted']);
    expect(matches).toHaveLength(1);
    expect(matches[0].canonical).toBe('take for granted');
    expect(matches[0].tokenStart).toBe(1);
    expect(matches[0].tokenEnd).toBe(4);
  });

  it('returns empty for no matches', () => {
    const trie = new MatchTrie();
    trie.insert('posit', ['posit', 'posits'], 'direct');

    const matches = trie.search(['no', 'match', 'here']);
    expect(matches).toHaveLength(0);
  });

  it('handles synonym matches', () => {
    const trie = new MatchTrie();
    trie.insert('posit', ['suggest', 'suggests'], 'synonym', 'suggest');

    const matches = trie.search(['i', 'suggest', 'that']);
    expect(matches).toHaveLength(1);
    expect(matches[0].canonical).toBe('posit');
    expect(matches[0].type).toBe('synonym');
    expect(matches[0].synonym).toBe('suggest');
  });

  it('finds multiple matches in one message', () => {
    const trie = new MatchTrie();
    trie.insert('posit', ['posit'], 'direct');
    trie.insert('ephemeral', ['ephemeral'], 'direct');

    const matches = trie.search(['i', 'posit', 'that', 'ephemeral', 'fame']);
    expect(matches).toHaveLength(2);
    expect(matches.map(m => m.canonical).sort()).toEqual(['ephemeral', 'posit']);
  });

  it('prefers longest match for phrases', () => {
    const trie = new MatchTrie();
    trie.insert('take', ['take'], 'direct');
    trie.insert('take for granted', ['take for granted'], 'direct');

    const matches = trie.search(['take', 'for', 'granted']);
    // Longest match wins — "take for granted" is emitted, not bare "take"
    expect(matches).toHaveLength(1);
    expect(matches[0].canonical).toBe('take for granted');
  });
});
