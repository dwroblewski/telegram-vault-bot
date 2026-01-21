import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logCapture, LOG_PATH } from '../../src/services/audit.js';

describe('audit logger', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-20T12:00:00Z'));
  });

  it('appends entry to existing log', async () => {
    const existingLog = '{"ts":"2026-01-19T10:00:00Z","telegram_msg_id":100}\n';
    const mockEnv = {
      VAULT: {
        get: vi.fn().mockResolvedValue({ text: () => existingLog }),
        put: vi.fn().mockResolvedValue(undefined)
      }
    };

    await logCapture(mockEnv, {
      telegramMsgId: 123,
      raw: 'test text',
      classification: { type: 'capture', confidence: 0.5, title: 'Test', topics: [], fields: {} },
      destination: '0-Inbox/test.md',
      tags: ['#capture'],
      error: null
    });

    expect(mockEnv.VAULT.put).toHaveBeenCalled();
    const [path, content] = mockEnv.VAULT.put.mock.calls[0];

    // Should contain existing entry
    expect(content).toContain('"telegram_msg_id":100');
    // Should contain new entry
    expect(content).toContain('"telegram_msg_id":123');
    // Each entry on its own line
    expect(content.trim().split('\n').length).toBe(2);
  });

  it('creates new log if none exists', async () => {
    const mockEnv = {
      VAULT: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined)
      }
    };

    await logCapture(mockEnv, {
      telegramMsgId: 456,
      raw: 'new capture',
      classification: { type: 'person', confidence: 0.85, title: 'Sarah', topics: [], fields: {} },
      destination: 'People/Sarah.md',
      tags: ['#person'],
      error: null
    });

    const [path, content] = mockEnv.VAULT.put.mock.calls[0];
    expect(path).toBe(LOG_PATH);
    expect(content).toContain('"telegram_msg_id":456');
  });

  it('logs errors with error field', async () => {
    const mockEnv = {
      VAULT: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined)
      }
    };

    await logCapture(mockEnv, {
      telegramMsgId: 789,
      raw: 'failed text',
      classification: null,
      destination: null,
      tags: [],
      error: 'Gemini API timeout'
    });

    const content = mockEnv.VAULT.put.mock.calls[0][1];
    const logged = JSON.parse(content.trim());
    expect(logged.error).toBe('Gemini API timeout');
    expect(logged.classification).toBe(null);
  });

  it('includes timestamp in each entry', async () => {
    const mockEnv = {
      VAULT: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined)
      }
    };

    await logCapture(mockEnv, {
      telegramMsgId: 111,
      raw: 'test',
      classification: { type: 'capture', confidence: 0.5, title: 'Test', topics: [], fields: {} },
      destination: '0-Inbox/test.md',
      tags: ['#capture'],
      error: null
    });

    const content = mockEnv.VAULT.put.mock.calls[0][1];
    const logged = JSON.parse(content.trim());
    expect(logged.ts).toBe('2026-01-20T12:00:00.000Z');
  });

  it('includes full classification object', async () => {
    const classification = {
      type: 'knowledge',
      confidence: 0.9,
      title: 'AI Insight',
      topics: ['genai', 'pe'],
      fields: { one_liner: 'AI transforms PE' }
    };

    const mockEnv = {
      VAULT: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined)
      }
    };

    await logCapture(mockEnv, {
      telegramMsgId: 222,
      raw: 'some AI PE insight',
      classification,
      destination: 'Knowledge/AI Insight.md',
      tags: ['#knowledge', '#genai', '#pe'],
      error: null
    });

    const content = mockEnv.VAULT.put.mock.calls[0][1];
    const logged = JSON.parse(content.trim());
    expect(logged.classification).toEqual(classification);
    expect(logged.classification.topics).toEqual(['genai', 'pe']);
  });

  it('stores destination path', async () => {
    const mockEnv = {
      VAULT: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined)
      }
    };

    await logCapture(mockEnv, {
      telegramMsgId: 333,
      raw: 'test',
      classification: { type: 'person', confidence: 0.8, title: 'John', topics: [], fields: {} },
      destination: 'People/John.md',
      tags: ['#person'],
      error: null
    });

    const content = mockEnv.VAULT.put.mock.calls[0][1];
    const logged = JSON.parse(content.trim());
    expect(logged.destination).toBe('People/John.md');
  });

  it('stores tags array', async () => {
    const mockEnv = {
      VAULT: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined)
      }
    };

    await logCapture(mockEnv, {
      telegramMsgId: 444,
      raw: 'test',
      classification: { type: 'knowledge', confidence: 0.85, title: 'Test', topics: ['genai'], fields: {} },
      destination: 'Knowledge/Test.md',
      tags: ['#knowledge', '#telegram', '#genai'],
      error: null
    });

    const content = mockEnv.VAULT.put.mock.calls[0][1];
    const logged = JSON.parse(content.trim());
    expect(logged.tags).toEqual(['#knowledge', '#telegram', '#genai']);
  });

  it('handles R2 read errors gracefully', async () => {
    const mockEnv = {
      VAULT: {
        get: vi.fn().mockRejectedValue(new Error('R2 read failed')),
        put: vi.fn().mockResolvedValue(undefined)
      }
    };

    // Should not throw, should create new log
    await logCapture(mockEnv, {
      telegramMsgId: 555,
      raw: 'test',
      classification: { type: 'capture', confidence: 0.5, title: 'Test', topics: [], fields: {} },
      destination: '0-Inbox/test.md',
      tags: ['#capture'],
      error: null
    });

    expect(mockEnv.VAULT.put).toHaveBeenCalled();
  });

  it('never contains hardcoded personal data', async () => {
    const mockEnv = {
      VAULT: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined)
      }
    };

    await logCapture(mockEnv, {
      telegramMsgId: 666,
      raw: 'generic test',
      classification: { type: 'capture', confidence: 0.5, title: 'Test', topics: [], fields: {} },
      destination: '0-Inbox/test.md',
      tags: ['#capture'],
      error: null
    });

    const content = mockEnv.VAULT.put.mock.calls[0][1];
    // Privacy check - audit log only contains data from input
    expect(content).toContain('generic test'); // From input
    expect(content).toContain('0-Inbox/test.md'); // From input
    expect(content).not.toMatch(/Areas\//); // No hardcoded folder paths
  });
});
