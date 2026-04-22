import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './FoodMarkdownCard.css'

const REMARK_PLUGINS = [remarkGfm]

// ── Source link extractor ─────────────────────────────────────────────────────
//
// Pulls [title](url) pairs out of the **Sources:** line that the LLM is
// instructed to copy verbatim as the first line of its reply.
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

// ── Favicon sources bar ───────────────────────────────────────────────────────
function SourcesBar({ sourceLinks }) {
  if (!sourceLinks.length) return null

  const visible       = sourceLinks.slice(0, 3)
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
// Renders the food agent's natural conversational reply.
// If the LLM placed a **Sources:** line first (as instructed), it is extracted,
// shown in the SourcesBar, and stripped from the body so it isn't rendered twice.
//
export default function FoodMarkdownCard({ markdown, isStreaming = false }) {
  const normalized = (markdown || '').replace(/\r\n?/g, '\n')
  const firstNewline = normalized.indexOf('\n')
  const firstLine    = firstNewline === -1 ? normalized : normalized.slice(0, firstNewline)

  const isSourcesLine = firstLine.trimStart().startsWith('**Sources:**')
  const sourceLinks   = isSourcesLine ? extractSourceLinks(firstLine) : []
  const body          = isSourcesLine
    ? normalized.slice(firstNewline + 1).trimStart()
    : normalized

  return (
    <div className="fmc">
      <SourcesBar sourceLinks={sourceLinks} />
      <div className="fmc-body md-body">
        <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{body}</ReactMarkdown>
      </div>
    </div>
  )
}
