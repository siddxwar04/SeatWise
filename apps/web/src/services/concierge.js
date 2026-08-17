/**
 * The concierge: natural-language search.
 *
 * With `VITE_LIVE_API=true` this posts to `/chat`, which is a real RAG pipeline
 * (pgvector + embeddings) that already exists in the API.
 *
 * Without it, the same intents are parsed locally — budget, cuisine, party size,
 * area, occasion, timing — and answered from the fixture market. This is not
 * pretending to be an LLM: it is an intent parser, it says what it understood,
 * and the value it demonstrates is the *interface* (ask in a sentence, get
 * bookable results) rather than the generation.
 */

import { CITIES, CUISINES } from '../data/cities.js';
import { delay, LIVE_API } from './config.js';
import { chatApi } from '../lib/api.js';
import { searchVenues } from './marketplace.js';

const OCCASION_HINTS = [
  { keys: ['date', 'romantic', 'anniversary'], zones: ['BOOTH', 'OUTDOOR'], copy: 'quiet enough to talk' },
  { keys: ['birthday', 'group', 'friends', 'party'], minSeats: 6, copy: 'room for a group' },
  { keys: ['business', 'client', 'work'], zones: ['PRIVATE', 'BOOTH'], copy: 'private enough for a meeting' },
  { keys: ['solo', 'alone', 'myself'], zones: ['COUNTER'], copy: 'good to eat at alone' },
];

/** Pulls structured intent out of a sentence. */
export function parseIntent(message, fallbackCity) {
  const text = message.toLowerCase();

  const budgetMatch = text.match(/(?:under|below|less than|upto|up to)\s*₹?\s*(\d{3,5})/);
  const budget = budgetMatch ? Number(budgetMatch[1]) : null;

  const partyMatch = text.match(/(?:for|party of|table for)\s*(\d{1,2})/);
  const party = partyMatch ? Math.min(12, Number(partyMatch[1])) : null;

  const cuisine = CUISINES.find((c) => text.includes(c.toLowerCase()));

  const city = CITIES.find((c) => text.includes(c.name.toLowerCase()))?.slug ?? fallbackCity;
  const area = CITIES.flatMap((c) => c.areas).find((a) => text.includes(a.toLowerCase()));

  const occasion = OCCASION_HINTS.find((o) => o.keys.some((k) => text.includes(k)));

  const tonight = /tonight|now|right now|next hour/.test(text);
  const outdoor = /outdoor|terrace|garden|rooftop|outside/.test(text);
  const counter = /counter|omakase|chef'?s table|tasting/.test(text);
  const walkIn = /walk[- ]?in|no booking|without booking/.test(text);

  return { budget, party, cuisine, city, area, occasion, tonight, outdoor, counter, walkIn };
}

/** Budget in rupees per head → the price bands that fit under it. */
function bandsUnder(budget) {
  const ceilings = { 1: 700, 2: 1500, 3: 3000, 4: Infinity };
  return [1, 2, 3, 4].filter((band) => ceilings[band] <= budget * 1.15);
}

function describe(intent) {
  const parts = [];
  if (intent.cuisine) parts.push(intent.cuisine.toLowerCase());
  if (intent.occasion) parts.push(intent.occasion.copy);
  if (intent.budget) parts.push(`under ₹${intent.budget.toLocaleString('en-IN')} a head`);
  if (intent.area) parts.push(`in ${intent.area}`);
  if (intent.party) parts.push(`for ${intent.party}`);
  if (intent.tonight) parts.push('tonight');
  if (intent.outdoor) parts.push('outdoors');
  return parts;
}

export async function ask(message, history = [], { city = 'pune' } = {}) {
  if (LIVE_API) {
    const data = await chatApi.send(message, history);
    return { reply: data.reply, venues: data.restaurants ?? [], intent: null };
  }

  await delay(760);

  const intent = parseIntent(message, city);
  const quick = [
    intent.tonight && 'tonight',
    intent.outdoor && 'outdoor',
    intent.counter && 'counter',
    intent.walkIn && 'walkin',
    (intent.party ?? 0) >= 6 && 'group',
  ].filter(Boolean);

  const { venues } = await searchVenues({
    city: intent.city,
    cuisines: intent.cuisine ? [intent.cuisine] : [],
    areas: intent.area ? [intent.area] : [],
    prices: intent.budget ? bandsUnder(intent.budget) : [],
    party: intent.party ?? 2,
    quick,
    sort: 'relevance',
  });

  const top = venues.slice(0, 3);
  const understood = describe(intent);

  // Empty results get a *useful* reply — which constraint to relax — rather than
  // "no results found", because the whole point of asking in a sentence is not
  // having to guess which filter was too strict.
  if (top.length === 0) {
    const blocker = intent.budget
      ? `nothing ${intent.cuisine ? `${intent.cuisine.toLowerCase()} ` : ''}under ₹${intent.budget}`
      : 'nothing matching all of that';
    return {
      reply: `I found ${blocker}${intent.area ? ` in ${intent.area}` : ''}. Loosen the budget by about ₹500, or drop the area filter and I will look across the city.`,
      venues: [],
      intent,
    };
  }

  const lead = understood.length
    ? `Looking for ${understood.join(', ')} — here are the three best fits.`
    : 'Here are three that fit.';

  const availability = top[0].slotsNear.length
    ? ` ${top[0].name} has ${top[0].slotsNear.length} slot${top[0].slotsNear.length === 1 ? '' : 's'} around then.`
    : ` ${top[0].name} is full, so it is showing its waitlist.`;

  return { reply: lead + availability, venues: top, intent };
}

export const CONCIERGE_PROMPTS = [
  'Cozy Italian for a date night under ₹1500',
  'Outdoor table for 6 tonight',
  "Chef's counter, solo, anywhere in Bengaluru",
  'Somewhere in Bandra West that takes walk-ins',
];
