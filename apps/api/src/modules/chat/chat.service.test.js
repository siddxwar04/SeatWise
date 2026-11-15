import { describe, expect, it } from 'vitest';
import { parseScope, stripRecommendedLine } from './chat.service.js';

describe('stripRecommendedLine', () => {
  it('hides the id line even when the model puts spaces after the commas', () => {
    const raw = 'Forno Nove fits your budget.  \nRECOMMENDED_IDS: a3fe51b4-999b, 81a02dd7-cac1';
    expect(stripRecommendedLine(raw)).toBe('Forno Nove fits your budget.');
  });
});

describe('concierge scope guard', () => {
  it('passes a dining reply through without its label', () => {
    const { scope, body } = parseScope('SCOPE: dining\nTry Forno Nove.\nRECOMMENDED_IDS: abc');
    expect(scope).toBe('dining');
    expect(body).toBe('Try Forno Nove.\nRECOMMENDED_IDS: abc');
  });

  it('recognises product questions', () => {
    expect(parseScope('scope: product\nSeatWise is a booking site.').scope).toBe('product');
  });

  it('flags an off-topic reply', () => {
    expect(parseScope('SCOPE: off_topic').scope).toBe('off_topic');
  });

  it('treats a reply with no label as off topic, discarding what the model wrote', () => {
    const result = parseScope('def add(a, b):\n    return a + b');
    expect(result).toEqual({ scope: 'off_topic', body: '' });
  });

  it('does not accept a label that is not on the first line', () => {
    expect(parseScope('Here is your code.\nSCOPE: dining').scope).toBe('off_topic');
  });

  it('rejects an unknown label', () => {
    expect(parseScope('SCOPE: anything_goes\nSure!').scope).toBe('off_topic');
  });
});
