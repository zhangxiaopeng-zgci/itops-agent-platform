import { randomUUID } from 'crypto';
import db from '../models/database';

export interface SkillRecord {
  id: string;
  name: string;
  description: string | null;
  category: string;
  version: string;
  content: string;
  required_tools: string[];
  risk_notes: string | null;
  enabled: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface HermesChannelSkillRecord extends SkillRecord {
  binding_id: string;
  channel_id: string;
  skill_id: string;
  binding_enabled: number;
  binding_config: Record<string, unknown> | null;
  binding_created_at: string;
}

export interface SkillInput {
  name?: string;
  description?: string | null;
  category?: string;
  version?: string;
  content?: string;
  required_tools?: string[];
  risk_notes?: string | null;
  enabled?: boolean | number;
}

export interface SkillRuntimeContext {
  id: string;
  name: string;
  category: string;
  version: string;
  content: string;
  requiredTools: string[];
  riskNotes?: string | null;
}

export function listSkills(onlyEnabled = false): SkillRecord[] {
  const rows = db.prepare(`
    SELECT *
    FROM skills
    ${onlyEnabled ? 'WHERE enabled = 1' : ''}
    ORDER BY
      CASE category
        WHEN 'diagnosis' THEN 1
        WHEN 'remediation' THEN 2
        WHEN 'review' THEN 3
        ELSE 4
      END,
      name ASC
  `).all() as Array<Record<string, unknown>>;

  return rows.map(parseSkill);
}

export function getSkill(id: string): SkillRecord | null {
  const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? parseSkill(row) : null;
}

export function createSkill(input: SkillInput, createdBy?: string | null): SkillRecord {
  const id = randomUUID();
  const normalized = normalizeSkillInput(input, true);

  db.prepare(`
    INSERT INTO skills (
      id, name, description, category, version, content, required_tools,
      risk_notes, enabled, created_by, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    id,
    normalized.name,
    normalized.description,
    normalized.category,
    normalized.version,
    normalized.content,
    JSON.stringify(normalized.required_tools || []),
    normalized.risk_notes,
    normalized.enabled,
    createdBy || null
  );

  return getSkill(id)!;
}

export function updateSkill(id: string, input: SkillInput): SkillRecord {
  const current = getSkill(id);
  if (!current) {
    throw new Error('Skill Pack not found');
  }

  const normalized = normalizeSkillInput(input, false);
  const merged = {
    name: normalized.name ?? current.name,
    description: normalized.description !== undefined ? normalized.description : current.description,
    category: normalized.category ?? current.category,
    version: normalized.version ?? current.version,
    content: normalized.content ?? current.content,
    required_tools: normalized.required_tools ?? current.required_tools,
    risk_notes: normalized.risk_notes !== undefined ? normalized.risk_notes : current.risk_notes,
    enabled: normalized.enabled ?? current.enabled
  };

  db.prepare(`
    UPDATE skills
    SET name = ?,
        description = ?,
        category = ?,
        version = ?,
        content = ?,
        required_tools = ?,
        risk_notes = ?,
        enabled = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    merged.name,
    merged.description,
    merged.category,
    merged.version,
    merged.content,
    JSON.stringify(merged.required_tools),
    merged.risk_notes,
    merged.enabled,
    id
  );

  return getSkill(id)!;
}

export function listChannelSkills(channelId: string): HermesChannelSkillRecord[] {
  const rows = db.prepare(`
    SELECT
      s.*,
      hcs.id AS binding_id,
      hcs.channel_id,
      hcs.skill_id,
      hcs.enabled AS binding_enabled,
      hcs.config AS binding_config,
      hcs.created_at AS binding_created_at
    FROM hermes_channel_skills hcs
    INNER JOIN skills s ON s.id = hcs.skill_id
    WHERE hcs.channel_id = ?
    ORDER BY
      CASE s.category
        WHEN 'diagnosis' THEN 1
        WHEN 'remediation' THEN 2
        WHEN 'review' THEN 3
        ELSE 4
      END,
      s.name ASC
  `).all(channelId) as Array<Record<string, unknown>>;

  return rows.map(parseChannelSkill);
}

export function replaceChannelSkills(channelId: string, skillIds: string[]): void {
  const uniqueSkillIds = Array.from(new Set(skillIds.map((skillId) => skillId.trim()).filter(Boolean)));
  const existingSkills = new Set(listSkills().map((skill) => skill.id));
  const unknown = uniqueSkillIds.filter((skillId) => !existingSkills.has(skillId));
  if (unknown.length > 0) {
    throw new Error(`Unknown Skill Pack: ${unknown.join(', ')}`);
  }

  const deleteSkills = db.prepare('DELETE FROM hermes_channel_skills WHERE channel_id = ?');
  const insertSkill = db.prepare(`
    INSERT INTO hermes_channel_skills (id, channel_id, skill_id, enabled)
    VALUES (?, ?, ?, 1)
  `);

  const transaction = db.transaction(() => {
    deleteSkills.run(channelId);
    uniqueSkillIds.forEach((skillId) => {
      insertSkill.run(`${channelId}:${skillId}`, channelId, skillId);
    });
  });

  transaction();
}

export function toSkillRuntimeContext(skill: HermesChannelSkillRecord): SkillRuntimeContext {
  return {
    id: skill.id,
    name: skill.name,
    category: skill.category,
    version: skill.version,
    content: skill.content,
    requiredTools: skill.required_tools,
    riskNotes: skill.risk_notes
  };
}

function parseSkill(row: Record<string, unknown>): SkillRecord {
  return {
    id: String(row.id),
    name: String(row.name || ''),
    description: nullableString(row.description),
    category: String(row.category || 'general'),
    version: String(row.version || '1.0.0'),
    content: String(row.content || ''),
    required_tools: parseStringArray(row.required_tools),
    risk_notes: nullableString(row.risk_notes),
    enabled: Number(row.enabled ?? 1),
    created_by: nullableString(row.created_by),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || '')
  };
}

function parseChannelSkill(row: Record<string, unknown>): HermesChannelSkillRecord {
  return {
    ...parseSkill(row),
    binding_id: String(row.binding_id || ''),
    channel_id: String(row.channel_id || ''),
    skill_id: String(row.skill_id || row.id || ''),
    binding_enabled: Number(row.binding_enabled ?? 1),
    binding_config: parseJsonObject(row.binding_config),
    binding_created_at: String(row.binding_created_at || '')
  };
}

function normalizeSkillInput(input: SkillInput, requireName: boolean): SkillInput & { enabled?: number } {
  const normalized: SkillInput & { enabled?: number } = {};

  if (typeof input.name === 'string' && input.name.trim()) {
    normalized.name = input.name.trim();
  } else if (requireName) {
    throw new Error('Skill Pack name is required');
  }

  if ('description' in input) {
    normalized.description = typeof input.description === 'string' && input.description.trim()
      ? input.description.trim()
      : null;
  }

  if (typeof input.category === 'string' && input.category.trim()) {
    normalized.category = input.category.trim();
  } else if (requireName) {
    normalized.category = 'general';
  }

  if (typeof input.version === 'string' && input.version.trim()) {
    normalized.version = input.version.trim();
  } else if (requireName) {
    normalized.version = '1.0.0';
  }

  if (typeof input.content === 'string' && input.content.trim()) {
    normalized.content = input.content.trim();
  } else if (requireName) {
    throw new Error('Skill Pack content is required');
  }

  if (Array.isArray(input.required_tools)) {
    normalized.required_tools = input.required_tools.filter((tool): tool is string => typeof tool === 'string' && tool.trim().length > 0);
  } else if (requireName) {
    normalized.required_tools = [];
  }

  if ('risk_notes' in input) {
    normalized.risk_notes = typeof input.risk_notes === 'string' && input.risk_notes.trim()
      ? input.risk_notes.trim()
      : null;
  }

  if (input.enabled !== undefined) {
    normalized.enabled = input.enabled === true || input.enabled === 1 ? 1 : 0;
  } else if (requireName) {
    normalized.enabled = 1;
  }

  return normalized;
}

function parseStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  try {
    const parsed = JSON.parse(String(value)) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(String(value)) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
