import { describe, it, expect } from 'vitest';
import { loadVaultConfig, parseConfig, DEFAULT_CONFIG } from '../../src/services/config.js';

describe('config loader', () => {
  it('returns default config when file missing', async () => {
    const mockEnv = { VAULT: { get: () => null } };
    const config = await loadVaultConfig(mockEnv);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('returns default config when VAULT.get throws', async () => {
    const mockEnv = { VAULT: { get: () => { throw new Error('R2 error'); } } };
    const config = await loadVaultConfig(mockEnv);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('parses folder mappings', () => {
    const content = `### Folders
person_folder: People
project_folder: Projects
knowledge_folder: Knowledge`;
    const config = parseConfig(content);
    expect(config.folders.person).toBe('People');
    expect(config.folders.project).toBe('Projects');
    expect(config.folders.knowledge).toBe('Knowledge');
  });

  it('parses topic keywords as lowercase arrays', () => {
    const content = `### Topic Keywords
genai: AI, LLM, RAG
career: job, interview, networking`;
    const config = parseConfig(content);
    expect(config.topic_keywords.genai).toEqual(['ai', 'llm', 'rag']);
    expect(config.topic_keywords.career).toEqual(['job', 'interview', 'networking']);
  });

  it('parses confidence thresholds as numbers', () => {
    const content = `### Confidence Thresholds
high_confidence: 0.7
medium_confidence: 0.5`;
    const config = parseConfig(content);
    expect(config.thresholds.high_confidence).toBe(0.7);
    expect(config.thresholds.medium_confidence).toBe(0.5);
  });

  it('parses type tags', () => {
    const content = `### Type Tags
person: #person
knowledge: #knowledge`;
    const config = parseConfig(content);
    expect(config.type_tags.person).toBe('#person');
    expect(config.type_tags.knowledge).toBe('#knowledge');
  });

  it('merges parsed config with defaults', async () => {
    const content = `### Folders
person_folder: CustomPeople`;
    const mockEnv = {
      VAULT: {
        get: () => ({ text: () => content })
      }
    };
    const config = await loadVaultConfig(mockEnv);
    // Custom value
    expect(config.folders.person).toBe('CustomPeople');
    // Default values preserved
    expect(config.folders.project).toBe('Projects');
    expect(config.type_tags.person).toBe('#person');
  });
});
