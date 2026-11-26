import React, { useEffect, useRef, useState } from 'react'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Rewind,
  FastForward,
  Scissors,
  Trash2,
  Repeat,
  Maximize2,
  Crop,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Sparkles,
  Maximize,
  Minimize,
  CircleDot,
  Copy,
  Upload,
} from 'lucide-react'
import { ASPECTS } from '../constants/presets.js'
import { clipDur, overlayDur, audioDur, clamp, fmt, subscribeImageLoad } from '../utils/media.js'
import {
  drawMainClip,
  compositeTransition,
  drawOverlayClip,
  getOverlayRect,
  drawTextItem,
  measureAndDrawText,
  locateMainTrack,
} from '../utils/compositor.js'

export default function Stage({
  canvasRef,
  clips,
  overlays,
  texts,
  audios,
  aspect,
  stageBgColor,
  currentTime,
  totalDur,
  isPlaying,
  loopPlayback,
  setLoopPlayback,
  selection, // { track: 'main' | 'overlay' | 'text' | 'audio', id: string } | null
  onSelect,
  cropping,
  setCropping,
  onTogglePlay,
  onSeek,
  onSplitAtPlayhead,
  onDeleteSelected,
  onDuplicateSelected,
  onUpdateMainClip,
  onUpdateOverlay,
  onUpdateText,
  onImportFiles,
  onLoadDemo,
  onOpenAi,
}) {
  const stageContainerRef = useRef(null)
  const previewWrapRef = useRef(null)
  const [snapGuide, setSnapGuide] = useState({ x: false, y: false })
  const [inlineEditId, setInlineEditId] = useState(null)

  // Offscreen transition canvases
  const offOutRef = useRef(null)
  const offInRef = useRef(null)

  // Media pools
  const slotARef = useRef(null)
  const slotBRef = useRef(null)
  const activeSlotKeyRef = useRef('A') // which slot holds current main clip
  const slotMetaRef = useRef({ A: { clipId: null, url: '' }, B: { clipId: null, url: '' } })
  const overlayVidMapRef = useRef(new Map())
  const audioElMapRef = useRef(new Map())

  // WebAudio gain booster for >100% volume
  const audioCtxRef = useRef(null)
  const gainNodeMapRef = useRef(new WeakMap())

  // Hit-test boxes rendered on latest frame (in canvas pixel space)
  const hitBoxesRef = useRef([])
  const dragStateRef = useRef(null)

  const ensureAudioGain = (mediaEl, targetGain) => {
    if (!mediaEl) return
    const gVal = clamp(targetGain, 0, 2)
    try {
      if (isPlaying && gVal > 1.001) {
        const Ctx = window.AudioContext || window.webkitAudioContext
        if (Ctx) {
          if (!audioCtxRef.current) audioCtxRef.current = new Ctx()
          if (audioCtxRef.current.state === 'suspended') {
            audioCtxRef.current.resume().catch(() => {})
          }
          if (audioCtxRef.current.state === 'running') {
            let gainNode = gainNodeMapRef.current.get(mediaEl)
            if (!gainNode) {
              const src = audioCtxRef.current.createMediaElementSource(mediaEl)
              gainNode = audioCtxRef.current.createGain()
              src.connect(gainNode)
              gainNode.connect(audioCtxRef.current.destination)
              gainNodeMapRef.current.set(mediaEl, gainNode)
            }
            mediaEl.volume = 1
            gainNode.gain.value = gVal
            return
          }
        }
      }
      const existingGain = gainNodeMapRef.current.get(mediaEl)
      if (existingGain && audioCtxRef.current?.state === 'running') {
        mediaEl.volume = 1
        existingGain.gain.value = gVal
      } else {
        mediaEl.volume = clamp(gVal, 0, 1)
      }
    } catch {
      try { mediaEl.volume = clamp(gVal, 0, 1) } catch {}
    }
  }

  // Create hidden main video slots once
  useEffect(() => {
    const mkVid = () => {
      const v = document.createElement('video')
      v.playsInline = true
      v.preload = 'auto'
      v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none;'
      document.body.appendChild(v)
      return v
    }
    slotARef.current = mkVid()
    slotBRef.current = mkVid()

    return () => {
      slotARef.current?.remove()
      slotBRef.current?.remove()
      for (const v of overlayVidMapRef.current.values()) v.remove()
      overlayVidMapRef.current.clear()
      for (const a of audioElMapRef.current.values()) {
        a.pause()
        a.remove()
      }
      audioElMapRef.current.clear()
      try { audioCtxRef.current?.close() } catch {}
    }
  }, [])

  // Sync overlay video elements pool
  useEffect(() => {
    const map = overlayVidMapRef.current
    const validIds = new Set(overlays.filter((o) => o.kind === 'video').map((o) => o.id))
    for (const [id, el] of map.entries()) {
      if (!validIds.has(id)) {
        el.pause()
        el.remove()
        map.delete(id)
      }
    }
    for (const ov of overlays) {
      if (ov.kind === 'video' && ov.url) {
        let el = map.get(ov.id)
        if (!el) {
          el = document.createElement('video')
          el.playsInline = true
          el.preload = 'auto'
          el.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none;'
          el.addEventListener('seeked', () => drawCurrentScene())
          el.addEventListener('loadeddata', () => drawCurrentScene())
          document.body.appendChild(el)
          map.set(ov.id, el)
        }
        if (el.dataset.srcUrl !== ov.url) {
          el.src = ov.url
          el.dataset.srcUrl = ov.url
        }
      }
    }
  }, [overlays])

  // Sync audio track elements pool
  useEffect(() => {
    const map = audioElMapRef.current
    const validIds = new Set(audios.map((a) => a.id))
    for (const [id, el] of map.entries()) {
      if (!validIds.has(id)) {
        el.pause()
        el.remove()
        map.delete(id)
      }
    }
    for (const au of audios) {
      if (au.url) {
        let el = map.get(au.id)
        if (!el) {
          el = document.createElement('audio')
          el.preload = 'auto'
          map.set(au.id, el)
        }
        if (el.dataset.srcUrl !== au.url) {
          el.src = au.url
          el.dataset.srcUrl = au.url
        }
      }
    }
  }, [audios])

  // Sync playback state + seek + audio envelopes for Main, Overlays, and Audio tracks
  useEffect(() => {
    const slotA = slotARef.current
    const slotB = slotBRef.current
    if (!slotA || !slotB) return

    const loc = locateMainTrack(clips, currentTime)
    const activeClip = !loc.beyondEnd ? loc.active : null

    if (!activeClip || activeClip.kind !== 'video') {
      if (!slotA.paused) slotA.pause()
      if (!slotB.paused) slotB.pause()
    } else {
      let curKey = activeSlotKeyRef.current
      let otherKey = curKey === 'A' ? 'B' : 'A'
      const meta = slotMetaRef.current

      if (meta[curKey].clipId !== activeClip.id) {
        if (meta[otherKey].clipId === activeClip.id || meta[otherKey].url === activeClip.url) {
          curKey = otherKey
          otherKey = curKey === 'A' ? 'B' : 'A'
          activeSlotKeyRef.current = curKey
        }
      }

      const primaryVid = curKey === 'A' ? slotA : slotB
      const secondaryVid = curKey === 'A' ? slotB : slotA

      if (meta[curKey].url !== activeClip.url) {
        primaryVid.src = activeClip.url
        meta[curKey] = { clipId: activeClip.id, url: activeClip.url }
      } else {
        meta[curKey].clipId = activeClip.id
      }

      const targetMediaTime = clamp(
        activeClip.trimStart + loc.localTime * (activeClip.speed || 1),
        0,
        Math.max(0.05, (activeClip.sourceDuration || activeClip.trimEnd) - 0.02)
      )
      const drift = Math.abs(primaryVid.currentTime - targetMediaTime)
      if (drift > (isPlaying ? 0.32 : 0.03)) {
        try { primaryVid.currentTime = targetMediaTime } catch {}
      }
      primaryVid.playbackRate = clamp(activeClip.speed || 1, 0.1, 4)

      // Compute audio gain with fade-in / fade-out
      const d = clipDur(activeClip)
      let gainEnv = activeClip.muted ? 0 : (activeClip.volume ?? 1)
      if ((activeClip.audioFadeIn || 0) > 0.02 && loc.localTime < activeClip.audioFadeIn) {
        gainEnv *= clamp(loc.localTime / activeClip.audioFadeIn, 0, 1)
      }
      if ((activeClip.audioFadeOut || 0) > 0.02 && d - loc.localTime < activeClip.audioFadeOut) {
        gainEnv *= clamp((d - loc.localTime) / activeClip.audioFadeOut, 0, 1)
      }
      ensureAudioGain(primaryVid, gainEnv)

      if (isPlaying && primaryVid.paused) {
        primaryVid.play().catch(() => {})
      } else if (!isPlaying && !primaryVid.paused) {
        primaryVid.pause()
      }

      // Secondary video: either hold prevClip during transition OR preload upcoming video clip!
      secondaryVid.muted = true
      if (!secondaryVid.paused) secondaryVid.pause()

      if (loc.transition?.prevClip?.kind === 'video') {
        const pClip = loc.transition.prevClip
        if (meta[otherKey].url !== pClip.url) {
          secondaryVid.src = pClip.url
          meta[otherKey] = { clipId: pClip.id, url: pClip.url }
        }
        const pEnd = Math.max(pClip.trimStart, pClip.trimEnd - 0.04)
        if (Math.abs(secondaryVid.currentTime - pEnd) > 0.15) {
          try { secondaryVid.currentTime = pEnd } catch {}
        }
      } else {
        const nextClip = clips[loc.index + 1]
        if (nextClip && nextClip.kind === 'video' && nextClip.url) {
          if (meta[otherKey].url !== nextClip.url) {
            secondaryVid.src = nextClip.url
            meta[otherKey] = { clipId: nextClip.id, url: nextClip.url }
            secondaryVid.onloadedmetadata = () => {
              try { secondaryVid.currentTime = nextClip.trimStart || 0 } catch {}
            }
          }
        }
      }
    }

    // Sync Overlay Videos
    for (const ov of overlays) {
      if (ov.kind !== 'video') continue
      const el = overlayVidMapRef.current.get(ov.id)
      if (!el) continue
      const od = overlayDur(ov)
      const inRange = currentTime >= ov.start && currentTime < ov.start + od
      if (!inRange) {
        if (!el.paused) el.pause()
      } else {
        const local = currentTime - ov.start
        const mediaT = ov.trimStart + local * (ov.speed || 1)
        if (Math.abs(el.currentTime - mediaT) > (isPlaying ? 0.32 : 0.04)) {
          try { el.currentTime = mediaT } catch {}
        }
        el.playbackRate = clamp(ov.speed || 1, 0.1, 4)
        ensureAudioGain(el, ov.muted ? 0 : (ov.volume ?? 1))
        if (isPlaying && el.paused) el.play().catch(() => {})
        else if (!isPlaying && !el.paused) el.pause()
      }
    }

    // Sync Audio Track Items
    for (const au of audios) {
      const el = audioElMapRef.current.get(au.id)
      if (!el) continue
      const ad = audioDur(au)
      const inRange = currentTime >= au.start && currentTime < au.start + ad
      if (!inRange) {
        if (!el.paused) el.pause()
      } else {
        const local = currentTime - au.start
        const mediaT = au.trimStart + local * (au.speed || 1)
        if (Math.abs(el.currentTime - mediaT) > (isPlaying ? 0.35 : 0.08)) {
          try { el.currentTime = mediaT } catch {}
        }
        el.playbackRate = clamp(au.speed || 1, 0.25, 4)
        let g = au.muted ? 0 : (au.volume ?? 1)
        if ((au.fadeIn || 0) > 0.02 && local < au.fadeIn) g *= clamp(local / au.fadeIn, 0, 1)
        if ((au.fadeOut || 0) > 0.02 && ad - local < au.fadeOut) g *= clamp((ad - local) / au.fadeOut, 0, 1)
        ensureAudioGain(el, g)
        if (isPlaying && el.paused) el.play().catch(() => {})
        else if (!isPlaying && !el.paused) el.pause()
      }
    }
  }, [clips, overlays, audios, currentTime, isPlaying])

  // Render Canvas Frame (on any state change AND 60fps while playing or video seeking)
  const stateSnapRef = useRef({})
  stateSnapRef.current = { clips, overlays, texts, aspect, stageBgColor, currentTime, selection }

  const drawCurrentScene = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { clips: cs, overlays: ovs, texts: txts, aspect: asp, stageBgColor: bg, currentTime: t } = stateSnapRef.current
    const dims = ASPECTS[asp] || ASPECTS['16:9']
    const w = dims.w
    const h = dims.h
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }

    if (!offOutRef.current) offOutRef.current = document.createElement('canvas')
    if (!offInRef.current) offInRef.current = document.createElement('canvas')
    if (offOutRef.current.width !== w || offOutRef.current.height !== h) {
      offOutRef.current.width = w; offOutRef.current.height = h
      offInRef.current.width = w; offInRef.current.height = h
    }

    const ctx = canvas.getContext('2d')
    const loc = locateMainTrack(cs, t)
    const curKey = activeSlotKeyRef.current
    const primaryVid = curKey === 'A' ? slotARef.current : slotBRef.current
    const secondaryVid = curKey === 'A' ? slotBRef.current : slotARef.current

    if (!loc.active || loc.beyondEnd) {
      ctx.fillStyle = bg || '#000000'
      ctx.fillRect(0, 0, w, h)
    } else if (loc.transition) {
      const pClip = loc.transition.prevClip
      const outCtx = offOutRef.current.getContext('2d')
      const inCtx = offInRef.current.getContext('2d')
      drawMainClip(outCtx, w, h, pClip, pClip.kind === 'video' ? secondaryVid : null, loc.transition.prevLocalTime, bg)
      drawMainClip(inCtx, w, h, loc.active, loc.active.kind === 'video' ? primaryVid : null, loc.localTime, bg)
      compositeTransition(ctx, w, h, offOutRef.current, offInRef.current, loc.transition.type, loc.transition.progress)
    } else {
      drawMainClip(ctx, w, h, loc.active, loc.active.kind === 'video' ? primaryVid : null, loc.localTime, bg)
    }

    const boxes = []

    // Draw PiP / Overlays
    for (const ov of ovs) {
      const od = overlayDur(ov)
      if (t >= ov.start && t <= ov.start + od) {
        const ovEl = ov.kind === 'video' ? overlayVidMapRef.current.get(ov.id) : null
        const rect = drawOverlayClip(ctx, w, h, ov, ovEl, t - ov.start)
        if (rect) {
          boxes.push({ track: 'overlay', id: ov.id, ...rect, canvasW: w, canvasH: h })
        }
      }
    }

    // Draw Texts
    for (const txt of txts) {
      const td = txt.duration || 3
      if (t >= txt.start && t <= txt.start + td) {
        const rect = drawTextItem(ctx, w, h, txt, t - txt.start)
        if (rect) {
          boxes.push({ track: 'text', id: txt.id, ...rect, canvasW: w, canvasH: h })
        }
      }
    }

    hitBoxesRef.current = boxes
  }

  useEffect(() => {
    drawCurrentScene()
  }, [clips, overlays, texts, aspect, stageBgColor, currentTime, selection])

  // Re-draw when hidden videos finish seeking or images finish loading while paused
  useEffect(() => {
    const a = slotARef.current
    const b = slotBRef.current
    const hdl = () => drawCurrentScene()
    a?.addEventListener('seeked', hdl)
    a?.addEventListener('loadeddata', hdl)
    b?.addEventListener('seeked', hdl)
    b?.addEventListener('loadeddata', hdl)
    const unsubImg = subscribeImageLoad(hdl)
    return () => {
      a?.removeEventListener('seeked', hdl)
      a?.removeEventListener('loadeddata', hdl)
      b?.removeEventListener('seeked', hdl)
      b?.removeEventListener('loadeddata', hdl)
      unsubImg()
    }
  }, [])

  // Continuous render loop while playing
  useEffect(() => {
    if (!isPlaying) return
    let raf
    const loop = () => {
      drawCurrentScene()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying])

  // Interactive Canvas Click / Drag for Texts & Overlays
  const handleCanvasMouseDown = (e) => {
    if (cropping) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * canvas.width
    const py = ((e.clientY - rect.top) / rect.height) * canvas.height

    // Top-most item wins (reverse order)
    const boxes = [...hitBoxesRef.current].reverse()
    const hit = boxes.find(
      (b) =>
        px >= b.cx - b.bw / 2 - 10 &&
        px <= b.cx + b.bw / 2 + 10 &&
        py >= b.cy - b.bh / 2 - 10 &&
        py <= b.cy + b.bh / 2 + 10
    )

    if (!hit) {
      // Select active main clip if any
      const loc = locateMainTrack(clips, currentTime)
      if (loc.active && !loc.beyondEnd) {
        onSelect({ track: 'main', id: loc.active.id })
      } else {
        onSelect(null)
      }
      setInlineEditId(null)
      return
    }

    e.preventDefault()
    onSelect({ track: hit.track, id: hit.id })

    const item = hit.track === 'text'
      ? texts.find((t) => t.id === hit.id)
      : overlays.find((o) => o.id === hit.id)
    if (!item) return

    // Check if near bottom-right corner of hitbox for resize
    const isCorner =
      px >= hit.cx + hit.bw / 2 - 22 &&
      py >= hit.cy + hit.bh / 2 - 22

    dragStateRef.current = {
      mode: isCorner ? 'resize' : 'move',
      track: hit.track,
      id: hit.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      rect,
      origX: item.x ?? 0.5,
      origY: item.y ?? 0.5,
      origWidth: item.width ?? 0.3,
      origFontSize: item.fontSize ?? 44,
    }

    const onMove = (ev) => {
      const d = dragStateRef.current
      if (!d) return
      const dxNorm = (ev.clientX - d.startClientX) / d.rect.width
      const dyNorm = (ev.clientY - d.startClientY) / d.rect.height

      if (d.mode === 'move') {
        let nx = clamp(d.origX + dxNorm, 0.04, 0.96)
        let ny = clamp(d.origY + dyNorm, 0.04, 0.96)
        let snapX = false
        let snapY = false
        if (Math.abs(nx - 0.5) < 0.022) { nx = 0.5; snapX = true }
        if (Math.abs(ny - 0.5) < 0.022) { ny = 0.5; snapY = true }
        setSnapGuide({ x: snapX, y: snapY })

        if (d.track === 'text') {
          onUpdateText(d.id, { x: nx, y: ny }, `drag-txt-${d.id}`)
        } else {
          onUpdateOverlay(d.id, { x: nx, y: ny }, `drag-ov-${d.id}`)
        }
      } else {
        // Resize
        if (d.track === 'text') {
          const nextSize = Math.round(clamp(d.origFontSize * (1 + dxNorm * 2.2), 16, 130))
          onUpdateText(d.id, { fontSize: nextSize }, `resize-txt-${d.id}`)
        } else {
          const nextW = clamp(d.origWidth + dxNorm * 1.5, 0.1, 1.0)
          onUpdateOverlay(d.id, { width: nextW }, `resize-ov-${d.id}`)
        }
      }
    }

    const onUp = () => {
      dragStateRef.current = null
      setSnapGuide({ x: false, y: false })
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const handleCanvasDoubleClick = () => {
    if (selection?.track === 'text') {
      setInlineEditId(selection.id)
    }
  }

  // Crop drag for selected Main Clip
  const selectedMain = selection?.track === 'main'
    ? clips.find((c) => c.id === selection.id)
    : locateMainTrack(clips, currentTime).active

  const startCropDrag = (e, mode) => {
    e.preventDefault()
    e.stopPropagation()
    const canvas = canvasRef.current
    if (!canvas || !selectedMain) return
    const rect = canvas.getBoundingClientRect()
    const orig = {
      x: selectedMain.cropX ?? 0,
      y: selectedMain.cropY ?? 0,
      w: selectedMain.cropW ?? 1,
      h: selectedMain.cropH ?? 1,
    }
    const startX = e.clientX
    const startY = e.clientY
    const clipId = selectedMain.id

    const onMove = (ev) => {
      const ddx = (ev.clientX - startX) / rect.width
      const ddy = (ev.clientY - startY) / rect.height
      let { x, y, w, h } = orig
      if (mode === 'move') {
        x = clamp(orig.x + ddx, 0, 1 - orig.w)
        y = clamp(orig.y + ddy, 0, 1 - orig.h)
      } else {
        if (mode.includes('e')) w = clamp(orig.w + ddx, 0.08, 1 - orig.x)
        if (mode.includes('s')) h = clamp(orig.h + ddy, 0.08, 1 - orig.y)
        if (mode.includes('w')) {
          const nx = clamp(orig.x + ddx, 0, orig.x + orig.w - 0.08)
          w = orig.w + (orig.x - nx)
          x = nx
        }
        if (mode.includes('n')) {
          const ny = clamp(orig.y + ddy, 0, orig.y + orig.h - 0.08)
          h = orig.h + (orig.y - ny)
          y = ny
        }
      }
      onUpdateMainClip(clipId, { cropX: x, cropY: y, cropW: w, cropH: h, cropEnabled: true }, `crop-${clipId}`)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const toggleFullscreen = () => {
    const el = previewWrapRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {})
    } else {
      document.exitFullscreen?.().catch(() => {})
    }
  }

  const selectedTextObj = selection?.track === 'text' ? texts.find((t) => t.id === selection.id) : null
  const selectedOverlayObj = selection?.track === 'overlay' ? overlays.find((o) => o.id === selection.id) : null
  const hasAnyContent = clips.length > 0 || overlays.length > 0 || texts.length > 0 || audios.length > 0

  const aspInfo = ASPECTS[aspect] || ASPECTS['16:9']
  const ratio = aspInfo.w / aspInfo.h

  // Offscreen text measurement canvas for synchronous zero-lag selection bounding box
  const measureCtxRef = useRef(null)
  const activeSelectionBox = (() => {
    if (!selection || cropping) return null
    const w = aspInfo.w
    const h = aspInfo.h

    if (selection.track === 'text' && selectedTextObj) {
      const td = selectedTextObj.duration || 3
      if (currentTime < selectedTextObj.start || currentTime > selectedTextObj.start + td) return null
      if (!measureCtxRef.current && typeof document !== 'undefined') {
        const cv = document.createElement('canvas')
        measureCtxRef.current = cv.getContext('2d')
      }
      if (!measureCtxRef.current) return null
      const box = measureAndDrawText(measureCtxRef.current, w, h, selectedTextObj, currentTime - selectedTextObj.start, false)
      if (!box) return null
      return {
        left: `${((box.cx - box.bw / 2) / w) * 100}%`,
        top: `${((box.cy - box.bh / 2) / h) * 100}%`,
        width: `${(box.bw / w) * 100}%`,
        height: `${(box.bh / h) * 100}%`,
      }
    }

    if (selection.track === 'overlay' && selectedOverlayObj) {
      const od = overlayDur(selectedOverlayObj)
      if (currentTime < selectedOverlayObj.start || currentTime > selectedOverlayObj.start + od) return null
      const box = getOverlayRect(
        selectedOverlayObj,
        w,
        h,
        selectedOverlayObj.kind === 'video' ? overlayVidMapRef.current.get(selectedOverlayObj.id) : null
      )
      if (!box) return null
      return {
        left: `${((box.cx - box.bw / 2) / w) * 100}%`,
        top: `${((box.cy - box.bh / 2) / h) * 100}%`,
        width: `${(box.bw / w) * 100}%`,
        height: `${(box.bh / h) * 100}%`,
      }
    }

    return null
  })()

  return (
    <section className="cc-stage" ref={stageContainerRef}>
      {/* Floating Contextual Toolbar (Clipchamp style) */}
      <div className="cc-stage-topbar">
        {hasAnyContent && selection?.track === 'main' && selectedMain && (
          <div className="cc-floating-bar">
            <button
              className={`cc-float-btn ${selectedMain.fitMode === 'cover' ? 'active' : ''}`}
              onClick={() =>
                onUpdateMainClip(selectedMain.id, {
                  fitMode: selectedMain.fitMode === 'cover' ? 'contain' : 'cover',
                })
              }
              title="Alternar Ajustar à tela / Preencher quadro"
            >
              {selectedMain.fitMode === 'cover' ? <Minimize size={14} /> : <Maximize size={14} />}
              <span>{selectedMain.fitMode === 'cover' ? 'Ajustar' : 'Preencher'}</span>
            </button>

            {selectedMain.kind !== 'color' && (
              <button
                className={`cc-float-btn ${selectedMain.blurFill ? 'active' : ''}`}
                onClick={() => onUpdateMainClip(selectedMain.id, { blurFill: !selectedMain.blurFill })}
                title="Preencher bordas vazias com fundo desfocado"
              >
                <Sparkles size={14} />
                <span>Fundo desfocado</span>
              </button>
            )}

            <button
              className={`cc-float-btn ${cropping ? 'active' : ''}`}
              onClick={() => setCropping((c) => !c)}
              title="Recortar parte do quadro"
            >
              <Crop size={14} />
              <span>Recortar</span>
            </button>

            <div className="cc-bar-sep" />

            <button
              className="cc-float-icon"
              onClick={() => onUpdateMainClip(selectedMain.id, { rotation: ((selectedMain.rotation || 0) + 90) % 360 })}
              title="Girar 90°"
            >
              <RotateCw size={14} />
            </button>
            <button
              className={`cc-float-icon ${selectedMain.flipH ? 'active' : ''}`}
              onClick={() => onUpdateMainClip(selectedMain.id, { flipH: !selectedMain.flipH })}
              title="Espelhar horizontalmente"
            >
              <FlipHorizontal size={14} />
            </button>
            <button
              className={`cc-float-icon ${selectedMain.flipV ? 'active' : ''}`}
              onClick={() => onUpdateMainClip(selectedMain.id, { flipV: !selectedMain.flipV })}
              title="Espelhar verticalmente"
            >
              <FlipVertical size={14} />
            </button>

            <div className="cc-bar-sep" />

            <button className="cc-float-icon" onClick={onDuplicateSelected} title="Duplicar (Ctrl+D)">
              <Copy size={14} />
            </button>
            <button className="cc-float-icon danger" onClick={onDeleteSelected} title="Excluir (Del)">
              <Trash2 size={14} />
            </button>
          </div>
        )}

        {hasAnyContent && selection?.track === 'overlay' && selectedOverlayObj && (
          <div className="cc-floating-bar">
            <button
              className={`cc-float-btn ${(selectedOverlayObj.borderRadius || 0) >= 500 ? 'active' : ''}`}
              onClick={() =>
                onUpdateOverlay(selectedOverlayObj.id, {
                  borderRadius: (selectedOverlayObj.borderRadius || 0) >= 500 ? 16 : 999,
                })
              }
              title="Alternar máscara circular (estilo webcam)"
            >
              <CircleDot size={14} />
              <span>{(selectedOverlayObj.borderRadius || 0) >= 500 ? 'Retângulo' : 'Círculo'}</span>
            </button>

            <button
              className="cc-float-btn"
              onClick={() => onUpdateOverlay(selectedOverlayObj.id, { x: 0.8, y: 0.76, width: 0.28 })}
              title="Posicionar no canto inferior direito"
            >
              <span>Canto Dir.</span>
            </button>
            <button
              className="cc-float-btn"
              onClick={() => onUpdateOverlay(selectedOverlayObj.id, { x: 0.2, y: 0.76, width: 0.28 })}
              title="Posicionar no canto inferior esquerdo"
            >
              <span>Canto Esq.</span>
            </button>

            <div className="cc-bar-sep" />

            <button
              className={`cc-float-icon ${selectedOverlayObj.flipH ? 'active' : ''}`}
              onClick={() => onUpdateOverlay(selectedOverlayObj.id, { flipH: !selectedOverlayObj.flipH })}
              title="Espelhar"
            >
              <FlipHorizontal size={14} />
            </button>
            <button className="cc-float-icon" onClick={onDuplicateSelected} title="Duplicar">
              <Copy size={14} />
            </button>
            <button className="cc-float-icon danger" onClick={onDeleteSelected} title="Excluir">
              <Trash2 size={14} />
            </button>
          </div>
        )}

        {hasAnyContent && selection?.track === 'text' && selectedTextObj && (
          <div className="cc-floating-bar">
            <button className="cc-float-btn" onClick={() => onUpdateText(selectedTextObj.id, { x: 0.5, y: 0.14 })}>
              <span>Topo</span>
            </button>
            <button className="cc-float-btn" onClick={() => onUpdateText(selectedTextObj.id, { x: 0.5, y: 0.5 })}>
              <span>Centro</span>
            </button>
            <button className="cc-float-btn" onClick={() => onUpdateText(selectedTextObj.id, { x: 0.5, y: 0.84 })}>
              <span>Base</span>
            </button>
            <div className="cc-bar-sep" />
            <button className="cc-float-icon" onClick={onDuplicateSelected} title="Duplicar">
              <Copy size={14} />
            </button>
            <button className="cc-float-icon danger" onClick={onDeleteSelected} title="Excluir">
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Main Preview Canvas Area */}
      <div
        className="cc-preview-area"
        ref={previewWrapRef}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          if (e.dataTransfer.files?.length) {
            e.preventDefault()
            onImportFiles(e.dataTransfer.files)
          }
        }}
      >
        {!hasAnyContent ? (
          <div className="cc-empty-stage">
            <div className="cc-empty-icon-ring">
              <Upload size={28} />
            </div>
            <h2>Crie seu vídeo em segundos</h2>
            <p>
              Arraste vídeos, fotos ou músicas para cá, grave sua tela/câmera ou comece com nosso projeto demonstrativo.
            </p>
            <div className="cc-empty-actions">
              <label className="cc-btn cc-btn-export" style={{ cursor: 'pointer' }}>
                <Upload size={16} />
                <span>Importar arquivos</span>
                <input
                  type="file"
                  accept="video/*,image/*,audio/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    onImportFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
              </label>
              <button className="cc-btn cc-btn-subtle" onClick={onOpenAi}>
                <Sparkles size={16} />
                <span>Pedir ao Ajudante IA</span>
              </button>
              <button className="cc-btn cc-btn-ghost" onClick={onLoadDemo}>
                <span>Abrir projeto demo</span>
              </button>
            </div>
          </div>
        ) : (
          <div
            className="cc-canvas-frame"
            style={{
              aspectRatio: `${aspInfo.w} / ${aspInfo.h}`,
              ...(ratio >= 1
                ? { width: 'min(100%, 920px)', maxHeight: '100%' }
                : { height: 'min(100%, 54vh)', maxWidth: '100%' }),
            }}
          >
            <canvas
              ref={canvasRef}
              className="cc-stage-canvas"
              onMouseDown={handleCanvasMouseDown}
              onDoubleClick={handleCanvasDoubleClick}
            />

            {/* Magnetic Center Snap Guides */}
            {snapGuide.x && <div className="cc-snap-line vertical" />}
            {snapGuide.y && <div className="cc-snap-line horizontal" />}

            {/* Interactive Selection Bounding Box for Text / Overlay */}
            {activeSelectionBox && (
              <div className="cc-onstage-selection" style={activeSelectionBox}>
                <span className="cc-resize-knob" title="Arraste no canto para redimensionar" />
              </div>
            )}

            {/* Quick Inline Text Editor on Double Click */}
            {inlineEditId && selectedTextObj && selection?.id === inlineEditId && (
              <div className="cc-inline-text-editor">
                <textarea
                  autoFocus
                  rows={2}
                  value={selectedTextObj.text}
                  onChange={(e) => onUpdateText(selectedTextObj.id, { text: e.target.value }, `txt-${selectedTextObj.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
                      e.preventDefault()
                      setInlineEditId(null)
                    }
                  }}
                />
                <button className="cc-btn cc-btn-export cc-btn-xs" onClick={() => setInlineEditId(null)}>
                  OK
                </button>
              </div>
            )}

            {/* Interactive Crop Overlay with Rule of Thirds */}
            {cropping && selectedMain && (
              <>
                <div
                  className="cc-crop-box"
                  style={{
                    left: `${(selectedMain.cropX || 0) * 100}%`,
                    top: `${(selectedMain.cropY || 0) * 100}%`,
                    width: `${(selectedMain.cropW ?? 1) * 100}%`,
                    height: `${(selectedMain.cropH ?? 1) * 100}%`,
                  }}
                  onMouseDown={(e) => startCropDrag(e, 'move')}
                >
                  <div className="cc-thirds-grid">
                    <i /><i /><i /><i />
                  </div>
                  {['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'].map((h) => (
                    <div
                      key={h}
                      className={`cc-crop-handle ${h}`}
                      onMouseDown={(e) => startCropDrag(e, h)}
                    />
                  ))}
                </div>
                <div className="cc-crop-toolbar">
                  <button
                    className="cc-btn cc-btn-ghost cc-btn-xs"
                    onClick={() =>
                      onUpdateMainClip(selectedMain.id, {
                        cropX: 0,
                        cropY: 0,
                        cropW: 1,
                        cropH: 1,
                        cropEnabled: false,
                      })
                    }
                  >
                    Resetar
                  </button>
                  <button className="cc-btn cc-btn-export cc-btn-xs" onClick={() => setCropping(false)}>
                    Concluir recorte
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Transport Bar */}
      <div className="cc-transport">
        <div className="cc-transport-left">
          <button
            className="cc-tool-btn"
            disabled={!hasAnyContent}
            onClick={onSplitAtPlayhead}
            title="Dividir na agulha (Tecla S)"
          >
            <Scissors size={15} />
            <span>Dividir</span>
          </button>
          <button
            className="cc-tool-btn"
            disabled={!selection}
            onClick={onDeleteSelected}
            title="Excluir item selecionado (Delete)"
          >
            <Trash2 size={15} />
          </button>
        </div>

        <div className="cc-transport-center">
          <button
            className="cc-icon-btn"
            disabled={!hasAnyContent}
            onClick={() => onSeek(0)}
            title="Ir para o início (Home)"
          >
            <SkipBack size={16} />
          </button>
          <button
            className="cc-icon-btn"
            disabled={!hasAnyContent}
            onClick={() => onSeek(Math.max(0, currentTime - 5))}
            title="Voltar 5 segundos (J)"
          >
            <Rewind size={16} />
          </button>

          <button
            className="cc-play-circle"
            disabled={!hasAnyContent || cropping}
            onClick={onTogglePlay}
            title="Reproduzir / Pausar (Espaço)"
          >
            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" style={{ marginLeft: 2 }} />}
          </button>

          <button
            className="cc-icon-btn"
            disabled={!hasAnyContent}
            onClick={() => onSeek(Math.min(totalDur, currentTime + 5))}
            title="Avançar 5 segundos (L)"
          >
            <FastForward size={16} />
          </button>
          <button
            className="cc-icon-btn"
            disabled={!hasAnyContent}
            onClick={() => onSeek(totalDur)}
            title="Ir para o fim (End)"
          >
            <SkipForward size={16} />
          </button>
        </div>

        <div className="cc-transport-right">
          <div className="cc-time-readout">
            <b>{fmt(currentTime)}</b>
            <span>/</span>
            <span>{fmt(totalDur)}</span>
          </div>
          <button
            className={`cc-icon-btn ${loopPlayback ? 'active' : ''}`}
            onClick={() => setLoopPlayback((l) => !l)}
            title="Repetir reprodução (Loop)"
          >
            <Repeat size={15} />
          </button>
          <button
            className="cc-icon-btn"
            disabled={!hasAnyContent}
            onClick={toggleFullscreen}
            title="Tela cheia"
          >
            <Maximize2 size={15} />
          </button>
        </div>
      </div>
    </section>
  )
}
