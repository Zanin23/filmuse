export function fmt(s) {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  const ms = Math.floor((s % 1) * 10)
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${ms}`
}

export function fmtShort(s) {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3)
}

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v))
}

export function clipDur(c) {
  if (!c) return 0
  return Math.max(0.1, (c.trimEnd - c.trimStart) / (c.speed || 1))
}

export function overlayDur(o) {
  if (!o) return 0
  return Math.max(0.1, (o.trimEnd - o.trimStart) / (o.speed || 1))
}

export function audioDur(a) {
  if (!a) return 0
  return Math.max(0.1, (a.trimEnd - a.trimStart) / (a.speed || 1))
}

export function fmtSize(mb) {
  if (!isFinite(mb) || mb < 0) mb = 0
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`
}

// Global image element cache for synchronous canvas rendering
const imageCache = new Map()
const imageListeners = new Set()

export function subscribeImageLoad(cb) {
  imageListeners.add(cb)
  return () => imageListeners.delete(cb)
}

export function getCachedImage(url) {
  if (!url) return null
  if (imageCache.has(url)) return imageCache.get(url)
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    imageListeners.forEach((fn) => fn(url))
  }
  img.src = url
  imageCache.set(url, img)
  return img
}

export function preloadImage(url) {
  return new Promise((resolve) => {
    if (!url) { resolve(null); return }
    const existing = imageCache.get(url)
    if (existing && existing.complete && existing.naturalWidth > 0) {
      resolve(existing)
      return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      imageCache.set(url, img)
      imageListeners.forEach((fn) => fn(url))
      resolve(img)
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

// Handles both standard MP4/MOV and MediaRecorder WebM blobs (where duration can initially be Infinity)
export function probeVideoMeta(url, fallbackDuration = 5) {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.preload = 'metadata'
    let settled = false
    const finish = (res) => {
      if (settled) return
      settled = true
      v.removeAttribute('src')
      v.load()
      resolve(res)
    }
    const timer = setTimeout(() => {
      finish({ duration: fallbackDuration, w: 1280, h: 720 })
    }, 6000)

    v.onloadedmetadata = () => {
      const w = v.videoWidth || 1280
      const h = v.videoHeight || 720
      if (isFinite(v.duration) && v.duration > 0) {
        clearTimeout(timer)
        finish({ duration: v.duration, w, h })
      } else {
        // WebM blob duration fix
        v.currentTime = 1e10
        v.ontimeupdate = () => {
          v.ontimeupdate = null
          clearTimeout(timer)
          const d = isFinite(v.duration) && v.duration > 0 ? v.duration : fallbackDuration
          finish({ duration: d, w, h })
        }
      }
    }
    v.onerror = () => {
      clearTimeout(timer)
      finish({ duration: fallbackDuration, w: 1280, h: 720 })
    }
    v.src = url
  })
}

export function probeAudioMeta(url, fallbackDuration = 5) {
  return new Promise((resolve) => {
    const a = document.createElement('audio')
    a.preload = 'metadata'
    let settled = false
    const finish = (d) => {
      if (settled) return
      settled = true
      a.removeAttribute('src')
      resolve({ duration: d })
    }
    const timer = setTimeout(() => finish(fallbackDuration), 5000)
    a.onloadedmetadata = () => {
      if (isFinite(a.duration) && a.duration > 0) {
        clearTimeout(timer)
        finish(a.duration)
      } else {
        a.currentTime = 1e10
        a.ontimeupdate = () => {
          a.ontimeupdate = null
          clearTimeout(timer)
          finish(isFinite(a.duration) && a.duration > 0 ? a.duration : fallbackDuration)
        }
      }
    }
    a.onerror = () => {
      clearTimeout(timer)
      finish(fallbackDuration)
    }
    a.src = url
  })
}

export async function captureFilmstrip(url, duration, count = 6) {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.preload = 'auto'
    v.src = url
    const frames = []
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      v.removeAttribute('src')
      v.load()
      resolve({ thumb: frames[0] || '', filmstrip: frames })
    }
    const timeout = setTimeout(done, 6500)

    const cv = document.createElement('canvas')
    cv.width = 240
    cv.height = 135
    const ctx = cv.getContext('2d')

    const snap = () => {
      try {
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, 240, 135)
        const vw = v.videoWidth || 240
        const vh = v.videoHeight || 135
        const sc = Math.max(240 / vw, 135 / vh)
        const dw = vw * sc
        const dh = vh * sc
        ctx.drawImage(v, (240 - dw) / 2, (135 - dh) / 2, dw, dh)
        return cv.toDataURL('image/jpeg', 0.65)
      } catch {
        return ''
      }
    }

    const dur = Math.max(0.5, isFinite(duration) && duration > 0 ? duration : 4)
    const n = Math.max(1, Math.min(count, Math.ceil(dur * 1.5)))
    let idx = 0

    const seekNext = () => {
      if (idx >= n) {
        clearTimeout(timeout)
        done()
        return
      }
      const frac = n === 1 ? 0.2 : (idx + 0.35) / n
      const t = clamp(dur * frac, 0.05, Math.max(0.05, dur - 0.08))
      try {
        v.currentTime = t
      } catch {
        clearTimeout(timeout)
        done()
      }
    }

    v.onloadeddata = () => seekNext()
    v.onseeked = () => {
      const data = snap()
      if (data) frames.push(data)
      idx++
      seekNext()
    }
    v.onerror = () => {
      clearTimeout(timeout)
      done()
    }
  })
}

export async function extractAudioPeaks(fileOrBlob, barCount = 100) {
  if (!fileOrBlob) return generateFallbackPeaks(barCount)
  let audioCtx = null
  try {
    const ab = await fileOrBlob.arrayBuffer()
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return generateFallbackPeaks(barCount)
    audioCtx = new Ctx()
    const buf = await audioCtx.decodeAudioData(ab)
    const ch = buf.getChannelData(0)
    const step = Math.max(1, Math.floor(ch.length / barCount))
    const peaks = []
    let maxPeak = 0.01
    for (let i = 0; i < barCount; i++) {
      const start = i * step
      let max = 0
      const stride = Math.max(1, Math.floor(step / 64))
      for (let j = 0; j < step && start + j < ch.length; j += stride) {
        const val = Math.abs(ch[start + j])
        if (val > max) max = val
      }
      peaks.push(max)
      if (max > maxPeak) maxPeak = max
    }
    try { await audioCtx.close() } catch {}
    return {
      hasAudio: maxPeak > 0.012,
      peaks: peaks.map(p => clamp(p / maxPeak, 0.08, 1)),
    }
  } catch {
    try { await audioCtx?.close() } catch {}
    return { hasAudio: false, peaks: generateFallbackPeaks(barCount) }
  }
}

export function generateFallbackPeaks(barCount = 80) {
  const arr = []
  for (let i = 0; i < barCount; i++) {
    arr.push(0.2 + 0.55 * Math.abs(Math.sin(i * 0.43) * Math.cos(i * 0.17)))
  }
  return arr
}

export function generateColorCardThumb(style) {
  const cv = document.createElement('canvas')
  cv.width = 240
  cv.height = 135
  const ctx = cv.getContext('2d')
  if (style.bg2 && style.bg2 !== style.bg) {
    const rad = ((style.angle ?? 135) * Math.PI) / 180
    const cx = 120, cy = 67.5
    const g = ctx.createLinearGradient(
      cx - Math.cos(rad) * 140,
      cy - Math.sin(rad) * 90,
      cx + Math.cos(rad) * 140,
      cy + Math.sin(rad) * 90
    )
    g.addColorStop(0, style.bg)
    g.addColorStop(1, style.bg2)
    ctx.fillStyle = g
  } else {
    ctx.fillStyle = style.bg || '#000000'
  }
  ctx.fillRect(0, 0, 240, 135)
  return cv.toDataURL('image/jpeg', 0.8)
}

// Synthesize real PCM WAV Blob for built-in sound effects & background loops
export function synthesizeSfxWav(kind = 'pop', duration = 0.6) {
  const sr = 44100
  const n = Math.max(1, Math.floor(sr * duration))
  const samples = new Float32Array(n)

  for (let i = 0; i < n; i++) {
    const t = i / sr
    const prog = i / n
    let s = 0

    if (kind === 'whoosh') {
      const env = Math.sin(Math.PI * Math.pow(prog, 0.75))
      const noise = (Math.random() * 2 - 1) * 0.45
      const sweep = Math.sin(2 * Math.PI * (140 + 480 * Math.sin(Math.PI * prog)) * t) * 0.35
      s = (noise + sweep) * env
    } else if (kind === 'pop') {
      const env = Math.exp(-t * 22)
      const freq = 260 + 420 * Math.exp(-t * 35)
      s = Math.sin(2 * Math.PI * freq * t) * env * 0.85
    } else if (kind === 'ding') {
      const env = Math.exp(-t * 4.2)
      s = (Math.sin(2 * Math.PI * 1046.5 * t) * 0.6 + Math.sin(2 * Math.PI * 2093 * t) * 0.25) * env
    } else if (kind === 'success') {
      const notes = [523.25, 659.25, 783.99, 1046.5]
      for (let k = 0; k < notes.length; k++) {
        const nt = t - k * 0.09
        if (nt > 0) {
          s += Math.sin(2 * Math.PI * notes[k] * nt) * Math.exp(-nt * 3.5) * 0.28
        }
      }
    } else if (kind === 'impact') {
      const env = Math.exp(-t * 4.0)
      const sub = Math.sin(2 * Math.PI * (95 * Math.exp(-t * 3.2) + 38) * t) * 0.75
      const crack = (Math.random() * 2 - 1) * Math.exp(-t * 18) * 0.45
      s = (sub + crack) * env
    } else if (kind === 'riser') {
      const env = Math.pow(prog, 2.0) * (prog > 0.94 ? (1 - prog) / 0.06 : 1)
      const freq = 140 + 780 * Math.pow(prog, 2.2)
      const noise = (Math.random() * 2 - 1) * 0.18
      s = (Math.sin(2 * Math.PI * freq * t) * 0.55 + noise) * env
    } else if (kind === 'lofi-loop') {
      // Warm 4-chord ambient synth loop (2s per chord over 8s)
      const chords = [
        [261.63, 329.63, 392.0, 493.88],  // Cmaj7
        [220.0, 261.63, 329.63, 392.0],   // Am7
        [174.61, 220.0, 261.63, 349.23],  // Fmaj7
        [196.0, 246.94, 293.66, 392.0],   // G6
      ]
      const ci = Math.floor((t % 8) / 2) % 4
      const localT = t % 2
      const chordEnv = Math.min(1, localT / 0.08) * Math.exp(-localT * 0.55)
      for (const f of chords[ci]) {
        s += Math.sin(2 * Math.PI * f * t + 0.2 * Math.sin(2 * Math.PI * 3 * t)) * 0.11 * chordEnv
      }
      // Subtle soft pulse every 0.5s
      const beatT = t % 0.5
      s += Math.sin(2 * Math.PI * (75 * Math.exp(-beatT * 18) + 45) * beatT) * Math.exp(-beatT * 12) * 0.22
      // Loop fade edges
      const loopFade = Math.min(1, t / 0.08, (duration - t) / 0.12)
      s *= clamp(loopFade, 0, 1)
    } else if (kind === 'tech-loop') {
      // Energetic arpeggio pulse loop
      const arp = [220, 277.18, 329.63, 440, 329.63, 277.18, 246.94, 329.63]
      const stepDur = 0.25
      const stepIdx = Math.floor(t / stepDur) % arp.length
      const st = t % stepDur
      const f = arp[stepIdx]
      const env = Math.min(1, st / 0.015) * Math.exp(-st * 7.5)
      s += (Math.sin(2 * Math.PI * f * t) * 0.3 + Math.sin(2 * Math.PI * f * 2 * t) * 0.12) * env
      const kickT = t % 0.5
      s += Math.sin(2 * Math.PI * (110 * Math.exp(-kickT * 22) + 48) * kickT) * Math.exp(-kickT * 10) * 0.3
      const loopFade = Math.min(1, t / 0.05, (duration - t) / 0.1)
      s *= clamp(loopFade, 0, 1)
    }

    samples[i] = clamp(s, -0.98, 0.98)
  }

  // Encode 16-bit mono WAV
  const buffer = new ArrayBuffer(44 + n * 2)
  const view = new DataView(buffer)
  const writeStr = (off, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + n * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // 1 channel
  view.setUint32(24, sr, true)
  view.setUint32(28, sr * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, n * 2, true)

  for (let i = 0; i < n; i++) {
    const int16 = Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767)))
    view.setInt16(44 + i * 2, int16, true)
  }

  const blob = new Blob([buffer], { type: 'audio/wav' })
  return blob
}
