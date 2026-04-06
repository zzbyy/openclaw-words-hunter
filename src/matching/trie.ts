export interface TrieMatch {
  canonical: string;     // key in mastery.json
  matchedForm: string;   // the actual form found in text
  type: 'direct' | 'synonym';
  synonym?: string;      // only for type:'synonym'
  tokenStart: number;    // index into token array
  tokenEnd: number;      // exclusive end index
}

interface LeafData {
  canonical: string;
  form: string;
  type: 'direct' | 'synonym';
  synonym?: string;
}

interface TrieNode {
  children: Map<string, TrieNode>;
  leaves: LeafData[];
}

function createNode(): TrieNode {
  return { children: new Map(), leaves: [] };
}

export class MatchTrie {
  private root = createNode();

  /**
   * Insert a canonical word with all its searchable forms.
   * Each token sequence maps back to the canonical word.
   */
  insert(canonical: string, forms: string[], type: 'direct' | 'synonym', synonym?: string): void {
    for (const form of forms) {
      const tokens = form.toLowerCase().split(/\s+/);
      let node = this.root;
      for (const token of tokens) {
        let child = node.children.get(token);
        if (!child) {
          child = createNode();
          node.children.set(token, child);
        }
        node = child;
      }
      node.leaves.push({ canonical, form, type, synonym });
    }
  }

  /**
   * Search tokenized text for all matches.
   * Handles multi-word phrases via greedy longest-match.
   * Returns all matches (caller deduplicates).
   */
  search(tokens: string[]): TrieMatch[] {
    const matches: TrieMatch[] = [];

    for (let i = 0; i < tokens.length; i++) {
      let node = this.root;
      let lastMatch: { leaves: LeafData[]; end: number } | null = null;

      for (let j = i; j < tokens.length; j++) {
        const child = node.children.get(tokens[j]);
        if (!child) break;
        node = child;
        if (node.leaves.length > 0) {
          lastMatch = { leaves: node.leaves, end: j + 1 };
        }
      }

      // Emit longest match from this position
      if (lastMatch) {
        for (const leaf of lastMatch.leaves) {
          matches.push({
            canonical: leaf.canonical,
            matchedForm: leaf.form,
            type: leaf.type,
            synonym: leaf.synonym,
            tokenStart: i,
            tokenEnd: lastMatch.end,
          });
        }
      }
    }

    return matches;
  }
}
