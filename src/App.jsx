import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Header from './components/Header.jsx'
import LeftSidebar from './components/LeftSidebar.jsx'
import Stage from './components/Stage.jsx'
import RightInspector from './components/RightInspector.jsx'
import Timeline from './components/Timeline.jsx'
import RecordModal from './components/RecordModal.jsx'
import ExportModal from './components/ExportModal.jsx'
import ShortcutsModal from './components/ShortcutsModal.jsx'
import { WELCOME_AI_MSG } from './components/AiAssistantPanel.jsx'
import { useProjectHistory } from './hooks/useHistory.js'
import {
  DEFAULT_FILTERS,
  TEXT_PRESETS,
  COLOR_BACKGROUNDS,
} from './constants/presets.js'
import {
  uid,
  clamp,
  clipDur,
  overlayDur,
  audioDur,
  probeVideoMeta,
  probeAudioMeta,
  preloadImage,
  captureFilmstrip,
  extractAudioPeaks,
  generateColorCardThumb,
  synthesizeSfxWav,
} from './utils/media.js'
import {
  exportProjectWebCodecs,
  exportProjectMediaRecorder,
  downloadCanvasSnapshot,
  validateExportBlob,
} from './utils/exporter.js'

const INITIAL_PROJECT = {
  clips: [],
  overlays: [],
  texts: [],
  audios: [],
  aspect: '16:9',
  stageBgColor: '#000000',
}

function buildMainClipFromMedia(media) {
  const dur = media.kind === 'image' || media.kind === 'color' ? (media.duration || 4) : (media.duration || 5)
  return {
    id: uid(),
    mediaId: media.id,
    kind: media.kind,
    name: media.name,
    url: media.url,
    file: media.file || null,
    sourceDuration: media.kind === 'image' || media.kind === 'color' ? 300 : dur,
    thumb: media.thumb || '',
    filmstrip: media.filmstrip?.length ? media.filmstrip : media.thumb ? [media.thumb] : [],
    peaks: media.peaks || [],
    videoW: media.width || 1280,
    videoH: media.height || 720,
    colorStyle: media.colorStyle || null,
    trimStart: 0,
    trimEnd: dur,
    speed: 1,
    volume: 1,
    muted: false,
    audioFadeIn: 0,
    audioFadeOut: 0,
    fitMode: 'contain',
    blurFill: false,
    scale: 1,
    posX: 0,
    posY: 0,
    rotation: 0,
    flipH: false,
    flipV: false,
    borderRadius: 0,
    cropEnabled: false,
    cropX: 0,
    cropY: 0,
    cropW: 1,
    cropH: 1,
    preset: 'original',
    ...DEFAULT_FILTERS,
    fadeIn: 0,
    fadeOut: 0,
    transition: { type: 'none', duration: 0.6 },
    motion: media.kind === 'image' ? 'zoom-in' : 'none',
  }
}

function buildOverlayFromMedia(media, startAt = 0, circular = false) {
  const dur = media.kind === 'image' || media.kind === 'color' ? 4 : (media.duration || 5)
  return {
    id: uid(),
    mediaId: media.id,
    kind: media.kind,
    name: media.name,
    url: media.url,
    file: media.file || null,
    sourceDuration: media.kind === 'image' || media.kind === 'color' ? 300 : dur,
    thumb: media.thumb || '',
    videoW: media.width || 640,
    videoH: media.height || 640,
    colorStyle: media.colorStyle || null,
    start: Math.max(0, startAt),
    trimStart: 0,
    trimEnd: dur,
    speed: 1,
    x: 0.78,
    y: 0.74,
    width: circular ? 0.24 : 0.32,
    rotation: 0,
    flipH: false,
    flipV: false,
    borderRadius: circular ? 999 : 16,
    shadow: true,
    borderWidth: 3,
    borderColor: '#ffffff',
    preset: 'original',
    ...DEFAULT_FILTERS,
    volume: 1,
    muted: false,
    fadeIn: 0.2,
    fadeOut: 0.2,
  }
}

function buildAudioFromMedia(media, startAt = 0) {
  const dur = media.duration || 5
  return {
    id: uid(),
    mediaId: media.id,
    name: media.name,
    url: media.url,
    file: media.file || null,
    sourceDuration: dur,
    peaks: media.peaks || [],
    start: Math.max(0, startAt),
    trimStart: 0,
    trimEnd: dur,
    speed: 1,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  }
}

export default function App() {
  const {
    state: project,
    commit,
    undo,
    redo,
    resetHistory,
    canUndo,
    canRedo,
  } = useProjectHistory(INITIAL_PROJECT)

  const { clips, overlays, texts, audios, aspect, stageBgColor } = project

  const [projectName, setProjectName] = useState('Meu projeto')
  const [mediaItems, setMediaItems] = useState([])
  const [leftTab, setLeftTab] = useState('ia')
  const [drawerOpen, setDrawerOpen] = useState(true)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [aiMessages, setAiMessages] = useState([WELCOME_AI_MSG])

  const [selection, setSelection] = useState(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [loopPlayback, setLoopPlayback] = useState(false)
  const [zoom, setZoom] = useState(28)
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [cropping, setCropping] = useState(false)

  const [toast, setToast] = useState('')
  const [recorderMode, setRecorderMode] = useState(null)
  const [showShortcuts, setShowShortcuts] = useState(false)

  const [showExportModal, setShowExportModal] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportProgressInfo, setExportProgressInfo] = useState(null)
  const [exportResult, setExportResult] = useState(null)

  const canvasRef = useRef(null)
  const aiInputRef = useRef(null)
  const cancelExportRef = useRef(false)
  const toastTimerRef = useRef(null)
  const projectRef = useRef(project)
  projectRef.current = project

  const showToast = useCallback((msg) => {
    setToast(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(''), 2800)
  }, [])

  const mainVideoDuration = useMemo(
    () => clips.reduce((acc, c) => acc + clipDur(c), 0),
    [clips]
  )

  const totalDur = useMemo(() => {
    const ovEnd = overlays.reduce((m, o) => Math.max(m, (o.start || 0) + overlayDur(o)), 0)
    const txEnd = texts.reduce((m, t) => Math.max(m, (t.start || 0) + (t.duration || 3)), 0)
    const auEnd = audios.reduce((m, a) => Math.max(m, (a.start || 0) + audioDur(a)), 0)
    return Math.max(mainVideoDuration, ovEnd, txEnd, auEnd)
  }, [mainVideoDuration, overlays, texts, audios])

  const hasContent = clips.length > 0 || overlays.length > 0 || texts.length > 0 || audios.length > 0

  // Keep valid selection if item is deleted via undo/redo
  useEffect(() => {
    if (!selection) return
    const exists =
      (selection.track === 'main' && clips.some((c) => c.id === selection.id)) ||
      (selection.track === 'overlay' && overlays.some((o) => o.id === selection.id)) ||
      (selection.track === 'text' && texts.some((t) => t.id === selection.id)) ||
      (selection.track === 'audio' && audios.some((a) => a.id === selection.id))
    if (!exists) setSelection(null)
  }, [clips, overlays, texts, audios, selection])

  useEffect(() => {
    if (cropping) setIsPlaying(false)
  }, [cropping])

  // Master Playback Clock
  const totalDurRef = useRef(totalDur)
  totalDurRef.current = totalDur
  const loopRef = useRef(loopPlayback)
  loopRef.current = loopPlayback

  useEffect(() => {
    if (!isPlaying) return
    let raf
    let lastTs = performance.now()
    const tick = (ts) => {
      const dt = Math.min(0.1, (ts - lastTs) / 1000)
      lastTs = ts
      setCurrentTime((prev) => {
        const end = totalDurRef.current
        if (end <= 0) {
          setIsPlaying(false)
          return 0
        }
        const next = prev + dt
        if (next >= end) {
          if (loopRef.current) return 0
          setIsPlaying(false)
          return end
        }
        return next
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying])

  const togglePlay = useCallback(() => {
    if (!hasContent || cropping) return
    setCurrentTime((t) => (t >= totalDur - 0.04 && !isPlaying ? 0 : t))
    setIsPlaying((p) => !p)
  }, [hasContent, cropping, totalDur, isPlaying])

  const seekTo = useCallback(
    (t) => {
      setCurrentTime(clamp(t, 0, Math.max(0, totalDur)))
    },
    [totalDur]
  )

  // --- Update Callbacks ---
  const updateMainClip = useCallback(
    (id, patch, coalesceKey = null) => {
      commit(
        (prev) => ({
          ...prev,
          clips: prev.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        }),
        coalesceKey
      )
    },
    [commit]
  )

  const applyFiltersAll = useCallback(
    (sourceClip) => {
      const filterPatch = {
        preset: sourceClip.preset || 'custom',
        brightness: sourceClip.brightness,
        contrast: sourceClip.contrast,
        saturate: sourceClip.saturate,
        hue: sourceClip.hue,
        grayscale: sourceClip.grayscale,
        sepia: sourceClip.sepia,
        blur: sourceClip.blur,
        vignette: sourceClip.vignette,
      }
      commit((prev) => ({
        ...prev,
        clips: prev.clips.map((c) => ({ ...c, ...filterPatch })),
      }))
      showToast('Filtro aplicado a todos os clipes')
    },
    [commit, showToast]
  )

  const updateOverlay = useCallback(
    (id, patch, coalesceKey = null) => {
      commit(
        (prev) => ({
          ...prev,
          overlays: prev.overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)),
        }),
        coalesceKey
      )
    },
    [commit]
  )

  const updateText = useCallback(
    (id, patch, coalesceKey = null) => {
      commit(
        (prev) => ({
          ...prev,
          texts: prev.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        }),
        coalesceKey
      )
    },
    [commit]
  )

  const updateAudio = useCallback(
    (id, patch, coalesceKey = null) => {
      commit(
        (prev) => ({
          ...prev,
          audios: prev.audios.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        }),
        coalesceKey
      )
    },
    [commit]
  )

  const reorderMainClip = useCallback(
    (fromIndex, toIndex) => {
      commit((prev) => {
        if (fromIndex < 0 || fromIndex >= prev.clips.length) return prev
        const target = clamp(toIndex, 0, prev.clips.length - 1)
        if (fromIndex === target) return prev
        const next = [...prev.clips]
        const [moved] = next.splice(fromIndex, 1)
        next.splice(target, 0, moved)
        return { ...prev, clips: next }
      })
    },
    [commit]
  )

  // --- Import Media Files (Videos, Images, Audio) ---
  const handleImportFiles = useCallback(
    async (fileList, targetTrack = null, dropTime = null) => {
      const files = Array.from(fileList || []).filter(
        (f) => f.type.startsWith('video/') || f.type.startsWith('image/') || f.type.startsWith('audio/')
      )
      if (!files.length) {
        showToast('Selecione arquivos de vídeo, imagem ou áudio')
        return
      }

      showToast(`Processando ${files.length} arquivo(s)...`)
      const addedMedia = []

      for (const file of files) {
        const url = URL.createObjectURL(file)
        if (file.type.startsWith('video/')) {
          const meta = await probeVideoMeta(url, 5)
          const [{ thumb, filmstrip }, peakInfo] = await Promise.all([
            captureFilmstrip(url, meta.duration, 6),
            extractAudioPeaks(file, 96),
          ])
          addedMedia.push({
            id: uid(),
            kind: 'video',
            name: file.name,
            url,
            file,
            duration: meta.duration,
            width: meta.w,
            height: meta.h,
            thumb,
            filmstrip,
            peaks: peakInfo.peaks,
            hasAudio: peakInfo.hasAudio,
          })
        } else if (file.type.startsWith('image/')) {
          const img = await preloadImage(url)
          addedMedia.push({
            id: uid(),
            kind: 'image',
            name: file.name,
            url,
            file,
            duration: 4,
            width: img?.naturalWidth || 1280,
            height: img?.naturalHeight || 720,
            thumb: url,
            filmstrip: [url],
            peaks: [],
            hasAudio: false,
          })
        } else if (file.type.startsWith('audio/')) {
          const [meta, peakInfo] = await Promise.all([
            probeAudioMeta(url, 5),
            extractAudioPeaks(file, 120),
          ])
          addedMedia.push({
            id: uid(),
            kind: 'audio',
            name: file.name,
            url,
            file,
            duration: meta.duration,
            width: 0,
            height: 0,
            thumb: '',
            filmstrip: [],
            peaks: peakInfo.peaks,
            hasAudio: true,
          })
        }
      }

      setMediaItems((prev) => [...addedMedia, ...prev])

      const prev = projectRef.current
      const insertAt = dropTime !== null ? dropTime : currentTime
      const nextClips = [...prev.clips]
      const nextOverlays = [...prev.overlays]
      const nextAudios = [...prev.audios]
      let newSel = null

      for (const m of addedMedia) {
        if (m.kind === 'audio' || targetTrack === 'audio') {
          const au = buildAudioFromMedia(m, prev.clips.length === 0 ? 0 : insertAt)
          nextAudios.push(au)
          newSel = { track: 'audio', id: au.id }
        } else if (targetTrack === 'overlay') {
          const ov = buildOverlayFromMedia(m, insertAt, false)
          nextOverlays.push(ov)
          newSel = { track: 'overlay', id: ov.id }
        } else {
          const mc = buildMainClipFromMedia(m)
          nextClips.push(mc)
          newSel = { track: 'main', id: mc.id }
        }
      }

      commit({
        ...prev,
        clips: nextClips,
        overlays: nextOverlays,
        audios: nextAudios,
      })

      if (newSel) setSelection(newSel)
      showToast(`${addedMedia.length} mídia(s) adicionada(s)`)
    },
    [commit, currentTime, showToast]
  )

  const handleAddMediaToTimeline = useCallback(
    (mediaId, dropTime = null) => {
      const m = mediaItems.find((x) => x.id === mediaId)
      if (!m) return
      const startAt = dropTime !== null ? dropTime : currentTime

      if (m.kind === 'audio') {
        const au = buildAudioFromMedia(m, startAt)
        commit((prev) => ({ ...prev, audios: [...prev.audios, au] }))
        setSelection({ track: 'audio', id: au.id })
      } else {
        const mc = buildMainClipFromMedia(m)
        commit((prev) => ({ ...prev, clips: [...prev.clips, mc] }))
        setSelection({ track: 'main', id: mc.id })
      }
      showToast(`"${m.name}" adicionado à timeline`)
    },
    [mediaItems, currentTime, commit, showToast]
  )

  const handleAddMediaAsOverlay = useCallback(
    (mediaId, dropTime = null) => {
      const m = mediaItems.find((x) => x.id === mediaId)
      if (!m || m.kind === 'audio') return
      const ov = buildOverlayFromMedia(m, dropTime !== null ? dropTime : currentTime, false)
      commit((prev) => ({ ...prev, overlays: [...prev.overlays, ov] }))
      setSelection({ track: 'overlay', id: ov.id })
      showToast('Camada Picture-in-Picture adicionada')
    },
    [mediaItems, currentTime, commit, showToast]
  )

  const handleRemoveMediaItem = useCallback((mediaId) => {
    setMediaItems((prev) => prev.filter((m) => m.id !== mediaId))
  }, [])

  const handleDropMediaOnTrack = useCallback(
    ({ mediaId, files, targetTrack, dropTime }) => {
      if (files?.length) {
        handleImportFiles(files, targetTrack, dropTime)
        return
      }
      if (!mediaId) return
      if (targetTrack === 'overlay') {
        handleAddMediaAsOverlay(mediaId, dropTime)
      } else {
        handleAddMediaToTimeline(mediaId, dropTime)
      }
    },
    [handleImportFiles, handleAddMediaAsOverlay, handleAddMediaToTimeline]
  )

  // --- Save Browser Recordings (Screen, Webcam, Screen+Cam, Voiceover) ---
  const handleSaveRecording = useCallback(
    async (rec) => {
      setRecorderMode(null)
      if (!rec) return

      if (rec.kind === 'voice' && rec.audioBlob) {
        const peakInfo = await extractAudioPeaks(rec.audioBlob, 100)
        const media = {
          id: uid(),
          kind: 'audio',
          name: `Narração ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
          url: rec.audioUrl,
          file: rec.audioBlob,
          duration: rec.duration,
          thumb: '',
          filmstrip: [],
          peaks: peakInfo.peaks,
          hasAudio: true,
        }
        setMediaItems((p) => [media, ...p])
        const au = buildAudioFromMedia(media, currentTime)
        commit((prev) => ({ ...prev, audios: [...prev.audios, au] }))
        setSelection({ track: 'audio', id: au.id })
        showToast('Narração adicionada na faixa de áudio!')
        return
      }

      if (rec.videoBlob) {
        const meta = await probeVideoMeta(rec.videoUrl, rec.duration)
        const [{ thumb, filmstrip }, peakInfo] = await Promise.all([
          captureFilmstrip(rec.videoUrl, meta.duration, 5),
          extractAudioPeaks(rec.videoBlob, 90),
        ])
        const mainMedia = {
          id: uid(),
          kind: 'video',
          name: rec.kind === 'webcam' ? 'Câmera gravada' : 'Tela gravada',
          url: rec.videoUrl,
          file: rec.videoBlob,
          duration: meta.duration,
          width: meta.w,
          height: meta.h,
          thumb,
          filmstrip,
          peaks: peakInfo.peaks,
          hasAudio: peakInfo.hasAudio,
        }

        const newMediaList = [mainMedia]
        let camMedia = null

        if (rec.kind === 'screen-cam' && rec.camBlob) {
          const camMeta = await probeVideoMeta(rec.camUrl, rec.duration)
          const camStrip = await captureFilmstrip(rec.camUrl, camMeta.duration, 4)
          camMedia = {
            id: uid(),
            kind: 'video',
            name: 'Webcam (PiP)',
            url: rec.camUrl,
            file: rec.camBlob,
            duration: camMeta.duration,
            width: camMeta.w,
            height: camMeta.h,
            thumb: camStrip.thumb,
            filmstrip: camStrip.filmstrip,
            peaks: [],
            hasAudio: true,
          }
          newMediaList.push(camMedia)
        }

        setMediaItems((p) => [...newMediaList, ...p])

        const prev = projectRef.current
        if (rec.kind === 'webcam' && rec.asOverlay) {
          const ov = buildOverlayFromMedia(mainMedia, currentTime, true)
          ov.flipH = true
          commit({ ...prev, overlays: [...prev.overlays, ov] })
          setSelection({ track: 'overlay', id: ov.id })
        } else {
          const startOffset = prev.clips.reduce((a, c) => a + clipDur(c), 0)
          const mc = buildMainClipFromMedia(mainMedia)
          if (rec.kind === 'webcam') mc.flipH = true
          const nextOverlays = [...prev.overlays]

          if (camMedia) {
            mc.muted = false
            const pip = buildOverlayFromMedia(camMedia, startOffset, true)
            pip.flipH = true
            pip.muted = true
            nextOverlays.push(pip)
          }

          commit({
            ...prev,
            clips: [...prev.clips, mc],
            overlays: nextOverlays,
          })
          setSelection({ track: 'main', id: mc.id })
        }

        showToast('Gravação adicionada ao projeto!')
      }
    },
    [commit, currentTime, showToast]
  )

  // --- Text, Stickers, Color Cards, Built-in SFX ---
  const handleAddTextPreset = useCallback(
    (preset) => {
      const newTxt = {
        id: uid(),
        name: preset.name,
        start: currentTime,
        duration: 3.5,
        align: 'center',
        opacity: 1,
        stylePreset: preset.id,
        ...preset.props,
      }
      commit((prev) => ({ ...prev, texts: [...prev.texts, newTxt] }))
      setSelection({ track: 'text', id: newTxt.id })
      setInspectorOpen(true)
      showToast('Texto adicionado na agulha')
    },
    [commit, currentTime, showToast]
  )

  const handleAddSticker = useCallback(
    (sticker) => {
      const newSticker = {
        id: uid(),
        name: sticker.label,
        text: sticker.emoji,
        start: currentTime,
        duration: 3,
        x: 0.5,
        y: 0.5,
        fontFamily: 'Inter',
        fontSize: 78,
        fontWeight: 800,
        italic: false,
        uppercase: false,
        align: 'center',
        color: '#ffffff',
        bgEnabled: false,
        bgColor: '#000000',
        bgOpacity: 0,
        bgPadding: 8,
        bgRadius: 8,
        strokeWidth: 0,
        strokeColor: '#000000',
        shadow: true,
        opacity: 1,
        animation: 'pop',
      }
      commit((prev) => ({ ...prev, texts: [...prev.texts, newSticker] }))
      setSelection({ track: 'text', id: newSticker.id })
      showToast(`Adesivo ${sticker.emoji} adicionado`)
    },
    [commit, currentTime, showToast]
  )

  const handleAddColorBackground = useCallback(
    (bgDef) => {
      const thumb = generateColorCardThumb(bgDef)
      const media = {
        id: uid(),
        kind: 'color',
        name: bgDef.name,
        url: '',
        file: null,
        duration: 4,
        width: 1280,
        height: 720,
        thumb,
        filmstrip: [thumb],
        peaks: [],
        hasAudio: false,
        colorStyle: bgDef,
      }
      const mc = buildMainClipFromMedia(media)
      commit((prev) => ({ ...prev, clips: [...prev.clips, mc] }))
      setSelection({ track: 'main', id: mc.id })
      showToast(`Fundo "${bgDef.name}" adicionado`)
    },
    [commit, showToast]
  )

  const handleAddBuiltinSfx = useCallback(
    async (sfx) => {
      const blob = synthesizeSfxWav(sfx.kind, sfx.duration)
      const url = URL.createObjectURL(blob)
      const peakInfo = await extractAudioPeaks(blob, 80)
      const media = {
        id: uid(),
        kind: 'audio',
        name: sfx.name,
        url,
        file: blob,
        duration: sfx.duration,
        thumb: '',
        filmstrip: [],
        peaks: peakInfo.peaks,
        hasAudio: true,
      }
      const au = buildAudioFromMedia(media, currentTime)
      if (sfx.kind.includes('loop')) au.volume = 0.55
      commit((prev) => ({ ...prev, audios: [...prev.audios, au] }))
      setSelection({ track: 'audio', id: au.id })
      showToast(`"${sfx.name}" adicionado na trilha`)
    },
    [commit, currentTime, showToast]
  )

  // --- Core Timeline Editing Operations (Split, Duplicate, Delete, Detach Audio, Transitions) ---
  const handleSplitAtPlayhead = useCallback(() => {
    const t = currentTime
    const prev = projectRef.current

    // 1) If a Text clip is selected and playhead is inside it
    if (selection?.track === 'text') {
      const idx = prev.texts.findIndex((x) => x.id === selection.id)
      if (idx >= 0) {
        const tx = prev.texts[idx]
        const offset = t - tx.start
        if (offset > 0.15 && tx.duration - offset > 0.15) {
          const left = { ...tx, duration: offset }
          const right = { ...tx, id: uid(), start: t, duration: tx.duration - offset }
          const nextTexts = [...prev.texts]
          nextTexts.splice(idx, 1, left, right)
          commit({ ...prev, texts: nextTexts })
          setSelection({ track: 'text', id: right.id })
          showToast('✂ Texto dividido na agulha')
          return
        }
      }
    }

    // 2) If an Overlay clip is selected and playhead is inside it
    if (selection?.track === 'overlay') {
      const idx = prev.overlays.findIndex((x) => x.id === selection.id)
      if (idx >= 0) {
        const ov = prev.overlays[idx]
        const dur = overlayDur(ov)
        const offset = t - ov.start
        if (offset > 0.15 && dur - offset > 0.15) {
          const splitMediaT = ov.trimStart + offset * (ov.speed || 1)
          const left = { ...ov, trimEnd: splitMediaT, fadeOut: 0 }
          const right = { ...ov, id: uid(), start: t, trimStart: splitMediaT, fadeIn: 0 }
          const nextOvs = [...prev.overlays]
          nextOvs.splice(idx, 1, left, right)
          commit({ ...prev, overlays: nextOvs })
          setSelection({ track: 'overlay', id: right.id })
          showToast('✂ Camada dividida na agulha')
          return
        }
      }
    }

    // 3) If an Audio clip is selected and playhead is inside it
    if (selection?.track === 'audio') {
      const idx = prev.audios.findIndex((x) => x.id === selection.id)
      if (idx >= 0) {
        const au = prev.audios[idx]
        const dur = audioDur(au)
        const offset = t - au.start
        if (offset > 0.15 && dur - offset > 0.15) {
          const frac = offset / dur
          const pkSplit = Math.max(1, Math.floor((au.peaks?.length || 0) * frac))
          const splitMediaT = au.trimStart + offset * (au.speed || 1)
          const left = {
            ...au,
            trimEnd: splitMediaT,
            fadeOut: 0,
            peaks: au.peaks?.length ? au.peaks.slice(0, pkSplit) : [],
          }
          const right = {
            ...au,
            id: uid(),
            start: t,
            trimStart: splitMediaT,
            fadeIn: 0,
            peaks: au.peaks?.length ? au.peaks.slice(pkSplit) : [],
          }
          const nextAudios = [...prev.audios]
          nextAudios.splice(idx, 1, left, right)
          commit({ ...prev, audios: nextAudios })
          setSelection({ track: 'audio', id: right.id })
          showToast('✂ Áudio dividido na agulha')
          return
        }
      }
    }

    // 4) Default: Split Main Video Clip under playhead
    let acc = 0
    for (let i = 0; i < prev.clips.length; i++) {
      const c = prev.clips[i]
      const dur = clipDur(c)
      if (t > acc + 0.15 && t < acc + dur - 0.15) {
        const offset = t - acc
        const splitMediaT = c.trimStart + offset * (c.speed || 1)
        const left = {
          ...c,
          trimEnd: splitMediaT,
          fadeOut: 0,
          audioFadeOut: 0,
        }
        const right = {
          ...c,
          id: uid(),
          trimStart: splitMediaT,
          fadeIn: 0,
          audioFadeIn: 0,
          transition: { type: 'none', duration: 0.6 },
        }
        const nextClips = [...prev.clips]
        nextClips.splice(i, 1, left, right)
        commit({ ...prev, clips: nextClips })
        setSelection({ track: 'main', id: right.id })
        showToast('✂ Clipe dividido na agulha')
        return
      }
      acc += dur
    }

    showToast('Posicione a agulha dentro de um clipe para dividir')
  }, [commit, currentTime, selection, showToast])

  const handleDeleteSelected = useCallback(() => {
    if (!selection) return
    commit((prev) => {
      if (selection.track === 'main') {
        return { ...prev, clips: prev.clips.filter((c) => c.id !== selection.id) }
      }
      if (selection.track === 'overlay') {
        return { ...prev, overlays: prev.overlays.filter((o) => o.id !== selection.id) }
      }
      if (selection.track === 'text') {
        return { ...prev, texts: prev.texts.filter((t) => t.id !== selection.id) }
      }
      if (selection.track === 'audio') {
        return { ...prev, audios: prev.audios.filter((a) => a.id !== selection.id) }
      }
      return prev
    })
    setSelection(null)
    setCropping(false)
    showToast('Item removido')
  }, [selection, commit, showToast])

  const handleDuplicateSelected = useCallback(() => {
    if (!selection) return
    const prev = projectRef.current
    if (selection.track === 'main') {
      const idx = prev.clips.findIndex((c) => c.id === selection.id)
      if (idx < 0) return
      const copy = { ...prev.clips[idx], id: uid(), name: `${prev.clips[idx].name} (cópia)` }
      const next = [...prev.clips]
      next.splice(idx + 1, 0, copy)
      commit({ ...prev, clips: next })
      setSelection({ track: 'main', id: copy.id })
      showToast('Clipe duplicado')
      return
    }
    if (selection.track === 'overlay') {
      const ov = prev.overlays.find((o) => o.id === selection.id)
      if (!ov) return
      const copy = { ...ov, id: uid(), start: ov.start + overlayDur(ov) + 0.1 }
      commit({ ...prev, overlays: [...prev.overlays, copy] })
      setSelection({ track: 'overlay', id: copy.id })
      showToast('Camada duplicada')
      return
    }
    if (selection.track === 'text') {
      const tx = prev.texts.find((t) => t.id === selection.id)
      if (!tx) return
      const copy = { ...tx, id: uid(), start: tx.start + (tx.duration || 3) + 0.1 }
      commit({ ...prev, texts: [...prev.texts, copy] })
      setSelection({ track: 'text', id: copy.id })
      showToast('Texto duplicado')
      return
    }
    if (selection.track === 'audio') {
      const au = prev.audios.find((a) => a.id === selection.id)
      if (!au) return
      const copy = { ...au, id: uid(), start: au.start + audioDur(au) + 0.1 }
      commit({ ...prev, audios: [...prev.audios, copy] })
      setSelection({ track: 'audio', id: copy.id })
      showToast('Áudio duplicado')
    }
  }, [selection, commit, showToast])

  const handleDetachAudio = useCallback(
    (clipId) => {
      const prev = projectRef.current
      let acc = 0
      let targetClip = null
      let clipStart = 0
      for (const c of prev.clips) {
        if (c.id === clipId) {
          targetClip = c
          clipStart = acc
          break
        }
        acc += clipDur(c)
      }
      if (!targetClip || targetClip.kind !== 'video') return
      const newAudio = {
        id: uid(),
        mediaId: targetClip.mediaId,
        name: `Áudio · ${targetClip.name}`,
        url: targetClip.url,
        file: targetClip.file,
        sourceDuration: targetClip.sourceDuration,
        peaks: targetClip.peaks || [],
        start: clipStart,
        trimStart: targetClip.trimStart,
        trimEnd: targetClip.trimEnd,
        speed: targetClip.speed || 1,
        volume: targetClip.volume ?? 1,
        muted: false,
        fadeIn: targetClip.audioFadeIn || 0,
        fadeOut: targetClip.audioFadeOut || 0,
      }
      commit({
        ...prev,
        clips: prev.clips.map((c) => (c.id === clipId ? { ...c, muted: true } : c)),
        audios: [...prev.audios, newAudio],
      })
      setSelection({ track: 'audio', id: newAudio.id })
      showToast('🔊 Áudio separado para a trilha independente')
    },
    [commit, showToast]
  )

  const handleApplyTransition = useCallback(
    (clipId, type, duration = 0.6) => {
      updateMainClip(clipId, { transition: { type, duration } })
      showToast(type === 'none' ? 'Transição removida' : '✨ Transição aplicada')
    },
    [updateMainClip, showToast]
  )

  const handleApplyTransitionAll = useCallback(
    (type, duration = 0.6) => {
      commit((prev) => ({
        ...prev,
        clips: prev.clips.map((c, idx) =>
          idx === 0 ? c : { ...c, transition: { type, duration } }
        ),
      }))
      showToast('✨ Transição aplicada a todos os cortes')
    },
    [commit, showToast]
  )

  const handleOpenTransitionForClip = useCallback((clipId) => {
    setSelection({ track: 'main', id: clipId })
    setLeftTab('transicoes')
    setDrawerOpen(true)
  }, [])

  // --- Load Instant Multi-Track Demo Project ---
  const handleLoadDemo = useCallback(async () => {
    setIsPlaying(false)
    const s1 = COLOR_BACKGROUNDS[0] // Aurora Violeta
    const s2 = COLOR_BACKGROUNDS[1] // Neon Oceano
    const s3 = COLOR_BACKGROUNDS[2] // Pôr do Sol

    const mkDemoClip = (bgDef, dur, trType, motion) => {
      const thumb = generateColorCardThumb(bgDef)
      return {
        ...buildMainClipFromMedia({
          id: uid(),
          kind: 'color',
          name: bgDef.name,
          url: '',
          file: null,
          duration: dur,
          width: 1280,
          height: 720,
          thumb,
          filmstrip: [thumb],
          colorStyle: bgDef,
        }),
        motion,
        transition: { type: trType, duration: 0.7 },
      }
    }

    const c1 = mkDemoClip(s1, 3.2, 'none', 'zoom-in')
    c1.fadeIn = 0.5
    const c2 = mkDemoClip(s2, 3.5, 'slide-left', 'pan-right')
    const c3 = mkDemoClip(s3, 3.3, 'crossfade', 'zoom-out')
    c3.fadeOut = 0.6

    const t1 = {
      id: uid(),
      name: 'Boas-vindas',
      start: 0.25,
      duration: 2.7,
      align: 'center',
      opacity: 1,
      ...TEXT_PRESETS[0].props,
      text: 'NOVO ESTÚDIO FILMUSE',
      y: 0.45,
    }
    const tSub = {
      id: uid(),
      name: 'Subtítulo',
      start: 0.5,
      duration: 2.4,
      align: 'center',
      opacity: 1,
      ...TEXT_PRESETS[1].props,
      text: 'Inspirado no Clipchamp · 100% no navegador',
      fontSize: 30,
      y: 0.64,
    }
    const t2 = {
      id: uid(),
      name: 'Dica Corte',
      start: 3.4,
      duration: 3.0,
      align: 'center',
      opacity: 1,
      ...TEXT_PRESETS[2].props,
      text: 'PRESSIONE "S" PARA DIVIDIR',
      y: 0.5,
    }
    const t3 = {
      id: uid(),
      name: 'Exportar',
      start: 6.9,
      duration: 2.8,
      align: 'center',
      opacity: 1,
      ...TEXT_PRESETS[3].props,
      text: 'EXPORTE EM MP4 FULL HD!',
      y: 0.52,
    }

    // Generate ambient synth loop + whoosh transition SFX
    const loopBlob = synthesizeSfxWav('lofi-loop', 8.0)
    const loopUrl = URL.createObjectURL(loopBlob)
    const loopPeaks = await extractAudioPeaks(loopBlob, 100)

    const whooshBlob = synthesizeSfxWav('whoosh', 0.55)
    const whooshUrl = URL.createObjectURL(whooshBlob)
    const whooshPeaks = await extractAudioPeaks(whooshBlob, 40)

    const a1 = {
      id: uid(),
      mediaId: uid(),
      name: 'Trilha Chill Synth',
      url: loopUrl,
      file: loopBlob,
      sourceDuration: 8.0,
      peaks: loopPeaks.peaks,
      start: 0,
      trimStart: 0,
      trimEnd: 8.0,
      speed: 1,
      volume: 0.55,
      muted: false,
      fadeIn: 0.4,
      fadeOut: 1.2,
    }

    const a2 = {
      id: uid(),
      mediaId: uid(),
      name: 'Transição Whoosh',
      url: whooshUrl,
      file: whooshBlob,
      sourceDuration: 0.55,
      peaks: whooshPeaks.peaks,
      start: 3.0,
      trimStart: 0,
      trimEnd: 0.55,
      speed: 1,
      volume: 0.85,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    }

    setProjectName('Demo Clipchamp · Filmuse')
    commit({
      clips: [c1, c2, c3],
      overlays: [],
      texts: [t1, tSub, t2, t3],
      audios: [a1, a2],
      aspect: '16:9',
      stageBgColor: '#000000',
    })
    setCurrentTime(0)
    setSelection({ track: 'text', id: t1.id })
    showToast('✨ Projeto demonstrativo carregado! Aperte Espaço para assistir.')
  }, [commit, showToast])

  // --- Export Pipeline ---
  const handleStartExport = async ({ width, height, fps, bitrate }) => {
    if (!hasContent || totalDur <= 0) return
    setIsPlaying(false)
    cancelExportRef.current = false
    setExporting(true)
    setExportResult(null)
    setExportProgressInfo({ percent: 0, frame: 0, totalFrames: Math.round(totalDur * fps), speedFactor: 0 })

    try {
      let out
      const supportsWebCodecs =
        typeof window.VideoEncoder !== 'undefined' &&
        typeof window.VideoFrame !== 'undefined'

      if (supportsWebCodecs) {
        try {
          out = await exportProjectWebCodecs({
            clips,
            overlays,
            texts,
            audios,
            totalDur,
            width,
            height,
            fps,
            bitrate,
            stageBgColor,
            cancelRef: cancelExportRef,
            onProgress: setExportProgressInfo,
          })
        } catch (wcErr) {
          if (wcErr?.message === 'cancelled') throw wcErr
          out = await exportProjectMediaRecorder({
            clips,
            overlays,
            texts,
            audios,
            totalDur,
            width,
            height,
            fps,
            bitrate,
            stageBgColor,
            cancelRef: cancelExportRef,
            onProgress: setExportProgressInfo,
          })
        }
      } else {
        out = await exportProjectMediaRecorder({
          clips,
          overlays,
          texts,
          audios,
          totalDur,
          width,
          height,
          fps,
          bitrate,
          stageBgColor,
          cancelRef: cancelExportRef,
          onProgress: setExportProgressInfo,
        })
      }

      const ext = (out.blob.type || '').includes('mp4') ? 'mp4' : 'webm'
      const url = URL.createObjectURL(out.blob)
      const safeName = (projectName || 'filmuse').trim().replace(/\s+/g, '-').toLowerCase()

      // Validate the generated file: measure real duration and confirm audio
      // is present, so the user doesn't get a silent or mis-timed export.
      const hasProjectAudio =
        audios.some((a) => !a.muted) ||
        clips.some((c) => c.kind === 'video' && !c.muted && (c.volume ?? 1) > 0) ||
        overlays.some((o) => o.kind === 'video' && !o.muted && (o.volume ?? 1) > 0)
      const validation = await validateExportBlob(out.blob, totalDur, hasProjectAudio)

      setExporting(false)
      setExportResult({
        url,
        name: `${safeName}.${ext}`,
        size: out.blob.size,
        w: width,
        h: height,
        fps,
        engine: out.engine,
        validation,
      })
    } catch (err) {
      setExporting(false)
      if (err?.message === 'cancelled') {
        showToast('Exportação cancelada')
      } else {
        showToast('Não foi possível concluir a exportação. Tente reduzir a resolução.')
      }
    }
  }

  // --- Global Studio Keyboard Shortcuts ---
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName
      const isEditingInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable
      if (isEditingInput) return

      const mod = e.ctrlKey || e.metaKey

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          if (redo()) showToast('Refeito')
        } else {
          if (undo()) showToast('Desfeito')
        }
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        if (redo()) showToast('Refeito')
        return
      }
      if (mod && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        setLeftTab('ia')
        setDrawerOpen(true)
        setTimeout(() => aiInputRef.current?.focus(), 40)
        return
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        handleDuplicateSelected()
        return
      }

      if (e.code === 'Space' || e.key.toLowerCase() === 'k') {
        e.preventDefault()
        togglePlay()
      } else if (!mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        handleSplitAtPlayhead()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection) {
          e.preventDefault()
          handleDeleteSelected()
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        seekTo(currentTime - (e.shiftKey ? 1 : 1 / 30))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        seekTo(currentTime + (e.shiftKey ? 1 : 1 / 30))
      } else if (e.key.toLowerCase() === 'j') {
        e.preventDefault()
        seekTo(currentTime - 5)
      } else if (e.key.toLowerCase() === 'l') {
        e.preventDefault()
        seekTo(currentTime + 5)
      } else if (e.key === 'Home') {
        e.preventDefault()
        seekTo(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        seekTo(totalDur)
      } else if (e.key === '=' || e.key === '+') {
        setZoom((z) => clamp(z * 1.2, 4, 260))
      } else if (e.key === '-') {
        setZoom((z) => clamp(z * 0.82, 4, 260))
      } else if (e.key === '?') {
        setShowShortcuts((v) => !v)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    undo,
    redo,
    togglePlay,
    handleSplitAtPlayhead,
    handleDeleteSelected,
    handleDuplicateSelected,
    selection,
    seekTo,
    currentTime,
    totalDur,
    showToast,
  ])

  const openAiAssistant = useCallback(() => {
    setLeftTab('ia')
    setDrawerOpen(true)
    setTimeout(() => aiInputRef.current?.focus(), 40)
  }, [])

  const handleApplyAiResult = useCallback(
    ({ nextProject, seekTime, nextSelection, summaryToast }) => {
      setIsPlaying(false)
      commit(nextProject)
      if (nextSelection !== undefined) setSelection(nextSelection)
      if (typeof seekTime === 'number' && isFinite(seekTime)) {
        setCurrentTime(Math.max(0, seekTime))
      }
      if (summaryToast) showToast(`✨ ${summaryToast}`)
    },
    [commit, showToast]
  )

  const selectedMainClip = selection?.track === 'main' ? clips.find((c) => c.id === selection.id) : null
  const selectedMainIndex = selection?.track === 'main' ? clips.findIndex((c) => c.id === selection.id) : -1

  return (
    <div className="cc-app">
      <Header
        projectName={projectName}
        setProjectName={setProjectName}
        aspect={aspect}
        onChangeAspect={(nextAsp) => commit((prev) => ({ ...prev, aspect: nextAsp }))}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => undo() && showToast('Desfeito')}
        onRedo={() => redo() && showToast('Refeito')}
        totalDur={totalDur}
        hasContent={hasContent}
        onCaptureSnapshot={() => {
          downloadCanvasSnapshot(canvasRef.current, projectName)
          showToast('📸 Frame salvo em PNG!')
        }}
        onOpenShortcuts={() => setShowShortcuts(true)}
        onNewProject={() => {
          if (!hasContent || window.confirm('Deseja limpar a timeline e iniciar um novo projeto?')) {
            setIsPlaying(false)
            resetHistory(INITIAL_PROJECT)
            setSelection(null)
            setCurrentTime(0)
            showToast('Novo projeto iniciado')
          }
        }}
        onOpenExport={() => {
          setIsPlaying(false)
          setExportResult(null)
          setShowExportModal(true)
        }}
        onLoadDemo={handleLoadDemo}
        onOpenAi={openAiAssistant}
        isAiOpen={drawerOpen && leftTab === 'ia'}
      />

      <div className="cc-workspace">
        <LeftSidebar
          activeTab={leftTab}
          setActiveTab={setLeftTab}
          drawerOpen={drawerOpen}
          setDrawerOpen={setDrawerOpen}
          mediaItems={mediaItems}
          onImportFiles={handleImportFiles}
          onAddMediaToTimeline={handleAddMediaToTimeline}
          onAddMediaAsOverlay={handleAddMediaAsOverlay}
          onRemoveMediaItem={handleRemoveMediaItem}
          onOpenRecorder={(mode) => {
            setIsPlaying(false)
            setRecorderMode(mode)
          }}
          onAddTextPreset={handleAddTextPreset}
          onAddSticker={handleAddSticker}
          onAddBuiltinSfx={handleAddBuiltinSfx}
          onAddColorBackground={handleAddColorBackground}
          selectedMainClip={selectedMainClip}
          mainClipIndex={selectedMainIndex}
          clipsCount={clips.length}
          onApplyTransition={handleApplyTransition}
          onApplyTransitionAll={handleApplyTransitionAll}
          stageBgColor={stageBgColor}
          onChangeStageBg={(col) => commit((prev) => ({ ...prev, stageBgColor: col }), 'stage-bg')}
          onEnableBlurFillAll={() => {
            commit((prev) => ({
              ...prev,
              clips: prev.clips.map((c) => ({ ...c, blurFill: true })),
            }))
            showToast('Fundo desfocado ativado em todos os clipes')
          }}
          onLoadDemo={handleLoadDemo}
          aiProps={{
            messages: aiMessages,
            setMessages: setAiMessages,
            project,
            projectName,
            currentTime,
            totalDur,
            selection,
            canUndo,
            onApplyAiResult: handleApplyAiResult,
            onUndo: () => undo() && showToast('Ação da IA desfeita'),
            onDownloadCoverSnapshot: () => {
              setIsPlaying(false)
              setCurrentTime(0.5)
              setTimeout(() => {
                downloadCanvasSnapshot(canvasRef.current, `${projectName}-capa`)
                showToast('🖼️ Imagem da capa salva em PNG!')
              }, 80)
            },
            externalInputRef: aiInputRef,
          }}
        />

        <Stage
          canvasRef={canvasRef}
          clips={clips}
          overlays={overlays}
          texts={texts}
          audios={audios}
          aspect={aspect}
          stageBgColor={stageBgColor}
          currentTime={currentTime}
          totalDur={totalDur}
          isPlaying={isPlaying}
          loopPlayback={loopPlayback}
          setLoopPlayback={setLoopPlayback}
          selection={selection}
          onSelect={setSelection}
          cropping={cropping}
          setCropping={setCropping}
          onTogglePlay={togglePlay}
          onSeek={seekTo}
          onSplitAtPlayhead={handleSplitAtPlayhead}
          onDeleteSelected={handleDeleteSelected}
          onDuplicateSelected={handleDuplicateSelected}
          onUpdateMainClip={updateMainClip}
          onUpdateOverlay={updateOverlay}
          onUpdateText={updateText}
          onImportFiles={handleImportFiles}
          onLoadDemo={handleLoadDemo}
          onOpenAi={openAiAssistant}
        />

        <RightInspector
          selection={selection}
          clips={clips}
          overlays={overlays}
          texts={texts}
          audios={audios}
          mainVideoDuration={mainVideoDuration}
          currentTime={currentTime}
          cropping={cropping}
          setCropping={setCropping}
          onUpdateMainClip={updateMainClip}
          onApplyFiltersAll={applyFiltersAll}
          onUpdateOverlay={updateOverlay}
          onUpdateText={updateText}
          onUpdateAudio={updateAudio}
          onDetachAudio={handleDetachAudio}
          onToast={showToast}
          onOpenLibrary={() => {
            setLeftTab('midia')
            setDrawerOpen(true)
          }}
          onLoadDemo={handleLoadDemo}
          inspectorOpen={inspectorOpen}
          setInspectorOpen={setInspectorOpen}
        />
      </div>

      <Timeline
        clips={clips}
        overlays={overlays}
        texts={texts}
        audios={audios}
        totalDur={totalDur}
        currentTime={currentTime}
        isPlaying={isPlaying}
        zoom={zoom}
        setZoom={setZoom}
        selection={selection}
        onSelect={setSelection}
        snapEnabled={snapEnabled}
        setSnapEnabled={setSnapEnabled}
        onSeek={seekTo}
        onSplitAtPlayhead={handleSplitAtPlayhead}
        onDuplicateSelected={handleDuplicateSelected}
        onDeleteSelected={handleDeleteSelected}
        onDetachAudio={handleDetachAudio}
        onUpdateMainClip={updateMainClip}
        onReorderMainClip={reorderMainClip}
        onUpdateOverlay={updateOverlay}
        onUpdateText={updateText}
        onUpdateAudio={updateAudio}
        onOpenTransitionForClip={handleOpenTransitionForClip}
        onDropMediaOnTrack={handleDropMediaOnTrack}
        onQuickAddText={() => handleAddTextPreset(TEXT_PRESETS[1])}
      />

      {recorderMode && (
        <RecordModal
          mode={recorderMode}
          onClose={() => setRecorderMode(null)}
          onSaveRecording={handleSaveRecording}
        />
      )}

      {showExportModal && (
        <ExportModal
          projectName={projectName}
          aspect={aspect}
          totalDur={totalDur}
          exporting={exporting}
          progressInfo={exportProgressInfo}
          exportResult={exportResult}
          onStartExport={handleStartExport}
          onCancelExport={() => { cancelExportRef.current = true }}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}

      {toast && <div className="cc-toast">{toast}</div>}
    </div>
  )
}
