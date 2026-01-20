/**
 * Note templates for classified captures
 * Renders markdown notes with frontmatter and type-specific content
 * NO hardcoded personal data - all customization via config
 */

/**
 * Build tag list for a classified capture
 * @param {string} type - Classification type
 * @param {string[]} topics - Topic tags to include
 * @param {Object} config - Vault config with type_tags
 * @returns {string[]} Array of tags with # prefix
 */
export function buildTags(type, topics, config) {
  const tags = [];

  // Type tag
  const typeTag = config.type_tags?.[type] || `#${type}`;
  tags.push(typeTag);

  // Telegram source tag
  tags.push(config.type_tags?.telegram || '#telegram');

  // Topic tags
  for (const topic of topics) {
    tags.push(`#${topic}`);
  }

  // Needs-review for captures (low confidence default type)
  if (type === 'capture') {
    tags.push(config.type_tags?.needs_review || '#needs-review');
  }

  return tags;
}

/**
 * Render a complete note from classification
 * @param {Object} classification - Classification result
 * @param {string} rawText - Original capture text
 * @param {string} timestamp - ISO timestamp
 * @param {Object} config - Vault config
 * @returns {string} Complete markdown note
 */
export function renderNote(classification, rawText, timestamp, config) {
  const tags = buildTags(classification.type, classification.topics || [], config);
  const date = timestamp.split('T')[0];

  const parts = [];

  // Frontmatter
  parts.push('---');
  parts.push(`type: ${classification.type}`);
  parts.push(`confidence: ${classification.confidence}`);
  parts.push(`captured: ${date}`);
  parts.push(`tags: [${tags.map(t => t.replace('#', '')).join(', ')}]`);
  parts.push('---');
  parts.push('');

  // Tags line
  parts.push(tags.join(' '));
  parts.push('');

  // Title
  parts.push(`# ${classification.title}`);
  parts.push('');

  // Type-specific content
  const typeContent = renderTypeContent(classification);
  if (typeContent) {
    parts.push(typeContent);
    parts.push('');
  }

  // Raw capture in collapsible
  parts.push('<details>');
  parts.push('<summary>Original capture</summary>');
  parts.push('');
  parts.push(rawText);
  parts.push('');
  parts.push('</details>');
  parts.push('');

  // Footer
  parts.push('---');
  parts.push(`*Captured via Telegram: ${timestamp}*`);

  return parts.join('\n');
}

/**
 * Render type-specific content section
 * @param {Object} classification - Classification with fields
 * @returns {string|null} Type-specific markdown or null
 */
function renderTypeContent(classification) {
  const { type, fields } = classification;

  switch (type) {
    case 'person':
      return renderPersonContent(fields);

    case 'project':
      return renderProjectContent(fields);

    case 'knowledge':
      return renderKnowledgeContent(fields);

    case 'action':
      return renderActionContent(fields);

    case 'capture':
    default:
      return null;
  }
}

/**
 * Render person-specific content
 */
function renderPersonContent(fields) {
  const parts = [];

  if (fields?.context) {
    parts.push(`**Context**: ${fields.context}`);
  }

  if (fields?.follow_ups && fields.follow_ups.length > 0) {
    parts.push('');
    parts.push('## Follow-ups');
    for (const followUp of fields.follow_ups) {
      parts.push(`- [ ] ${followUp}`);
    }
  }

  return parts.length > 0 ? parts.join('\n') : null;
}

/**
 * Render project-specific content
 */
function renderProjectContent(fields) {
  const parts = [];

  if (fields?.status) {
    parts.push(`**Status**: ${fields.status}`);
  }

  if (fields?.next_action) {
    parts.push(`**Next action**: ${fields.next_action}`);
  }

  return parts.length > 0 ? parts.join('\n') : null;
}

/**
 * Render knowledge-specific content
 */
function renderKnowledgeContent(fields) {
  if (fields?.one_liner) {
    return `> ${fields.one_liner}`;
  }
  return null;
}

/**
 * Render action-specific content
 */
function renderActionContent(fields) {
  const parts = [];

  if (fields?.due_date) {
    parts.push(`**Due**: ${fields.due_date}`);
  }

  parts.push('');
  parts.push('- [ ] Complete this action');

  return parts.join('\n');
}
