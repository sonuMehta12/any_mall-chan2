import { useState } from 'react'
import { generateBio, saveBio } from '../api.js'
import './PetBioScreen.css'

const SPECIES_EMOJI = { dog: '🐕', cat: '🐱' }

function ReadinessBar({ score }) {
  const pct = Math.min(100, score)
  const color = score >= 25 ? '#22C55E' : score >= 10 ? '#EAB308' : '#EF4444'
  return (
    <div className="readiness-bar-track">
      <div className="readiness-bar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export default function PetBioScreen({ pet, userCode, language: defaultLang, onBack }) {
  const [language, setLanguage] = useState(defaultLang || 'EN')
  const [bioText, setBioText] = useState(pet.bio || '')
  const [isDirty, setIsDirty] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [genInfo, setGenInfo] = useState(null)
  const [saveStatus, setSaveStatus] = useState(null)
  const [forceMode, setForceMode] = useState(false)

  async function handleGenerate() {
    setIsGenerating(true)
    setSaveStatus(null)
    setGenInfo(null)
    try {
      const result = await generateBio(pet.pet_id, userCode, {
        language,
        force: forceMode,
        push_to_aalda: true,
      })
      setBioText(result.bio)
      setIsDirty(false)
      setGenInfo({
        bio_state: result.bio_state,
        bio_readiness: result.bio_readiness,
        level: result.level,
        needs_more_data: result.needs_more_data,
      })
      if (result.saved_to_aalda) {
        setSaveStatus({ type: 'success', msg: 'Bio generated and saved to profile.' })
      } else if (result.bio_state !== 'generated') {
        setSaveStatus({ type: 'info', msg: 'Not enough data for AI yet — template shown. Chat more to improve it.' })
      }
    } catch (err) {
      setSaveStatus({ type: 'error', msg: err.message })
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleSave() {
    if (!bioText.trim()) return
    setIsSaving(true)
    setSaveStatus(null)
    try {
      await saveBio(pet.pet_id, userCode, bioText.trim())
      setIsDirty(false)
      setSaveStatus({ type: 'success', msg: 'Saved to pet profile.' })
    } catch (err) {
      setSaveStatus({ type: 'error', msg: err.message })
    } finally {
      setIsSaving(false)
    }
  }

  const emoji = SPECIES_EMOJI[pet.species] || '🐾'
  const busy = isGenerating || isSaving
  const isTemplate = genInfo && genInfo.bio_state !== 'generated'
  const isAI = genInfo && genInfo.bio_state === 'generated'

  return (
    <div className="petbio">
      <div className="petbio-header">
        <button className="back-btn" onClick={onBack}>←</button>
        <div className="petbio-header-info">
          <h2 className="petbio-title">Pet Bio</h2>
          <p className="petbio-subtitle">{pet.name} · {pet.breed}</p>
        </div>
        <div className="petbio-avatar">{emoji}</div>
      </div>

      <div className="petbio-body">
        {/* Language toggle */}
        <div className="petbio-section">
          <label className="petbio-label">Language</label>
          <div className="lang-pills">
            {['EN', 'JA'].map(l => (
              <button
                key={l}
                className={`lang-pill ${language === l ? 'lang-pill-active' : ''}`}
                onClick={() => { setLanguage(l); setGenInfo(null) }}
                disabled={busy}
              >{l}</button>
            ))}
          </div>
        </div>

        {/* Bio textarea */}
        <div className="petbio-section">
          <label className="petbio-label">Bio text</label>
          <textarea
            className="petbio-textarea"
            value={bioText}
            onChange={e => { setBioText(e.target.value); setIsDirty(true); setSaveStatus(null) }}
            placeholder="No bio yet. Hit Generate to create one, or type your own and Save."
            rows={5}
            disabled={busy}
          />
          <p className="petbio-char-count">{bioText.length} chars</p>
        </div>

        {/* Generation result explanation — shown immediately after a generate call */}
        {genInfo && (
          <div className={`gen-result-card ${isAI ? 'gen-result-ai' : 'gen-result-template'}`}>
            <div className="gen-result-header">
              {isAI
                ? '✓ AI-generated bio'
                : genInfo.bio_state === 'fallback_template'
                  ? '⚠ LLM failed — showing fallback template'
                  : '⚠ Not enough data for AI — showing placeholder template'}
            </div>
            <div className="gen-result-meta">
              <span>Readiness {genInfo.bio_readiness} / 100</span>
              <span>·</span>
              <span>Level {genInfo.level}</span>
              {genInfo.bio_state !== 'generated' && (
                <>
                  <span>·</span>
                  <span>Need ≥ 10 for LLM</span>
                </>
              )}
            </div>
            <ReadinessBar score={genInfo.bio_readiness} />
            {isTemplate && (
              <p className="gen-result-hint">
                Chat with {pet.name} first to build their profile, then regenerate.
                Or use <strong>Force LLM</strong> below to call the AI anyway.
              </p>
            )}
          </div>
        )}

        {/* Force mode toggle */}
        <label className="force-toggle">
          <input
            type="checkbox"
            checked={forceMode}
            onChange={e => setForceMode(e.target.checked)}
            disabled={busy}
          />
          <span>Force LLM (bypass readiness gate)</span>
        </label>

        {/* Action buttons */}
        <div className="petbio-actions">
          <button
            className={`petbio-btn ${forceMode ? 'petbio-btn-force' : isDirty ? 'petbio-btn-outline' : 'petbio-btn-primary'}`}
            onClick={handleGenerate}
            disabled={busy}
          >
            {isGenerating
              ? 'Generating…'
              : forceMode ? 'Force Generate (LLM)' : 'Generate & Save'}
          </button>
          {isDirty && (
            <button
              className="petbio-btn petbio-btn-primary"
              onClick={handleSave}
              disabled={busy || !bioText.trim()}
            >
              {isSaving ? 'Saving…' : 'Save Edit'}
            </button>
          )}
        </div>

        {/* Save status banner */}
        {saveStatus && (
          <div className={`petbio-status petbio-status-${saveStatus.type}`}>
            {saveStatus.msg}
          </div>
        )}
      </div>
    </div>
  )
}
