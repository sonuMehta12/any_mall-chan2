// Development: VITE_API_URL=http://127.0.0.1:8000 (set in .env.development or via CLI)
// Production:  empty string — requests go to the same server serving the frontend
export const BASE = import.meta.env.VITE_API_URL ?? ''

// GET /api/v1/pets — fetch user's pets from AALDA
export async function fetchPets(userCode) {
  const res = await fetch(`${BASE}/api/v1/pets`, {
    headers: { 'X-User-Code': userCode },
  })
  if (!res.ok) throw new Error(`${res.status} — failed to fetch pets`)
  const data = await res.json()
  return data.pets
}

// POST /api/v1/chat
export async function sendMessage({ sessionId, message, petIds, userCode, language = 'auto', displayName = '' }) {
  const res = await fetch(`${BASE}/api/v1/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Code': userCode,
    },
    body: JSON.stringify({
      session_id: sessionId,
      message,
      pet_ids: petIds,
      language,
      display_name: displayName,
    }),
  })
  if (!res.ok) {
    if (res.status === 400) {
      const body = await res.json().catch(() => ({}))
      const err = new Error(body.detail || "I can't help with that.")
      err.isRejection = true
      throw err
    }
    throw new Error(`${res.status} — failed to send message`)
  }
  const data = await res.json()

  // ── Agent 1 — logged immediately (synchronous, in the /chat response) ───────
  console.group(
    `%c[Agent 1]  intent=${data.intent_type?.toUpperCase()}  urgency=${data.urgency}  is_entity=${data.is_entity}`,
    'color:#7c3aed; font-weight:bold'
  )
  console.log('reply       →', data.message)
  console.log('is_entity   →', data.is_entity, '  (true = message had extractable pet facts)')
  console.log('intent_type →', data.intent_type)
  console.log('urgency     →', data.urgency)
  console.log('guardrailed →', data.was_guardrailed)
  if (data.redirect) {
    console.log('redirect    →', data.redirect)
  }
  console.groupEnd()

  // ── Agent 2 (Compressor) — logged after 8s (runs fire-and-forget in background) ──
  const primaryPetId = petIds[0]
  setTimeout(async () => {
    try {
      const factsRes = await fetch(
        `${BASE}/api/v1/debug/facts?pet_id=${primaryPetId}&session_id=${data.session_id}&limit=10`
      )
      const factsData = await factsRes.json()

      if (factsData.facts?.length > 0) {
        console.group(
          `%c[Agent 2]  Compressor extracted ${factsData.count} fact(s)`,
          'color:#059669; font-weight:bold'
        )
        factsData.facts.forEach(f => {
          const flag = f.needs_clarification ? '⚠ needs clarification' : '✓ high confidence'
          console.log(
            `  ${f.key.padEnd(24)} = "${f.value}"`,
            `| conf=${f.confidence}`,
            `| scope=${f.time_scope}`,
            `| ${flag}`
          )
        })
        console.groupEnd()
      } else {
        console.log(
          '%c[Agent 2]  Compressor — no facts extracted  (is_entity=false or nothing extractable)',
          'color:#6b7280'
        )
      }
    } catch (e) {
      console.warn('[Agent 2] Could not fetch /debug/facts:', e)
    }

    // ── Agent 3 (Aggregator) — logged right after Agent 2 (same poll window) ──
    try {
      const profileRes = await fetch(`${BASE}/api/v1/debug/profile?pet_id=${primaryPetId}`)
      const profileData = await profileRes.json()

      if (profileData.status === 'ok' && profileData.field_count > 0) {
        console.group(
          `%c[Agent 3]  Aggregator — active profile (${profileData.field_count} field(s))`,
          'color:#d97706; font-weight:bold'
        )
        Object.entries(profileData.profile).forEach(([key, entry]) => {
          if (key.startsWith('_')) return // skip metadata like _pet_history
          const status = entry.status ? `status=${entry.status}` : ''
          const change = entry.change_detected ? `  change="${entry.change_detected}"` : ''
          console.log(
            `  ${key.padEnd(24)} = "${entry.value}"`,
            `| conf=${entry.confidence}`,
            `| ${status}${change}`
          )
        })
        console.groupEnd()
      } else {
        console.log(
          '%c[Agent 3]  Aggregator — no active profile yet',
          'color:#6b7280'
        )
      }
    } catch (e) {
      console.warn('[Agent 3] Could not fetch /debug/profile:', e)
    }
  }, 8000)

  return data
}


// POST /api/v1/chat/stream — SSE streaming variant.
//
// Calls the streaming endpoint and dispatches frame callbacks as frames arrive.
// Uses fetch() + ReadableStream (not EventSource, which doesn't support POST).
//
// Callbacks:
//   onMeta(frame)           — first frame; carries intent_type, urgency, etc.
//   onStatus(frame)         — progress update ("Fetching recipes...", etc.)
//   onToolsComplete(frame)  — tool calls done; carries recipes_by_pet, effective_mode
//   onToken(frame)          — one LLM token; frame.content is the partial text
//   onDone(frame)           — stream complete; frame.final_text, was_guardrailed, redirect
//   onError(frame)          — backend-sent error frame
//
// Returns a controller with { abort() } so the caller can cancel mid-stream.
export function sendMessageStream({
  sessionId, message, petIds, userCode, language = 'auto', displayName = '',
  onMeta = () => {}, onStatus = () => {}, onToolsComplete = () => {},
  onToken = () => {}, onDone = () => {}, onError = () => {},
}) {
  const controller = new AbortController()

  ;(async () => {
    let res
    try {
      res = await fetch(`${BASE}/api/v1/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Code': userCode,
        },
        body: JSON.stringify({
          session_id: sessionId,
          message,
          pet_ids: petIds,
          language,
          display_name: displayName,
        }),
        signal: controller.signal,
      })
    } catch (err) {
      if (err.name !== 'AbortError') onError({ type: 'error', message: err.message })
      return
    }

    if (!res.ok) {
      let detail = `${res.status} — stream request failed`
      try {
        const body = await res.json()
        detail = body.detail || detail
      } catch {}
      onError({ type: 'error', message: detail })
      return
    }

    // Read the response body as a stream of text chunks
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let receivedDone = false

    while (true) {
      let done, value
      try {
        ;({ done, value } = await reader.read())
      } catch {
        break  // aborted or network error
      }
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Parse complete SSE frames from the buffer.
      // Frames are delimited by \n\n; incomplete frames stay in the buffer.
      const parts = buffer.split('\n\n')
      buffer = parts.pop()  // last part may be incomplete — keep it

      for (const part of parts) {
        const line = part.trim()
        if (!line.startsWith('data: ')) continue
        try {
          const frame = JSON.parse(line.slice(6))
          switch (frame.type) {
            case 'meta':           onMeta(frame);           break
            case 'status':         onStatus(frame);         break
            case 'tools_complete': onToolsComplete(frame);  break
            case 'token':          onToken(frame);          break
            case 'done':           receivedDone = true; onDone(frame);   break
            case 'error':          receivedDone = true; onError(frame);  break
          }
        } catch {
          // Malformed JSON in a frame — skip it
        }
      }
    }

    // Stream ended without a done/error frame — backend was restarted or
    // connection dropped mid-stream. Reset the UI so the input is usable again.
    if (!receivedDone) {
      onError({ type: 'error', message: "Connection lost. Please try again." })
    }
  })()

  return controller
}


// POST /api/v1/pets/setup/query — confidence score + suggested questions.
// Returns confidence_score, confidence_color, and suggested_questions (3 items,
// filtered by module). Works for 1 or more pet IDs.
// module: 'anymall' (default) | 'food' | 'health'
export async function fetchSetup(petIds, userCode, language = 'auto', module = 'anymall') {
  const ids = Array.isArray(petIds) ? petIds : [petIds]
  const res = await fetch(`${BASE}/api/v1/pets/setup/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Code': userCode,
    },
    body: JSON.stringify({ pet_ids: ids, language, module }),
  })
  if (!res.ok) throw new Error(`${res.status} — failed to fetch setup`)
  return res.json()
}

// GET /api/v1/confidence — backward-compatible alias (confidence only, no questions).
// Still used by the post-chat refresh (only needs score, not questions).
export async function fetchConfidence(petIds, userCode) {
  const ids = Array.isArray(petIds) ? petIds : [petIds]
  const query = ids.map(id => `pet_id=${id}`).join('&')
  const res = await fetch(`${BASE}/api/v1/confidence?${query}`, {
    headers: { 'X-User-Code': userCode },
  })
  if (!res.ok) throw new Error(`${res.status} — failed to fetch confidence`)
  return res.json()
}
