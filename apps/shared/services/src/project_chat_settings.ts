/**
 * The chat half of a project's configuration: the instructions every thread in
 * the project inherits, and the agent a new thread there starts with.
 *
 * Stored inside the existing `projects.settings` jsonb rather than in columns of
 * their own. Two reasons: `settings` is already the project's open-ended
 * configuration bag, and projects live in the CONTROL plane while chat threads
 * live in INTELLIGENCE — so this has to be readable through the project entity
 * that already crosses that boundary, not through a join.
 *
 * Everything here is pure: parse and merge only, no database. The routes own
 * persistence, and agent-intelligence reads the same parser through an injected
 * provider, so both sides agree on the shape without either importing the other.
 */

/**
 * Namespaced under one key so a future non-chat setting cannot collide with
 * `instructions` at the top of the bag.
 */
export const PROJECT_CHAT_SETTINGS_KEY = 'chat';

/**
 * Prepended to the system prompt of EVERY turn in the project, so its length is
 * a per-message token cost, not a one-off. Capped well below the 10k the other
 * project text fields allow because those are stored and displayed once.
 */
export const PROJECT_INSTRUCTIONS_MAX = 4_000;

export interface ProjectChatSettings {
  /** Null, never '' — an empty instruction block must not reach the prompt. */
  instructions: string | null;
  /** The agent a new thread in this project opens with. */
  defaultAgentId: string | null;
}

export const EMPTY_PROJECT_CHAT_SETTINGS: ProjectChatSettings = {
  instructions: null,
  defaultAgentId: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads a whitespace-only string as absent. Without this, a user who clears the
 * textarea but leaves a newline behind keeps injecting a blank block into every
 * system prompt forever.
 */
function readOptionalString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

/**
 * Pulls the chat settings out of a project's `settings` bag. Never throws and
 * never returns undefined fields: a malformed or absent bag reads as "no
 * settings", because a project that predates this feature is the normal case,
 * not an error.
 */
export function readProjectChatSettings(
  settings: Record<string, unknown> | null | undefined
): ProjectChatSettings {
  if (!isRecord(settings)) return { ...EMPTY_PROJECT_CHAT_SETTINGS };

  const chat = settings[PROJECT_CHAT_SETTINGS_KEY];
  if (!isRecord(chat)) return { ...EMPTY_PROJECT_CHAT_SETTINGS };

  return {
    instructions: readOptionalString(chat.instructions, PROJECT_INSTRUCTIONS_MAX),
    // Not validated as a uuid here: whether the agent exists and the caller can
    // reach it is an authorization question the route answers against the agent
    // store, which this module deliberately knows nothing about.
    defaultAgentId: readOptionalString(chat.defaultAgentId, 64),
  };
}

/**
 * Merges a partial update into the project's existing settings bag and returns
 * the WHOLE bag, ready to write back.
 *
 * A patch field that is absent leaves the stored value alone; an explicit null
 * clears it. Collapsing those two into one would make "don't touch the
 * instructions" indistinguishable from "delete the instructions", so a caller
 * updating only the default agent would silently wipe the instructions.
 */
export function writeProjectChatSettings(
  settings: Record<string, unknown> | null | undefined,
  patch: Partial<ProjectChatSettings>
): Record<string, unknown> {
  const base = isRecord(settings) ? settings : {};
  const current = readProjectChatSettings(base);

  const next: ProjectChatSettings = {
    instructions:
      patch.instructions === undefined
        ? current.instructions
        : readOptionalString(patch.instructions, PROJECT_INSTRUCTIONS_MAX),
    defaultAgentId:
      patch.defaultAgentId === undefined
        ? current.defaultAgentId
        : readOptionalString(patch.defaultAgentId, 64),
  };

  return {
    ...base,
    [PROJECT_CHAT_SETTINGS_KEY]: next,
  };
}
