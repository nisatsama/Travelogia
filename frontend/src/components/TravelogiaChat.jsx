import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import "./TravelogiaChat.css";

const STARTER_PROMPTS = [
  "Plan a 5-day trip under ₹15,000.",
  "Best destinations to visit in December?",
  "Compare Darjeeling and Gangtok.",
  "Suggest peaceful destinations in India.",
  "Plan a weekend trip from Kolkata.",
];

const INITIAL_MESSAGE = {
  id: "welcome",
  role: "assistant",
  content:
    "Hi! I am Travelogia AI. Ask me to recommend destinations from our catalogue, compare places, build itineraries, estimate budgets, or share packing tips.",
  suggestedDestinations: [],
};

function TravelogiaChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastFailedPrompt, setLastFailedPrompt] = useState("");

  const endRef = useRef(null);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading, isOpen, isMinimized]);

  const sendMessage = async (textToSend) => {
    const trimmed = String(textToSend || "").trim();
    if (!trimmed || loading) return;

    setError("");
    setLastFailedPrompt("");

    const userMsg = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
    };

    const historyPayload = messages
      .filter((m) => m.id !== "welcome")
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await api.post("/chatbot/message", {
        message: trimmed,
        conversationHistory: historyPayload,
      });

      const botMsg = {
        id: `bot-${Date.now()}`,
        role: "assistant",
        content: res.data?.reply || "I could not generate a response.",
        suggestedDestinations: res.data?.suggestedDestinations || [],
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          "Travelogia AI could not respond right now. Please try again.",
        ),
      );
      setLastFailedPrompt(trimmed);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleClear = () => {
    setMessages([INITIAL_MESSAGE]);
    setError("");
    setLastFailedPrompt("");
  };

  return (
    <div className="travelogia-chat-root" aria-live="polite">
      {!isOpen && (
        <button
          type="button"
          className="chat-launcher"
          onClick={() => {
            setIsOpen(true);
            setIsMinimized(false);
          }}
          aria-label="Open Travelogia AI travel assistant"
        >
          <span className="chat-launcher-dot" aria-hidden="true" />
          <span className="chat-launcher-label">Travelogia AI</span>
        </button>
      )}

      {isOpen && (
        <section
          className={`chat-panel ${isMinimized ? "minimized" : ""}`}
          aria-label="Travelogia AI Assistant"
        >
          <header className="chat-header">
            <div className="chat-header-info">
              <div className="chat-avatar" aria-hidden="true">AI</div>
              <div>
                <h3>Travelogia AI</h3>
                <p>Grounded in Travelogia destinations</p>
              </div>
            </div>
            <div className="chat-header-actions">
              <button
                type="button"
                className="chat-icon-btn"
                onClick={handleClear}
                title="Clear conversation"
                aria-label="Clear conversation"
              >
                Clear
              </button>
              <button
                type="button"
                className="chat-icon-btn"
                onClick={() => setIsMinimized((prev) => !prev)}
                title={isMinimized ? "Expand chat" : "Minimize chat"}
                aria-label={isMinimized ? "Expand chat" : "Minimize chat"}
              >
                {isMinimized ? "+" : "—"}
              </button>
              <button
                type="button"
                className="chat-icon-btn"
                onClick={() => setIsOpen(false)}
                title="Close chat"
                aria-label="Close chat"
              >
                ×
              </button>
            </div>
          </header>

          {!isMinimized && (
            <>
              <div className="chat-body">
                {messages.map((msg) => (
                  <div key={msg.id} className={`chat-bubble-row ${msg.role}`}>
                    <div className={`chat-bubble ${msg.role}`}>
                      <p className="chat-bubble-text">{msg.content}</p>

                      {Array.isArray(msg.suggestedDestinations) &&
                        msg.suggestedDestinations.length > 0 && (
                          <div className="chat-dest-links">
                            <span className="chat-dest-label">
                              Travelogia Listings:
                            </span>
                            <div className="chat-dest-grid">
                              {msg.suggestedDestinations.map((dest) => (
                                <Link
                                  key={dest._id}
                                  to={dest.url || `/travels/${dest._id}`}
                                  className="chat-dest-chip"
                                  onClick={() => setIsMinimized(true)}
                                >
                                  <strong>{dest.title}</strong>
                                  <span>
                                    {dest.city}, {dest.country} · Est. ${dest.pricePerNight}/night
                                  </span>
                                </Link>
                              ))}
                            </div>
                          </div>
                        )}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="chat-bubble-row assistant">
                    <div className="chat-bubble assistant typing">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-text">Planning with Travelogia AI...</span>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="chat-error-box" role="alert">
                    <p>{error}</p>
                    {lastFailedPrompt && (
                      <button
                        type="button"
                        className="chat-retry-btn"
                        onClick={() => sendMessage(lastFailedPrompt)}
                      >
                        Retry
                      </button>
                    )}
                  </div>
                )}

                <div ref={endRef} />
              </div>

              {messages.length <= 2 && (
                <div className="chat-starters">
                  {STARTER_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="chat-starter-chip"
                      onClick={() => sendMessage(prompt)}
                      disabled={loading}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              <form className="chat-input-bar" onSubmit={handleSubmit}>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about destinations, budgets, or itineraries..."
                  maxLength={1000}
                  disabled={loading}
                  aria-label="Message Travelogia AI"
                />
                <button type="submit" disabled={loading || !input.trim()}>
                  Send
                </button>
              </form>

              <div className="chat-disclaimer">
                Prices are estimates. Use destination pages to confirm bookings.
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

export default TravelogiaChat;
