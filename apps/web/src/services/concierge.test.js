import { describe, expect, it } from 'vitest';
import {
  ask,
  classifyScope,
  CONCIERGE_PROMPTS,
  OFF_TOPIC_REPLY,
  parseIntent,
} from './concierge.js';

const scopeOf = (message) => classifyScope(message, parseIntent(message, 'pune'));

describe('concierge scope', () => {
  it.each([
    'write code for a basic program adding two numbers',
    'Write a python function for 2 numbers now',
    'what is the capital of France',
    'solve this equation for me',
    'tell me a joke',
    'give me a recipe for butter chicken',
  ])('declines off-topic: %s', (message) => {
    expect(scopeOf(message)).toBe('off_topic');
  });

  it.each(CONCIERGE_PROMPTS)('accepts its own suggested prompt: %s', (message) => {
    expect(scopeOf(message)).toBe('dining');
  });

  it.each(['somewhere under 1500 for a date', 'Table for 4 tonight', 'best biryani near me'])(
    'accepts dining: %s',
    (message) => {
      expect(scopeOf(message)).toBe('dining');
    },
  );

  it.each([
    'What is SeatWise?',
    'How does the waitlist work?',
    'how do I book a table',
    'What problem does this solve for restaurant owners?',
  ])('answers product question: %s', (message) => {
    expect(scopeOf(message)).toBe('product');
  });

  it('returns the redirect and no restaurants for an off-topic message', async () => {
    const result = await ask('write code to add two numbers');
    expect(result.reply).toBe(OFF_TOPIC_REPLY);
    expect(result.venues).toEqual([]);
  });

  it('explains the product without recommending restaurants', async () => {
    const result = await ask('what is seatwise');
    expect(result.reply).toMatch(/table-booking/);
    expect(result.venues).toEqual([]);
  });
});
