import { describe, expect, it } from 'vitest';
import type { AgentSkill } from '@uaip/types';
import {
  renderSkillsPromptSection,
  selectEnabledSkills,
  skillsRevision,
} from '../../user_l_l_m_service';
import { ContextManager } from '../../context-manager/context_manager';

const makeSkill = (overrides: Partial<AgentSkill> = {}): AgentSkill => ({
  name: 'incident-triage',
  description: 'Triage production incidents',
  content: '1. Check dashboards\n2. Identify blast radius',
  source: 'inline',
  enabled: true,
  ...overrides,
});

describe('selectEnabledSkills', () => {
  it('returns an empty list when skills are undefined', () => {
    expect(selectEnabledSkills(undefined)).toEqual([]);
  });

  it('keeps skills whose enabled flag is omitted', () => {
    const skill = makeSkill({ enabled: undefined });
    expect(selectEnabledSkills([skill])).toEqual([skill]);
  });

  it('drops explicitly disabled skills', () => {
    const enabled = makeSkill({ name: 'kept' });
    const disabled = makeSkill({ name: 'dropped', enabled: false });
    expect(selectEnabledSkills([enabled, disabled])).toEqual([enabled]);
  });
});

describe('renderSkillsPromptSection', () => {
  it('renders nothing when there are no skills', () => {
    expect(renderSkillsPromptSection([])).toBe('');
  });

  it('includes the skill name, description and full SKILL.md body', () => {
    const section = renderSkillsPromptSection([makeSkill()]);

    expect(section).toContain('SKILLS:');
    expect(section).toContain('--- SKILL: incident-triage ---');
    expect(section).toContain('Triage production incidents');
    expect(section).toContain('1. Check dashboards');
    expect(section).toContain('2. Identify blast radius');
  });

  it('lists allowedTools only when the skill restricts them', () => {
    const withTools = renderSkillsPromptSection([makeSkill({ allowedTools: ['bash', 'grep'] })]);
    expect(withTools).toContain('Tools permitted while applying this skill: bash, grep');

    const withoutTools = renderSkillsPromptSection([makeSkill()]);
    expect(withoutTools).not.toContain('Tools permitted');
  });

  it('renders every skill in order', () => {
    const section = renderSkillsPromptSection([
      makeSkill({ name: 'first' }),
      makeSkill({ name: 'second' }),
    ]);

    expect(section.indexOf('--- SKILL: first ---')).toBeLessThan(
      section.indexOf('--- SKILL: second ---')
    );
  });
});

describe('skillsRevision', () => {
  it('is undefined when there are no skills so the cache key stays the plain agent id', () => {
    expect(skillsRevision([])).toBeUndefined();
  });

  it('is stable for identical skills', () => {
    expect(skillsRevision([makeSkill()])).toBe(skillsRevision([makeSkill()]));
  });

  it('changes when a skill body is edited', () => {
    const before = skillsRevision([makeSkill()]);
    const after = skillsRevision([makeSkill({ content: 'totally different instructions' })]);
    expect(after).not.toBe(before);
  });

  it('changes when a skill is renamed', () => {
    const before = skillsRevision([makeSkill()]);
    const after = skillsRevision([makeSkill({ name: 'renamed' })]);
    expect(after).not.toBe(before);
  });
});

describe('persona prompt cache keying', () => {
  it('does not serve a stale prompt after skills change', () => {
    const manager = new ContextManager();
    const agentId = 'agent-1';

    const original = [makeSkill()];
    manager.cachePersonaPrompt(agentId, 'PROMPT WITH ORIGINAL SKILL', skillsRevision(original));

    const edited = [makeSkill({ content: 'edited instructions' })];
    expect(manager.getCachedPersonaPrompt(agentId, skillsRevision(edited))).toBeUndefined();
    expect(manager.getCachedPersonaPrompt(agentId, skillsRevision(original))).toBe(
      'PROMPT WITH ORIGINAL SKILL'
    );
  });

  it('still caches by plain agent id when the agent has no skills', () => {
    const manager = new ContextManager();
    manager.cachePersonaPrompt('agent-2', 'PLAIN PROMPT', skillsRevision([]));
    expect(manager.getCachedPersonaPrompt('agent-2', skillsRevision([]))).toBe('PLAIN PROMPT');
    expect(manager.getCachedPersonaPrompt('agent-2')).toBe('PLAIN PROMPT');
  });
});
