import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Scissors,
  Copy,
  Trash2,
  Magnet,
  Unlink,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Type,
  Layers,
  Film,
  Music,
  VolumeX,
  Plus,
  Sparkles,
} from 'lucide-react'
import { clipDur, overlayDur, audioDur, clamp, fmtShort, fmt } from '../utils/media.js'

const HEADER_W = 132

export default function Timeline({
  clips,
  overlays,
  texts,
  audios,
  totalDur,
  currentTime,
  isPlaying,
  zoom,
  setZoom,
  selection,
  onSelect,
  snapEnabled,
  setSnapEnabled,
  onSeek,
  onSplitAtPlayhead,
  onDuplicateSelected,
  onDeleteSelected,
  onDetachAudio,
  onUpdateMainClip,
  onReorderMainClip,
  onUpdateOverlay,
  onUpdateText,
  onUpdateAudio,
  onOpenTransitionForClip,
  onDropMediaOnTrack,
  onQuickAddText,
}) {
  const scrollRef = useRef(null)
  const [dropReorderIdx, setDropReorderIdx] = useState(null)

  // Compute exact cumulative positions of main clips
  const mainLayout = useMemo(() => {
    let acc = 0
    return clips.map((c, index) => {
      const dur = clipDur(c)
      const item = { clip: c, index, start: acc, dur, end: acc + dur }
      acc += dur
      return item
    })
  }, [clips])

  // Snap candidate points (0, playhead, all main clip boundaries)
  const snapPoints = useMemo(() => {
    const pts = [0, currentTime]
    for (const m of mainLayout) {
      pts.push(m.start, m.end)
    }
    return pts
  }, [mainLayout, currentTime])

  const snapTime = (t) => {
    if (!snapEnabled) return Math.max(0, t)
    const thresholdSec = 8 / Math.max(4, zoom) // 8px magnetic snap radius
    let best = t
    let bestDist = thresholdSec
    for (const p of snapPoints) {
      const dist = Math.abs(t - p)
      if (dist < bestDist) {
        bestDist = dist
        best = p
      }
    }
    return Math.max(0, best)
  }

  const fitTimeline = () => {
    const el = scrollRef.current
    if (!el) return
    const dur = Math.max(5, totalDur)
    const avail = Math.max(260, el.clientWidth - HEADER_W - 48)
    setZoom(clamp(avail / dur, 6, 220))
    el.scrollLeft = 0
  }

  // Auto-fit when going from 0 clips to >=1 clips
  const hadContentRef = useRef(false)
  useEffect(() => {
    const hasNow = totalDur > 0
    if (hasNow && !hadContentRef.current) {
      hadContentRef.current = true
      setTimeout(fitTimeline, 60)
    } else if (!hasNow) {
      hadContentRef.current = false
    }
  }, [totalDur > 0])

  // Auto-scroll playhead while playing
  useEffect(() => {
    if (!isPlaying) return
    const el = scrollRef.current
    if (!el) return
    const playX = currentTime * zoom
    const viewLeft = el.scrollLeft
    const viewW = el.clientWidth - HEADER_W
    if (playX < viewLeft + 20 || playX > viewLeft + viewW - 60) {
      el.scrollLeft = Math.max(0, playX - viewW * 0.35)
    }
  }, [currentTime, isPlaying, zoom])

  // Wheel zoom with Ctrl/Meta or horizontal scroll
  const handleWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.15 : 0.87
      setZoom((z) => clamp(z * factor, 4, 260))
    }
  }

  // Ruler & Playhead Scrub Drag
  const startScrub = (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    const el = scrollRef.current
    if (!el) return

    const calcTime = (clientX) => {
      const rect = el.getBoundingClientRect()
      const xInLanes = clientX - rect.left + el.scrollLeft - HEADER_W
      return Math.max(0, xInLanes / zoom)
    }

    onSeek(calcTime(e.clientX))

    const onMove = (ev) => onSeek(calcTime(ev.clientX))
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Trim Main Clip (Left or Right Handle)
  const startMainTrim = (e, clip, side) => {
    e.preventDefault()
    e.stopPropagation()
    onSelect({ track: 'main', id: clip.id })
    const startX = e.clientX
    const origStart = clip.trimStart
    const origEnd = clip.trimEnd
    const speed = clip.speed || 1
    const isInfinite = clip.kind === 'image' || clip.kind === 'color'
    const maxDur = isInfinite ? 300 : (clip.sourceDuration || origEnd)

    const onMove = (ev) => {
      const dxSec = ((ev.clientX - startX) / zoom) * speed
      if (side === 'left') {
        const ns = clamp(origStart + dxSec, 0, origEnd - 0.15)
        onUpdateMainClip(clip.id, { trimStart: ns }, `trim-main-${clip.id}`)
      } else {
        const ne = clamp(origEnd + dxSec, origStart + 0.15, maxDur)
        onUpdateMainClip(clip.id, { trimEnd: ne }, `trim-main-${clip.id}`)
      }
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Reorder Main Clip by Dragging
  const startMainReorderDrag = (e, item) => {
    if (e.button !== 0) return
    onSelect({ track: 'main', id: item.clip.id })
    const startX = e.clientX
    let moved = false

    const onMove = (ev) => {
      if (Math.abs(ev.clientX - startX) > 6) moved = true
      if (!moved) return
      const el = scrollRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const t = Math.max(0, (ev.clientX - rect.left + el.scrollLeft - HEADER_W) / zoom)
      let targetIdx = clips.length
      for (const m of mainLayout) {
        if (t < m.start + m.dur / 2) {
          targetIdx = m.index
          break
        }
      }
      setDropReorderIdx(targetIdx)
    }

    const onUp = (ev) => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (moved) {
        const el = scrollRef.current
        if (el) {
          const rect = el.getBoundingClientRect()
          const t = Math.max(0, (ev.clientX - rect.left + el.scrollLeft - HEADER_W) / zoom)
          let targetIdx = clips.length - 1
          for (const m of mainLayout) {
            if (t < m.start + m.dur / 2) {
              targetIdx = m.index
              break
            }
          }
          if (targetIdx !== item.index) {
            onReorderMainClip(item.index, targetIdx)
          }
        }
      }
      setDropReorderIdx(null)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Free Track Item Move / Trim (Texts, Overlays, Audios)
  const startFreeItemDrag = (e, trackType, item, mode) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    onSelect({ track: trackType, id: item.id })

    const startX = e.clientX
    const origStart = item.start || 0
    const origDur = trackType === 'text' ? (item.duration || 3) : trackType === 'overlay' ? overlayDur(item) : audioDur(item)
    const origTrimStart = item.trimStart || 0
    const origTrimEnd = item.trimEnd || origDur
    const speed = item.speed || 1
    const isStatic = trackType === 'text' || item.kind === 'image' || item.kind === 'color'
    const maxSource = isStatic ? 300 : (item.sourceDuration || origTrimEnd)

    const applyUpdate = (patch) => {
      const key = `${mode}-${trackType}-${item.id}`
      if (trackType === 'text') onUpdateText(item.id, patch, key)
      else if (trackType === 'overlay') onUpdateOverlay(item.id, patch, key)
      else if (trackType === 'audio') onUpdateAudio(item.id, patch, key)
    }

    const onMove = (ev) => {
      const dt = (ev.clientX - startX) / zoom
      if (mode === 'move') {
        const snappedStart = snapTime(origStart + dt)
        applyUpdate({ start: snappedStart })
      } else if (mode === 'left') {
        if (trackType === 'text') {
          const maxShift = origDur - 0.3
          const shift = clamp(dt, -origStart, maxShift)
          const ns = snapTime(origStart + shift)
          const actualShift = ns - origStart
          applyUpdate({ start: ns, duration: Math.max(0.3, origDur - actualShift) })
        } else {
          const maxLeftShift = -origTrimStart / speed
          const maxRightShift = origDur - 0.2
          const shift = clamp(dt, Math.max(-origStart, isStatic ? -origStart : maxLeftShift), maxRightShift)
          const ns = snapTime(origStart + shift)
          const actualShift = ns - origStart
          if (isStatic) {
            applyUpdate({ start: ns, trimEnd: Math.max(0.2, origTrimEnd - actualShift) })
          } else {
            applyUpdate({
              start: ns,
              trimStart: clamp(origTrimStart + actualShift * speed, 0, origTrimEnd - 0.15),
            })
          }
        }
      } else if (mode === 'right') {
        if (trackType === 'text') {
          const endPos = snapTime(origStart + Math.max(0.3, origDur + dt))
          applyUpdate({ duration: Math.max(0.3, endPos - origStart) })
        } else {
          const nextOutDur = Math.max(0.2, origDur + dt)
          const snappedEnd = snapTime(origStart + nextOutDur)
          const finalOutDur = Math.max(0.2, snappedEnd - origStart)
          const nextTrimEnd = clamp(origTrimStart + finalOutDur * speed, origTrimStart + 0.15, maxSource)
          applyUpdate({ trimEnd: nextTrimEnd })
        }
      }
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Drop media from Media Bin or OS onto a specific track
  const handleTrackDrop = (e, targetTrack) => {
    e.preventDefault()
    const el = scrollRef.current
    const rect = el?.getBoundingClientRect()
    const dropTime = rect
      ? Math.max(0, (e.clientX - rect.left + el.scrollLeft - HEADER_W) / zoom)
      : currentTime

    const mediaId = e.dataTransfer.getData('application/x-filmuse-media')
    if (mediaId) {
      onDropMediaOnTrack({ mediaId, targetTrack, dropTime })
    } else if (e.dataTransfer.files?.length) {
      onDropMediaOnTrack({ files: e.dataTransfer.files, targetTrack, dropTime })
    }
  }

  const timelineSpanSec = Math.max(12, totalDur + 6)
  const laneWidthPx = Math.max(500, timelineSpanSec * zoom)
  const rulerStep = zoom < 8 ? 15 : zoom < 18 ? 10 : zoom < 40 ? 5 : zoom < 90 ? 2 : 1

  const rulerTicks = useMemo(() => {
    const arr = []
    const maxS = Math.ceil(timelineSpanSec)
    for (let s = 0; s <= maxS; s += rulerStep) arr.push(s)
    return arr
  }, [timelineSpanSec, rulerStep])

  const canDetachSelected =
    selection?.track === 'main' &&
    clips.find((c) => c.id === selection.id)?.kind === 'video'

  return (
    <footer className="cc-timeline" onWheel={handleWheel}>
      {/* Timeline Action Toolbar */}
      <div className="cc-tl-toolbar">
        <div className="cc-tl-tools-left">
          <button
            className="cc-tl-btn"
            onClick={onSplitAtPlayhead}
            disabled={totalDur <= 0}
            title="Dividir clipe na posição da agulha (S)"
          >
            <Scissors size={14} />
            <span>Dividir</span>
            <kbd>S</kbd>
          </button>

          <button
            className="cc-tl-btn"
            onClick={onDuplicateSelected}
            disabled={!selection}
            title="Duplicar selecionado (Ctrl+D)"
          >
            <Copy size={14} />
            <span className="hide-sm">Duplicar</span>
          </button>

          <button
            className="cc-tl-btn danger"
            onClick={onDeleteSelected}
            disabled={!selection}
            title="Excluir selecionado (Delete)"
          >
            <Trash2 size={14} />
            <span className="hide-sm">Excluir</span>
          </button>

          {canDetachSelected && (
            <button
              className="cc-tl-btn"
              onClick={() => onDetachAudio(selection.id)}
              title="Extrair áudio do vídeo para a faixa de áudio"
            >
              <Unlink size={14} />
              <span className="hide-md">Separar áudio</span>
            </button>
          )}

          <div className="cc-bar-sep" />

          <button
            className={`cc-tl-btn ${snapEnabled ? 'active' : ''}`}
            onClick={() => setSnapEnabled((s) => !s)}
            title="Alinhamento magnético (Snap)"
          >
            <Magnet size={14} />
            <span className="hide-md">Snap</span>
          </button>
        </div>

        <div className="cc-tl-tools-right">
          <button
            className="cc-icon-btn cc-icon-sm"
            onClick={() => setZoom((z) => clamp(z * 0.8, 4, 260))}
            title="Diminuir zoom (-)"
          >
            <ZoomOut size={15} />
          </button>

          <input
            type="range"
            className="cc-zoom-slider"
            min={4}
            max={220}
            step={1}
            value={Math.round(zoom)}
            onChange={(e) => setZoom(parseInt(e.target.value))}
            aria-label="Zoom da timeline"
          />

          <button
            className="cc-icon-btn cc-icon-sm"
            onClick={() => setZoom((z) => clamp(z * 1.25, 4, 260))}
            title="Aumentar zoom (+)"
          >
            <ZoomIn size={15} />
          </button>

          <button
            className="cc-tl-btn"
            onClick={fitTimeline}
            title="Ajustar projeto inteiro na tela"
          >
            <Maximize2 size={13} />
            <span className="hide-sm">Ajustar</span>
          </button>
        </div>
      </div>

      {/* Scrollable Multi-Track Workspace */}
      <div className="cc-tl-scroll" ref={scrollRef}>
        <div className="cc-tl-grid" style={{ width: HEADER_W + laneWidthPx }}>
          {/*Ruler Row*/}
          <div className="cc-tl-row cc-ruler-row">
            <div className="cc-track-header cc-ruler-corner">
              <span>{fmt(currentTime)}</span>
            </div>
            <div className="cc-ruler-lane" style={{ width: laneWidthPx }} onMouseDown={startScrub}>
              {rulerTicks.map((s) => (
                <React.Fragment key={s}>
                  <i className="cc-tick-major" style={{ left: s * zoom }} />
                  <span className="cc-tick-label" style={{ left: s * zoom }}>{fmtShort(s)}</span>
                  {rulerStep >= 2 && (
                    <i className="cc-tick-minor" style={{ left: (s + rulerStep / 2) * zoom }} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* TRACK 1: TEXT & STICKERS */}
          <div
            className="cc-tl-row cc-row-compact"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleTrackDrop(e, 'text')}
          >
            <div className="cc-track-header">
              <Type size={13} className="track-ico amber" />
              <span>Texto</span>
              <button
                className="cc-track-plus"
                onClick={onQuickAddText}
                title="Adicionar texto na agulha"
              >
                <Plus size={12} />
              </button>
            </div>
            <div
              className="cc-track-lane"
              style={{ width: laneWidthPx }}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) startScrub(e)
              }}
            >
              {texts.map((txt) => {
                const left = (txt.start || 0) * zoom
                const w = Math.max(18, (txt.duration || 3) * zoom)
                const isSel = selection?.track === 'text' && selection.id === txt.id
                return (
                  <div
                    key={txt.id}
                    className={`cc-clip-block cc-text-block ${isSel ? 'selected' : ''}`}
                    style={{ left, width: w }}
                    onMouseDown={(e) => startFreeItemDrag(e, 'text', txt, 'move')}
                  >
                    <div
                      className="cc-trim-handle left"
                      onMouseDown={(e) => startFreeItemDrag(e, 'text', txt, 'left')}
                    />
                    <span className="cc-block-label">
                      <Type size={11} />
                      <b>{txt.text}</b>
                    </span>
                    <div
                      className="cc-trim-handle right"
                      onMouseDown={(e) => startFreeItemDrag(e, 'text', txt, 'right')}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          {/* TRACK 2: OVERLAY / PICTURE-IN-PICTURE */}
          <div
            className="cc-tl-row cc-row-compact"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleTrackDrop(e, 'overlay')}
          >
            <div className="cc-track-header">
              <Layers size={13} className="track-ico pink" />
              <span>Camada / PiP</span>
            </div>
            <div
              className="cc-track-lane"
              style={{ width: laneWidthPx }}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) startScrub(e)
              }}
            >
              {overlays.length === 0 && clips.length > 0 && (
                <span className="cc-lane-watermark">Arraste fotos ou vídeos aqui para sobrepor (PiP)</span>
              )}
              {overlays.map((ov) => {
                const dur = overlayDur(ov)
                const left = (ov.start || 0) * zoom
                const w = Math.max(20, dur * zoom)
                const isSel = selection?.track === 'overlay' && selection.id === ov.id
                return (
                  <div
                    key={ov.id}
                    className={`cc-clip-block cc-overlay-block ${isSel ? 'selected' : ''}`}
                    style={{ left, width: w }}
                    onMouseDown={(e) => startFreeItemDrag(e, 'overlay', ov, 'move')}
                  >
                    <div
                      className="cc-trim-handle left"
                      onMouseDown={(e) => startFreeItemDrag(e, 'overlay', ov, 'left')}
                    />
                    {ov.thumb && <img src={ov.thumb} alt="" className="cc-mini-thumb" draggable={false} />}
                    <span className="cc-block-label">
                      <b>{ov.name}</b>
                    </span>
                    <div
                      className="cc-trim-handle right"
                      onMouseDown={(e) => startFreeItemDrag(e, 'overlay', ov, 'right')}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          {/* TRACK 3: MAIN MAGNETIC VIDEO TRACK */}
          <div
            className="cc-tl-row cc-row-main"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleTrackDrop(e, 'main')}
          >
            <div className="cc-track-header">
              <Film size={14} className="track-ico violet" />
              <span>Vídeo</span>
            </div>
            <div
              className="cc-track-lane cc-main-lane"
              style={{ width: laneWidthPx }}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) startScrub(e)
              }}
            >
              {clips.length === 0 && (
                <span className="cc-lane-watermark">
                  Arraste vídeos ou imagens para a faixa principal para começar
                </span>
              )}

              {mainLayout.map((m) => {
                const { clip, index, start, dur } = m
                const left = start * zoom
                const w = Math.max(14, dur * zoom)
                const isSel = selection?.track === 'main' && selection.id === clip.id
                const stripList = clip.filmstrip?.length ? clip.filmstrip : clip.thumb ? [clip.thumb] : []
                const tileCount = stripList.length ? Math.max(1, Math.min(18, Math.ceil(w / 76))) : 0
                const hasTrans = index > 0 && clip.transition?.type && clip.transition.type !== 'none'

                return (
                  <React.Fragment key={clip.id}>
                    <div
                      className={`cc-main-clip ${isSel ? 'selected' : ''}`}
                      style={{ left, width: w }}
                      onMouseDown={(e) => startMainReorderDrag(e, m)}
                    >
                      {/* Filmstrip Thumbnails */}
                      {tileCount > 0 ? (
                        <div className="cc-filmstrip">
                          {Array.from({ length: tileCount }).map((_, ti) => {
                            const src = stripList[Math.floor((ti / tileCount) * stripList.length)] || stripList[0]
                            return <img key={ti} src={src} alt="" draggable={false} />
                          })}
                        </div>
                      ) : (
                        <div className="cc-filmstrip-fallback" />
                      )}

                      {/* Visual Fade-In / Fade-Out Overlays */}
                      {(clip.fadeIn || 0) > 0.05 && (
                        <div
                          className="cc-fade-ramp left"
                          style={{ width: Math.min(w * 0.5, clip.fadeIn * zoom) }}
                        />
                      )}
                      {(clip.fadeOut || 0) > 0.05 && (
                        <div
                          className="cc-fade-ramp right"
                          style={{ width: Math.min(w * 0.5, clip.fadeOut * zoom) }}
                        />
                      )}

                      {/* Clip Label Overlay */}
                      <div className="cc-main-clip-overlay">
                        <span className="cc-clip-title">{clip.name}</span>
                        <div className="cc-clip-badges">
                          {clip.speed && clip.speed !== 1 && <em>{clip.speed}×</em>}
                          {clip.muted && <VolumeX size={11} />}
                        </div>
                      </div>

                      <div
                        className="cc-trim-handle left main"
                        onMouseDown={(e) => startMainTrim(e, clip, 'left')}
                        title="Arraste para cortar o início"
                      />
                      <div
                        className="cc-trim-handle right main"
                        onMouseDown={(e) => startMainTrim(e, clip, 'right')}
                        title="Arraste para cortar o fim"
                      />
                    </div>

                    {/* Clipchamp Transition Junction Button between Clips */}
                    {index > 0 && (
                      <button
                        className={`cc-trans-junction ${hasTrans ? 'active' : ''}`}
                        style={{ left }}
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpenTransitionForClip(clip.id)
                        }}
                        title={
                          hasTrans
                            ? `Transição: ${clip.transition.type} (${clip.transition.duration}s)`
                            : 'Adicionar transição entre clipes'
                        }
                      >
                        {hasTrans ? <Sparkles size={11} /> : <Plus size={11} />}
                      </button>
                    )}
                  </React.Fragment>
                )
              })}

              {dropReorderIdx !== null && (
                <div
                  className="cc-reorder-indicator"
                  style={{
                    left:
                      dropReorderIdx < mainLayout.length
                        ? mainLayout[dropReorderIdx].start * zoom
                        : (mainLayout[mainLayout.length - 1]?.end || 0) * zoom,
                  }}
                />
              )}
            </div>
          </div>

          {/* TRACK 4: DEDICATED AUDIO & WAVEFORM TRACK */}
          <div
            className="cc-tl-row cc-row-audio"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleTrackDrop(e, 'audio')}
          >
            <div className="cc-track-header">
              <Music size={13} className="track-ico teal" />
              <span>Áudio</span>
            </div>
            <div
              className="cc-track-lane"
              style={{ width: laneWidthPx }}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) startScrub(e)
              }}
            >
              {audios.length === 0 && clips.length > 0 && (
                <span className="cc-lane-watermark">Arraste músicas, efeitos sonoros ou grave narração</span>
              )}
              {audios.map((au) => {
                const dur = audioDur(au)
                const left = (au.start || 0) * zoom
                const w = Math.max(20, dur * zoom)
                const isSel = selection?.track === 'audio' && selection.id === au.id
                const peaks = au.peaks?.length ? au.peaks : [0.3, 0.6, 0.4, 0.8, 0.5]
                const barCount = Math.max(6, Math.min(140, Math.floor(w / 4)))

                return (
                  <div
                    key={au.id}
                    className={`cc-clip-block cc-audio-block ${isSel ? 'selected' : ''} ${au.muted ? 'muted' : ''}`}
                    style={{ left, width: w }}
                    onMouseDown={(e) => startFreeItemDrag(e, 'audio', au, 'move')}
                  >
                    <div
                      className="cc-trim-handle left"
                      onMouseDown={(e) => startFreeItemDrag(e, 'audio', au, 'left')}
                    />

                    {/* Audio Waveform Bars */}
                    <div className="cc-waveform">
                      {Array.from({ length: barCount }).map((_, bi) => {
                        const pkIdx = Math.min(peaks.length - 1, Math.floor((bi / barCount) * peaks.length))
                        const amp = clamp((peaks[pkIdx] || 0.25) * clamp(au.volume ?? 1, 0.15, 1.4), 0.08, 1)
                        return <i key={bi} style={{ height: `${Math.round(amp * 82)}%` }} />
                      })}
                    </div>

                    {(au.fadeIn || 0) > 0.05 && (
                      <div
                        className="cc-fade-ramp left"
                        style={{ width: Math.min(w * 0.5, au.fadeIn * zoom) }}
                      />
                    )}
                    {(au.fadeOut || 0) > 0.05 && (
                      <div
                        className="cc-fade-ramp right"
                        style={{ width: Math.min(w * 0.5, au.fadeOut * zoom) }}
                      />
                    )}

                    <span className="cc-audio-label">
                      {au.muted ? <VolumeX size={11} /> : <Music size={11} />}
                      <b>{au.name}</b>
                    </span>

                    <div
                      className="cc-trim-handle right"
                      onMouseDown={(e) => startFreeItemDrag(e, 'audio', au, 'right')}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          {/* Global Spanning Playhead */}
          <div
            className="cc-playhead"
            style={{ left: HEADER_W + currentTime * zoom }}
            onMouseDown={startScrub}
          >
            <div className="cc-playhead-cap" />
          </div>
        </div>
      </div>
    </footer>
  )
}
