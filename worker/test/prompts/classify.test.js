import { describe, it, expect } from 'vitest';
import { buildClassifyPrompt } from '../../src/prompts/classify.js';

describe('classification prompt', () => {
  it('builds prompt with topic keywords injected', () => {
    const config = { topic_keywords: { genai: ['ai', 'llm'], career: ['job', 'interview'] } };
    const prompt = buildClassifyPrompt(config);
    expect(prompt).toContain('genai: ai, llm');
    expect(prompt).toContain('career: job, interview');
  });

  it('handles empty topic keywords', () => {
    const config = { topic_keywords: {} };
    const prompt = buildClassifyPrompt(config);
    expect(prompt).toContain('(none configured)');
  });

  it('never contains hardcoded personal data', () => {
    const config = { topic_keywords: { genai: ['ai'] } };
    const prompt = buildClassifyPrompt(config);
    // Privacy check - no personal identifiers
    expect(prompt.toLowerCase()).not.toContain('user');
    expect(prompt.toLowerCase()).not.toContain('company2');
    expect(prompt.toLowerCase()).not.toContain('company1');
    expect(prompt.toLowerCase()).not.toContain('owner');
  });

  it('includes all five classification types', () => {
    const config = { topic_keywords: {} };
    const prompt = buildClassifyPrompt(config);
    expect(prompt).toContain('person:');
    expect(prompt).toContain('project:');
    expect(prompt).toContain('knowledge:');
    expect(prompt).toContain('action:');
    expect(prompt).toContain('capture:');
  });

  it('specifies topics array output (not singular)', () => {
    const config = { topic_keywords: {} };
    const prompt = buildClassifyPrompt(config);
    expect(prompt).toContain('"topics"');
    expect(prompt).not.toMatch(/"topic":/);  // Should be topics, not topic
  });

  it('instructs to return ALL matching topics', () => {
    const config = { topic_keywords: {} };
    const prompt = buildClassifyPrompt(config);
    expect(prompt.toLowerCase()).toContain('all matching');
  });
});
