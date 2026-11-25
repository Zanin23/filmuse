import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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
  return t.trim() || 'none'
}
function clipDur(c) { return Math.max(0.1, (c.trimEnd - c.trimStart) / c.speed) }

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
  const [zoom, setZoom] = useState(60) // px per second
  const [dragOver, setDragOver] = useState(false)
  const [toast, setToast] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportDone, setExportDone] = useState(null) // {url, name}
  const [showExportModal, setShowExportModal] = useState(false)

  const videoRef = useRef(null)
  const fileInputRef = useRef(null)
  const clipsRef = useRef(clips)
  const timeRef = useRef(0)
  const playingRef = useRef(false)
  const rafRef = useRef(null)
  const lastTsRef = useRef(0)
  const trimDragRef = useRef(null)

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

  const addFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList).filter(f => f.type.startsWith('video/'))
    if (!files.length) { showToast('Selecione arquivos de vídeo'); return }
    const newClips = []
    for (const file of files) {
      const url = URL.createObjectURL(file)
      const dur = await new Promise((res) => {
        const v = document.createElement('video')
        v.preload = 'metadata'; v.src = url
        v.onloadedmetadata = () => res(v.duration || 0)
        v.onerror = () => res(0)
        setTimeout(() => res(0), 5000)
      })
      const thumb = await captureThumb(url)
      newClips.push({
        id: uid(), name: file.name, url, file, duration: dur || 10, thumb,
        trimStart: 0, trimEnd: dur || 10, speed: 1, volume: 1, muted: false,
        rotation: 0, flipH: false,
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

  // Sync video element with locator
  useEffect(() => {
    const v = videoRef.current
    if (!v || !locator.clip) return
    const local = locator.clip.trimStart + locator.offset * locator.clip.speed
    if (v.src !== locator.clip.url) {
      v.src = locator.clip.url
      v.playbackRate = locator.clip.speed
      v.volume = locator.clip.muted ? 0 : locator.clip.volume
      v.onloadedmetadata = () => { try { v.currentTime = local } catch {} ; if (playingRef.current) v.play().catch(()=>{}) }
    } else {
      // seek if drift > 0.35s
      if (Math.abs(v.currentTime - local) > 0.35) { try { v.currentTime = local } catch {} }
      v.playbackRate = locator.clip.speed
      v.volume = locator.clip.muted ? 0 : locator.clip.volume
      if (isPlaying && v.paused) v.play().catch(()=>{})
      if (!isPlaying && !v.paused) v.pause()
    }
  }, [locator.clip?.id, locator.offset, isPlaying])

  // Pause video when not playing
  useEffect(() => { const v = videoRef.current; if (v && !isPlaying) v.pause() }, [isPlaying])

  // Keyboard space
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
    if (!clips.length) return
    if (currentTime >= totalDur - 0.05 && !isPlaying) setCurrentTime(0)
    setIsPlaying(p => !p)
  }

  function seekTo(t) {
    const clamped = Math.max(0, Math.min(totalDur, t))
    setCurrentTime(clamped)
    // force video seek
    const v = videoRef.current
    if (v && locator.clip) {
      // recompute locator for clamped
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

  // Trim drag
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

  // Timeline click seek
  function onRulerClick(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    seekTo(x / zoom)
  }

  // --- Export ---
  async function exportVideo() {
    if (!clips.length) return
    setShowExportModal(true); setExporting(true); setExportProgress(0); setExportDone(null)
    const { w, h } = ASPECTS[aspect]
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    const stream = canvas.captureStream(30)
    // try audio from first video element (preview) — best effort
    let audioTrack = null
    try {
      const v = videoRef.current
      if (v && v.captureStream) {
        const vs = v.captureStream()
        audioTrack = vs.getAudioTracks()[0] || null
        if (audioTrack) stream.addTrack(audioTrack)
      }
    } catch {}
    const mime = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      .find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || ''
    let recorder
    const chunks = []
    try { recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : undefined) }
    catch { recorder = new MediaRecorder(stream) }
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
    const done = new Promise(res => { recorder.onstop = res })
    recorder.start(200)

    const total = clips.reduce((a, c) => a + clipDur(c), 0)
    let elapsed = 0
    const hidden = document.createElement('video')
    hidden.muted = false; hidden.playsInline = true; hidden.preload = 'auto'; hidden.crossOrigin = 'anonymous'
    hidden.style.display = 'none'; document.body.appendChild(hidden)

    for (let ci = 0; ci < clips.length; ci++) {
      const clip = clips[ci]
      hidden.src = clip.url
      await new Promise((res, rej) => { hidden.onloadedmetadata = res; hidden.onerror = rej; setTimeout(res, 3000) })
      hidden.playbackRate = clip.speed
      hidden.volume = clip.muted ? 0 : clip.volume
      hidden.currentTime = clip.trimStart
      await new Promise(res => { hidden.onseeked = res; setTimeout(res, 1500) })
      await hidden.play().catch(()=>{})
      const clipOutDur = clipDur(clip)
      const startReal = performance.now()
      await new Promise((resolve) => {
        const draw = () => {
          const played = (performance.now() - startReal) / 1000
          // draw frame
          ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h)
          ctx.save()
          try { ctx.filter = buildFilter(clip) } catch {}
          const vw = hidden.videoWidth || w, vh = hidden.videoHeight || h
          const rot = (clip.rotation || 0) * Math.PI / 180
          const swap = clip.rotation === 90 || clip.rotation === 270
          const srcW = swap ? vh : vw, srcH = swap ? vw : vh
          const scale = Math.min(w / srcW, h / srcH)
          const dw = srcW * scale, dh = srcH * scale
          ctx.translate(w / 2, h / 2)
          ctx.rotate(rot)
          if (clip.flipH) ctx.scale(-1, 1)
          ctx.drawImage(hidden, -dw / 2, -dh / 2, dw, dh)
          ctx.restore()
          // text
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
          setExportProgress(Math.min(99, ((elapsed + Math.min(played, clipOutDur)) / total) * 100))
          if (played >= clipOutDur || hidden.ended) { hidden.pause(); resolve() }
          else requestAnimationFrame(draw)
        }
        requestAnimationFrame(draw)
      })
      elapsed += clipOutDur
    }
    hidden.remove()
    recorder.stop(); await done
    const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' })
    const ext = (recorder.mimeType || '').includes('mp4') ? 'mp4' : 'webm'
    const url = URL.createObjectURL(blob)
    const name = `${projectName.replace(/\s+/g, '-').toLowerCase() || 'filmuse'}.${ext}`
    setExportProgress(100); setExporting(false); setExportDone({ url, name })
  }

  const ratio = ASPECTS[aspect].w / ASPECTS[aspect].h
  const previewStyle = ratio >= 1
    ? { aspectRatio: `${ASPECTS[aspect].w}/${ASPECTS[aspect].h}`, width: 'min(100%, 960px)' }
    : { aspectRatio: `${ASPECTS[aspect].w}/${ASPECTS[aspect].h}`, height: 'min(100%, 54vh)' }

  const rulerTicks = useMemo(() => {
    const arr = []
    const step = zoom < 30 ? 5 : 1
    for (let s = 0; s <= Math.ceil(totalDur); s += step) arr.push(s)
    return arr
  }, [totalDur, zoom])

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
            {[['midia','🎞 Mídia'],['filtros','🎨 Filtros'],['texto','T Texto'],['ajustes','⚙ Ajustes'],['formato','▭ Formato']].map(([id, label]) => (
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
                      <div className="meta"><b>{i + 1}. {c.name}</b><span>{fmt(clipDur(c))} · {c.speed}×</span></div>
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
                <p className="hint">Escolha o formato ideal para onde vai publicar.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Object.entries(ASPECTS).map(([k, v]) => (
                    <button key={k} className={`chip ${aspect === k ? 'active' : ''}`} style={{ textAlign: 'left', padding: '12px 14px' }} onClick={() => setAspect(k)}>{v.label}</button>
                  ))}
                </div>
                <h3>Exportação</h3>
                <p className="hint">A exportação é feita no navegador via Canvas + MediaRecorder. O arquivo final é WebM (ou MP4, se o navegador suportar). Qualidade 720p/1080p conforme o formato.</p>
                <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={!clips.length} onClick={exportVideo}>⬇ Exportar agora</button>
              </>
            )}
          </div>
        </aside>

        <section className="stage">
          <div className="stage-top">
            <span className="timecode"><b>{fmt(currentTime)}</b> / {fmt(totalDur)} · {aspect}</span>
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
              <div className="preview-box" style={previewStyle}>
                <video ref={videoRef} playsInline preload="auto"
                  style={{ filter: locator.clip ? buildFilter(locator.clip) : 'none', transform: locator.clip ? buildTransform(locator.clip) : 'none' }} />
                {locator.clip?.textEnabled && locator.clip?.textContent && (
                  <div className={`text-overlay ${locator.clip.textPos}`}
                    style={{ fontSize: Math.max(14, locator.clip.textSize * 0.55), color: locator.clip.textColor, background: locator.clip.textBg }}>
                    {locator.clip.textContent}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="controls">
            <button className="icon-btn" disabled={!clips.length} onClick={() => seekTo(0)} title="Início">⏮</button>
            <button className="play-btn" disabled={!clips.length} onClick={togglePlay}>{isPlaying ? '⏸' : '▶'}</button>
            <button className="icon-btn" disabled={!clips.length} onClick={() => seekTo(totalDur)} title="Fim">⏭</button>
            <span className="timecode" style={{ marginLeft: 8 }}>{locator.clip ? `Clipe: ${locator.clip.name}` : ''}</span>
          </div>
        </section>
      </div>

      <footer className="timeline">
        <div className="tl-toolbar">
          <b style={{ fontSize: 13 }}>Timeline</b>
          <span className="timecode">{fmt(totalDur)}</span>
          <div className="spacer" />
          <span className="timecode">Zoom</span>
          <input type="range" min={20} max={140} step={5} value={zoom} onChange={e => setZoom(parseInt(e.target.value))} style={{ width: 120, accentColor: 'var(--accent)' }} />
          {selected && <>
            <button className="btn btn-ghost btn-sm" onClick={() => moveClip(selected.id, -1)}>← Mover</button>
            <button className="btn btn-ghost btn-sm" onClick={() => moveClip(selected.id, 1)}>Mover →</button>
            <button className="btn btn-ghost btn-sm" onClick={() => duplicateClip(selected.id)}>⧉ Duplicar</button>
            <button className="btn btn-danger btn-sm" onClick={() => removeClip(selected.id)}>✕ Excluir</button>
          </>}
        </div>
        <div className="tl-scroll">
          {clips.length === 0 ? (
            <div className="tl-empty">Sua timeline está vazia — adicione vídeos na aba Mídia para começar ✂️</div>
          ) : (
            <div className="tl-inner" style={{ width: Math.max(totalDur * zoom, 600) }}>
              <div className="ruler" onClick={onRulerClick}>
                {rulerTicks.map(s => <React.Fragment key={s}><i style={{ left: s * zoom }} /><span style={{ left: s * zoom }}>{fmt(s)}</span></React.Fragment>)}
              </div>
              <div className="track">
                {clips.map(c => {
                  const w = Math.max(110, clipDur(c) * zoom)
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
            <p>{exportDone ? 'Seu vídeo foi gerado. Clique abaixo para baixar.' : 'Estamos renderizando seu vídeo quadro a quadro. Não feche esta janela.'}</p>
            <div className="progress"><i style={{ width: `${exportProgress}%` }} /></div>
            <p style={{ textAlign: 'center', fontWeight: 700, color: 'var(--text)' }}>{Math.round(exportProgress)}%</p>
            {exportDone && (
              <video src={exportDone.url} controls style={{ width: '100%', borderRadius: 12, background: '#000', marginTop: 8 }} />
            )}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowExportModal(false)}>{exporting ? 'Aguarde...' : 'Fechar'}</button>
              {exportDone && <a className="btn btn-primary" href={exportDone.url} download={exportDone.name}>⬇ Baixar {exportDone.name}</a>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
