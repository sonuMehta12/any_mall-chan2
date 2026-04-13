import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './FoodMarkdownCard.css'

const REMARK_PLUGINS = [remarkGfm]

// ── Source link extractor ─────────────────────────────────────────────────────
//
// Shared by both code paths:
//   - Backend path: extracts from foodSections.sources (a single pre-built line)
//   - Streaming path: called inside parseMarkdownSections on the preamble text
//
function extractSourceLinks(text) {
  const links = []
  for (const m of text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
    const title = m[1], url = m[2]
    let favicon = ''
    try {
      const domain = new URL(url).hostname
      favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=16`
    } catch { /* malformed URL — favicon stays empty */ }
    links.push({ title, url, favicon })
  }
  return links
}

// ── Section parser ────────────────────────────────────────────────────────────
//
// Parses the LLM's Markdown output (which may be partial during streaming) into:
//   sourceLinks   — [{title, url, favicon}] extracted from the **Sources:** line
//   forYou        — text content under "## 🍽️ For You"
//   forVet        — text content under "## 🩺 For Your Vet"
//   activeSection — which section the LLM is currently writing
//                   ('preamble' | 'forYou' | 'forVet')
//
// Robustness notes:
//   - Normalises \r\n and bare \r to \n before splitting (SSE streams often carry
//     Windows line endings that survive the split and break startsWith checks).
//   - Uses \s+ (not a literal space) after the hashes so non-breaking spaces,
//     tabs, or double-spaces from the LLM don't silently skip the heading.
//   - Accepts ## or ### (some models use three hashes for secondary headings).
//   - Section detection is a loose substring match so emoji variants, trailing
//     punctuation, or slight rephrasing all still route correctly.
//
// Called on every render during streaming — must be fast (no DOM, no regex NFA).
function parseMarkdownSections(markdown) {
  // Normalise line endings: \r\n → \n, lone \r → \n
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')

  const sections = { preamble: [], forYou: [], forVet: [] }
  let current       = 'preamble'
  let activeSection = 'preamble'

  for (const line of lines) {
    // \s+ handles: plain space, non-breaking space (U+00A0), tab, double space
    const headingMatch = line.match(/^#{2,3}\s+(.+)/)
    if (headingMatch) {
      // Strip the matched heading text of any trailing whitespace / variation selectors
      const heading = headingMatch[1].trim()
      if (heading.includes('For You') || heading.includes('あなたへ')) {
        current = 'forYou'
      } else if (heading.includes('For Your Vet') || heading.includes('For Vet') || heading.includes('獣医')) {
        current = 'forVet'
      }
      activeSection = current   // last heading seen = section being written
    } else {
      sections[current].push(line)
    }
  }

  // Parse [title](url) pairs from the preamble (the **Sources:** line)
  const preambleText = sections.preamble.join('\n')
  const sourceLinks  = extractSourceLinks(preambleText)

  let forYou = sections.forYou.join('\n').trim()
  let forVet = sections.forVet.join('\n').trim()

  // Fallback: heading not found during streaming — split on double blank line.
  // The LLM separates owner-content from clinical-content with two blank lines
  // even when it omits the ## heading. Only apply when forVet is still empty
  // so we don't override a correctly detected heading split.
  if (!forVet && forYou) {
    const parts = forYou.split(/\n{3,}/)
    if (parts.length >= 2 && parts[parts.length - 1].trim()) {
      forVet = parts[parts.length - 1].trim()
      forYou = parts.slice(0, -1).join('\n\n').trim()
    }
  }

  return { sourceLinks, forYou, forVet, activeSection }
}

// ── Favicon stack (same UI as the old FoodResponseCard, pure JSX) ─────────────
function SourcesBar({ sourceLinks }) {
  if (!sourceLinks.length) return null

  const visible      = sourceLinks.slice(0, 3)
  const overflowCount = sourceLinks.length - visible.length

  return (
    <div className="fmc-sources-bar">
      <span className="fmc-sources-label">Sources</span>
      <div className="fmc-fav-stack">
        {visible.map((s, i) => (
          <a
            key={i}
            className="fmc-fav"
            style={{ zIndex: visible.length - i }}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            title={s.title}
          >
            {s.favicon && (
              <img
                src={s.favicon}
                alt=""
                onError={e => { e.currentTarget.style.display = 'none' }}
              />
            )}
          </a>
        ))}
        {overflowCount > 0 && (
          <span className="fmc-more">+{overflowCount}</span>
        )}
      </div>
    </div>
  )
}

// ── Main card ─────────────────────────────────────────────────────────────────
//
// isStreaming=true  → JS parser drives content; tabs auto-follow the LLM section
// isStreaming=false → if foodSections prop is present (backend-parsed, reliable),
//                     use it; otherwise fall back to JS parser
// foodSections      → {sources, for_you, for_vet} sent by the backend in DoneFrame
export default function FoodMarkdownCard({ markdown, isStreaming = false, foodSections = null }) {
  const [manualTab, setManualTab] = useState(null)

  // Choose data source:
  //   committed + backend data available → use backend sections (immune to Unicode issues)
  //   streaming or no backend data       → use JS heuristic parser (fine for preview)
  let sourceLinks, forYou, forVet, activeSection
  if (!isStreaming && foodSections) {
    console.log('[DEBUG FMC] backend path — for_you:', foodSections.for_you?.length, 'chars | for_vet:', foodSections.for_vet?.length, 'chars')
    sourceLinks   = extractSourceLinks(foodSections.sources ?? '')
    forYou        = foodSections.for_you ?? ''
    forVet        = foodSections.for_vet ?? ''
    activeSection = 'forYou'
  } else {
    console.log('[DEBUG FMC] JS parser path — isStreaming:', isStreaming, 'foodSections:', foodSections)
    ;({ sourceLinks, forYou, forVet, activeSection } = parseMarkdownSections(markdown))
  }

  // During streaming: follow the LLM.  After done: respect the user's last click
  // (or default to 'you' if they haven't clicked yet).
  const streamingTab = activeSection === 'forVet' ? 'vet' : 'you'
  const activeTab    = isStreaming ? streamingTab : (manualTab ?? 'you')

  function handleTabClick(tab) {
    if (!isStreaming) setManualTab(tab)
  }

  return (
    <div className="fmc">

      {/* ── Favicon sources bar ───────────────────────────────────────────── */}
      <SourcesBar sourceLinks={sourceLinks} />

      {/* ── Tab bar — visible from the very first token ───────────────────── */}
      <div className="fmc-tabs">
        <button
          className={`fmc-tab${activeTab === 'you' ? ' fmc-tab--on' : ''}`}
          onClick={() => handleTabClick('you')}
          // Visually disabled during streaming so the cursor signals non-interactivity
          style={isStreaming ? { cursor: 'default' } : undefined}
        >
          🍽️ For You
        </button>
        <button
          className={`fmc-tab${activeTab === 'vet' ? ' fmc-tab--on' : ''}`}
          onClick={() => handleTabClick('vet')}
          style={isStreaming ? { cursor: 'default' } : undefined}
        >
          🩺 For Your Vet
        </button>
      </div>

      {/* ── Active tab content — streams in live ──────────────────────────── */}
      <div className="fmc-body md-body">
        <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>
          {activeTab === 'you' ? forYou : forVet}
        </ReactMarkdown>
      </div>

    </div>
  )
}
