import { useEffect, useRef, useState } from "react";
import { askTripQuestion } from "../utils/tripChat";
import { RateLimitError } from "../utils/gemini";
import logger from "../utils/logger";

export default function TripChat({ trip }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const handleSend = async (e) => {
    e.preventDefault();
    const question = input.trim();
    if (!question || sending) return;

    setInput("");
    setError("");
    const nextHistory = [...messages, { role: "user", content: question }];
    setMessages([...nextHistory, { role: "assistant", content: "" }]);
    setSending(true);

    try {
      const answer = await askTripQuestion(trip, nextHistory, (partial) => {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: partial };
          return copy;
        });
      });
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: answer };
        return copy;
      });
    } catch (err) {
      logger.error("Trip chat failed:", err);
      // Drop the empty in-progress placeholder rather than leaving a blank bubble.
      setMessages((prev) => prev.slice(0, -1));
      if (err instanceof RateLimitError) {
        const wait = err.retryAfterSeconds;
        setError(
          `Hit the AI's daily usage limit for this app.${wait ? ` Try again in about ${wait}s.` : " Try again later."}`
        );
      } else {
        setError(err.message || "Couldn't get an answer. Please try again.");
      }
    } finally {
      setSending(false);
    }
  };

  if (!trip) return null;

  return (
    <div className={`trip-chat ${open ? "trip-chat-open" : ""}`}>
      {open && (
        <div className="trip-chat-panel">
          <div className="trip-chat-header">
            <span>Ask about this trip</span>
            <button
              type="button"
              className="trip-chat-close"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
            >
              ×
            </button>
          </div>

          <div className="trip-chat-messages" ref={scrollRef}>
            <div className="trip-chat-msg trip-chat-msg-assistant trip-chat-greeting">
              Ask me anything about this trip — budget, itinerary, packing, currency, whatever's on your mind.
            </div>
            {messages.map((m, idx) => (
              <div key={idx} className={`trip-chat-msg trip-chat-msg-${m.role}`}>
                {m.content || (sending && idx === messages.length - 1 ? "…" : "")}
              </div>
            ))}
          </div>

          {error && <p className="trip-chat-error">{error}</p>}

          <form className="trip-chat-input-row" onSubmit={handleSend}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. How much cash should I carry?"
              disabled={sending}
            />
            <button type="submit" disabled={sending || !input.trim()}>
              {sending ? "…" : "Send"}
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        className="trip-chat-fab"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close trip chat" : "Ask about this trip"}
      >
        {open ? "×" : "Ask"}
      </button>
    </div>
  );
}
