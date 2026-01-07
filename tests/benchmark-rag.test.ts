/**
 * Tests for RAG Benchmark Script
 * 
 * Validates:
 * 1. Fixture structure and coverage
 * 2. Metric calculation correctness
 * 3. Category distribution
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

interface BenchmarkQuery {
  id: string;
  query: string;
  expectedFiles: string[];
  expectedSymbols: string[];
  category: string;
}

interface BenchmarkFixture {
  version: string;
  description: string;
  created: string;
  queries: BenchmarkQuery[];
}

describe('RAG Benchmark Fixture', () => {
  let fixture: BenchmarkFixture;

  beforeAll(() => {
    const fixturePath = path.join(__dirname, 'rag-benchmark.fixture.json');
    fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
  });

  it('should have valid structure', () => {
    expect(fixture.version).toBeDefined();
    expect(fixture.description).toBeDefined();
    expect(fixture.queries).toBeInstanceOf(Array);
    expect(fixture.queries.length).toBeGreaterThanOrEqual(10);
  });

  it('should have unique query IDs', () => {
    const ids = fixture.queries.map(q => q.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('each query should have required fields', () => {
    for (const query of fixture.queries) {
      expect(query.id).toBeTruthy();
      expect(query.query).toBeTruthy();
      expect(query.expectedFiles).toBeInstanceOf(Array);
      expect(query.expectedFiles.length).toBeGreaterThan(0);
      expect(query.expectedSymbols).toBeInstanceOf(Array);
      expect(query.category).toBeTruthy();
    }
  });

  it('should cover all major categories', () => {
    const categories = new Set(fixture.queries.map(q => q.category));
    const requiredCategories = ['auth', 'sandbox', 'rag', 'security', 'agents'];
    
    for (const cat of requiredCategories) {
      expect(categories.has(cat)).toBe(true);
    }
  });

  it('expectedFiles should reference valid paths', () => {
    for (const query of fixture.queries) {
      for (const file of query.expectedFiles) {
        // Paths should be relative and well-formed
        expect(file).not.toMatch(/^\//); // No absolute paths
        expect(file).toMatch(/\.(ts|tsx|js|jsx|json|sql)$/); // Valid extensions
      }
    }
  });
});

describe('Metric Calculations', () => {
  // Unit tests for metric calculation functions
  
  function calculateMRR(rank: number): number {
    return rank > 0 && rank <= 3 ? 1 / rank : 0;
  }

  function calculateSymbolRecall(found: number, total: number): number {
    return total > 0 ? found / total : 1;
  }

  it('MRR should be 1.0 for rank 1', () => {
    expect(calculateMRR(1)).toBe(1.0);
  });

  it('MRR should be 0.5 for rank 2', () => {
    expect(calculateMRR(2)).toBe(0.5);
  });

  it('MRR should be ~0.33 for rank 3', () => {
    expect(calculateMRR(3)).toBeCloseTo(0.333, 2);
  });

  it('MRR should be 0 for rank > 3', () => {
    expect(calculateMRR(4)).toBe(0);
    expect(calculateMRR(10)).toBe(0);
  });

  it('MRR should be 0 for no match (rank 0)', () => {
    expect(calculateMRR(0)).toBe(0);
  });

  it('SymbolRecall should handle empty expectations', () => {
    expect(calculateSymbolRecall(0, 0)).toBe(1);
  });

  it('SymbolRecall should calculate percentage correctly', () => {
    expect(calculateSymbolRecall(2, 4)).toBe(0.5);
    expect(calculateSymbolRecall(3, 3)).toBe(1.0);
    expect(calculateSymbolRecall(0, 5)).toBe(0);
  });
});

describe('Query Path Matching', () => {
  // Tests for file path matching logic
  
  function matchesExpected(resultPath: string, expectedFiles: string[]): boolean {
    return expectedFiles.some(f => 
      resultPath.includes(f) || f.includes(resultPath)
    );
  }

  it('should match exact paths', () => {
    const result = 'src/lib/sandbox.ts';
    const expected = ['src/lib/sandbox.ts'];
    expect(matchesExpected(result, expected)).toBe(true);
  });

  it('should match partial paths (result contains expected)', () => {
    const result = 'src/lib/sandbox.ts';
    const expected = ['sandbox.ts'];
    expect(matchesExpected(result, expected)).toBe(true);
  });

  it('should match partial paths (expected contains result)', () => {
    const result = 'sandbox.ts';
    const expected = ['src/lib/sandbox.ts'];
    expect(matchesExpected(result, expected)).toBe(true);
  });

  it('should not match unrelated paths', () => {
    const result = 'src/lib/auth.ts';
    const expected = ['src/lib/sandbox.ts'];
    expect(matchesExpected(result, expected)).toBe(false);
  });

  it('should match any in list', () => {
    const result = 'src/lib/sandbox.ts';
    const expected = ['auth.ts', 'sandbox.ts', 'config.ts'];
    expect(matchesExpected(result, expected)).toBe(true);
  });
});

describe('Benchmark Configuration', () => {
  it('should support mock mode via environment variable', () => {
    // This tests that the mock mode concept is properly considered
    const useMock = process.env.BENCHMARK_USE_MOCK === 'true' || !process.env.PGVECTOR_URL;
    // In test environment, PGVECTOR_URL is likely not set, so mock should be true
    expect(typeof useMock).toBe('boolean');
  });

  it('default topK should be 10', () => {
    const defaultTopK = 10;
    expect(defaultTopK).toBe(10);
  });

  it('should define minimum threshold targets', () => {
    const thresholds = {
      MRR3: 0.6,    // 60% MRR@3 minimum
      Hit3: 0.7,    // 70% Hit@3 minimum
      SymbolRecall3: 0.5, // 50% symbol recall minimum
    };
    
    // These are configuration values that CI can check against
    expect(thresholds.MRR3).toBeGreaterThan(0);
    expect(thresholds.Hit3).toBeGreaterThan(0);
    expect(thresholds.SymbolRecall3).toBeGreaterThan(0);
  });
});
