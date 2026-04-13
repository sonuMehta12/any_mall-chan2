import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import FoodMarkdownCard from './FoodMarkdownCard.jsx'
import './ChatBubble.css'

// Shared remark plugins — defined once outside the component so the array
// reference is stable and react-markdown doesn't re-create its parser each render.
const REMARK_PLUGINS = [remarkGfm]

export default function ChatBubble({ message, isUser, isFood = false, isTyping = false, statusText = null, isStreaming = false, foodSections = null }) {
  if (isTyping) {
    return (
      <div className="bubble-row bubble-row--bot">
        <div className="bubble-avatar">🐢</div>
        <div className="bubble bubble--bot bubble--typing">
          {statusText
            ? <span className="typing-status">{statusText}</span>
            : <>
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </>
          }
        </div>
      </div>
    )
  }

  return (
    <div className={`bubble-row ${isUser ? 'bubble-row--user' : 'bubble-row--bot'}`}>
      {!isUser && <div className="bubble-avatar">🐢</div>}
      <div className={`bubble ${isUser ? 'bubble--user' : 'bubble--bot'}`}>
        {/* User messages: plain text only — never pass user input to a renderer */}
        {isUser
          ? message
          /* Food messages: FoodMarkdownCard handles both streaming and final state.
             isStreaming=true  → card visible immediately, tabs auto-follow the LLM.
             isStreaming=false → tabs are interactive, user switches manually. */
          : isFood
          ? <FoodMarkdownCard markdown={message} isStreaming={isStreaming} foodSections={foodSections} />
          /* General bot messages: live Markdown (streaming and final) */
          : <div className="md-body">
              <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{message}</ReactMarkdown>
            </div>
        }
      </div>
    </div>
  )
}
