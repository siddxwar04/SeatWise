import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CONCIERGE_PROMPTS, ask } from '../../services/concierge.js';
import { useMarket } from '../../context/MarketContext.jsx';
import { Cover, StarRating } from '../ui/Data.jsx';
import { IconButton } from '../ui/Button.jsx';
import { Icon } from '../ui/Icon.jsx';
import { priceBand } from '../../lib/format.js';

const WELCOME =
  'Ask me for a restaurant in a sentence — "cozy Italian for a date night under ₹1500" or "outdoor table for 6 tonight."';

/**
 * The floating concierge, carried over from the food-site build and re-skinned
 * for a marketplace: it now answers with bookable venues rather than menu
 * items, and every card deep-links straight into that venue's booking sheet.
 */
export function ConciergeWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState([{ role: 'assistant', content: WELCOME }]);
  const listRef = useRef(null);
  const reduce = useReducedMotion();
  const { citySlug } = useMarket();

  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open, sending]);

  const send = async (event, prefill) => {
    event?.preventDefault();
    const text = (prefill ?? input).trim();
    if (!text || sending) return;

    const history = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-8)
      .map(({ role, content }) => ({ role, content }));

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setSending(true);

    try {
      const data = await ask(text, history, { city: citySlug });
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply, venues: data.venues }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Could not reach the concierge. Please try again.', isError: true },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`concierge ${open ? 'is-open' : ''}`}>
      <AnimatePresence>
        {open && (
          <motion.section
            className="concierge_panel"
            aria-label="SeatWise concierge"
            initial={reduce ? false : { opacity: 0, scale: 0.9, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, scale: 0.92, y: 12 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: 'bottom right' }}
          >
            <header className="concierge_head">
              <div>
                <p className="concierge_eyebrow">Concierge</p>
                <h3>Ask SeatWise</h3>
              </div>
              <IconButton icon="x" label="Close concierge" onClick={() => setOpen(false)} />
            </header>

            <div className="concierge_msgs" ref={listRef} role="log" aria-live="polite">
              {messages.map((msg, index) => (
                <div key={index} className={`bubble bubble_${msg.role}${msg.isError ? ' is-error' : ''}`}>
                  <p>{msg.content}</p>
                  {msg.venues?.length > 0 && (
                    <div className="bubble_venues">
                      {msg.venues.map((venue) => (
                        <Link key={venue.slug} to={`/r/${venue.slug}`} className="bubble_venue" onClick={() => setOpen(false)}>
                          <Cover seed={venue.slug} name={venue.name} src={venue.image} size="sm" alt="" />
                          <div>
                            <strong>{venue.name}</strong>
                            <span>
                              {venue.cuisine} · {priceBand(venue.price)} · {venue.area}
                            </span>
                            <StarRating rating={venue.rating} size="sm" />
                          </div>
                          <Icon name="arrow-right" />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {sending && (
                <div className="bubble bubble_assistant is-loading">
                  <span className="concierge_dots">
                    <i /> <i /> <i />
                  </span>
                </div>
              )}
            </div>

            {messages.length === 1 && (
              <div className="concierge_prompts">
                {CONCIERGE_PROMPTS.map((prompt) => (
                  <button key={prompt} type="button" onClick={(e) => send(e, prompt)}>
                    {prompt}
                  </button>
                ))}
              </div>
            )}

            <form className="concierge_composer" onSubmit={send}>
              <label htmlFor="concierge-input" className="sr-only">
                Ask the concierge
              </label>
              <input
                id="concierge-input"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask for a restaurant…"
                maxLength={300}
                disabled={sending}
                autoComplete="off"
              />
              <IconButton icon="arrow-right" label="Send" type="submit" variant="primary" disabled={sending || !input.trim()} />
            </form>
          </motion.section>
        )}
      </AnimatePresence>

      <button type="button" className="concierge_fab" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Icon name={open ? 'x' : 'sparkles'} />
        {!open && <span>Ask AI</span>}
      </button>
    </div>
  );
}
