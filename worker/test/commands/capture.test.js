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

describe('capture handler (shadow mode)', () => {
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

  describe('shadow mode routing', () => {
    it('routes ALL captures to inbox in shadow mode', async () => {
      mockEnv.VAULT.get.mockResolvedValue(null);
      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          type: 'person',
          confidence: 0.85,
          title: 'Sarah - Acme Corp',
          topics: [],
          fields: { context: 'CTO' }
        })
      });

      await handleCapture(mockEnv, 123456, 789, 'met sarah from acme corp');

      // In shadow mode, even high confidence goes to inbox
      const putCalls = mockEnv.VAULT.put.mock.calls;
      const notePutCall = putCalls.find(c => !c[0].includes('_capture_log'));
      expect(notePutCall[0]).toMatch(/^0-Inbox\//);
    });

    it('logs intended destination in audit trail', async () => {
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

      const putCalls = mockEnv.VAULT.put.mock.calls;
      const auditPutCall = putCalls.find(c => c[0].includes('_capture_log'));
      expect(auditPutCall).toBeDefined();

      const logContent = auditPutCall[1];
      // Should have shadow_mode flag
      expect(logContent).toContain('"shadow_mode":true');
      // Should log intended destination
      expect(logContent).toContain('"intended_destination":"Knowledge/');
      // Actual destination should be inbox
      expect(logContent).toContain('"destination":"0-Inbox/');
    });

    it('sends shadow mode feedback with classification details', async () => {
      mockEnv.VAULT.get.mockResolvedValue(null);
      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          type: 'person',
          confidence: 0.85,
          title: 'Sarah CEO',
          topics: [],
          fields: {}
        })
      });

      await handleCapture(mockEnv, 123456, 789, 'met sarah');

      // Shadow mode sends detailed feedback
      expect(sendTelegram).toHaveBeenCalledWith(
        mockEnv, 123456,
        expect.stringContaining('Shadow')
      );
      expect(sendTelegram).toHaveBeenCalledWith(
        mockEnv, 123456,
        expect.stringContaining('person')
      );
      expect(sendTelegram).toHaveBeenCalledWith(
        mockEnv, 123456,
        expect.stringContaining('People/')
      );
    });

    it('includes confidence percentage in shadow feedback', async () => {
      mockEnv.VAULT.get.mockResolvedValue(null);
      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          type: 'knowledge',
          confidence: 0.85,
          title: 'Test',
          topics: [],
          fields: {}
        })
      });

      await handleCapture(mockEnv, 123456, 789, 'test');

      expect(sendTelegram).toHaveBeenCalledWith(
        mockEnv, 123456,
        expect.stringContaining('85%')
      );
    });

    it('includes topics in shadow feedback when present', async () => {
      mockEnv.VAULT.get.mockResolvedValue(null);
      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          type: 'knowledge',
          confidence: 0.9,
          title: 'AI in PE',
          topics: ['genai', 'pe'],
          fields: {}
        })
      });

      await handleCapture(mockEnv, 123456, 789, 'how PE uses AI');

      expect(sendTelegram).toHaveBeenCalledWith(
        mockEnv, 123456,
        expect.stringContaining('genai')
      );
    });
  });

  describe('classification accuracy tracking', () => {
    it('tracks person classification intended for People/', async () => {
      mockEnv.VAULT.get.mockResolvedValue(null);
      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          type: 'person',
          confidence: 0.85,
          title: 'Sarah - Acme',
          topics: [],
          fields: {}
        })
      });

      await handleCapture(mockEnv, 123456, 789, 'met sarah from acme');

      const auditContent = mockEnv.VAULT.put.mock.calls
        .find(c => c[0].includes('_capture_log'))[1];
      expect(auditContent).toContain('"intended_destination":"People/');
    });

    it('tracks knowledge classification intended for Knowledge/', async () => {
      mockEnv.VAULT.get.mockResolvedValue(null);
      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          type: 'knowledge',
          confidence: 0.85,
          title: 'TIL Transformers',
          topics: ['genai'],
          fields: {}
        })
      });

      await handleCapture(mockEnv, 123456, 789, 'TIL transformers');

      const auditContent = mockEnv.VAULT.put.mock.calls
        .find(c => c[0].includes('_capture_log'))[1];
      expect(auditContent).toContain('"intended_destination":"Knowledge/');
    });

    it('tracks project classification intended for Projects/', async () => {
      mockEnv.VAULT.get.mockResolvedValue(null);
      mockEnv.AI.run.mockResolvedValue({
        response: JSON.stringify({
          type: 'project',
          confidence: 0.8,
          title: 'Dashboard Widget',
          topics: [],
          fields: {}
        })
      });

      await handleCapture(mockEnv, 123456, 789, 'build dashboard widget');

      const auditContent = mockEnv.VAULT.put.mock.calls
        .find(c => c[0].includes('_capture_log'))[1];
      expect(auditContent).toContain('"intended_destination":"Projects/');
    });

    it('tracks low confidence intended for inbox', async () => {
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

      await handleCapture(mockEnv, 123456, 789, 'random text');

      const auditContent = mockEnv.VAULT.put.mock.calls
        .find(c => c[0].includes('_capture_log'))[1];
      expect(auditContent).toContain('"intended_destination":"0-Inbox/');
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
    it('uses custom folder in intended destination', async () => {
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

      // Audit log should show Contacts/ as intended destination
      const auditContent = mockEnv.VAULT.put.mock.calls
        .find(c => c[0].includes('_capture_log'))[1];
      expect(auditContent).toContain('"intended_destination":"Contacts/');
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

      for (const [path, content] of mockEnv.VAULT.put.mock.calls) {
        const lower = content.toLowerCase();
        expect(lower).not.toContain('user');
        expect(lower).not.toContain('company2');
        expect(lower).not.toContain('company1');
      }
    });
  });
});
