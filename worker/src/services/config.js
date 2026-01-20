/**
 * Vault configuration loader
 * Loads classification config from _vault_context.md in R2
 * Falls back to defaults if config missing or invalid
 */

export const DEFAULT_CONFIG = {
  folders: {
    person: 'People',
    project: 'Projects',
    knowledge: 'Knowledge',
    action: '0-Inbox',
    capture: '0-Inbox',
    low_confidence: '0-Inbox'
  },
  topic_keywords: {},
  type_tags: {
    person: '#person',
    project: '#project',
    knowledge: '#knowledge',
    action: '#action',
    capture: '#capture',
    telegram: '#telegram',
    needs_review: '#needs-review'
  },
  thresholds: {
    high_confidence: 0.7,
    medium_confidence: 0.5
  }
};

/**
 * Load vault config from R2, merge with defaults
 * @param {Object} env - Cloudflare Worker environment with VAULT binding
 * @returns {Object} Merged config object
 */
export async function loadVaultConfig(env) {
  try {
    const file = await env.VAULT.get('_vault_context.md');
    if (!file) return DEFAULT_CONFIG;
    const content = await file.text();
    const parsed = parseConfig(content);
    return mergeConfigs(DEFAULT_CONFIG, parsed);
  } catch {
    return DEFAULT_CONFIG;
  }
}

/**
 * Parse markdown config file into structured object
 * @param {string} content - Raw markdown content
 * @returns {Object} Parsed config (partial, to be merged with defaults)
 */
export function parseConfig(content) {
  const config = {
    folders: {},
    topic_keywords: {},
    type_tags: {},
    thresholds: {}
  };

  let currentSection = null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    // Section header: ### Folders, ### Topic Keywords, etc.
    if (trimmed.startsWith('### ')) {
      currentSection = trimmed.slice(4).toLowerCase().replace(/ /g, '_');
      continue;
    }

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Key-value pair: key: value
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();

    if (!currentSection || !key || !value) continue;

    switch (currentSection) {
      case 'folders':
        // person_folder: People → folders.person = 'People'
        const folderKey = key.replace('_folder', '');
        config.folders[folderKey] = value;
        break;

      case 'topic_keywords':
        // genai: AI, LLM, RAG → topic_keywords.genai = ['ai', 'llm', 'rag']
        config.topic_keywords[key] = value
          .split(',')
          .map(s => s.trim().toLowerCase())
          .filter(s => s.length > 0);
        break;

      case 'type_tags':
        // person: #person → type_tags.person = '#person'
        config.type_tags[key] = value;
        break;

      case 'confidence_thresholds':
        // high_confidence: 0.7 → thresholds.high_confidence = 0.7
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          config.thresholds[key] = numValue;
        }
        break;
    }
  }

  return config;
}

/**
 * Deep merge parsed config into defaults
 * @param {Object} defaults - Default config
 * @param {Object} parsed - Parsed config (may be partial)
 * @returns {Object} Merged config
 */
function mergeConfigs(defaults, parsed) {
  return {
    folders: { ...defaults.folders, ...parsed.folders },
    topic_keywords: { ...defaults.topic_keywords, ...parsed.topic_keywords },
    type_tags: { ...defaults.type_tags, ...parsed.type_tags },
    thresholds: { ...defaults.thresholds, ...parsed.thresholds }
  };
}
