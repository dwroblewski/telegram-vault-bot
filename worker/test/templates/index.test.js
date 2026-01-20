import { describe, it, expect } from 'vitest';
import { renderNote, buildTags } from '../../src/templates/index.js';
import { DEFAULT_CONFIG } from '../../src/services/config.js';

describe('renderNote', () => {
  const timestamp = '2026-01-20T12:00:00Z';

  it('renders person note with frontmatter', () => {
    const classification = {
      type: 'person',
      title: 'Sarah - Acme',
      confidence: 0.85,
      topics: [],
      fields: { context: 'CTO', follow_ups: ['Send LinkedIn request'] }
    };

    const note = renderNote(classification, 'met sarah from acme corp today', timestamp, DEFAULT_CONFIG);

    expect(note).toContain('---');
    expect(note).toContain('type: person');
    expect(note).toContain('confidence: 0.85');
    expect(note).toContain('# Sarah - Acme');
    expect(note).toContain('#person');
    expect(note).toContain('#telegram');
    expect(note).toContain('CTO');
  });

  it('renders knowledge note with one-liner', () => {
    const classification = {
      type: 'knowledge',
      title: 'TIL Transformers',
      confidence: 0.9,
      topics: ['genai'],
      fields: { one_liner: 'Attention is all you need' }
    };

    const note = renderNote(classification, 'TIL transformers use attention', timestamp, DEFAULT_CONFIG);

    expect(note).toContain('> Attention is all you need');
    expect(note).toContain('#knowledge');
    expect(note).toContain('#genai');
  });

  it('renders project note with status and next action', () => {
    const classification = {
      type: 'project',
      title: 'Build Dashboard Widget',
      confidence: 0.8,
      topics: [],
      fields: { status: 'active', next_action: 'Create mockup' }
    };

    const note = renderNote(classification, 'build the dashboard widget by friday', timestamp, DEFAULT_CONFIG);

    expect(note).toContain('**Status**: active');
    expect(note).toContain('**Next action**: Create mockup');
    expect(note).toContain('#project');
  });

  it('renders action note with due date', () => {
    const classification = {
      type: 'action',
      title: 'Buy Milk',
      confidence: 0.75,
      topics: [],
      fields: { due_date: '2026-01-21' }
    };

    const note = renderNote(classification, 'remember to buy milk', timestamp, DEFAULT_CONFIG);

    expect(note).toContain('**Due**: 2026-01-21');
    expect(note).toContain('#action');
  });

  it('renders capture note with minimal fields', () => {
    const classification = {
      type: 'capture',
      title: 'Random Thought',
      confidence: 0.3,
      topics: [],
      fields: {}
    };

    const note = renderNote(classification, 'some random thought', timestamp, DEFAULT_CONFIG);

    expect(note).toContain('# Random Thought');
    expect(note).toContain('#capture');
    expect(note).toContain('#needs-review');
  });

  it('includes raw text in collapsible section', () => {
    const classification = {
      type: 'knowledge',
      title: 'Test',
      confidence: 0.8,
      topics: [],
      fields: {}
    };

    const rawText = 'this is the original raw capture text';
    const note = renderNote(classification, rawText, timestamp, DEFAULT_CONFIG);

    expect(note).toContain('<details>');
    expect(note).toContain('Original capture');
    expect(note).toContain(rawText);
    expect(note).toContain('</details>');
  });

  it('includes captured timestamp', () => {
    const classification = {
      type: 'capture',
      title: 'Test',
      confidence: 0.5,
      topics: [],
      fields: {}
    };

    const note = renderNote(classification, 'test', timestamp, DEFAULT_CONFIG);

    expect(note).toContain('captured: 2026-01-20');
  });

  it('renders multi-topic tags', () => {
    const classification = {
      type: 'knowledge',
      title: 'AI in PE',
      confidence: 0.9,
      topics: ['genai', 'pe'],
      fields: {}
    };

    const note = renderNote(classification, 'how PE firms use AI', timestamp, DEFAULT_CONFIG);

    expect(note).toContain('#genai');
    expect(note).toContain('#pe');
  });

  it('never contains hardcoded personal data', () => {
    const classification = {
      type: 'person',
      title: 'Test Person',
      confidence: 0.8,
      topics: [],
      fields: { context: 'test context' }
    };

    const note = renderNote(classification, 'test text', timestamp, DEFAULT_CONFIG);

    expect(note.toLowerCase()).not.toContain('user');
    expect(note.toLowerCase()).not.toContain('company2');
    expect(note.toLowerCase()).not.toContain('company1');
    expect(note.toLowerCase()).not.toContain('owner');
  });
});

describe('buildTags', () => {
  it('includes type tag', () => {
    const tags = buildTags('person', [], DEFAULT_CONFIG);
    expect(tags).toContain('#person');
  });

  it('includes telegram tag', () => {
    const tags = buildTags('capture', [], DEFAULT_CONFIG);
    expect(tags).toContain('#telegram');
  });

  it('includes topic tags when present', () => {
    const tags = buildTags('knowledge', ['genai', 'pe'], DEFAULT_CONFIG);
    expect(tags).toContain('#genai');
    expect(tags).toContain('#pe');
  });

  it('includes needs-review for low confidence captures', () => {
    const tags = buildTags('capture', [], DEFAULT_CONFIG);
    expect(tags).toContain('#needs-review');
  });

  it('does not include needs-review for typed classifications', () => {
    const tags = buildTags('person', [], DEFAULT_CONFIG);
    expect(tags).not.toContain('#needs-review');
  });

  it('uses config type_tags when available', () => {
    const config = {
      ...DEFAULT_CONFIG,
      type_tags: {
        ...DEFAULT_CONFIG.type_tags,
        person: '#contact'  // Custom tag
      }
    };
    const tags = buildTags('person', [], config);
    expect(tags).toContain('#contact');
  });
});
