import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrayBufferTarget, Muxer } from 'mp4-muxer'

const ASPECTS = {
  '16:9': { label: '16:9 · Horizontal', w: 1280, h: 720 },
  '9:16': { label: '9:16 · Vertical', w: 720, h: 1280 },
  '1:1': { label: '1:1 · Quadrado', w: 1080, h: 1080 },
  '4:5': { label: '4:5 · Retrato', w: 1080, h: 1350 },
}

const PRESETS = [
  { id: 'original', name: 'Original', icon: '🎨', f: { brightness: 1, contrast: 1, saturate: 1, grayscale: 0, sepia: 0, blur: 0, hue: 0 } },
  { id: 'pb', name: 'Preto e Branco', icon: '⚫', f: { brightness: 1, contrast: 1.05, saturate: 1, grayscale: 1, sepia: 0, blur: 0, hue: 0 } },
  { id: 'sepia', name: 'Sépia', icon: '🟤', f: { brightness: 1, contrast: 1, saturate: 1, grayscale: 0, sepia: 0.65, blur: 0, hue: 0 } },
  { id: 'vintage', name: 'Vintage', icon: '📼', f: { brightness: 1.05, contrast: 0.9, saturate: 0.85, grayscale: 0, sepia: 0.35, blur: 0, hue: 0 } },
  { id: 'quente', name: 'Quente', icon: '🔥', f: { brightness: 1.06, contrast: 1.05, saturate: 1.35, grayscale: 0, sepia: 0.15, blur: 0, hue: -12 } },
  { id: 'frio', name: 'Frio', icon: '❄️', f: { brightness: 1, contrast: 1.05, saturate: 0.9, grayscale: 0, sepia: 0, blur: 0, hue: 25 } },
  { id: 'dramatico', name: 'Dramático', icon: '🎭', f: { brightness: 0.98, contrast: 1.35, saturate: 1.25, grayscale: 0, sepia: 0, blur: 0, hue: 0 } },
  { id: 'suave', name: 'Suave', icon: '✨', f: { brightness: 1.12, contrast: 0.9, saturate: 1.1, grayscale: 0, sepia: 0, blur: 0.4, hue: 0 } },
]

function fmt(s) {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  const ms = Math.floor((s % 1) * 10)
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${ms}`
}
function uid() { return Math.random().toString(36).slice(2, 9) }

function buildFilter(c) {
  return `brightness(${c.brightness}) contrast(${c.contrast}) saturate(${c.saturate}) grayscale(${c.grayscale}) sepia(${c.sepia}) blur(${c.blur}px) hue-rotate(${c.hue}deg)`
}
function buildTransform(c) {
  let t = ''
  if (c.rotation) t += `rotate(${c.rotation}deg) `
  if (c.flipH) t += `scaleX(-1) `
  if (c.scale && c.scale !== 1) t += `scale(${c.scale}) `
  return t.trim() || 'none'
}
function clipDur(c) { return Math.max(0.1, (c.trimEnd - c.trimStart) / c.speed) }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)) }

function captureThumb(url) {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.muted = true; v.playsInline = true; v.preload = 'metadata'; v.src = url
    v.onloadedmetadata = () => {
      const t = Math.min(1, Math.max(0.1, v.duration * 0.2))
      v.currentTime = t
    }
    v.onseeked = () => {
      try {
        const cv = document.createElement('canvas')
        cv.width = 320; cv.height = 180
        const ctx = cv.getContext('2d')
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 320, 180)
        const vw = v.videoWidth || 320, vh = v.videoHeight || 180
        const scale = Math.min(320 / vw, 180 / vh)
        const dw = vw * scale, dh = vh * scale
        ctx.drawImage(v, (320 - dw) / 2, (180 - dh) / 2, dw, dh)
        resolve(cv.toDataURL('image/jpeg', 0.7))
      } catch { resolve('') }
    }
    v.onerror = () => resolve('')
    setTimeout(() => resolve(''), 4000)
  })
}

export default function App() {
  const [clips, setClips] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [projectName, setProjectName] = useState('Meu vídeo')
  const [aspect, setAspect] = useState('16:9')
  const [tab, setTab] = useState('midia')
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [zoom, setZoom] = useState(10) // px per second (fit-to-screen)
  const [dragOver, setDragOver] = useState(false)
  const [toast, setToast] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportDone, setExportDone] = useState(null)
  const [showExportModal, setShowExportModal] = useState(false)
  const [cropping, setCropping] = useState(false)
  const [resScale, setResScale] = useState(1) // 1, 0.75, 0.5, 0.33
  const [bitrate, setBitrate] = useState(8) // Mbps
  const [qualityPreset, setQualityPreset] = useState('alta')
  const [exportCancelled, setExportCancelled] = useState(false)
  const cancelRef = useRef(false)

  const videoRef = useRef(null)
  const fileInputRef = useRef(null)
  const clipsRef = useRef(clips)
  const timeRef = useRef(0)
  const playingRef = useRef(false)
  const rafRef = useRef(null)
  const lastTsRef = useRef(0)
  const trimDragRef = useRef(null)
  const tlScrollRef = useRef(null)
  const previewBoxRef = useRef(null)
  const cropDragRef = useRef(null)

  clipsRef.current = clips
  timeRef.current = currentTime
  playingRef.current = isPlaying

  const selected = clips.find(c => c.id === selectedId) || clips[0] || null
  const totalDur = useMemo(() => clips.reduce((a, c) => a + clipDur(c), 0), [clips])

  const locator = useMemo(() => {
    let t = currentTime
    for (let i = 0; i < clips.length; i++) {
      const d = clipDur(clips[i])
      if (t <= d || i === clips.length - 1) return { clip: clips[i], index: i, offset: Math.min(t, d) }
      t -= d
    }
    return { clip: clips[0], index: 0, offset: 0 }
  }, [clips, currentTime])

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2600) }

  const updateClip = useCallback((id, patch) => {
    setClips(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
  }, [])

  const fitZoom = useCallback(() => {
    const el = tlScrollRef.current
    if (!el || totalDur <= 0) return
    const avail = Math.max(300, el.clientWidth - 24)
    const z = clamp(avail / totalDur, 4, 200)
    setZoom(z)
    el.scrollLeft = 0
  }, [totalDur])

  // Auto-fit when clips change (new video added / removed)
  const prevClipsLen = useRef(0)
  useEffect(() => {
    if (clips.length !== prevClipsLen.current) {
      prevClipsLen.current = clips.length
      // small delay so container has size
      setTimeout(fitZoom, 50)
    }
  }, [clips.length, fitZoom])

  // Keep playhead visible while playing
  useEffect(() => {
    if (!isPlaying) return
    const el = tlScrollRef.current
    if (!el) return
    const x = currentTime * zoom
    if (x < el.scrollLeft + 40 || x > el.scrollLeft + el.clientWidth - 80) {
      el.scrollLeft = Math.max(0, x - el.clientWidth / 2)
    }
  }, [currentTime, isPlaying, zoom])

  const addFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList).filter(f => f.type.startsWith('video/'))
    if (!files.length) { showToast('Selecione arquivos de vídeo'); return }
    const newClips = []
    for (const file of files) {
      const url = URL.createObjectURL(file)
      const meta = await new Promise((res) => {
        const v = document.createElement('video')
        v.preload = 'metadata'; v.src = url
        v.onloadedmetadata = () => res({ duration: v.duration || 0, w: v.videoWidth || 1280, h: v.videoHeight || 720 })
        v.onerror = () => res({ duration: 0, w: 1280, h: 720 })
        setTimeout(() => res({ duration: 0, w: 1280, h: 720 }), 5000)
      })
      const thumb = await captureThumb(url)
      newClips.push({
        id: uid(), name: file.name, url, file, duration: meta.duration || 10, thumb,
        videoW: meta.w, videoH: meta.h,
        trimStart: 0, trimEnd: meta.duration || 10, speed: 1, volume: 1, muted: false,
        rotation: 0, flipH: false, scale: 1,
        cropEnabled: false, cropX: 0, cropY: 0, cropW: 1, cropH: 1,
        brightness: 1, contrast: 1, saturate: 1, grayscale: 0, sepia: 0, blur: 0, hue: 0,
        preset: 'original',
        textEnabled: false, textContent: 'Seu texto aqui', textSize: 42, textColor: '#ffffff',
        textBg: 'rgba(0,0,0,0.55)', textPos: 'bottom',
      })
    }
    setClips(prev => {
      const next = [...prev, ...newClips]
      if (!selectedId && newClips[0]) setSelectedId(newClips[0].id)
      return next
    })
    showToast(`${newClips.length} vídeo(s) adicionado(s)`)
  }, [selectedId])

  // --- Playback engine ---
  useEffect(() => {
    if (!isPlaying) { if (rafRef.current) cancelAnimationFrame(rafRef.current); return }
    lastTsRef.current = performance.now()
    const tick = (ts) => {
      const dt = (ts - lastTsRef.current) / 1000
      lastTsRef.current = ts
      setCurrentTime(prev => {
        const next = prev + dt
        const total = clipsRef.current.reduce((a, c) => a + clipDur(c), 0)
        if (next >= total) { setIsPlaying(false); return total }
        return next
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [isPlaying])

  useEffect(() => {
    const v = videoRef.current
    if (!v || !locator.clip) return
    const local = locator.clip.trimStart + locator.offset * locator.clip.speed
    if (v.src !== locator.clip.url) {
      v.src = locator.clip.url
      v.playbackRate = locator.clip.speed
      v.volume = locator.clip.muted ? 0 : locator.clip.volume
      v.onloadedmetadata = () => {
        try { v.currentTime = local } catch {}
        if (v.videoWidth && locator.clip.videoW !== v.videoWidth) {
          updateClip(locator.clip.id, { videoW: v.videoWidth, videoH: v.videoHeight })
        }
        if (playingRef.current) v.play().catch(()=>{})
      }
    } else {
      if (Math.abs(v.currentTime - local) > 0.35) { try { v.currentTime = local } catch {} }
      v.playbackRate = locator.clip.speed
      v.volume = locator.clip.muted ? 0 : locator.clip.volume
      if (isPlaying && v.paused) v.play().catch(()=>{})
      if (!isPlaying && !v.paused) v.pause()
    }
  }, [locator.clip?.id, locator.offset, isPlaying])

  useEffect(() => { const v = videoRef.current; if (v && !isPlaying) v.pause() }, [isPlaying])
  useEffect(() => { if (cropping) setIsPlaying(false) }, [cropping])

  useEffect(() => {
    const h = (e) => {
      if (e.code === 'Space' && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault(); togglePlay()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  function togglePlay() {
    if (!clips.length || cropping) return
    if (currentTime >= totalDur - 0.05 && !isPlaying) setCurrentTime(0)
    setIsPlaying(p => !p)
  }

  function seekTo(t) {
    const clamped = Math.max(0, Math.min(totalDur, t))
    setCurrentTime(clamped)
    const v = videoRef.current
    if (v && locator.clip) {
      let tt = clamped, clip = clips[0], off = 0
      for (let i = 0; i < clips.length; i++) {
        const d = clipDur(clips[i])
        if (tt <= d || i === clips.length - 1) { clip = clips[i]; off = Math.min(tt, d); break }
        tt -= d
      }
      if (clip && v.src === clip.url) { try { v.currentTime = clip.trimStart + off * clip.speed } catch {} }
    }
  }

  function removeClip(id) {
    setClips(prev => {
      const next = prev.filter(c => c.id !== id)
      if (selectedId === id) setSelectedId(next[0]?.id || null)
      return next
    })
    showToast('Clipe removido')
  }
  function duplicateClip(id) {
    const c = clips.find(x => x.id === id); if (!c) return
    const copy = { ...c, id: uid(), name: c.name.replace(/\.mp4|\.mov|\.webm/i, '') + ' (cópia)' }
    const idx = clips.findIndex(x => x.id === id)
    const next = [...clips]; next.splice(idx + 1, 0, copy)
    setClips(next); setSelectedId(copy.id)
  }
  function moveClip(id, dir) {
    const idx = clips.findIndex(c => c.id === id)
    const j = idx + dir
    if (idx < 0 || j < 0 || j >= clips.length) return
    const next = [...clips]; [next[idx], next[j]] = [next[j], next[idx]]
    setClips(next)
  }

  function startTrim(e, clipId, side) {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX
    const orig = { ...clips.find(c => c.id === clipId) }
    trimDragRef.current = { clipId, side, startX, orig }
    const onMove = (ev) => {
      const d = trimDragRef.current; if (!d) return
      const dxSec = (ev.clientX - d.startX) / zoom * d.orig.speed
      if (d.side === 'left') {
        const ns = Math.max(0, Math.min(d.orig.trimEnd - 0.2, d.orig.trimStart + dxSec))
        updateClip(clipId, { trimStart: ns })
      } else {
        const ne = Math.min(d.orig.duration, Math.max(d.orig.trimStart + 0.2, d.orig.trimEnd + dxSec))
        updateClip(clipId, { trimEnd: ne })
      }
    }
    const onUp = () => { trimDragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  function onRulerClick(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    seekTo(x / zoom)
  }

  // --- Crop drag ---
  function startCropDrag(e, mode) {
    e.preventDefault(); e.stopPropagation()
    const box = previewBoxRef.current
    if (!box || !selected) return
    const rect = box.getBoundingClientRect()
    const orig = { x: selected.cropX, y: selected.cropY, w: selected.cropW, h: selected.cropH }
    cropDragRef.current = { mode, rect, orig, clipId: selected.id }
    const onMove = (ev) => {
      const d = cropDragRef.current; if (!d) return
      const dx = (ev.clientX - d.rect.left) / d.rect.width
      const dy = (ev.clientY - d.rect.top) / d.rect.height
      const sx = (d.startX ?? d.rect.left) // not used
      let { x, y, w, h } = d.orig
      const ddx = (ev.clientX - d.startClientX) / d.rect.width
      const ddy = (ev.clientY - d.startClientY) / d.rect.height
      if (d.mode === 'move') {
        x = clamp(d.orig.x + ddx, 0, 1 - d.orig.w)
        y = clamp(d.orig.y + ddy, 0, 1 - d.orig.h)
      } else {
        if (d.mode.includes('e')) w = clamp(d.orig.w + ddx, 0.08, 1 - d.orig.x)
        if (d.mode.includes('s')) h = clamp(d.orig.h + ddy, 0.08, 1 - d.orig.y)
        if (d.mode.includes('w')) {
          const nx = clamp(d.orig.x + ddx, 0, d.orig.x + d.orig.w - 0.08)
          w = d.orig.w + (d.orig.x - nx); x = nx
        }
        if (d.mode.includes('n')) {
          const ny = clamp(d.orig.y + ddy, 0, d.orig.y + d.orig.h - 0.08)
          h = d.orig.h + (d.orig.y - ny); y = ny
        }
      }
      updateClip(d.clipId, { cropX: x, cropY: y, cropW: w, cropH: h, cropEnabled: true })
    }
    cropDragRef.current.startClientX = e.clientX
    cropDragRef.current.startClientY = e.clientY
    const onUp = () => { cropDragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  function applyCropPreset(name) {
    if (!selected) return
    const vw = selected.videoW || 1280, vh = selected.videoH || 720
    const videoRatio = vw / vh
    const mk = (ratio) => {
      // largest rect with given ratio centered
      if (videoRatio >= ratio) {
        const w = (vh * ratio) / vw
        return { cropX: (1 - w) / 2, cropY: 0, cropW: w, cropH: 1 }
      } else {
        const h = (vw / ratio) / vh
        return { cropX: 0, cropY: (1 - h) / 2, cropW: 1, cropH: h }
      }
    }
    const presets = {
      cheia: { cropX: 0, cropY: 0, cropW: 1, cropH: 1 },
      '16:9': mk(16 / 9),
      '9:16': mk(9 / 16),
      '1:1': mk(1),
      '4:5': mk(4 / 5),
      esquerda: { cropX: 0, cropY: 0, cropW: 0.5, cropH: 1 },
      direita: { cropX: 0.5, cropY: 0, cropW: 0.5, cropH: 1 },
      topo: { cropX: 0, cropY: 0, cropW: 1, cropH: 0.5 },
      base: { cropX: 0, cropY: 0.5, cropW: 1, cropH: 0.5 },
    }
    const p = presets[name]
    if (p) updateClip(selected.id, { ...p, cropEnabled: !(name === 'cheia') })
  }

  const QUALITY_PRESETS = {
    alta: { label: 'Alta', desc: 'Qualidade máxima', scale: 1, br: 8 },
    equilibrada: { label: 'Equilibrada', desc: 'Bom equilíbrio', scale: 0.75, br: 4 },
    compacta: { label: 'Compacta', desc: 'Arquivo menor', scale: 0.5, br: 2 },
    minima: { label: 'Mínima', desc: 'Tamanho mínimo', scale: 0.33, br: 1 },
  }
  function applyQuality(p) {
    const q = QUALITY_PRESETS[p]
    if (!q) return
    setQualityPreset(p); setResScale(q.scale); setBitrate(q.br)
  }
  const exportDims = useMemo(() => {
    const base = ASPECTS[aspect]
    const even = (n) => Math.max(2, Math.round(n / 2) * 2)
    return { w: even(base.w * resScale), h: even(base.h * resScale) }
  }, [aspect, resScale])
  const estSizeMB = useMemo(() => (bitrate * totalDur) / 8, [bitrate, totalDur])
  const fmtSize = (mb) => mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`

  // --- Export helpers ---
  function drawFrameToCanvas(ctx, w, h, source, clip) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h)
    ctx.save()
    try { ctx.filter = buildFilter(clip) } catch {}
    const vw = source.videoWidth || w, vh = source.videoHeight || h
    const rot = (clip.rotation || 0) * Math.PI / 180
    const swap = clip.rotation === 90 || clip.rotation === 270
    const cx = clip.cropEnabled ? (clip.cropX || 0) : 0
    const cy = clip.cropEnabled ? (clip.cropY || 0) : 0
    const cw = clip.cropEnabled ? (clip.cropW || 1) : 1
    const ch = clip.cropEnabled ? (clip.cropH || 1) : 1
    const sx = cx * vw, sy = cy * vh, sw = Math.max(2, cw * vw), sh = Math.max(2, ch * vh)
    const srcW = swap ? sh : sw, srcH = swap ? sw : sh
    const fit = Math.min(w / srcW, h / srcH)
    const dw = srcW * fit * (clip.scale || 1), dh = srcH * fit * (clip.scale || 1)
    ctx.translate(w / 2, h / 2)
    ctx.rotate(rot)
    if (clip.flipH) ctx.scale(-1, 1)
    ctx.drawImage(source, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh)
    ctx.restore()
    if (clip.textEnabled && clip.textContent) {
      ctx.save()
      ctx.font = `800 ${clip.textSize}px Inter, sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      const tw = ctx.measureText(clip.textContent).width
      const padX = 18, padY = 10
      const ty = clip.textPos === 'top' ? h * 0.12 : clip.textPos === 'center' ? h / 2 : h * 0.88
      ctx.fillStyle = clip.textBg || 'rgba(0,0,0,0.55)'
      const bw = Math.min(w - 40, tw + padX * 2), bh = clip.textSize + padY * 2
      ctx.beginPath()
      if (ctx.roundRect) ctx.roundRect(w / 2 - bw / 2, ty - bh / 2, bw, bh, 12); else ctx.rect(w / 2 - bw / 2, ty - bh / 2, bw, bh)
      ctx.fill()
      ctx.fillStyle = clip.textColor
      ctx.fillText(clip.textContent, w / 2, ty, w - 60)
      ctx.restore()
    }
  }

  function makeHiddenVideo() {
    const hidden = document.createElement('video')
    hidden.muted = true; hidden.playsInline = true; hidden.preload = 'auto'; hidden.crossOrigin = 'anonymous'
    hidden.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none;'
    document.body.appendChild(hidden)
    return hidden
  }
  function waitFor(el, event, timeoutMs) {
    return new Promise((res) => {
      const t = setTimeout(res, timeoutMs)
      el.addEventListener(event, () => { clearTimeout(t); res() }, { once: true })
    })
  }

  // Fast path: WebCodecs (frame-by-frame, correct timestamps, with audio)
  async function exportWebCodecs() {
    const { w, h } = exportDims
    const FPS = 30
    const total = clips.reduce((a, c) => a + clipDur(c), 0)
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')

    // pick video codec
    const codecCandidates = ['avc1.640028', 'avc1.4D4028', 'avc1.42E01E']
    let videoCodec = null
    for (const c of codecCandidates) {
      try {
        if (await VideoEncoder.isConfigSupported({ codec: c, width: w, height: h, bitrate: bitrate * 1_000_000, framerate: FPS })) { videoCodec = c; break }
      } catch {}
    }
    if (!videoCodec) throw new Error('codec')

    const target = new ArrayBufferTarget()
    const muxer = new Muxer({
      target,
      video: { codec: 'avc', width: w, height: h },
      audio: { codec: 'aac', numberOfChannels: 2, sampleRate: 48000 },
      fastStart: 'in-memory',
    })

    const videoEncoder = new VideoEncoder()
    videoEncoder.configure({ codec: videoCodec, width: w, height: h, bitrate: bitrate * 1_000_000, framerate: FPS, latencyMode: 'quality' })
    videoEncoder.onoutput = (chunk, meta) => muxer.addVideoChunk(chunk, meta.decoderConfig)

    let audioEncoder = null
    try {
      audioEncoder = new AudioEncoder()
      audioEncoder.configure({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 })
      audioEncoder.onoutput = (chunk, meta) => muxer.addAudioChunk(chunk, meta.decoderConfig)
    } catch { audioEncoder = null }

    const hidden = makeHiddenVideo()
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    let elapsed = 0

    for (let ci = 0; ci < clips.length; ci++) {
      if (cancelRef.current) break
      const clip = clips[ci]
      hidden.src = clip.url
      await waitFor(hidden, 'loadedmetadata', 3000)
      const clipOutDur = clipDur(clip)
      const nFrames = Math.max(1, Math.round(clipOutDur * FPS))

      // --- video frames (seek-based, fast) ---
      for (let f = 0; f < nFrames; f++) {
        if (cancelRef.current) break
        const t = f / FPS
        const local = clip.trimStart + t * clip.speed
        hidden.currentTime = local
        await waitFor(hidden, 'seeked', 1200)
        drawFrameToCanvas(ctx, w, h, hidden, clip)
        const ts = Math.round((elapsed + t) * 1e6)
        const frame = new VideoFrame(canvas, { timestamp: ts, duration: Math.round(1e6 / FPS) })
        videoEncoder.encode(frame)
        frame.close()
        setExportProgress(Math.min(99, ((elapsed + t) / total) * 100))
        // yield to keep UI alive
        if (f % 15 === 0) await new Promise(r => setTimeout(r, 0))
      }

      // --- audio (only at 1x; other speeds export silent for that clip) ---
      if (audioEncoder && !clip.muted && clip.speed === 1 && clip.file) {
        try {
          const ab = await clip.file.arrayBuffer()
          const audioBuf = await audioCtx.decodeAudioData(ab)
          const sr = audioBuf.sampleRate
          const nCh = Math.min(2, audioBuf.numberOfChannels)
          const startF = Math.floor(clip.trimStart * sr)
          const endF = Math.min(audioBuf.length, Math.floor(clip.trimEnd * sr))
          const segLen = Math.max(0, endF - startF)
          if (segLen > 0) {
            const vol = clip.volume ?? 1
            const chunkFrames = Math.floor(sr * 0.1)
            for (let off = 0; off < segLen; off += chunkFrames) {
              if (cancelRef.current) break
              const len = Math.min(chunkFrames, segLen - off)
              const data = []
              for (let ch = 0; ch < nCh; ch++) {
                const src = audioBuf.getChannelData(ch)
                const piece = new Float32Array(len)
                for (let i = 0; i < len; i++) piece[i] = (src[startF + off + i] || 0) * vol
                data.push(piece)
              }
              while (data.length < 2) data.push(new Float32Array(len))
              const ad = new AudioData({
                format: 'f32-planar', numberOfFrames: len, sampleRate: sr, numberOfChannels: 2,
                timestamp: Math.round((elapsed + off / sr) * 1e6), data,
              })
              audioEncoder.encode(ad)
              ad.close()
            }
          }
        } catch {}
      }
      elapsed += clipOutDur
    }

    hidden.remove()
    if (cancelRef.current) { try { videoEncoder.close() } catch {}; try { audioEncoder?.close() } catch {}; throw new Error('cancelled') }
    await videoEncoder.flush(); videoEncoder.close()
    if (audioEncoder) { await audioEncoder.flush(); audioEncoder.close() }
    muxer.finalize()
    return new Blob([target.buffer], { type: 'video/mp4' })
  }

  // Fallback: real-time MediaRecorder (WebM preferred for correct duration)
  async function exportMediaRecorder() {
    const { w, h } = exportDims
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    const stream = canvas.captureStream(30)
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
      .find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || ''
    let recorder
    const chunks = []
    try { recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: bitrate * 1_000_000 } : undefined) }
    catch { recorder = new MediaRecorder(stream) }
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
    const done = new Promise(res => { recorder.onstop = res })
    recorder.start(200)

    const total = clips.reduce((a, c) => a + clipDur(c), 0)
    let elapsed = 0
    const hidden = makeHiddenVideo()
    hidden.muted = false

    for (let ci = 0; ci < clips.length; ci++) {
      if (cancelRef.current) break
      const clip = clips[ci]
      hidden.src = clip.url
      await waitFor(hidden, 'loadedmetadata', 3000)
      hidden.playbackRate = clip.speed
      hidden.volume = clip.muted ? 0 : clip.volume
      hidden.currentTime = clip.trimStart
      await waitFor(hidden, 'seeked', 1500)
      await hidden.play().catch(()=>{})
      await waitFor(hidden, 'playing', 3000)
      const clipOutDur = clipDur(clip)
      await new Promise((resolve) => {
        const draw = () => {
          if (cancelRef.current) { hidden.pause(); resolve(); return }
          drawFrameToCanvas(ctx, w, h, hidden, clip)
          const localElapsed = Math.max(0, (hidden.currentTime - clip.trimStart) / clip.speed)
          setExportProgress(Math.min(99, ((elapsed + Math.min(localElapsed, clipOutDur)) / total) * 100))
          if (hidden.currentTime >= clip.trimEnd - 0.05 || hidden.ended) { hidden.pause(); resolve() }
          else requestAnimationFrame(draw)
        }
        requestAnimationFrame(draw)
      })
      elapsed += clipOutDur
    }
    hidden.remove()
    if (cancelRef.current) { try { recorder.stop() } catch {}; throw new Error('cancelled') }
    recorder.stop(); await done
    return new Blob(chunks, { type: recorder.mimeType || 'video/webm' })
  }

  // --- Export ---
  async function exportVideo() {
    if (!clips.length) return
    cancelRef.current = false; setExportCancelled(false)
    setShowExportModal(true); setExporting(true); setExportProgress(0); setExportDone(null)
    const { w, h } = exportDims
    let blob = null, engine = ''
    try {
      if (window.VideoEncoder && window.AudioEncoder && window.VideoFrame && window.AudioData) {
        blob = await exportWebCodecs(); engine = 'Renderização rápida'
      } else {
        blob = await exportMediaRecorder(); engine = 'Tempo real'
      }
    } catch (err) {
      if (err?.message === 'cancelled') {
        setExporting(false); setShowExportModal(false); showToast('Exportação cancelada'); return
      }
      // WebCodecs failed → try fallback once
      try { blob = await exportMediaRecorder(); engine = 'Tempo real' }
      catch (e2) {
        setExporting(false)
        showToast('Falha ao exportar. Tente um vídeo menor.')
        return
      }
    }
    const ext = (blob.type || '').includes('mp4') ? 'mp4' : 'webm'
    const url = URL.createObjectURL(blob)
    const name = `${projectName.replace(/\s+/g, '-').toLowerCase() || 'filmuse'}.${ext}`
    setExportProgress(100); setExporting(false); setExportDone({ url, name, size: blob.size, w, h, br: bitrate, engine })
  }

  const ratio = ASPECTS[aspect].w / ASPECTS[aspect].h
  const previewStyle = ratio >= 1
    ? { aspectRatio: `${ASPECTS[aspect].w}/${ASPECTS[aspect].h}`, width: 'min(100%, 960px)' }
    : { aspectRatio: `${ASPECTS[aspect].w}/${ASPECTS[aspect].h}`, height: 'min(100%, 54vh)' }

  const rulerStep = zoom < 8 ? 10 : zoom < 25 ? 5 : zoom < 60 ? 2 : 1
  const rulerTicks = useMemo(() => {
    const arr = []
    for (let s = 0; s <= Math.ceil(totalDur); s += rulerStep) arr.push(s)
    return arr
  }, [totalDur, rulerStep])

  const lc = locator.clip
  const cropInnerStyle = lc ? {
    width: `${100 / (lc.cropEnabled ? lc.cropW : 1)}%`,
    height: `${100 / (lc.cropEnabled ? lc.cropH : 1)}%`,
    left: `${-(lc.cropEnabled ? lc.cropX : 0) / (lc.cropEnabled ? lc.cropW : 1) * 100}%`,
    top: `${-(lc.cropEnabled ? lc.cropY : 0) / (lc.cropEnabled ? lc.cropH : 1) * 100}%`,
  } : {}

  return (
    <div className="app">
      <header className="header">
        <div className="logo"><span className="logo-badge">🎬</span> Filmuse</div>
        <input className="proj-name" value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="Nome do projeto" />
        <div className="header-actions">
          <button className="btn btn-ghost" onClick={() => { if (confirm('Limpar projeto?')) { setClips([]); setSelectedId(null); setCurrentTime(0) } }}>🗑 Novo</button>
          <button className="btn btn-primary" disabled={!clips.length} onClick={exportVideo}>⬇ Exportar vídeo</button>
        </div>
      </header>

      <div className="main">
        <aside className="sidebar">
          <div className="tabs">
            {[['midia','🎞 Mídia'],['filtros','🎨 Filtros'],['texto','T Texto'],['recorte','✂ Recorte'],['ajustes','⚙ Ajustes'],['formato','▭ Formato']].map(([id, label]) => (
              <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>
          <div className="panel">
            {tab === 'midia' && (
              <>
                <h3>Adicionar vídeos</h3>
                <p className="hint">Arraste arquivos para a janela ou clique abaixo. Suporta MP4, MOV, WebM e mais. Tudo fica no seu navegador — nada é enviado para servidor.</p>
                <div
                  className={`dropzone ${dragOver ? 'drag' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
                >
                  <strong>📁 Clique ou arraste vídeos aqui</strong>
                  MP4 · MOV · WebM · MKV
                </div>
                <input ref={fileInputRef} type="file" accept="video/*" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
                <h3>Clipes ({clips.length})</h3>
                {clips.length === 0 && <p className="hint">Nenhum clipe ainda. Adicione seu primeiro vídeo para começar.</p>}
                <div className="clip-list">
                  {clips.map((c, i) => (
                    <div key={c.id} className={`clip-item ${selected?.id === c.id ? 'active' : ''}`} onClick={() => setSelectedId(c.id)}>
                      {c.thumb ? <img src={c.thumb} alt="" /> : <div style={{ width: 64, height: 40, background: '#000', borderRadius: 8, display: 'grid', placeItems: 'center' }}>🎬</div>}
                      <div className="meta"><b>{i + 1}. {c.name}</b><span>{fmt(clipDur(c))} · {c.speed}×{c.cropEnabled ? ' · ✂' : ''}</span></div>
                      <button className="icon-btn" title="Duplicar" onClick={e => { e.stopPropagation(); duplicateClip(c.id) }}>⧉</button>
                      <button className="icon-btn" title="Remover" onClick={e => { e.stopPropagation(); removeClip(c.id) }}>✕</button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {tab === 'filtros' && (
              <>
                <h3>Filtros prontos</h3>
                <div className="preset-grid">
                  {PRESETS.map(p => (
                    <button key={p.id} className={`preset ${selected?.preset === p.id ? 'active' : ''}`}
                      onClick={() => selected && updateClip(selected.id, { ...p.f, preset: p.id })}>
                      <div className="thumb" style={{ filter: `brightness(${p.f.brightness}) contrast(${p.f.contrast}) saturate(${p.f.saturate}) grayscale(${p.f.grayscale}) sepia(${p.f.sepia})` }}>{p.icon}</div>
                      <span>{p.name}</span>
                    </button>
                  ))}
                </div>
                <h3>Ajuste fino</h3>
                {!selected && <p className="hint">Selecione um clipe na timeline.</p>}
                {selected && <>
                  {[['brightness','Brilho',0.5,1.5,0.01],['contrast','Contraste',0.5,1.5,0.01],['saturate','Saturação',0,2,0.01],['grayscale','Preto e branco',0,1,0.01],['sepia','Sépia',0,1,0.01],['blur','Desfoque (px)',0,5,0.1],['hue','Matiz (°)',-180,180,1]].map(([k, label, min, max, step]) => (
                    <div className="field" key={k}>
                      <label>{label} <output>{Number(selected[k]).toFixed(2)}</output></label>
                      <input type="range" min={min} max={max} step={step} value={selected[k]}
                        onChange={e => updateClip(selected.id, { [k]: parseFloat(e.target.value), preset: 'custom' })} />
                    </div>
                  ))}
                  <button className="btn btn-ghost btn-sm" onClick={() => updateClip(selected.id, { brightness: 1, contrast: 1, saturate: 1, grayscale: 0, sepia: 0, blur: 0, hue: 0, preset: 'original' })}>↺ Resetar filtros</button>
                </>}
              </>
            )}

            {tab === 'texto' && (
              <>
                <h3>Texto no vídeo</h3>
                {!selected && <p className="hint">Adicione um vídeo primeiro.</p>}
                {selected && <>
                  <div className="toggle-row">Mostrar texto
                    <button className={`switch ${selected.textEnabled ? 'on' : ''}`} onClick={() => updateClip(selected.id, { textEnabled: !selected.textEnabled })} />
                  </div>
                  <div className="field" style={{ marginTop: 12 }}>
                    <label>Conteúdo</label>
                    <input type="text" value={selected.textContent} maxLength={60} onChange={e => updateClip(selected.id, { textContent: e.target.value })} placeholder="Digite seu texto..." />
                  </div>
                  <div className="field">
                    <label>Tamanho <output>{selected.textSize}px</output></label>
                    <input type="range" min={20} max={90} step={1} value={selected.textSize} onChange={e => updateClip(selected.id, { textSize: parseInt(e.target.value) })} />
                  </div>
                  <div className="field"><label>Cor do texto</label><input type="color" value={selected.textColor} onChange={e => updateClip(selected.id, { textColor: e.target.value })} /></div>
                  <div className="field"><label>Cor de fundo</label><input type="color" value={selected.textBg.startsWith('#') ? selected.textBg : '#000000'} onChange={e => updateClip(selected.id, { textBg: e.target.value })} /></div>
                  <div className="field"><label>Posição</label>
                    <div className="seg">
                      {[['top','Topo'],['center','Centro'],['bottom','Base']].map(([v, l]) => (
                        <button key={v} className={selected.textPos === v ? 'active' : ''} onClick={() => updateClip(selected.id, { textPos: v })}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <p className="hint">💡 Dica: use textos curtos para Stories e Reels.</p>
                </>}
              </>
            )}

            {tab === 'recorte' && (
              <>
                <h3>Recortar parte da tela</h3>
                <p className="hint">Selecione apenas uma área do vídeo — ideal para focar em uma parte da tela, remover bordas ou transformar um vídeo horizontal em vertical.</p>
                {!selected && <p className="hint">Adicione um vídeo primeiro.</p>}
                {selected && <>
                  <div className="toggle-row">Recorte ativo
                    <button className={`switch ${selected.cropEnabled ? 'on' : ''}`} onClick={() => updateClip(selected.id, { cropEnabled: !selected.cropEnabled })} />
                  </div>
                  <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', margin: '12px 0' }}
                    onClick={() => { setCropping(c => !c); setIsPlaying(false) }}>
                    {cropping ? '✅ Concluir recorte' : '✂ Editar recorte na tela'}
                  </button>
                  <p className="hint">No modo de edição, arraste a caixa roxa para mover e os cantos para redimensionar direto na prévia.</p>
                  <h3>Presets rápidos</h3>
                  <div className="chip-row">
                    {[['cheia','Tela cheia'],['16:9','Centro 16:9'],['9:16','Centro 9:16'],['1:1','Centro 1:1'],['4:5','Centro 4:5'],['esquerda','Esquerda'],['direita','Direita'],['topo','Topo'],['base','Base']].map(([v, l]) => (
                      <button key={v} className="chip" onClick={() => applyCropPreset(v)}>{l}</button>
                    ))}
                  </div>
                  <h3>Tamanho / Zoom</h3>
                  <div className="field">
                    <label>Zoom (tamanho do vídeo) <output>{(selected.scale || 1).toFixed(2)}×</output></label>
                    <input type="range" min={1} max={3} step={0.05} value={selected.scale || 1}
                      onChange={e => updateClip(selected.id, { scale: parseFloat(e.target.value) })} />
                  </div>
                  <div className="chip-row">
                    {[1, 1.25, 1.5, 2, 3].map(v => (
                      <button key={v} className={`chip ${(selected.scale || 1) === v ? 'active' : ''}`} onClick={() => updateClip(selected.id, { scale: v })}>{v}×</button>
                    ))}
                  </div>
                  <h3>Posição do recorte</h3>
                  {[['cropX','Esquerda',0,1,0.01],['cropY','Topo',0,1,0.01],['cropW','Largura',0.08,1,0.01],['cropH','Altura',0.08,1,0.01]].map(([k, label, min, max, step]) => (
                    <div className="field" key={k}>
                      <label>{label} <output>{Math.round((selected[k] || 0) * 100)}%</output></label>
                      <input type="range" min={min} max={max} step={step} value={selected[k]}
                        onChange={e => updateClip(selected.id, { [k]: parseFloat(e.target.value), cropEnabled: true })} />
                    </div>
                  ))}
                  <button className="btn btn-ghost btn-sm" onClick={() => updateClip(selected.id, { cropX: 0, cropY: 0, cropW: 1, cropH: 1, cropEnabled: false, scale: 1 })}>↺ Resetar recorte e zoom</button>
                </>}
              </>
            )}

            {tab === 'ajustes' && (
              <>
                <h3>Velocidade e áudio</h3>
                {!selected && <p className="hint">Selecione um clipe.</p>}
                {selected && <>
                  <div className="field">
                    <label>Velocidade <output>{selected.speed}×</output></label>
                    <input type="range" min={0.25} max={2} step={0.05} value={selected.speed} onChange={e => updateClip(selected.id, { speed: parseFloat(e.target.value) })} />
                    <div className="chip-row" style={{ marginTop: 8 }}>
                      {[0.5, 1, 1.5, 2].map(v => <button key={v} className={`chip ${selected.speed === v ? 'active' : ''}`} onClick={() => updateClip(selected.id, { speed: v })}>{v}×</button>)}
                    </div>
                  </div>
                  <div className="field">
                    <label>Volume <output>{Math.round(selected.volume * 100)}%</output></label>
                    <input type="range" min={0} max={1} step={0.05} value={selected.volume} onChange={e => updateClip(selected.id, { volume: parseFloat(e.target.value) })} />
                  </div>
                  <div className="toggle-row">Silenciar clipe
                    <button className={`switch ${selected.muted ? 'on' : ''}`} onClick={() => updateClip(selected.id, { muted: !selected.muted })} />
                  </div>
                  <h3>Orientação</h3>
                  <div className="row">
                    <button className="icon-btn" title="Girar 90°" onClick={() => updateClip(selected.id, { rotation: (selected.rotation + 90) % 360 })}>⟳ Girar</button>
                    <button className={`icon-btn ${selected.flipH ? 'active' : ''}`} title="Espelhar" onClick={() => updateClip(selected.id, { flipH: !selected.flipH })}>⇋ Espelhar</button>
                  </div>
                  <p className="hint" style={{ marginTop: 10 }}>Rotação atual: {selected.rotation}°</p>
                  <h3>Cortar (trim)</h3>
                  <div className="field">
                    <label>Início <output>{fmt(selected.trimStart)}</output></label>
                    <input type="range" min={0} max={selected.duration} step={0.05} value={selected.trimStart}
                      onChange={e => updateClip(selected.id, { trimStart: Math.min(parseFloat(e.target.value), selected.trimEnd - 0.2) })} />
                  </div>
                  <div className="field">
                    <label>Fim <output>{fmt(selected.trimEnd)}</output></label>
                    <input type="range" min={0} max={selected.duration} step={0.05} value={selected.trimEnd}
                      onChange={e => updateClip(selected.id, { trimEnd: Math.max(parseFloat(e.target.value), selected.trimStart + 0.2) })} />
                  </div>
                  <p className="hint">Duração original: {fmt(selected.duration)} · Duração no projeto: {fmt(clipDur(selected))}</p>
                </>}
              </>
            )}

            {tab === 'formato' && (
              <>
                <h3>Formato do projeto</h3>
                <p className="hint">Escolha o formato ideal para onde vai publicar. Combine com o <b>Recorte</b> para enquadrar a parte da tela que quiser.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Object.entries(ASPECTS).map(([k, v]) => (
                    <button key={k} className={`chip ${aspect === k ? 'active' : ''}`} style={{ textAlign: 'left', padding: '12px 14px' }} onClick={() => setAspect(k)}>{v.label}</button>
                  ))}
                </div>
                <h3>Comprimir tamanho do vídeo</h3>
                <p className="hint">Reduza o tamanho do arquivo final diminuindo a resolução e a taxa de bits. Ideal para enviar por WhatsApp, e-mail ou subir em sites com limite.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Object.entries(QUALITY_PRESETS).map(([k, q]) => (
                    <button key={k} className={`chip ${qualityPreset === k ? 'active' : ''}`} style={{ textAlign: 'left', padding: '10px 14px' }} onClick={() => applyQuality(k)}>
                      <b>{q.label}</b> · {q.desc}<br />
                      <span style={{ fontSize: 12, opacity: .85 }}>{Math.round(ASPECTS[aspect].w * q.scale)}×{Math.round(ASPECTS[aspect].h * q.scale)} · {q.br} Mbps</span>
                    </button>
                  ))}
                </div>
                <div className="field" style={{ marginTop: 14 }}>
                  <label>Resolução <output>{exportDims.w}×{exportDims.h} ({Math.round(resScale * 100)}%)</output></label>
                  <input type="range" min={0.33} max={1} step={0.01} value={resScale}
                    onChange={e => { setResScale(parseFloat(e.target.value)); setQualityPreset('custom') }} />
                </div>
                <div className="field">
                  <label>Taxa de bits (qualidade) <output>{bitrate} Mbps</output></label>
                  <input type="range" min={1} max={12} step={0.5} value={bitrate}
                    onChange={e => { setBitrate(parseFloat(e.target.value)); setQualityPreset('custom') }} />
                </div>
                <p className="hint" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                  📦 Tamanho estimado: <b style={{ color: 'var(--text)' }}>~{fmtSize(estSizeMB)}</b> para {fmt(totalDur)} de vídeo<br />
                  <span style={{ fontSize: 12 }}>Quanto menor a resolução e a taxa de bits, menor o arquivo — mas com menos qualidade.</span>
                </p>
                <h3>Exportação</h3>
                <p className="hint">A exportação é feita no navegador via Canvas + MediaRecorder. O arquivo final é WebM (ou MP4, se o navegador suportar).</p>
                <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={!clips.length} onClick={exportVideo}>⬇ Exportar agora</button>
              </>
            )}
          </div>
        </aside>

        <section className="stage">
          <div className="stage-top">
            <span className="timecode"><b>{fmt(currentTime)}</b> / {fmt(totalDur)} · {aspect}{cropping ? ' · ✂ Editando recorte' : ''}</span>
            <span className="timecode">{clips.length} clipe(s) · <span className="kbd">Espaço</span> play/pause</span>
          </div>
          <div className="preview-wrap">
            {clips.length === 0 ? (
              <div className="empty-preview">
                <div>
                  <div style={{ fontSize: 48, marginBottom: 10 }}>🎬</div>
                  <h2>Comece adicionando um vídeo</h2>
                  <p>Clique em <b>Mídia</b> ou arraste um arquivo para a janela.<br />Depois corte, aplique filtros, adicione texto e exporte.</p>
                </div>
              </div>
            ) : (
              <div className="preview-box" ref={previewBoxRef} style={previewStyle}>
                <div className="crop-viewport">
                  <div className="crop-inner" style={cropInnerStyle}>
                    <video ref={videoRef} playsInline preload="auto"
                      style={{ filter: lc ? buildFilter(lc) : 'none', transform: lc ? buildTransform(lc) : 'none' }} />
                  </div>
                </div>
                {lc?.textEnabled && lc?.textContent && (
                  <div className={`text-overlay ${lc.textPos}`}
                    style={{ fontSize: Math.max(14, lc.textSize * 0.55), color: lc.textColor, background: lc.textBg }}>
                    {lc.textContent}
                  </div>
                )}
                {cropping && lc && (
                  <>
                    <div className="crop-box"
                      style={{ left: `${lc.cropX * 100}%`, top: `${lc.cropY * 100}%`, width: `${lc.cropW * 100}%`, height: `${lc.cropH * 100}%` }}
                      onMouseDown={e => startCropDrag(e, 'move')}>
                      {['nw','ne','sw','se','n','s','w','e'].map(h => (
                        <div key={h} className={`crop-handle ${h}`} onMouseDown={e => startCropDrag(e, h)} />
                      ))}
                    </div>
                    <div className="crop-bar">
                      <button className="btn btn-ghost btn-sm" onClick={() => applyCropPreset('cheia')}>Tela cheia</button>
                      <button className="btn btn-primary btn-sm" onClick={() => setCropping(false)}>✅ Concluir</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="controls">
            <button className="icon-btn" disabled={!clips.length} onClick={() => seekTo(0)} title="Início">⏮</button>
            <button className="play-btn" disabled={!clips.length || cropping} onClick={togglePlay}>{isPlaying ? '⏸' : '▶'}</button>
            <button className="icon-btn" disabled={!clips.length} onClick={() => seekTo(totalDur)} title="Fim">⏭</button>
            <span className="timecode" style={{ marginLeft: 8 }}>{lc ? `Clipe: ${lc.name}` : ''}</span>
          </div>
        </section>
      </div>

      <footer className="timeline">
        <div className="tl-toolbar">
          <b style={{ fontSize: 13 }}>Timeline</b>
          <span className="timecode">{fmt(totalDur)}</span>
          <div className="spacer" />
          <button className="btn btn-ghost btn-sm" onClick={fitZoom} title="Ajustar timeline à tela">⛶ Ajustar à tela</button>
          <span className="timecode">Zoom</span>
          <input type="range" min={4} max={200} step={1} value={zoom} onChange={e => setZoom(parseInt(e.target.value))} style={{ width: 120, accentColor: 'var(--accent)' }} />
          {selected && <>
            <button className="btn btn-ghost btn-sm" onClick={() => moveClip(selected.id, -1)}>← Mover</button>
            <button className="btn btn-ghost btn-sm" onClick={() => moveClip(selected.id, 1)}>Mover →</button>
            <button className="btn btn-ghost btn-sm" onClick={() => duplicateClip(selected.id)}>⧉ Duplicar</button>
            <button className="btn btn-danger btn-sm" onClick={() => removeClip(selected.id)}>✕ Excluir</button>
          </>}
        </div>
        <div className="tl-scroll" ref={tlScrollRef}>
          {clips.length === 0 ? (
            <div className="tl-empty">Sua timeline está vazia — adicione vídeos na aba Mídia para começar ✂️</div>
          ) : (
            <div className="tl-inner" style={{ width: Math.max(totalDur * zoom, 300) }}>
              <div className="ruler" onClick={onRulerClick}>
                {rulerTicks.map(s => <React.Fragment key={s}><i style={{ left: s * zoom }} /><span style={{ left: s * zoom }}>{fmt(s)}</span></React.Fragment>)}
              </div>
              <div className="track">
                {clips.map(c => {
                  const w = Math.max(80, clipDur(c) * zoom)
                  return (
                    <div key={c.id} className={`tl-clip ${selected?.id === c.id ? 'active' : ''}`} style={{ width: w }} onClick={() => setSelectedId(c.id)}>
                      <div className="handle left" onMouseDown={e => startTrim(e, c.id, 'left')} title="Arraste para cortar o início">◂</div>
                      <div className="handle right" onMouseDown={e => startTrim(e, c.id, 'right')} title="Arraste para cortar o fim">▸</div>
                      {c.thumb ? <img src={c.thumb} alt="" draggable={false} /> : <div style={{ height: 64, background: '#000', display: 'grid', placeItems: 'center' }}>🎬</div>}
                      <div className="tl-meta"><b>{c.name}</b><span>{fmt(c.trimStart)} → {fmt(c.trimEnd)} · {c.speed}×</span></div>
                    </div>
                  )
                })}
              </div>
              <div className="playhead" style={{ left: currentTime * zoom }} />
            </div>
          )}
        </div>
      </footer>

      {toast && <div className="toast">{toast}</div>}

      {showExportModal && (
        <div className="modal-back" onClick={() => !exporting && setShowExportModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{exportDone ? '✅ Vídeo pronto!' : 'Exportando vídeo...'}</h2>
            <p>{exportDone
              ? `Seu vídeo foi gerado com ${exportDone.w}×${exportDone.h} a ${exportDone.br} Mbps (${exportDone.engine || 'Renderização rápida'}). Clique abaixo para baixar.`
              : `Renderizando em ${exportDims.w}×${exportDims.h} a ${bitrate} Mbps. Pode deixar a aba aberta — é mais rápido que o vídeo.`}</p>
            <div className="progress"><i style={{ width: `${exportProgress}%` }} /></div>
            <p style={{ textAlign: 'center', fontWeight: 700, color: 'var(--text)' }}>{Math.round(exportProgress)}%</p>
            {exportDone && (
              <>
                <p style={{ textAlign: 'center', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', marginTop: 10 }}>
                  📦 Tamanho final: <b style={{ color: 'var(--accent2)' }}>{fmtSize(exportDone.size / (1024 * 1024))}</b>
                </p>
                <video src={exportDone.url} controls style={{ width: '100%', borderRadius: 12, background: '#000', marginTop: 8 }} />
              </>
            )}
            <div className="modal-actions">
              {exporting
                ? <button className="btn btn-danger" onClick={() => { cancelRef.current = true }}>✕ Cancelar exportação</button>
                : <button className="btn btn-ghost" onClick={() => setShowExportModal(false)}>Fechar</button>}
              {exportDone && <a className="btn btn-primary" href={exportDone.url} download={exportDone.name}>⬇ Baixar {exportDone.name}</a>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
