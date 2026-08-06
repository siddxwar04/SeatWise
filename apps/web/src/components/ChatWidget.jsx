import { useEffect, useRef, useState } from 'react';
import { ApiError, chatApi } from '../lib/api.js';
import { ChatRestaurantCard } from './ChatRestaurantCard.jsx';

const WELCOME =
  'Hi! I am the TastyFood concierge. Ask me things like “date night under ₹1500” or “outdoor seating in Koramangala”.';

/**
 * Floating AI concierge — bottom-right, expandable.
 * Does not touch the booking form; cards deep-link with ?restaurant=slug#reserve.
 */
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState([{ role: 'assistant', content: WELCOME }]);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open, sending]);

  const send = async (event) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const history = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-10)
      .map(({ role, content }) => ({ role, content }));

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setSending(true);

    try {
      const data = await chatApi.send(text, history);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply,
          restaurants: data.restaurants ?? [],
        },
      ]);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Could not reach the concierge. Check your connection and try again.';
      setMessages((prev) => [...prev, { role: 'assistant', content: message, isError: true }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`chat_widget ${open ? 'is-open' : ''}`}>
      {open && (
        <section className="chat_panel" aria-label="TastyFood concierge chat">
          <header className="chat_panel_header">
            <div>
              <p className="chat_panel_eyebrow">Concierge</p>
              <h3>Ask TastyFood</h3>
            </div>
            <button
              type="button"
              className="chat_icon_btn"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
            >
              ×
            </button>
          </header>

          <div className="chat_messages" ref={listRef} role="log" aria-live="polite">
            {messages.map((msg, index) => (
              <div
                key={`${msg.role}-${index}`}
                className={`chat_bubble chat_bubble_${msg.role}${msg.isError ? ' chat_bubble_error' : ''}`}
              >
                <p>{msg.content}</p>
                {msg.restaurants?.length > 0 && (
                  <div className="chat_restaurant_list">
                    {msg.restaurants.map((restaurant) => (
                      <ChatRestaurantCard key={restaurant.id} restaurant={restaurant} />
                    ))}
                  </div>
                )}
              </div>
            ))}
            {sending && (
              <div className="chat_bubble chat_bubble_assistant chat_bubble_loading">
                <p>Finding places for you…</p>
              </div>
            )}
          </div>

          <form className="chat_composer" onSubmit={send}>
            <label htmlFor="chat-input" className="visually_hidden">
              Message the concierge
            </label>
            <input
              id="chat-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about restaurants…"
              maxLength={1000}
              disabled={sending}
              autoComplete="off"
            />
            <button type="submit" className="btn btn-primary btn-small" disabled={sending || !input.trim()}>
              Send
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        className="chat_fab"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Close concierge chat' : 'Open concierge chat'}
      >
        {open ? 'Close' : 'Ask AI'}
      </button>
    </div>
  );
}
