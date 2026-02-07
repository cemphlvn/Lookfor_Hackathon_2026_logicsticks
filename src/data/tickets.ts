/**
 * Ticket Loader — Load and process historical tickets
 */

import { Ticket } from '../meta/intent-extractor';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Load tickets from data file
 */
export function loadTickets(): Ticket[] {
  try {
    const ticketPath = join(process.cwd(), 'data', 'tickets.json');
    const raw = readFileSync(ticketPath, 'utf-8');
    const tickets = JSON.parse(raw);

    // Normalize field names (conversationType vs ConversationType)
    return tickets.map((t: Record<string, unknown>) => ({
      conversationId: t.conversationId as string,
      customerId: t.customerId as string,
      createdAt: t.createdAt as string,
      ConversationType: (t.conversationType || t.ConversationType) as string,
      subject: t.subject as string,
      conversation: t.conversation as string
    }));
  } catch (error) {
    console.warn('[Tickets] Could not load tickets file:', error);
    return [];
  }
}

/**
 * Get sample tickets for quick testing
 */
export function getSampleTickets(count: number = 10): Ticket[] {
  const tickets = loadTickets();
  return tickets.slice(0, count);
}

/**
 * Extract common patterns from tickets
 */
export function analyzeTicketPatterns(tickets: Ticket[]): {
  commonSubjects: string[];
  commonIssues: string[];
  orderPatterns: string[];
} {
  const subjects = new Map<string, number>();
  const issues: string[] = [];
  const orderPatterns: string[] = [];

  for (const ticket of tickets) {
    // Count subjects
    const subjectKey = ticket.subject.toLowerCase().replace(/order #?\w+/gi, 'order #XXX');
    subjects.set(subjectKey, (subjects.get(subjectKey) || 0) + 1);

    // Extract issues from conversation
    const conv = ticket.conversation.toLowerCase();
    if (conv.includes('refund')) issues.push('refund');
    if (conv.includes('return')) issues.push('return');
    if (conv.includes('cancel')) issues.push('cancel');
    if (conv.includes('tracking') || conv.includes('where is')) issues.push('tracking');
    if (conv.includes('subscription')) issues.push('subscription');

    // Extract order patterns
    const orderMatches = ticket.conversation.match(/NP\d{7}|#\d{6,}/gi);
    if (orderMatches) {
      orderPatterns.push(...orderMatches);
    }
  }

  return {
    commonSubjects: Array.from(subjects.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([subject]) => subject),
    commonIssues: [...new Set(issues)],
    orderPatterns: [...new Set(orderPatterns.slice(0, 20))]
  };
}
