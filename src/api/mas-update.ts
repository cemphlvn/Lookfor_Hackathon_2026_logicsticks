/**
 * Dynamic MAS Update — Side Quest
 *
 * Accept prompts to update MAS behavior dynamically.
 * Example: "If customer wants to update address, mark as NEEDS_ATTENTION and escalate"
 */

import { MASConfig, AgentConfig } from '../meta/agent-generator';

export interface MASUpdateRule {
  id: string;
  prompt: string;
  trigger: {
    keywords: string[];
    intent?: string;
  };
  action: {
    type: 'escalate' | 'block' | 'redirect' | 'modify_response';
    reason?: string;
    tag?: string;
    targetAgent?: string;
  };
  createdAt: string;
  active: boolean;
}

/**
 * Dynamic rule store
 */
class DynamicRuleStore {
  private rules: MASUpdateRule[] = [];

  /**
   * Parse a natural language update prompt into a rule
   */
  parsePrompt(prompt: string): MASUpdateRule | null {
    const promptLower = prompt.toLowerCase();

    // Extract trigger keywords
    const triggerPatterns = [
      /if\s+(?:a\s+)?customer\s+(?:wants?\s+to|asks?\s+to|requests?\s+to)\s+([^,]+)/i,
      /when\s+(?:a\s+)?customer\s+([^,]+)/i,
      /for\s+([^,]+)\s+requests?/i,
    ];

    let triggerKeywords: string[] = [];
    for (const pattern of triggerPatterns) {
      const match = prompt.match(pattern);
      if (match) {
        // Extract key words from the match
        const words = match[1].toLowerCase()
          .replace(/their|the|a|an|order|subscription/g, '')
          .trim()
          .split(/\s+/)
          .filter(w => w.length > 2);
        triggerKeywords = words;
        break;
      }
    }

    if (triggerKeywords.length === 0) {
      // Fallback: extract any nouns/verbs
      const words = promptLower
        .replace(/if|when|do not|don't|should|must|always|never|the|a|an/g, '')
        .split(/[^a-z]+/)
        .filter(w => w.length > 3);
      triggerKeywords = words.slice(0, 3);
    }

    // Determine action type
    let actionType: MASUpdateRule['action']['type'] = 'escalate';
    let reason = 'Dynamic rule triggered';
    let tag: string | undefined;

    if (promptLower.includes('escalate') || promptLower.includes('needs_attention')) {
      actionType = 'escalate';
      reason = 'Requires manual review per dynamic rule';
    }
    if (promptLower.includes('do not') || promptLower.includes("don't") || promptLower.includes('block')) {
      actionType = 'block';
      reason = 'Action blocked by dynamic rule';
    }
    if (promptLower.includes('redirect') || promptLower.includes('route to')) {
      actionType = 'redirect';
    }

    // Extract tag if mentioned
    const tagMatch = prompt.match(/mark\s+(?:as\s+)?['"]?([A-Z_]+)['"]?/i);
    if (tagMatch) {
      tag = tagMatch[1].toUpperCase();
    }

    return {
      id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      prompt,
      trigger: {
        keywords: triggerKeywords,
      },
      action: {
        type: actionType,
        reason,
        tag,
      },
      createdAt: new Date().toISOString(),
      active: true,
    };
  }

  /**
   * Add a rule from natural language prompt
   */
  addRule(prompt: string): MASUpdateRule | null {
    const rule = this.parsePrompt(prompt);
    if (rule) {
      this.rules.push(rule);
      console.log(`[MAS Update] Added rule: ${rule.id}`);
      console.log(`  Triggers: ${rule.trigger.keywords.join(', ')}`);
      console.log(`  Action: ${rule.action.type}${rule.action.tag ? ` (tag: ${rule.action.tag})` : ''}`);
    }
    return rule;
  }

  /**
   * Check if message matches any dynamic rule
   */
  checkMessage(message: string): MASUpdateRule | null {
    const msgLower = message.toLowerCase();

    for (const rule of this.rules) {
      if (!rule.active) continue;

      // Check if any trigger keywords match
      const matches = rule.trigger.keywords.filter(kw => msgLower.includes(kw));
      if (matches.length > 0) {
        console.log(`[MAS Update] Rule matched: ${rule.id}`);
        return rule;
      }
    }

    return null;
  }

  /**
   * Get all rules
   */
  getRules(): MASUpdateRule[] {
    return [...this.rules];
  }

  /**
   * Deactivate a rule
   */
  deactivateRule(ruleId: string): boolean {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) {
      rule.active = false;
      return true;
    }
    return false;
  }

  /**
   * Clear all rules
   */
  clear(): void {
    this.rules = [];
  }
}

// Singleton
export const dynamicRules = new DynamicRuleStore();

/**
 * Apply dynamic rules to a message before normal processing
 */
export function applyDynamicRules(message: string): {
  blocked: boolean;
  escalate: boolean;
  tag?: string;
  reason?: string;
  rule?: MASUpdateRule;
} {
  const matchedRule = dynamicRules.checkMessage(message);

  if (!matchedRule) {
    return { blocked: false, escalate: false };
  }

  return {
    blocked: matchedRule.action.type === 'block',
    escalate: matchedRule.action.type === 'escalate',
    tag: matchedRule.action.tag,
    reason: matchedRule.action.reason,
    rule: matchedRule,
  };
}
