import { clipDur, overlayDur, clamp, getCachedImage } from './media.js'

export function buildCssFilter(c) {
  if (!c) return 'none'
  const b = c.brightness ?? 1
  const ct = c.contrast ?? 1
  const sat = c.saturate ?? 1
  const gray = c.grayscale ?? 0
  const sep = c.sepia ?? 0
  const bl = c.blur ?? 0
  const hue = c.hue ?? 0
  if (b === 1 && ct === 1 && sat === 1 && gray === 0 && sep === 0 && bl === 0 && hue === 0) {
    return 'none'
  }
  return `brightness(${b}) contrast(${ct}) saturate(${sat}) grayscale(${gray}) sepia(${sep}) blur(${bl}px) hue-rotate(${hue}deg)`
}

export function hexToRgba(hex, alpha = 1) {
  if (!hex) return `rgba(0,0,0,${alpha})`
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex
  const clean = hex.replace('#', '')
  const full = clean.length === 3
    ? clean.split('').map(ch => ch + ch).join('')
    : clean.padEnd(6, '0').slice(0, 6)
  const num = parseInt(full, 16)
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function easeOutBack(t) {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

function roundedRectPath(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2))
  ctx.beginPath()
  if (radius >= Math.min(w, h) / 2 - 0.5 && Math.abs(w - h) < 2) {
    ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2)
  } else if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, radius)
  } else {
    ctx.moveTo(x + radius, y)
    ctx.arcTo(x + w, y, x + w, y + h, radius)
    ctx.arcTo(x + w, y + h, x, y + h, radius)
    ctx.arcTo(x, y + h, x, y, radius)
    ctx.arcTo(x, y, x + w, y, radius)
    ctx.closePath()
  }
}

export function drawColorStyleRect(ctx, x, y, w, h, style, animShift = 0) {
  if (!style) {
    ctx.fillStyle = '#1e1b4b'
    ctx.fillRect(x, y, w, h)
    return
  }
  if (style.bg2 && style.bg2 !== style.bg) {
    const angle = ((style.angle ?? 135) + animShift * 25) * (Math.PI / 180)
    const cx = x + w / 2
    const cy = y + h / 2
    const r = Math.hypot(w, h) / 2
    const g = ctx.createLinearGradient(
      cx - Math.cos(angle) * r,
      cy - Math.sin(angle) * r,
      cx + Math.cos(angle) * r,
      cy + Math.sin(angle) * r
    )
    g.addColorStop(0, style.bg)
    g.addColorStop(1, style.bg2)
    ctx.fillStyle = g
  } else {
    ctx.fillStyle = style.bg || '#000000'
  }
  ctx.fillRect(x, y, w, h)
}

function getSourceDimensions(clip, sourceEl) {
  if (clip.kind === 'color') return { vw: 1280, vh: 720, ready: true }
  if (clip.kind === 'image') {
    const img = sourceEl || getCachedImage(clip.url)
    if (img && img.complete && img.naturalWidth > 0) {
      return { vw: img.naturalWidth, vh: img.naturalHeight, ready: true, el: img }
    }
    return { vw: clip.videoW || 1280, vh: clip.videoH || 720, ready: false, el: null }
  }
  if (sourceEl && sourceEl.readyState >= 2 && sourceEl.videoWidth > 0) {
    return { vw: sourceEl.videoWidth, vh: sourceEl.videoHeight, ready: true, el: sourceEl }
  }
  return { vw: clip.videoW || 1280, vh: clip.videoH || 720, ready: false, el: null }
}

export function drawMainClip(ctx, w, h, clip, sourceEl, localTime = 0, stageBgColor = '#000000') {
  ctx.fillStyle = stageBgColor || '#000000'
  ctx.fillRect(0, 0, w, h)
  if (!clip) return

  const dur = clipDur(clip)
  const progress = clamp(localTime / Math.max(0.01, dur), 0, 1)
  const { vw, vh, ready, el } = getSourceDimensions(clip, sourceEl)

  // 1) Optional Clipchamp-style Blur Fill background when letterboxed/pillarboxed
  if (clip.blurFill && clip.kind !== 'color' && ready && el) {
    ctx.save()
    try {
      ctx.filter = `blur(${Math.round((h / 720) * 26)}px) brightness(0.55) saturate(1.25)`
    } catch {}
    const coverScale = Math.max(w / vw, h / vh) * 1.15
    const bw = vw * coverScale
    const bh = vh * coverScale
    ctx.drawImage(el, (w - bw) / 2, (h - bh) / 2, bw, bh)
    ctx.restore()
  }

  // 2) Compute Ken Burns motion multiplier
  let motionScale = 1
  let motionX = 0
  let motionY = 0
  if (clip.motion === 'zoom-in') {
    motionScale = 1 + 0.16 * progress
  } else if (clip.motion === 'zoom-out') {
    motionScale = 1.16 - 0.16 * progress
  } else if (clip.motion === 'pan-right') {
    motionScale = 1.14
    motionX = (-0.05 + 0.1 * progress) * w
  } else if (clip.motion === 'pan-left') {
    motionScale = 1.14
    motionX = (0.05 - 0.1 * progress) * w
  }

  // 3) Draw foreground visual
  ctx.save()
  ctx.globalAlpha = clamp(clip.opacity ?? 1, 0, 1)
  const filterStr = buildCssFilter(clip)
  if (filterStr !== 'none') {
    try { ctx.filter = filterStr } catch {}
  }

  const rot = ((clip.rotation || 0) * Math.PI) / 180
  const swap = Math.abs((clip.rotation || 0) % 180) === 90
  const cx = clip.cropEnabled ? (clip.cropX || 0) : 0
  const cy = clip.cropEnabled ? (clip.cropY || 0) : 0
  const cw = clip.cropEnabled ? (clip.cropW || 1) : 1
  const ch = clip.cropEnabled ? (clip.cropH || 1) : 1
  const sx = cx * vw
  const sy = cy * vh
  const sw = Math.max(2, cw * vw)
  const sh = Math.max(2, ch * vh)
  const srcW = swap ? sh : sw
  const srcH = swap ? sw : sh

  const baseFit = clip.fitMode === 'cover'
    ? Math.max(w / srcW, h / srcH)
    : Math.min(w / srcW, h / srcH)
  const totalScale = (clip.scale || 1) * motionScale
  const drawW = (swap ? sh : sw) * baseFit * totalScale
  const drawH = (swap ? sw : sh) * baseFit * totalScale
  // Unswapped dimensions in local rotated frame:
  const localW = sw * baseFit * totalScale
  const localH = sh * baseFit * totalScale

  const offsetX = (clip.posX || 0) * (w * 0.5) + motionX
  const offsetY = (clip.posY || 0) * (h * 0.5) + motionY

  ctx.translate(w / 2 + offsetX, h / 2 + offsetY)
  if (rot) ctx.rotate(rot)
  if (clip.flipH || clip.flipV) {
    ctx.scale(clip.flipH ? -1 : 1, clip.flipV ? -1 : 1)
  }

  const radius = (clip.borderRadius || 0) * (h / 720)
  if (radius > 0.5) {
    roundedRectPath(ctx, -localW / 2, -localH / 2, localW, localH, radius)
    ctx.clip()
  }

  if (clip.kind === 'color') {
    drawColorStyleRect(ctx, -localW / 2, -localH / 2, localW, localH, clip.colorStyle, progress)
  } else if (ready && el) {
    ctx.drawImage(el, sx, sy, sw, sh, -localW / 2, -localH / 2, localW, localH)
  }
  ctx.restore()

  // 4) Vignette effect
  if ((clip.vignette || 0) > 0.01) {
    ctx.save()
    const maxR = Math.hypot(w, h) * 0.58
    const minR = Math.min(w, h) * 0.24
    const grad = ctx.createRadialGradient(w / 2, h / 2, minR, w / 2, h / 2, maxR)
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(1, `rgba(0,0,0,${clamp(clip.vignette * 0.85, 0, 0.9)})`)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
  }

  // 5) Visual Fade In / Fade Out
  let fadeBlackAlpha = 0
  if ((clip.fadeIn || 0) > 0.02 && localTime < clip.fadeIn) {
    fadeBlackAlpha = Math.max(fadeBlackAlpha, 1 - localTime / clip.fadeIn)
  }
  if ((clip.fadeOut || 0) > 0.02 && dur - localTime < clip.fadeOut) {
    fadeBlackAlpha = Math.max(fadeBlackAlpha, 1 - (dur - localTime) / clip.fadeOut)
  }
  if (fadeBlackAlpha > 0.005) {
    ctx.save()
    ctx.fillStyle = `rgba(0,0,0,${clamp(fadeBlackAlpha, 0, 1)})`
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
  }

  // Legacy per-clip text fallback if present
  if (clip.textEnabled && clip.textContent) {
    drawTextItem(ctx, w, h, {
      text: clip.textContent,
      fontSize: clip.textSize || 42,
      fontFamily: 'Inter',
      fontWeight: 800,
      color: clip.textColor || '#ffffff',
      bgEnabled: true,
      bgColor: clip.textBg || '#000000',
      bgOpacity: 0.6,
      bgPadding: 14,
      bgRadius: 12,
      x: 0.5,
      y: clip.textPos === 'top' ? 0.12 : clip.textPos === 'center' ? 0.5 : 0.86,
      duration: dur,
    }, localTime)
  }
}

export function compositeTransition(ctx, w, h, outCanvas, inCanvas, type, rawProgress) {
  const p = clamp(rawProgress, 0, 1)
  const ease = easeInOutCubic(p)

  ctx.clearRect(0, 0, w, h)

  if (!outCanvas || type === 'none') {
    ctx.drawImage(inCanvas, 0, 0, w, h)
    return
  }

  if (type === 'crossfade') {
    ctx.drawImage(outCanvas, 0, 0, w, h)
    ctx.save()
    ctx.globalAlpha = ease
    ctx.drawImage(inCanvas, 0, 0, w, h)
    ctx.restore()
  } else if (type === 'fade-black' || type === 'fade-white') {
    const fill = type === 'fade-white' ? '#ffffff' : '#000000'
    if (p < 0.5) {
      const sub = easeInOutCubic(p * 2)
      ctx.drawImage(outCanvas, 0, 0, w, h)
      ctx.save()
      ctx.globalAlpha = sub
      ctx.fillStyle = fill
      ctx.fillRect(0, 0, w, h)
      ctx.restore()
    } else {
      const sub = easeInOutCubic((p - 0.5) * 2)
      ctx.fillStyle = fill
      ctx.fillRect(0, 0, w, h)
      ctx.save()
      ctx.globalAlpha = sub
      ctx.drawImage(inCanvas, 0, 0, w, h)
      ctx.restore()
    }
  } else if (type === 'slide-left') {
    const offset = Math.round(ease * w)
    ctx.drawImage(outCanvas, -offset, 0, w, h)
    ctx.drawImage(inCanvas, w - offset, 0, w, h)
  } else if (type === 'slide-right') {
    const offset = Math.round(ease * w)
    ctx.drawImage(outCanvas, offset, 0, w, h)
    ctx.drawImage(inCanvas, -w + offset, 0, w, h)
  } else if (type === 'zoom') {
    ctx.save()
    const sOut = 1 + 0.35 * ease
    ctx.translate(w / 2, h / 2)
    ctx.scale(sOut, sOut)
    ctx.drawImage(outCanvas, -w / 2, -h / 2, w, h)
    ctx.restore()

    ctx.save()
    ctx.globalAlpha = ease
    const sIn = 0.86 + 0.14 * ease
    ctx.translate(w / 2, h / 2)
    ctx.scale(sIn, sIn)
    ctx.drawImage(inCanvas, -w / 2, -h / 2, w, h)
    ctx.restore()
  } else if (type === 'wipe') {
    ctx.drawImage(outCanvas, 0, 0, w, h)
    const wipeX = ease * w
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, wipeX, h)
    ctx.clip()
    ctx.drawImage(inCanvas, 0, 0, w, h)
    ctx.restore()
  } else {
    ctx.drawImage(inCanvas, 0, 0, w, h)
  }
}

export function getOverlayRect(ov, w, h, sourceEl) {
  const { vw, vh } = getSourceDimensions(ov, sourceEl)
  const isCircle = (ov.borderRadius || 0) >= 500
  const boxW = clamp(ov.width || 0.3, 0.08, 1.2) * w
  const aspect = isCircle ? 1 : (vw / Math.max(1, vh))
  const boxH = boxW / Math.max(0.2, aspect)
  const cx = (ov.x ?? 0.78) * w
  const cy = (ov.y ?? 0.75) * h
  return { cx, cy, bw: boxW, bh: boxH, vw, vh }
}

export function drawOverlayClip(ctx, w, h, ov, sourceEl, localTime = 0) {
  if (!ov) return null
  const dur = overlayDur(ov)
  const { vw, vh, ready, el } = getSourceDimensions(ov, sourceEl)
  const isCircle = (ov.borderRadius || 0) >= 500
  const bw = clamp(ov.width || 0.3, 0.08, 1.2) * w
  const aspect = isCircle ? 1 : (vw / Math.max(1, vh))
  const bh = bw / Math.max(0.2, aspect)
  const cx = (ov.x ?? 0.78) * w
  const cy = (ov.y ?? 0.75) * h

  let fadeAlpha = 1
  if ((ov.fadeIn || 0) > 0.02 && localTime < ov.fadeIn) {
    fadeAlpha *= clamp(localTime / ov.fadeIn, 0, 1)
  }
  if ((ov.fadeOut || 0) > 0.02 && dur - localTime < ov.fadeOut) {
    fadeAlpha *= clamp((dur - localTime) / ov.fadeOut, 0, 1)
  }

  const alpha = clamp((ov.opacity ?? 1) * fadeAlpha, 0, 1)
  if (alpha <= 0.005) return { cx, cy, bw, bh }

  const scaleFactor = h / 720
  const radius = isCircle ? Math.min(bw, bh) / 2 : (ov.borderRadius ?? 16) * scaleFactor

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(cx, cy)
  if (ov.rotation) ctx.rotate((ov.rotation * Math.PI) / 180)

  // Optional soft shadow
  if (ov.shadow !== false) {
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)'
    ctx.shadowBlur = 24 * scaleFactor
    ctx.shadowOffsetY = 8 * scaleFactor
    roundedRectPath(ctx, -bw / 2, -bh / 2, bw, bh, radius)
    ctx.fillStyle = '#000'
    ctx.fill()
    ctx.restore()
  }

  // Clipped media
  ctx.save()
  roundedRectPath(ctx, -bw / 2, -bh / 2, bw, bh, radius)
  ctx.clip()

  if (ov.flipH || ov.flipV) {
    ctx.scale(ov.flipH ? -1 : 1, ov.flipV ? -1 : 1)
  }
  const filterStr = buildCssFilter(ov)
  if (filterStr !== 'none') {
    try { ctx.filter = filterStr } catch {}
  }

  if (ov.kind === 'color') {
    drawColorStyleRect(ctx, -bw / 2, -bh / 2, bw, bh, ov.colorStyle, localTime / Math.max(1, dur))
  } else if (ready && el) {
    // Cover-fit inside PiP frame (especially important for circular webcam)
    const cover = Math.max(bw / vw, bh / vh)
    const dw = vw * cover
    const dh = vh * cover
    ctx.drawImage(el, -dw / 2, -dh / 2, dw, dh)
  } else {
    ctx.fillStyle = '#111827'
    ctx.fillRect(-bw / 2, -bh / 2, bw, bh)
  }
  ctx.restore()

  // Optional crisp frame border
  if ((ov.borderWidth ?? 2) > 0) {
    ctx.lineWidth = (ov.borderWidth ?? 2) * scaleFactor
    ctx.strokeStyle = ov.borderColor || '#ffffff'
    roundedRectPath(ctx, -bw / 2, -bh / 2, bw, bh, radius)
    ctx.stroke()
  }

  ctx.restore()
  return { cx, cy, bw, bh }
}

export function measureAndDrawText(ctx, w, h, item, localTime = 0, draw = true) {
  if (!item || !item.text) return null
  const scaleFactor = h / 720
  const dur = Math.max(0.2, item.duration || 3)
  const rawText = item.uppercase ? item.text.toUpperCase() : item.text

  // Typewriter visible text calculation
  let displayStr = rawText
  let animAlpha = 1
  let animScale = 1
  let animOffsetY = 0
  const enterDur = Math.min(0.42, dur * 0.3)
  const exitDur = Math.min(0.3, dur * 0.25)

  if (item.animation === 'fade') {
    if (localTime < enterDur) animAlpha = clamp(localTime / enterDur, 0, 1)
    else if (dur - localTime < exitDur) animAlpha = clamp((dur - localTime) / exitDur, 0, 1)
  } else if (item.animation === 'pop') {
    if (localTime < enterDur) {
      const p = clamp(localTime / enterDur, 0, 1)
      animScale = Math.max(0.2, easeOutBack(p))
      animAlpha = clamp(p * 2, 0, 1)
    } else if (dur - localTime < exitDur) {
      const p = clamp((dur - localTime) / exitDur, 0, 1)
      animScale = 0.85 + 0.15 * p
      animAlpha = p
    }
  } else if (item.animation === 'slide-up') {
    if (localTime < enterDur) {
      const p = easeInOutCubic(clamp(localTime / enterDur, 0, 1))
      animOffsetY = (1 - p) * 34 * scaleFactor
      animAlpha = p
    } else if (dur - localTime < exitDur) {
      const p = clamp((dur - localTime) / exitDur, 0, 1)
      animAlpha = p
    }
  } else if (item.animation === 'typewriter') {
    const typeWindow = Math.min(1.4, dur * 0.65)
    const count = localTime >= typeWindow
      ? rawText.length
      : Math.max(1, Math.floor((localTime / Math.max(0.05, typeWindow)) * rawText.length))
    displayStr = rawText.slice(0, count)
    if (dur - localTime < exitDur) animAlpha = clamp((dur - localTime) / exitDur, 0, 1)
  } else if (item.animation === 'glow') {
    if (localTime < enterDur) animAlpha = clamp(localTime / enterDur, 0, 1)
    else if (dur - localTime < exitDur) animAlpha = clamp((dur - localTime) / exitDur, 0, 1)
  }

  const fontSize = Math.max(12, (item.fontSize || 44) * scaleFactor)
  const weight = item.fontWeight || 800
  const style = item.italic ? 'italic ' : ''
  const family = item.fontFamily || 'Inter'
  const fontSpec = `${style}${weight} ${fontSize}px ${family}, Inter, sans-serif`

  ctx.save()
  ctx.font = fontSpec
  const lines = displayStr.split('\n')
  const fullLines = rawText.split('\n') // stable box dimensions even during typewriter
  const lineHeight = fontSize * 1.22

  let maxLineW = 20
  for (const ln of fullLines) {
    const m = ctx.measureText(ln || ' ')
    if (m.width > maxLineW) maxLineW = m.width
  }

  const padX = (item.bgEnabled ? (item.bgPadding ?? 16) * 1.25 : 10) * scaleFactor
  const padY = (item.bgEnabled ? (item.bgPadding ?? 16) * 0.72 : 6) * scaleFactor
  const boxW = Math.min(w * 0.94, maxLineW + padX * 2)
  const boxH = fullLines.length * lineHeight + padY * 2

  const cx = (item.x ?? 0.5) * w
  const cy = (item.y ?? 0.8) * h

  if (draw) {
    const finalAlpha = clamp((item.opacity ?? 1) * animAlpha, 0, 1)
    if (finalAlpha > 0.005) {
      ctx.globalAlpha = finalAlpha
      ctx.translate(cx, cy + animOffsetY)
      if (animScale !== 1) ctx.scale(animScale, animScale)

      // Background pill
      if (item.bgEnabled && (item.bgOpacity ?? 0.75) > 0.01) {
        ctx.save()
        if (item.shadow) {
          ctx.shadowColor = 'rgba(0,0,0,0.45)'
          ctx.shadowBlur = 18 * scaleFactor
          ctx.shadowOffsetY = 5 * scaleFactor
        }
        ctx.fillStyle = hexToRgba(item.bgColor || '#000000', item.bgOpacity ?? 0.75)
        const rad = (item.bgRadius ?? 12) * scaleFactor
        roundedRectPath(ctx, -boxW / 2, -boxH / 2, boxW, boxH, rad)
        ctx.fill()
        ctx.restore()
      }

      // Text lines
      const align = item.align || 'center'
      ctx.textAlign = align
      ctx.textBaseline = 'middle'
      const textAnchorX = align === 'left' ? -boxW / 2 + padX : align === 'right' ? boxW / 2 - padX : 0
      const startY = -((lines.length - 1) * lineHeight) / 2

      if (item.animation === 'glow') {
        ctx.shadowColor = item.strokeColor && item.strokeColor !== '#000000' ? item.strokeColor : item.color || '#d946ef'
        ctx.shadowBlur = (22 + 8 * Math.sin(localTime * 5)) * scaleFactor
      } else if (item.shadow && !item.bgEnabled) {
        ctx.shadowColor = 'rgba(0,0,0,0.75)'
        ctx.shadowBlur = 12 * scaleFactor
        ctx.shadowOffsetY = 3 * scaleFactor
      }

      for (let i = 0; i < lines.length; i++) {
        const ly = startY + i * lineHeight
        if ((item.strokeWidth || 0) > 0) {
          ctx.lineJoin = 'round'
          ctx.miterLimit = 2
          ctx.lineWidth = item.strokeWidth * scaleFactor * 1.6
          ctx.strokeStyle = item.strokeColor || '#000000'
          ctx.strokeText(lines[i], textAnchorX, ly, w * 0.92)
        }
        ctx.fillStyle = item.color || '#ffffff'
        ctx.fillText(lines[i], textAnchorX, ly, w * 0.92)
      }
    }
  }

  ctx.restore()
  return { cx, cy, bw: boxW, bh: boxH }
}

export function drawTextItem(ctx, w, h, item, localTime = 0) {
  return measureAndDrawText(ctx, w, h, item, localTime, true)
}

// Helper to locate active main clip + any incoming transition at global projectTime
export function locateMainTrack(clips, projectTime) {
  if (!clips.length) return { active: null, prev: null, transition: null }
  let acc = 0
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i]
    const d = clipDur(c)
    const isLast = i === clips.length - 1
    if (projectTime < acc + d || isLast) {
      const localTime = clamp(projectTime - acc, 0, d)
      const prevClip = i > 0 ? clips[i - 1] : null
      const tr = c.transition && c.transition.type && c.transition.type !== 'none' ? c.transition : null
      let transitionInfo = null
      if (prevClip && tr) {
        const maxTrDur = Math.min(tr.duration || 0.6, d * 0.75, clipDur(prevClip) * 0.75)
        if (maxTrDur > 0.05 && localTime < maxTrDur) {
          transitionInfo = {
            type: tr.type,
            duration: maxTrDur,
            progress: clamp(localTime / maxTrDur, 0, 1),
            prevClip,
            prevLocalTime: clipDur(prevClip),
          }
        }
      }
      return {
        active: c,
        index: i,
        clipStart: acc,
        localTime,
        beyondEnd: projectTime > acc + d + 0.02,
        transition: transitionInfo,
      }
    }
    acc += d
  }
  return { active: null, prev: null, transition: null }
}
