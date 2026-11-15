import { describe, expect, it } from 'vitest';
import { smallTalkReply } from './chat.service.js';

describe('greetings and thanks', () => {
  it.each(['hii', 'Hi!', 'hello', 'Hey there', 'Good evening', 'namaste 🙏'])(
    'greets back: %s',
    (message) => {
      expect(smallTalkReply(message)).toMatch(/^Hi! I can help you find a restaurant/);
    },
  );

  it.each(['thanks', 'Thank you so much!', 'ok', 'great'])('acknowledges: %s', (message) => {
    expect(smallTalkReply(message)).toMatch(/welcome/);
  });

  it('explains itself when asked for help', () => {
    expect(smallTalkReply('what can you do?')).toMatch(/SeatWise concierge/);
  });

  it.each([
    'hi, write python code to add two numbers',
    'hello can you do my homework',
    'Italian for two tonight',
    'thanks, now book me a table near Baner',
    '',
  ])('is not small talk, so it goes through the normal checks: %s', (message) => {
    expect(smallTalkReply(message)).toBeNull();
  });
});
