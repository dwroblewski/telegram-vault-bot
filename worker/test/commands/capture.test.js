import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCapture } from '../../src/commands/capture.js';

// Mock dependencies
vi.mock('../../src/services/telegram.js', () => ({
  sendTelegram: vi.fn().mockResolvedValue(undefined),
  reactToMessage: vi.fn().mockResolvedValue(undefined),
  alertOnError: vi.fn()
}));

vi.mock('../../src/services/github.js', () => ({
  notifyGitHub: vi.fn().mockResolvedValue(undefined)
}));

import { sendTelegram, reactToMessage } from '../../src/services/telegram.js';

describe('capture handler', () => {
  let mockEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-20T12:00:00Z'));

    mockEnv = {
      VAULT: {
        get: vi.fn(),
        put: vi.fn().mockResolvedValue(undefined)
      },
      AI: {
        run: vi.fn()
      }
    };
  });

  describe('high confidence classification', () => {
    it('routes person capture to People/ folder', async () => {
      // Mock config - no custom config, use defaults
      mockEnv.VAULT.get.mockImplementation((key) => {
        if (key === '_vault_context.md') return null;
        if (key === '0-Inbox/_capture_log.jsonl') return null;
        return null;
      });

      // Mock Gemini response
      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          type: 'person',
          confidence: 0.85,
          title: 'Sarah - Acme Corp',
          topics: [],
          fields: { context: 'CTO at Acme', follow_ups: ['Connect on LinkedIn'] }
        })
      });

      await handleCapture(mockEnv, 123456, 789, 'met sarah from acme corp today');

      // Check R2 put was called with People/ path
      const putCalls = mockEnv.VAULT.put.mock.calls;
      const notePutCall = putCalls.find(c => c[0].startsWith('People/'));
      expect(notePutCall).toBeDefined();
      expect(notePutCall[0]).toMatch(/^People\/.*\.md$/);
    });

    it('sends thumbs up only for high confidence', async () => {
      mockEnv.VAULT.get.mockResolvedValue(null);
      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          type: 'knowledge',
          confidence: 0.9,
          title: 'AI Insight',
          topics: ['genai'],
          fields: {}
        })
      });

      await handleCapture(mockEnv, 123456, 789, 'interesting AI fact');

      expect(reactToMessage).toHaveBeenCalledWith(
        mockEnv, 123456, 789, '👍'
      );
      // Should NOT send text message for high confidence
      expect(sendTelegram).not.toHaveBeenCalled();
    });
  });

  describe('medium confidence classification', () => {
    it('routes to typed folder but sends confirmation', async () => {
      mockEnv.VAULT.get.mockResolvedValue(null);
      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          type: 'project',
          confidence: 0.6,
          title: 'Dashboard Widget',
          topics: [],
          fields: { status: 'planning' }
        })
      });

      await handleCapture(mockEnv, 123456, 789, 'build dashboard widget');

      // Check routed to Projects/
      const putCalls = mockEnv.VAULT.put.mock.calls;
      const notePutCall = putCalls.find(c => c[0].startsWith('Projects/'));
      expect(notePutCall).toBeDefined();

      // Should send confirmation message
      expect(sendTelegram).toHaveBeenCalledWith(
        mockEnv, 123456,
        expect.stringContaining('project')
      );
    });
  });

  describe('low confidence classification', () => {
    it('routes to inbox with hint message', async () => {
      mockEnv.VAULT.get.mockResolvedValue(null);
      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          type: 'capture',
          confidence: 0.3,
          title: 'Random Note',
          topics: [],
          fields: {}
        })
      });

      await handleCapture(mockEnv, 123456, 789, 'some random text');

      // Check routed to 0-Inbox/
      const putCalls = mockEnv.VAULT.put.mock.calls;
      const notePutCall = putCalls.find(c => c[0].startsWith('0-Inbox/') && !c[0].includes('_capture_log'));
      expect(notePutCall).toBeDefined();

      // Should send hint message
      expect(sendTelegram).toHaveBeenCalledWith(
        mockEnv, 123456,
        expect.stringContaining('Inbox')
      );
    });
  });

  describe('folder routing', () => {
    it('routes knowledge to Knowledge/ folder', async () => {
      mockEnv.VAULT.get.mockResolvedValue(null);
      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          type: 'knowledge',
          confidence: 0.85,
          title: 'TIL Transformers',
          topics: ['genai'],
          fields: { one_liner: 'Attention is all you need' }
        })
      });

      await handleCapture(mockEnv, 123456, 789, 'TIL transformers use attention');

      const putCalls = mockEnv.VAULT.put.mock.calls;
      const notePutCall = putCalls.find(c => c[0].startsWith('Knowledge/'));
      expect(notePutCall).toBeDefined();
    });

    it('routes action to 0-Inbox/ folder', async () => {
      mockEnv.VAULT.get.mockResolvedValue(null);
      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          type: 'action',
          confidence: 0.8,
          title: 'Buy Milk',
          topics: [],
          fields: { due_date: '2026-01-21' }
        })
      });

      await handleCapture(mockEnv, 123456, 789, 'remember to buy milk');

      const putCalls = mockEnv.VAULT.put.mock.calls;
      const notePutCall = putCalls.find(c => c[0].startsWith('0-Inbox/') && !c[0].includes('_capture_log'));
      expect(notePutCall).toBeDefined();
    });
  });

  describe('audit logging', () => {
    it('logs every capture to audit trail', async () => {
      mockEnv.VAULT.get.mockResolvedValue(null);
      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          type: 'capture',
          confidence: 0.5,
          title: 'Test',
          topics: [],
          fields: {}
        })
      });

      await handleCapture(mockEnv, 123456, 789, 'test text');

      // Check audit log was written
      const putCalls = mockEnv.VAULT.put.mock.calls;
      const auditPutCall = putCalls.find(c => c[0].includes('_capture_log.jsonl'));
      expect(auditPutCall).toBeDefined();

      const logContent = auditPutCall[1];
      expect(logContent).toContain('"telegram_msg_id":789');
    });

    it('logs errors when classification fails', async () => {
      mockEnv.VAULT.get.mockResolvedValue(null);
      mockEnv.AI.run.mockRejectedValue(new Error('API timeout'));

      await handleCapture(mockEnv, 123456, 789, 'test text');

      const putCalls = mockEnv.VAULT.put.mock.calls;
      const auditPutCall = putCalls.find(c => c[0].includes('_capture_log.jsonl'));
      expect(auditPutCall).toBeDefined();

      const logContent = auditPutCall[1];
      expect(logContent).toContain('"error"');
    });
  });

  describe('error handling', () => {
    it('falls back to basic capture on API error', async () => {
      mockEnv.VAULT.get.mockResolvedValue(null);
      mockEnv.AI.run.mockRejectedValue(new Error('API timeout'));

      await handleCapture(mockEnv, 123456, 789, 'test text');

      // Should still save to inbox
      const putCalls = mockEnv.VAULT.put.mock.calls;
      const notePutCall = putCalls.find(c => c[0].startsWith('0-Inbox/') && !c[0].includes('_capture_log'));
      expect(notePutCall).toBeDefined();
    });
  });

  describe('config integration', () => {
    it('uses custom folder from config', async () => {
      // Mock custom config
      mockEnv.VAULT.get.mockImplementation((key) => {
        if (key === '_vault_context.md') {
          return {
            text: () => `### Folders
person_folder: Contacts`
          };
        }
        return null;
      });

      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          type: 'person',
          confidence: 0.9,
          title: 'John Doe',
          topics: [],
          fields: {}
        })
      });

      await handleCapture(mockEnv, 123456, 789, 'met john doe');

      const putCalls = mockEnv.VAULT.put.mock.calls;
      const notePutCall = putCalls.find(c => c[0].startsWith('Contacts/'));
      expect(notePutCall).toBeDefined();
    });
  });

  describe('privacy', () => {
    it('never contains hardcoded personal data in output', async () => {
      mockEnv.VAULT.get.mockResolvedValue(null);
      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          type: 'capture',
          confidence: 0.5,
          title: 'Test',
          topics: [],
          fields: {}
        })
      });

      await handleCapture(mockEnv, 123456, 789, 'test text');

      // Check all put calls
      for (const [path, content] of mockEnv.VAULT.put.mock.calls) {
        const lower = content.toLowerCase();
        expect(lower).not.toContain('user');
        expect(lower).not.toContain('company2');
        expect(lower).not.toContain('company1');
      }
    });
  });
});
