// ClarificationCard.jsx
//
// Step-by-step bottom sheet for clarification questions.
// Shows ONE question at a time — user advances through each before submitting.
//
// Props:
//   questions  — 1–3 question objects from ClarificationAgent
//   onSubmit   — (formattedText: string) => void
//   onSkip     — () => void — re-sends the original message for a best-effort reply

import { useState } from 'react'
import './ClarificationCard.css'

// ── Pure helper: format all collected answers into a single text string ───────
function formatAnswers(questions, answers) {
  return questions
    .filter(q => (answers[q.id] ?? []).length > 0)
    .map(q => {
      const selected = answers[q.id]
      if (q.pattern === 'open_field') return selected[0]?.label ?? ''
      const labels = selected.map(opt => opt.custom_text ?? opt.label).join(', ')
      return `${q.text}: ${labels}`
    })
    .join('. ')
}

export default function ClarificationCard({ questions, onSubmit, onSkip }) {
  const [step, setStep] = useState(0)
  // answers: { [qId]: [{id, label, custom_text?, is_open_text?}] }
  const [answers, setAnswers] = useState({})
  // which questions have an open "Other" text input expanded
  const [openOther, setOpenOther] = useState({})
  // text typed into each "Other" input
  const [otherText, setOtherText] = useState({})

  const q = questions[step]
  const total = questions.length
  const isLast = step === total - 1

  // ── Answer helpers ──────────────────────────────────────────────────────────

  function getSelected(qId) {
    return answers[qId] ?? []
  }

  function isSelected(qId, optId) {
    return getSelected(qId).some(o => o.id === optId)
  }

  // Advance to next question (or submit if on last)
  function advance(latestAnswers) {
    const ans = latestAnswers ?? answers
    if (isLast) {
      onSubmit(formatAnswers(questions, ans))
    } else {
      setStep(s => s + 1)
    }
  }

  // single_select / yes_or_no — replace selection, auto-advance
  function selectSingle(opt) {
    if (opt.is_open_text) {
      // "Other" chip — expand text input, don't auto-advance yet
      setOpenOther(prev => ({ ...prev, [q.id]: true }))
      setAnswers(prev => ({ ...prev, [q.id]: [{ id: opt.id, label: '', is_open_text: true }] }))
    } else {
      setOpenOther(prev => ({ ...prev, [q.id]: false }))
      const updated = { ...answers, [q.id]: [opt] }
      setAnswers(updated)
      // Brief visual feedback before advancing
      setTimeout(() => advance(updated), 200)
    }
  }

  // multi_select — toggle selection
  function toggleMulti(opt) {
    const current = getSelected(q.id)
    if (opt.is_open_text) {
      if (isSelected(q.id, opt.id)) {
        setOpenOther(prev => ({ ...prev, [q.id]: false }))
        setAnswers(prev => ({ ...prev, [q.id]: current.filter(o => o.id !== opt.id) }))
      } else {
        setOpenOther(prev => ({ ...prev, [q.id]: true }))
        setAnswers(prev => ({ ...prev, [q.id]: [...current, { id: opt.id, label: '', is_open_text: true }] }))
      }
    } else {
      if (isSelected(q.id, opt.id)) {
        setAnswers(prev => ({ ...prev, [q.id]: current.filter(o => o.id !== opt.id) }))
      } else {
        setAnswers(prev => ({ ...prev, [q.id]: [...current, opt] }))
      }
    }
  }

  // Update the label of the "Other" free-text entry
  function updateOtherText(text) {
    setOtherText(prev => ({ ...prev, [q.id]: text }))
    const current = getSelected(q.id)
    const updated = current.map(o => o.is_open_text ? { ...o, label: text, custom_text: text } : o)
    setAnswers(prev => ({ ...prev, [q.id]: updated }))
  }

  // Next/Submit is enabled when the current question has a valid answer
  function canAdvance() {
    const sel = getSelected(q.id)
    if (sel.length === 0) return false
    // "Other" selected but text is empty → not yet ready
    const otherEntry = sel.find(o => o.is_open_text)
    if (otherEntry && !otherEntry.label?.trim()) return false
    return true
  }

  // Whether the current question uses explicit Next/Submit (vs auto-advance)
  const needsExplicitNext = q.pattern === 'multi_select' || q.pattern === 'open_field'

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="clarification-sheet">
      {/* Progress dots — only shown when there are multiple questions */}
      {total > 1 && (
        <div className="clarification-progress">
          {questions.map((_, i) => (
            <span
              key={i}
              className={`clarification-dot ${i < step ? 'dot-answered' : i === step ? 'dot-active' : 'dot-future'}`}
            />
          ))}
        </div>
      )}

      {/* Current question */}
      <div className="clarification-body">
        <p className="clarification-q-text">{q.text}</p>

        {q.pattern === 'open_field' ? (
          <textarea
            className="clarification-open-field"
            placeholder="Type your answer..."
            value={getSelected(q.id)[0]?.label ?? ''}
            onChange={e =>
              setAnswers(prev => ({ ...prev, [q.id]: [{ id: 'open', label: e.target.value }] }))
            }
            rows={3}
            autoFocus
          />
        ) : (
          <div className="clarification-chips">
            {q.options?.map(opt => {
              const selected = isSelected(q.id, opt.id)
              const isMulti = q.pattern === 'multi_select'

              return (
                <div key={opt.id} className="clarification-chip-wrap">
                  <button
                    className={`clarification-chip ${selected ? 'chip-selected' : ''}`}
                    onClick={() => isMulti ? toggleMulti(opt) : selectSingle(opt)}
                  >
                    {opt.label}
                  </button>

                  {/* Inline text input for "Other" when expanded */}
                  {opt.is_open_text && openOther[q.id] && selected && (
                    <input
                      className="clarification-other-input"
                      type="text"
                      placeholder="Please specify..."
                      value={otherText[q.id] ?? ''}
                      onChange={e => updateOtherText(e.target.value)}
                      autoFocus
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="clarification-footer">
        <button className="clarification-skip-btn" onClick={onSkip}>
          Skip
        </button>

        {/* Next / Submit — only for multi_select and open_field.
            single_select and yes_or_no auto-advance on tap. */}
        {needsExplicitNext && (
          <button
            className="clarification-next-btn"
            onClick={() => advance()}
            disabled={!canAdvance()}
          >
            {isLast ? 'Submit' : 'Next →'}
          </button>
        )}
      </div>
    </div>
  )
}
