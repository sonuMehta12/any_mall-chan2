import { useEffect, useRef, useState } from 'react'
import ChatBubble from '../components/ChatBubble.jsx'
import ConfidenceBar from '../components/ConfidenceBar.jsx'
import CategoryBreakdownSheet from '../components/CategoryBreakdownSheet.jsx'
import RecipeCard from '../components/RecipeCard.jsx'
import ClarificationCard from '../components/ClarificationCard.jsx'
import { sendMessageStream, fetchSetup, fetchConfidence, BASE } from '../api.js'
import './Chat.css'

const SPECIES_EMOJI = { dog: '🐕', cat: '🐱' }

// Generate a session ID once per page load — persists for the full conversation
function makeSessionId() {
  return crypto.randomUUID()
}

export default function Chat({ selectedPets, userCode, language, onBack, testMode = false, activeTestPets = null, ownerName = '' }) {
  const [sessionId] = useState(makeSessionId)   // created once, never changes
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [statusText, setStatusText] = useState(null)      // "Fetching recipes..." etc.
  const [streamingText, setStreamingText] = useState('')  // in-progress assistant reply
  const [confidenceScore, setConfidenceScore] = useState(0)
  const [confidenceColor, setConfidenceColor] = useState('red')
  const [categoryScores, setCategoryScores] = useState([])
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [activeRedirect, setActiveRedirect] = useState(null)
  const [suggestedQuestions, setSuggestedQuestions] = useState([])
  const [streamingIsFood, setStreamingIsFood] = useState(false)
  const streamController = useRef(null)                   // lets us abort mid-stream

  // Thinking mode — session-sticky; auto-activates for health/food deep-work
  const [thinkingModeActive, setThinkingModeActive] = useState(false)
  const [thinkingModeAutoActivated, setThinkingModeAutoActivated] = useState(false)

  // Clarification — active question card
  const [activeClarification, setActiveClarification] = useState(null)
  // Shape: { questions, round, originalMessage }

  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)

  const petIds = selectedPets.map(p => p.pet_id)
  const primaryPet = selectedPets[0]
  const petNames = selectedPets.map(p => p.name).join(' & ')

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  // Fetch setup (confidence + suggested questions) on mount
  useEffect(() => {
    if (!primaryPet) return
    fetchSetup(petIds, userCode, language, 'anymall', testMode ? activeTestPets : null)
      .then(data => {
        setConfidenceScore(data.confidence_score ?? 0)
        setConfidenceColor(data.confidence_color ?? 'red')
        setCategoryScores(data.category_scores ?? [])
        if (data.suggested_questions?.length) {
          setSuggestedQuestions(data.suggested_questions)
        }
      })
      .catch(err => console.warn('Could not fetch setup:', err))
  }, [])

  // Show opening greeting when chat first mounts
  useEffect(() => {
    const greeting = language === 'JA'
      ? (selectedPets.length === 1
        ? `こんにちは！${primaryPet.name}の調子はどうですか？🐾`
        : `こんにちは！${petNames}の調子はどうですか？🐾`)
      : (selectedPets.length === 1
        ? `Hi! How's ${primaryPet.name} doing today? 🐾`
        : `Hi! How are ${petNames} doing today? 🐾`)
    setMessages([{ id: 1, text: greeting, isUser: false }])
  }, [])

  // ClarificationCard calls onSubmit(formattedText) — text is already formatted
  function handleClarificationSubmit(text) {
    if (!text?.trim()) return
    setActiveClarification(null)
    handleSend(text)
  }

  function handleClarificationSkip() {
    const original = activeClarification?.originalMessage
    setActiveClarification(null)
    // Re-send the original message so the backend can give a best-effort answer.
    // The backend will either ask another round (if rounds < 3) or fall through
    // to the agent after 3 total clarification attempts.
    if (original) handleSend(original)
  }

  function handleSend(overrideText) {
    const text = (overrideText || inputText).trim()
    if (!text || isTyping) return

    setInputText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    setSuggestedQuestions([])
    setMessages(prev => [...prev, { id: Date.now(), text, isUser: true }])
    setIsTyping(true)
    setStatusText(null)
    setStreamingText('')

    // Accumulate state inside the stream callbacks (avoid stale closure issues)
    let pendingRecipes = []
    let pendingEffectiveMode = 'general'
    let pendingMeta = null

    streamController.current = sendMessageStream({
      sessionId,
      message: text,
      petIds,
      userCode,
      language,
      displayName: ownerName || 'Friend',
      thinkingMode: thinkingModeActive,
      testPets: testMode ? activeTestPets : null,

      onThinking() {
        if (!thinkingModeActive) {
          setThinkingModeActive(true)
          setThinkingModeAutoActivated(true)
        }
      },

      onClarification(frame) {
        // Add the bot's intro text as a normal chat bubble, then show the card.
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          text: frame.message,
          isUser: false,
        }])
        // Store originalMessage so Skip can re-send it for a best-effort response.
        setActiveClarification({ questions: frame.questions, round: frame.round, originalMessage: text })
        setIsTyping(false)
        setStatusText(null)
        setStreamingText('')
      },

      onMeta(frame) {
        pendingMeta = frame
        setCategoryScores(frame.category_scores ?? [])
        setConfidenceScore(frame.confidence_score ?? 0)
        setConfidenceColor(frame.confidence_color ?? 'red')
        console.group(
          `%c[Stream]  intent=${frame.intent_type?.toUpperCase()}  urgency=${frame.urgency}`,
          'color:#7c3aed; font-weight:bold'
        )
        console.log('meta →', frame)
        console.groupEnd()
      },

      onStatus(frame) {
        setStatusText(frame.message)
      },

      onToolsComplete(frame) {
        setStatusText(null)  // clear status — tokens are about to start
        pendingEffectiveMode = frame.effective_mode ?? 'general'
        setStreamingIsFood(
          pendingEffectiveMode === 'nutrition' || pendingEffectiveMode === 'food_info'
        )

        // Flatten recipes for the final message
        pendingRecipes = []
        const rbp = frame.recipes_by_pet ?? {}
        for (const [petIdStr, recipes] of Object.entries(rbp)) {
          const petId = parseInt(petIdStr)
          const petName = selectedPets.find(p => p.pet_id === petId)?.name || null
          if (Array.isArray(recipes)) {
            recipes.forEach(r => pendingRecipes.push({ ...r, petName }))
          }
        }
      },

      onToken(frame) {
        setStreamingText(prev => prev + frame.content)
      },

      onDone(frame) {
        setThinkingModeAutoActivated(false)
        const finalText = frame.final_text
        const isFood = pendingEffectiveMode === 'nutrition' || pendingEffectiveMode === 'food_info'

        if (frame.redirect) {
          console.log('[Redirect payload]', frame.redirect)
          setActiveRedirect(frame.redirect)
        } else {
          setActiveRedirect(null)
        }

        // Commit the final message (replaces the live streaming text)
        setIsTyping(false)
        setStatusText(null)
        setStreamingText('')
        setStreamingIsFood(false)
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          // food_recipes final_text is a synthetic session-history summary
          // ("[Recipe cards shown — …]") intended only for the backend session
          // store — never display it as a visible bubble.
          text: pendingEffectiveMode === 'food_recipes' ? '' : finalText,
          isUser: false,
          recipes: pendingRecipes,
          isFood,
        }])

        // Refresh confidence after background pipeline finishes — skipped in test mode
        if (!testMode) {
          setTimeout(() => {
            fetchConfidence(petIds, userCode)
              .then(fresh => {
                setConfidenceScore(fresh.confidence_score ?? pendingMeta?.confidence_score ?? 0)
                setConfidenceColor(fresh.confidence_color ?? pendingMeta?.confidence_color ?? 'red')
                setCategoryScores(fresh.category_scores ?? [])
              })
              .catch(() => {})
          }, 4000)
        }
      },

      onError(frame) {
        setIsTyping(false)
        setStatusText(null)
        setStreamingText('')
        setStreamingIsFood(false)
        const msg = frame.message || `I'm having trouble connecting right now. Please try again! 🐢`
        setMessages(prev => [...prev, { id: Date.now() + 1, text: msg, isUser: false }])
      },
    })
  }

  function handleChipTap(questionText) {
    if (isTyping) return
    // Set the input text and let handleSend do the rest
    setInputText(questionText)
    // Use a microtask so React flushes the state update before handleSend reads it
    setTimeout(() => handleSend(questionText), 0)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const petEmoji = SPECIES_EMOJI[primaryPet?.species] || '🐾'

  return (
    <div className="chat">
      {/* ── Header ── */}
      <div className="chat-header">
        <button className="chat-back-btn" onClick={onBack}>←</button>
        <div className="chat-header-pet">
          <div className="chat-pet-avatar">{petEmoji}</div>
          <div>
            <div className="chat-pet-name">{petNames}</div>
            <div className="chat-pet-meta">
              {selectedPets.map(p => p.breed).join(' & ')}
            </div>
          </div>
        </div>
        <ConfidenceBar
          score={confidenceScore}
          label={confidenceColor}
          variant="compact"
          onInfoClick={categoryScores.length > 0 ? () => setShowBreakdown(true) : null}
        />
      </div>

      {/* ── Category breakdown sheet ── */}
      {showBreakdown && (
        <CategoryBreakdownSheet
          categoryScores={categoryScores}
          overallScore={confidenceScore}
          overallColor={confidenceColor}
          onClose={() => setShowBreakdown(false)}
        />
      )}

      {/* ── Messages ── */}
      <div className="chat-messages">
        <div className="chat-date-divider">
          <span>Today</span>
        </div>

        {messages.map(msg => (
          <div key={msg.id}>
            {/* Recipe carousel — attached to the message it belongs to */}
            {!msg.isUser && msg.recipes?.length > 0 && (
              <div className="chat-recipe-carousel">
                <div className="chat-recipe-label">🍽️ おすすめレシピ</div>
                <div className="chat-recipe-scroll">
                  {msg.recipes.map((r, idx) => (
                    <RecipeCard key={`${r.petName ?? 'pet'}-${r.id}-${idx}`} recipe={r} petName={r.petName} />
                  ))}
                </div>
              </div>
            )}
            <ChatBubble message={msg.text} isUser={msg.isUser} isFood={msg.isFood} />
          </div>
        ))}

        {/* Suggested question chips — shown only on blank state */}
        {suggestedQuestions.length > 0 && messages.length <= 1 && !isTyping && (
          <div className="chat-suggested-questions">
            {suggestedQuestions.map((q, i) => (
              <button
                key={i}
                className="suggested-chip"
                onClick={() => handleChipTap(q.text)}
              >
                {q.text}
              </button>
            ))}
          </div>
        )}

        {/* Show status text or typing dots while waiting for first token */}
        {isTyping && !streamingText && (
          <ChatBubble isTyping statusText={statusText} isThinking={thinkingModeActive} />
        )}

        {/* Live streaming bubble — grows token by token.
            isFood=true → FoodMarkdownCard in streaming mode (tabs visible immediately,
            active tab auto-follows the section the LLM is currently writing). */}
        {streamingText && (
          <ChatBubble message={streamingText} isUser={false} isFood={streamingIsFood} isStreaming={true} />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Sticky redirect nudge ── */}
      {activeRedirect && (
        <div className="chat-sticky-nudge">
          <button
            className="redirect-sticky-btn"
            onClick={() => {
              const ALLOWED_MODULES = ['health', 'food']
              if (!ALLOWED_MODULES.includes(activeRedirect.module)) {
                console.warn('Blocked redirect to unknown module:', activeRedirect.module)
                return
              }
              const params = new URLSearchParams({
                query: activeRedirect.context.query,
                pet_id: activeRedirect.context.pet_id,
                pet_summary: activeRedirect.context.pet_summary,
                urgency: activeRedirect.urgency,
              })
              window.open(`${BASE}/api/v1/simulator/${activeRedirect.module}?${params}`, '_blank')
            }}
            style={{
              background: activeRedirect.display.style === 'urgent' ? '#ef4444' : '#f97316',
            }}
          >
            {activeRedirect.display.label} →
          </button>
          <button
            className="redirect-dismiss"
            onClick={() => setActiveRedirect(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Thinking mode auto-activation banner ── */}
      {thinkingModeAutoActivated && (
        <div className="thinking-banner">
          <strong>Thinking mode activated</strong>
          <span>Switching to deep thinking for a more thorough answer.</span>
        </div>
      )}

      {/* ── Thinking mode chip — shown when active ── */}
      {thinkingModeActive && !activeClarification && (
        <div className="thinking-chip">
          Thinking mode
          <button
            className="thinking-chip-dismiss"
            onClick={() => { setThinkingModeActive(false); setThinkingModeAutoActivated(false) }}
          >×</button>
        </div>
      )}

      {/* ── Clarification bottom sheet — replaces input bar when active ── */}
      {activeClarification && (
        <ClarificationCard
          questions={activeClarification.questions}
          onSubmit={handleClarificationSubmit}
          onSkip={handleClarificationSkip}
        />
      )}

      {/* ── Input — hidden while clarification card is shown ── */}
      {!activeClarification && <div className="chat-input-bar">
        <div className="chat-input-wrap">
          <textarea
            ref={textareaRef}
            className="chat-input"
            placeholder={language === 'JA' ? `${petNames}について...` : `Message about ${petNames}...`}
            value={inputText}
            onChange={e => {
              setInputText(e.target.value)
              const ta = e.target
              ta.style.height = 'auto'
              ta.style.height = `${ta.scrollHeight}px`
            }}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <button
            type="button"
            className={`thinking-toggle-btn ${thinkingModeActive ? 'active' : ''}`}
            onClick={() => {
              setThinkingModeActive(v => !v)
              setThinkingModeAutoActivated(false)
            }}
            title={thinkingModeActive ? 'Disable thinking mode' : 'Enable thinking mode'}
            aria-label={thinkingModeActive ? 'Disable thinking mode' : 'Enable thinking mode'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.5 2a2.5 2.5 0 0 1 5 0v1.5"/>
              <path d="M17 6.5a3.5 3.5 0 0 0-3.5-3.5H10a3.5 3.5 0 0 0-3.5 3.5v1"/>
              <path d="M6.5 7.5A3.5 3.5 0 0 0 3 11v1a3.5 3.5 0 0 0 3.5 3.5"/>
              <path d="M17.5 7.5A3.5 3.5 0 0 1 21 11v1a3.5 3.5 0 0 1-3.5 3.5"/>
              <path d="M6.5 15.5A3.5 3.5 0 0 0 10 19h4a3.5 3.5 0 0 0 3.5-3.5v-1"/>
              <line x1="12" y1="11" x2="12" y2="19"/>
              <line x1="9" y1="14" x2="15" y2="14"/>
            </svg>
          </button>
          <button
            type="button"
            className={`chat-send-btn ${inputText.trim() ? 'active' : ''}`}
            onPointerDown={e => { e.preventDefault(); handleSend() }}
            disabled={!inputText.trim() || isTyping}
          >
            ↑
          </button>
        </div>
        <p className="chat-input-hint">AnyMall-chan learns naturally — just chat normally</p>
      </div>}

    </div>
  )
}
