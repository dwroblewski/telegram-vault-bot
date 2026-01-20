import { describe, it, expect, vi } from 'vitest';
import { classifyCapture, FALLBACK_CLASSIFICATION, validateClassification } from '../../src/services/classifier.js';
import { DEFAULT_CONFIG } from '../../src/services/config.js';

describe('classifier', () => {
  it('returns valid schema on success', async () => {
    const mockGeminiResponse = {
      type: 'person',
      confidence: 0.85,
      title: 'Sarah - Acme Corp',
      topics: [],
      fields: { context: 'CTO', follow_ups: ['Send LinkedIn request'] }
    };

    const mockEnv = {
      AI: {
        run: vi.fn().mockResolvedValue({
          response: JSON.stringify(mockGeminiResponse)
        })
      }
    };

    const result = await classifyCapture('met sarah from acme corp today', mockEnv, DEFAULT_CONFIG);

    expect(result).toHaveProperty('type');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('title');
    expect(result).toHaveProperty('topics');
    expect(result).toHaveProperty('fields');
    expect(result.type).toBe('person');
    expect(result.confidence).toBe(0.85);
  });

  it('returns fallback on API error', async () => {
    const mockEnv = {
      AI: {
        run: vi.fn().mockRejectedValue(new Error('API timeout'))
      }
    };

    const result = await classifyCapture('some text', mockEnv, DEFAULT_CONFIG);

    expect(result.type).toBe('capture');
    expect(result.confidence).toBe(0);
    expect(result.title).toContain('Capture');
  });

  it('returns fallback on invalid JSON response', async () => {
    const mockEnv = {
      AI: {
        run: vi.fn().mockResolvedValue({
          response: 'not valid json at all'
        })
      }
    };

    const result = await classifyCapture('test text', mockEnv, DEFAULT_CONFIG);

    expect(result.type).toBe('capture');
    expect(result.confidence).toBe(0);
  });

  it('validates type is in allowed list', async () => {
    const mockGeminiResponse = {
      type: 'invalid_type',
      confidence: 0.9,
      title: 'Test',
      topics: [],
      fields: {}
    };

    const mockEnv = {
      AI: {
        run: vi.fn().mockResolvedValue({
          response: JSON.stringify(mockGeminiResponse)
        })
      }
    };

    const result = await classifyCapture('text', mockEnv, DEFAULT_CONFIG);

    // Should fallback to capture since type is invalid
    expect(['person', 'project', 'knowledge', 'action', 'capture']).toContain(result.type);
  });

  it('clamps confidence to 0-1 range', async () => {
    const mockGeminiResponse = {
      type: 'knowledge',
      confidence: 1.5,
      title: 'Test',
      topics: [],
      fields: {}
    };

    const mockEnv = {
      AI: {
        run: vi.fn().mockResolvedValue({
          response: JSON.stringify(mockGeminiResponse)
        })
      }
    };

    const result = await classifyCapture('text', mockEnv, DEFAULT_CONFIG);

    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });

  it('ensures topics is always an array', async () => {
    const mockGeminiResponse = {
      type: 'knowledge',
      confidence: 0.8,
      title: 'Test',
      topics: 'genai',  // Invalid: should be array
      fields: {}
    };

    const mockEnv = {
      AI: {
        run: vi.fn().mockResolvedValue({
          response: JSON.stringify(mockGeminiResponse)
        })
      }
    };

    const result = await classifyCapture('text', mockEnv, DEFAULT_CONFIG);

    expect(Array.isArray(result.topics)).toBe(true);
  });

  it('returns multi-topic classification', async () => {
    const mockGeminiResponse = {
      type: 'knowledge',
      confidence: 0.9,
      title: 'AI in Private Equity',
      topics: ['genai', 'pe'],
      fields: { one_liner: 'How AI transforms PE' }
    };

    const mockEnv = {
      AI: {
        run: vi.fn().mockResolvedValue({
          response: JSON.stringify(mockGeminiResponse)
        })
      }
    };

    const result = await classifyCapture('AI is transforming how PE firms do diligence', mockEnv, DEFAULT_CONFIG);

    expect(result.topics).toEqual(['genai', 'pe']);
  });

  it('includes prompt with config topic keywords', async () => {
    const config = {
      ...DEFAULT_CONFIG,
      topic_keywords: { genai: ['ai', 'llm'], career: ['job', 'interview'] }
    };

    const mockEnv = {
      AI: {
        run: vi.fn().mockResolvedValue({
          response: JSON.stringify({
            type: 'knowledge',
            confidence: 0.8,
            title: 'Test',
            topics: [],
            fields: {}
          })
        })
      }
    };

    await classifyCapture('test text', mockEnv, config);

    // Verify prompt was passed with topic keywords
    const promptArg = mockEnv.AI.run.mock.calls[0][1].prompt;
    expect(promptArg).toContain('genai:');
    expect(promptArg).toContain('career:');
  });
});

describe('validateClassification', () => {
  it('accepts valid classification', () => {
    const valid = {
      type: 'person',
      confidence: 0.8,
      title: 'Test Person',
      topics: [],
      fields: {}
    };

    const result = validateClassification(valid);
    expect(result).toBeTruthy();
    expect(result.type).toBe('person');
  });

  it('rejects missing type', () => {
    const invalid = {
      confidence: 0.8,
      title: 'Test',
      topics: [],
      fields: {}
    };

    const result = validateClassification(invalid);
    expect(result).toBe(null);
  });

  it('rejects invalid type', () => {
    const invalid = {
      type: 'invalid',
      confidence: 0.8,
      title: 'Test',
      topics: [],
      fields: {}
    };

    const result = validateClassification(invalid);
    expect(result).toBe(null);
  });

  it('provides default values for missing optional fields', () => {
    const minimal = {
      type: 'capture',
      confidence: 0.5
    };

    const result = validateClassification(minimal);
    expect(result).toBeTruthy();
    expect(result.title).toBeDefined();
    expect(result.topics).toEqual([]);
    expect(result.fields).toEqual({});
  });
});
