import { describe, expect, it } from 'vitest';
import {
  PROJECT_INSTRUCTIONS_MAX,
  readProjectChatSettings,
  writeProjectChatSettings,
} from '../../project_chat_settings.js';

const AGENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_AGENT_ID = '22222222-2222-4222-8222-222222222222';

describe('readProjectChatSettings', () => {
  it('reads a project that predates chat settings as empty rather than failing', () => {
    expect(readProjectChatSettings(undefined)).toEqual({
      instructions: null,
      defaultAgentId: null,
    });
    expect(readProjectChatSettings(null)).toEqual({ instructions: null, defaultAgentId: null });
    expect(readProjectChatSettings({})).toEqual({ instructions: null, defaultAgentId: null });
  });

  it('ignores a malformed chat key instead of throwing', () => {
    expect(readProjectChatSettings({ chat: 'nonsense' })).toEqual({
      instructions: null,
      defaultAgentId: null,
    });
    expect(readProjectChatSettings({ chat: [] })).toEqual({
      instructions: null,
      defaultAgentId: null,
    });
  });

  it('reads whitespace-only instructions as absent', () => {
    // Otherwise clearing the textarea but leaving a newline keeps injecting an
    // empty "Project instructions:" block into every system prompt.
    expect(readProjectChatSettings({ chat: { instructions: '   \n  ' } }).instructions).toBeNull();
  });

  it('trims and returns stored values', () => {
    expect(
      readProjectChatSettings({
        chat: { instructions: '  Be terse.  ', defaultAgentId: `  ${AGENT_ID}  ` },
      })
    ).toEqual({ instructions: 'Be terse.', defaultAgentId: AGENT_ID });
  });

  it('truncates instructions at the cap', () => {
    const long = 'x'.repeat(PROJECT_INSTRUCTIONS_MAX + 500);
    expect(readProjectChatSettings({ chat: { instructions: long } }).instructions).toHaveLength(
      PROJECT_INSTRUCTIONS_MAX
    );
  });
});

describe('writeProjectChatSettings', () => {
  it('preserves unrelated keys in the settings bag', () => {
    // `settings` is the project's whole configuration bag; writing only the chat
    // key would drop everything else stored alongside it.
    const next = writeProjectChatSettings(
      { theme: 'dark', budget: { cap: 10 } },
      { instructions: 'Be terse.' }
    );

    expect(next.theme).toBe('dark');
    expect(next.budget).toEqual({ cap: 10 });
  });

  it('leaves a field alone when the patch omits it', () => {
    const stored = writeProjectChatSettings(
      {},
      { instructions: 'Be terse.', defaultAgentId: AGENT_ID }
    );

    const next = writeProjectChatSettings(stored, { defaultAgentId: OTHER_AGENT_ID });

    expect(readProjectChatSettings(next)).toEqual({
      instructions: 'Be terse.',
      defaultAgentId: OTHER_AGENT_ID,
    });
  });

  it('clears a field on an explicit null', () => {
    const stored = writeProjectChatSettings(
      {},
      { instructions: 'Be terse.', defaultAgentId: AGENT_ID }
    );

    const next = writeProjectChatSettings(stored, { instructions: null });

    expect(readProjectChatSettings(next)).toEqual({
      instructions: null,
      defaultAgentId: AGENT_ID,
    });
  });

  it('distinguishes an omitted field from an explicit null', () => {
    // The whole reason both are accepted: collapsing them would make "update
    // only the agent" silently wipe the instructions.
    const stored = writeProjectChatSettings({}, { instructions: 'Keep me.' });

    expect(readProjectChatSettings(writeProjectChatSettings(stored, {})).instructions).toBe(
      'Keep me.'
    );
    expect(
      readProjectChatSettings(writeProjectChatSettings(stored, { instructions: null })).instructions
    ).toBeNull();
  });
});
