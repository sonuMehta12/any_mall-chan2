import { useState } from 'react'
import './TestProfileManager.css'

const LS_KEY = 'anymall_test_profiles'

const EXAMPLE_PROFILES = [
  {
    id: 'example-buddy',
    label: 'Buddy (Golden Retriever, 3yr)',
    owner_name: 'Kenji',
    pets: [{
      name: 'Buddy',
      species: 'dog',
      breed: 'Golden Retriever',
      date_of_birth: '2023-04-01',
      sex: 'male',
      activity_level: 3,
      body_condition: 3,
      current_diet: 'dry kibble',
      food_allergies: 'chicken',
      size: 'large',
      life_stage: 'adult',
    }],
    created_at: new Date().toISOString(),
  },
  {
    id: 'example-mochi',
    label: 'Mochi (Shiba Inu, 5yr)',
    owner_name: 'Yuki',
    pets: [{
      name: 'Mochi',
      species: 'dog',
      breed: 'Shiba Inu',
      date_of_birth: '2021-03-10',
      sex: 'female',
      activity_level: 2,
      body_condition: 4,
      current_diet: 'wet food + dry mix',
      food_allergies: '',
      size: 'medium',
      life_stage: 'adult',
    }],
    created_at: new Date().toISOString(),
  },
  {
    id: 'example-hana-leo',
    label: 'Hana & Leo (Shiba Inu + Ragdoll cat)',
    owner_name: 'Saki',
    pets: [
      {
        name: 'Hana',
        species: 'dog',
        breed: 'Shiba Inu',
        date_of_birth: '2022-06-15',
        sex: 'female',
        activity_level: 4,
        body_condition: 3,
        current_diet: 'dry kibble + occasional wet food',
        food_allergies: 'beef',
        size: 'medium',
        life_stage: 'adult',
      },
      {
        name: 'Leo',
        species: 'cat',
        breed: 'Ragdoll',
        date_of_birth: '2020-11-03',
        sex: 'male',
        activity_level: 2,
        body_condition: 4,
        current_diet: 'premium dry cat food',
        food_allergies: '',
        size: 'medium',
        life_stage: 'adult',
      },
    ],
    created_at: new Date().toISOString(),
  },
]

const JSON_SCHEMA_HINT = `// Profile (owner_name + 1 or 2 pets). All fields are OPTIONAL — omit any to test sparse profiles.
{
  "owner_name": "Kenji",                // optional — pet parent's name
  "pets": [
    {
      "name": "Buddy",                  // optional — display name
      "species": "dog",                 // optional — "dog" | "cat"
      "breed": "Golden Retriever",      // optional
      "date_of_birth": "2023-04-01",    // optional — YYYY-MM-DD (used to infer life_stage)
      "sex": "male",                    // optional — "male" | "female" | "unknown"
      "activity_level": 3,              // optional — 1 (sedentary) – 5 (very active)
      "body_condition": 3,              // optional — 1–5 (BCS scale)
      "current_diet": "dry kibble",     // optional
      "food_allergies": "chicken",      // optional — empty string if none
      "size": "large",                  // optional — "small" | "medium" | "large" (overrides breed-based inference)
      "life_stage": "adult"             // optional — "puppy" | "adult" | "senior" | "kitten" (overrides DOB-based inference)
    }
  ]
}`

const BLANK_PET = {
  name: '',
  species: 'dog',
  breed: '',
  date_of_birth: '',
  sex: 'male',
  activity_level: 3,
  body_condition: 3,
  current_diet: '',
  food_allergies: '',
  size: '',
  life_stage: '',
}

function loadProfiles() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]')
  } catch {
    return []
  }
}

function saveProfiles(profiles) {
  localStorage.setItem(LS_KEY, JSON.stringify(profiles))
}

function makeLabel(pets) {
  return pets.map(p => `${p.name}${p.breed ? ` (${p.breed})` : ` (${p.species})`}`).join(' & ')
}

function formatDate(isoStr) {
  if (!isoStr) return ''
  try {
    return new Date(isoStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return isoStr
  }
}

export default function TestProfileManager({ onBack, onStartChat, language, onLanguageChange }) {
  const [profiles, setProfiles] = useState(loadProfiles)
  // 'list' | 'form' | 'json'
  const [view, setView] = useState('list')
  const [formPets, setFormPets] = useState([{ ...BLANK_PET }])
  const [formOwnerName, setFormOwnerName] = useState('')
  const [editId, setEditId] = useState(null)
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState(null)
  const [showSchemaHint, setShowSchemaHint] = useState(false)
  const [formError, setFormError] = useState(null)

  // ── Examples ──────────────────────────────────────────────────────────────

  function handleLoadExamples() {
    const existing = loadProfiles()
    const existingIds = new Set(existing.map(p => p.id))
    const toAdd = EXAMPLE_PROFILES.filter(e => !existingIds.has(e.id))
    if (toAdd.length === 0) return
    const merged = [...existing, ...toAdd]
    saveProfiles(merged)
    setProfiles(merged)
  }

  // ── Form ──────────────────────────────────────────────────────────────────

  function openNewForm() {
    setFormPets([{ ...BLANK_PET }])
    setFormOwnerName('')
    setEditId(null)
    setFormError(null)
    setView('form')
  }

  function openEditForm(profile) {
    setFormPets(profile.pets.map(p => ({ ...p })))
    setFormOwnerName(profile.owner_name || '')
    setEditId(profile.id)
    setFormError(null)
    setView('form')
  }

  function updatePet(index, field, value) {
    setFormPets(prev => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  function handleAddSecondPet() {
    setFormPets(prev => [...prev, { ...BLANK_PET }])
  }

  function handleRemoveSecondPet() {
    setFormPets(prev => prev.slice(0, 1))
  }

  function handleSaveForm() {
    // Pet Name is the only UI-required field — a blank name produces an unlabelled
    // profile card. All other fields are optional so testers can probe sparse profiles.
    for (let i = 0; i < formPets.length; i++) {
      const p = formPets[i]
      if (!p.name.trim()) return setFormError(`Pet ${i + 1}: name is required`)
    }
    setFormError(null)

    const label = makeLabel(formPets)
    const entry = {
      id: editId || crypto.randomUUID(),
      label,
      owner_name: formOwnerName.trim(),
      pets: formPets.map(p => ({
        ...p,
        name: p.name.trim(),
        breed: p.breed.trim(),
        activity_level: Number(p.activity_level),
        body_condition: Number(p.body_condition),
        food_allergies: p.food_allergies.trim(),
        size: p.size || '',
        life_stage: p.life_stage || '',
      })),
      created_at: new Date().toISOString(),
    }

    const updated = editId
      ? profiles.map(p => p.id === editId ? entry : p)
      : [...profiles, entry]
    saveProfiles(updated)
    setProfiles(updated)
    setView('list')
    setEditId(null)
  }

  // ── JSON paste ────────────────────────────────────────────────────────────

  function handleSaveJson() {
    try {
      const parsed = JSON.parse(jsonText)
      // Accept: { owner_name, pets: [...] }  OR  [pet, pet]  OR  single pet
      let ownerNameFromJson = ''
      let petsArr
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.pets) {
        // New format: { owner_name, pets: [...] }
        ownerNameFromJson = String(parsed.owner_name || '').trim()
        petsArr = Array.isArray(parsed.pets) ? parsed.pets : [parsed.pets]
      } else {
        // Legacy: array or single pet object
        petsArr = Array.isArray(parsed) ? parsed : [parsed]
      }
      if (petsArr.length < 1 || petsArr.length > 2) {
        throw new Error('Provide 1 or 2 pet objects')
      }
      petsArr.forEach((p, i) => {
        if (p.species != null && p.species !== '' && !['dog', 'cat'].includes(p.species)) {
          throw new Error(`Pet ${i + 1}: "species" must be "dog" or "cat" if provided`)
        }
        if (p.sex != null && p.sex !== '' && !['male', 'female', 'unknown'].includes(p.sex)) {
          throw new Error(`Pet ${i + 1}: "sex" must be "male", "female", or "unknown" if provided`)
        }
        if (p.size != null && p.size !== '' && !['small', 'medium', 'large'].includes(p.size)) {
          throw new Error(`Pet ${i + 1}: "size" must be "small", "medium", or "large" if provided`)
        }
        if (p.life_stage != null && p.life_stage !== '' && !['puppy', 'adult', 'senior', 'kitten'].includes(p.life_stage)) {
          throw new Error(`Pet ${i + 1}: "life_stage" must be "puppy", "adult", "senior", or "kitten" if provided`)
        }
      })

      const pets = petsArr.map(p => ({
        name: String(p.name || '').trim(),
        species: p.species || 'dog',
        breed: String(p.breed || '').trim(),
        date_of_birth: p.date_of_birth || '',
        sex: p.sex || 'unknown',
        activity_level: p.activity_level == null ? 3 : Math.min(5, Math.max(1, Number(p.activity_level) || 3)),
        body_condition: p.body_condition == null ? 3 : Math.min(5, Math.max(1, Number(p.body_condition) || 3)),
        current_diet: String(p.current_diet || '').trim(),
        food_allergies: String(p.food_allergies || '').trim(),
        size: p.size || '',
        life_stage: p.life_stage || '',
      }))

      const entry = {
        id: crypto.randomUUID(),
        label: makeLabel(pets),
        owner_name: ownerNameFromJson,
        pets,
        created_at: new Date().toISOString(),
      }
      const updated = [...profiles, entry]
      saveProfiles(updated)
      setProfiles(updated)
      setJsonText('')
      setJsonError(null)
      setView('list')
    } catch (e) {
      setJsonError(e.message)
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  function handleDelete(id) {
    const updated = profiles.filter(p => p.id !== id)
    saveProfiles(updated)
    setProfiles(updated)
  }

  // ── Use ───────────────────────────────────────────────────────────────────

  function handleUseProfile(profile) {
    onStartChat({ pets: profile.pets, ownerName: profile.owner_name || '' })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (view === 'form') {
    return (
      <div className="tpm">
        <div className="tpm-header">
          <button className="tpm-back-btn" onClick={() => { setView('list'); setEditId(null) }}>←</button>
          <div>
            <div className="tpm-title">{editId ? 'Edit Profile' : 'New Profile'}</div>
            <div className="tpm-subtitle">Fill in pet details below</div>
          </div>
          <div className="tpm-badge">🧪 Test</div>
        </div>

        <div className="tpm-form">
          <div className="tpm-form-note" style={{ marginBottom: 12, fontSize: 13, opacity: 0.75 }}>
            Only <strong>Pet Name</strong> is required. Everything else is optional — leave fields blank to test sparse-profile behaviour.
          </div>

          {/* Owner / pet parent name */}
          <div className="tpm-field">
            <label className="tpm-label">Your Name (pet parent) <span className="tpm-optional">(optional)</span></label>
            <input
              className="tpm-input"
              value={formOwnerName}
              onChange={e => setFormOwnerName(e.target.value)}
              placeholder="e.g. Kenji"
            />
          </div>

          <div className="tpm-divider" />

          {formPets.map((pet, idx) => (
            <div key={idx}>
              {formPets.length > 1 && (
                <div className="tpm-section-title">Pet {idx + 1}</div>
              )}

              <div className="tpm-field">
                <label className="tpm-label">Pet Name *</label>
                <input className="tpm-input" value={pet.name} onChange={e => updatePet(idx, 'name', e.target.value)} placeholder="e.g. Buddy" />
              </div>

              <div className="tpm-field-row">
                <div className="tpm-field">
                  <label className="tpm-label">Species <span className="tpm-optional">(optional)</span></label>
                  <select className="tpm-select" value={pet.species} onChange={e => updatePet(idx, 'species', e.target.value)}>
                    <option value="dog">🐕 Dog</option>
                    <option value="cat">🐱 Cat</option>
                  </select>
                </div>
                <div className="tpm-field">
                  <label className="tpm-label">Sex <span className="tpm-optional">(optional)</span></label>
                  <select className="tpm-select" value={pet.sex} onChange={e => updatePet(idx, 'sex', e.target.value)}>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>
              </div>

              <div className="tpm-field">
                <label className="tpm-label">Breed <span className="tpm-optional">(optional)</span></label>
                <input className="tpm-input" value={pet.breed} onChange={e => updatePet(idx, 'breed', e.target.value)} placeholder="e.g. Golden Retriever" />
              </div>

              <div className="tpm-field">
                <label className="tpm-label">Date of Birth <span className="tpm-optional">(optional)</span></label>
                <input className="tpm-input" type="date" value={pet.date_of_birth} onChange={e => updatePet(idx, 'date_of_birth', e.target.value)} />
              </div>

              <div className="tpm-field">
                <label className="tpm-label">Activity Level <span className="tpm-optional">(optional)</span> <span className="tpm-optional">— 1 sedentary · 5 very active</span></label>
                <div className="tpm-rating-row">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      className={`tpm-rating-btn ${pet.activity_level === n ? 'tpm-rating-btn-active' : ''}`}
                      onClick={() => updatePet(idx, 'activity_level', n)}
                    >{n}</button>
                  ))}
                </div>
              </div>

              <div className="tpm-field">
                <label className="tpm-label">Body Condition Score <span className="tpm-optional">(optional)</span> <span className="tpm-optional">— 1 thin · 5 obese</span></label>
                <div className="tpm-rating-row">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      className={`tpm-rating-btn ${pet.body_condition === n ? 'tpm-rating-btn-active' : ''}`}
                      onClick={() => updatePet(idx, 'body_condition', n)}
                    >{n}</button>
                  ))}
                </div>
              </div>

              <div className="tpm-field-row">
                <div className="tpm-field">
                  <label className="tpm-label">Size <span className="tpm-optional">(optional)</span></label>
                  <select className="tpm-select" value={pet.size} onChange={e => updatePet(idx, 'size', e.target.value)}>
                    <option value="">— not set —</option>
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                </div>
                <div className="tpm-field">
                  <label className="tpm-label">Life Stage <span className="tpm-optional">(optional)</span></label>
                  <select className="tpm-select" value={pet.life_stage} onChange={e => updatePet(idx, 'life_stage', e.target.value)}>
                    <option value="">— not set —</option>
                    <option value="puppy">Puppy</option>
                    <option value="kitten">Kitten</option>
                    <option value="adult">Adult</option>
                    <option value="senior">Senior</option>
                  </select>
                </div>
              </div>

              <div className="tpm-field">
                <label className="tpm-label">Current Diet <span className="tpm-optional">(optional)</span></label>
                <input className="tpm-input" value={pet.current_diet} onChange={e => updatePet(idx, 'current_diet', e.target.value)} placeholder="e.g. dry kibble, wet food" />
              </div>

              <div className="tpm-field">
                <label className="tpm-label">Food Allergies / Sensitivities <span className="tpm-optional">(optional)</span></label>
                <input className="tpm-input" value={pet.food_allergies} onChange={e => updatePet(idx, 'food_allergies', e.target.value)} placeholder="e.g. chicken, wheat (leave empty if none)" />
              </div>

              {idx === 0 && formPets.length === 1 && (
                <button className="tpm-add-pet-btn" onClick={handleAddSecondPet}>+ Add Second Pet</button>
              )}
              {idx === 1 && (
                <button className="tpm-add-pet-btn tpm-remove-pet-btn" onClick={handleRemoveSecondPet}>− Remove Second Pet</button>
              )}
              {idx < formPets.length - 1 && <div className="tpm-divider" />}
            </div>
          ))}

          {formError && <div className="tpm-json-error">{formError}</div>}
        </div>

        <div className="tpm-footer">
          <button className="tpm-btn-secondary" onClick={() => { setView('list'); setEditId(null) }}>Cancel</button>
          <button className="tpm-btn-primary" onClick={handleSaveForm}>Save Profile</button>
        </div>
      </div>
    )
  }

  if (view === 'json') {
    return (
      <div className="tpm">
        <div className="tpm-header">
          <button className="tpm-back-btn" onClick={() => { setView('list'); setJsonError(null) }}>←</button>
          <div>
            <div className="tpm-title">Paste Profile JSON</div>
            <div className="tpm-subtitle">Paste raw JSON for 1 or 2 pets</div>
          </div>
          <div className="tpm-badge">🧪 Test</div>
        </div>

        <div className="tpm-form">
          <textarea
            className="tpm-json-textarea"
            value={jsonText}
            onChange={e => { setJsonText(e.target.value); setJsonError(null) }}
            placeholder={`{\n  "name": "Buddy",\n  "species": "dog",\n  ...\n}`}
            spellCheck={false}
          />
          {jsonError && <div className="tpm-json-error">⚠ {jsonError}</div>}
          <div>
            <button className="tpm-schema-toggle" onClick={() => setShowSchemaHint(v => !v)}>
              {showSchemaHint ? '▲ Hide schema' : '▼ What format?'}
            </button>
            {showSchemaHint && <pre className="tpm-json-schema">{JSON_SCHEMA_HINT}</pre>}
          </div>
        </div>

        <div className="tpm-footer">
          <button className="tpm-btn-secondary" onClick={() => { setView('list'); setJsonError(null) }}>Cancel</button>
          <button className="tpm-btn-primary" onClick={handleSaveJson} disabled={!jsonText.trim()}>Save</button>
        </div>
      </div>
    )
  }

  // ── List view ─────────────────────────────────────────────────────────────
  return (
    <div className="tpm">
      <div className="tpm-header">
        <button className="tpm-back-btn" onClick={onBack}>←</button>
        <div>
          <div className="tpm-title">Test Profiles</div>
          <div className="tpm-subtitle">Bypass AALDA — use custom pet data</div>
        </div>
        <div className="tpm-header-right">
          <div className="tpm-lang-row">
            <select
              className="tpm-lang-select"
              value={language}
              onChange={e => onLanguageChange(e.target.value)}
            >
              <option value="EN">EN</option>
              <option value="JA">JA</option>
            </select>
          </div>
          <button className="tpm-btn-examples" onClick={handleLoadExamples} title="Load 3 example profiles">
            Load Examples
          </button>
        </div>
      </div>

      <div className="tpm-list">
        {profiles.length === 0 ? (
          <div className="tpm-empty">
            <div className="tpm-empty-icon">🧪</div>
            <div className="tpm-empty-title">No test profiles yet</div>
            <div className="tpm-empty-text">
              Click "Load Examples" to get started with 3 sample pets,<br />
              or create your own using the buttons below.
            </div>
          </div>
        ) : (
          profiles.map(profile => (
            <div key={profile.id} className="tpm-card">
              <div className="tpm-card-label">{profile.label}</div>
              <div className="tpm-card-meta">
                {profile.owner_name && <span>👤 {profile.owner_name} · </span>}
                {profile.pets.length} pet{profile.pets.length > 1 ? 's' : ''} · Added {formatDate(profile.created_at)}
              </div>
              <div className="tpm-card-actions">
                <button className="tpm-use-btn" onClick={() => handleUseProfile(profile)}>
                  Use →
                </button>
                <button className="tpm-edit-btn" onClick={() => openEditForm(profile)}>Edit</button>
                <button className="tpm-delete-btn" onClick={() => handleDelete(profile.id)}>✕</button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="tpm-footer">
        <button className="tpm-btn-secondary" onClick={() => setView('json')}>Paste JSON</button>
        <button className="tpm-btn-primary" onClick={openNewForm}>+ Add New</button>
      </div>
    </div>
  )
}
