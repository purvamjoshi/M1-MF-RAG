import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';

export default function Home() {
  const [messages, setMessages] = useState([
    {
      type: 'bot',
      text: "Hi! I'm your Groww Mutual Fund Assistant. Ask me anything about HDFC mutual funds - expense ratios, SIP amounts, lock-in periods, and more!",
      timestamp: new Date()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [showStarters, setShowStarters] = useState(true);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (text) => {
    const queryText = text || inputText;
    if (!queryText.trim()) return;

    // Hide starters after first message
    setShowStarters(false);

    // Add user message
    const userMessage = {
      type: 'user',
      text: queryText,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setLoading(true);

    try {
      const response = await fetch(`/api/answer?q=${encodeURIComponent(queryText)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get answer');
      }

      // Add bot response
      const botMessage = {
        type: 'bot',
        text: data.answer,
        sourceUrl: data.sourceUrl,
        schemeName: data.schemeName,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, botMessage]);
    } catch (err) {
      const errorMessage = {
        type: 'bot',
        text: `Sorry, I encountered an error: ${err.message}. Please try again.`,
        timestamp: new Date(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleStarterClick = (question) => {
    handleSend(question);
  };

  const conversationStarters = [
    "What is the expense ratio of HDFC Mid Cap fund?",
    "What is the minimum SIP for HDFC Flexi Cap?",
    "Does HDFC ELSS have a lock-in period?",
    "How do I download my mutual fund statement?",
    "What is the exit load for HDFC Large Cap?",
    "What is the risk level of HDFC Small Cap fund?"
  ];

  return (
    <>
      <Head>
        <title>Groww Mutual Fund FAQ Assistant</title>
        <meta name="description" content="Get factual answers about HDFC mutual funds on Groww" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="min-h-screen bg-groww-bg">
        <div className="max-w-4xl mx-auto h-screen flex flex-col">
          {/* Header */}
          <div className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-groww-primary to-groww-green flex items-center justify-center text-white font-bold text-lg">
                  G
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">Groww MF Assistant</h1>
                  <p className="text-xs text-gray-500">Always here to help</p>
                </div>
              </div>
              <div className="text-xs text-gray-400">
                No investment advice • Facts only
              </div>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                    msg.type === 'user'
                      ? 'bg-groww-primary text-white'
                      : msg.isError
                      ? 'bg-red-50 border border-red-200 text-red-800'
                      : 'bg-white border border-gray-200 text-gray-800'
                  }`}
                >
                  <p className="text-sm whitespace-pre-line">{msg.text}</p>
                  {msg.sourceUrl && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <a
                        href={msg.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-groww-primary hover:underline flex items-center gap-1"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        View official source
                      </a>
                    </div>
                  )}
                  <p className="text-xs opacity-60 mt-2">
                    {msg.timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Conversation Starters */}
          {showStarters && messages.length === 1 && (
            <div className="px-6 pb-4">
              <p className="text-xs text-gray-500 mb-3">💡 Quick questions to get started:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {conversationStarters.map((question, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleStarterClick(question)}
                    className="text-left text-sm px-4 py-3 bg-white border border-gray-200 hover:border-groww-primary hover:bg-blue-50 rounded-xl transition-all duration-200 text-gray-700"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Box */}
          <div className="bg-white border-t border-gray-200 px-6 py-4">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !loading && handleSend()}
                  placeholder="Type your question here..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:border-groww-primary focus:ring-2 focus:ring-groww-primary focus:ring-opacity-20 text-sm text-gray-900 placeholder-gray-400"
                  disabled={loading}
                />
              </div>
              <button
                onClick={() => handleSend()}
                disabled={loading || !inputText.trim()}
                className="px-6 py-3 bg-groww-primary text-white font-medium rounded-xl hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-white border-t border-gray-200 px-6 py-3">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <div className="flex items-center gap-4">
                <span>Milestone 1 by <a href="https://www.linkedin.com/in/purvamjoshi/" target="_blank" rel="noopener noreferrer" className="text-groww-primary hover:underline">@purvamjoshi</a></span>
                <a href="https://www.instagram.com/purvamjoshi" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-groww-primary">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                </a>
              </div>
              <span>⚠️ Factual info only • No investment advice</span>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
