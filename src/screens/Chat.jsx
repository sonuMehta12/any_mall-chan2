import { useEffect, useRef, useState } from 'react'
import ChatBubble from '../components/ChatBubble.jsx'
import ConfidenceBar from '../components/ConfidenceBar.jsx'
import RecipeCard from '../components/RecipeCard.jsx'
import { sendMessageStream, fetchSetup, fetchConfidence, BASE } from '../api.js'
import './Chat.css'

const SPECIES_EMOJI = { dog: '🐕', cat: '🐱' }

// Generate a session ID once per page load — persists for the full conversation
function makeSessionId() {
  return crypto.randomUUID()
}

export default function Chat({ selectedPets, userCode, language, onBack }) {
  const [sessionId] = useState(makeSessionId)   // created once, never changes
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [statusText, setStatusText] = useState(null)      // "Fetching recipes..." etc.
  const [streamingText, setStreamingText] = useState('')  // in-progress assistant reply
  const [confidenceScore, setConfidenceScore] = useState(0)
  const [confidenceColor, setConfidenceColor] = useState('red')
  const [activeRedirect, setActiveRedirect] = useState(null)
  const [suggestedQuestions, setSuggestedQuestions] = useState([])
  const [streamingIsFood, setStreamingIsFood] = useState(false)
  const streamController = useRef(null)                   // lets us abort mid-stream

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
    fetchSetup(petIds, userCode, language, 'anymall')
      .then(data => {
        setConfidenceScore(data.confidence_score ?? 0)
        setConfidenceColor(data.confidence_color ?? 'red')
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
      displayName: 'Sarah',

      onMeta(frame) {
        pendingMeta = frame
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
          pendingEffectiveMode === 'food_recipes_info' || pendingEffectiveMode === 'food_info'
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
        const finalText = frame.final_text
        const isFood = pendingEffectiveMode === 'food_recipes_info' || pendingEffectiveMode === 'food_info'
        const foodSections = frame.food_sections ?? null
        console.log('[DEBUG food_sections]', foodSections)

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
          foodSections,
        }])

        // Refresh confidence after background pipeline finishes
        setTimeout(() => {
          fetchConfidence(petIds, userCode)
            .then(fresh => {
              setConfidenceScore(fresh.confidence_score ?? pendingMeta?.confidence_score ?? 0)
              setConfidenceColor(fresh.confidence_color ?? pendingMeta?.confidence_color ?? 'red')
            })
            .catch(() => {})
        }, 4000)
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
        <ConfidenceBar score={confidenceScore} label={confidenceColor} variant="compact" />
      </div>

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
            <ChatBubble message={msg.text} isUser={msg.isUser} isFood={msg.isFood} foodSections={msg.foodSections ?? null} />
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
          <ChatBubble isTyping statusText={statusText} />
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

      {/* ── Input ── */}
      <div className="chat-input-bar">
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
            className={`chat-send-btn ${inputText.trim() ? 'active' : ''}`}
            onPointerDown={e => { e.preventDefault(); handleSend() }}
            disabled={!inputText.trim() || isTyping}
          >
            ↑
          </button>
        </div>
        <p className="chat-input-hint">AnyMall-chan learns naturally — just chat normally</p>
      </div>
    </div>
  )
}
