import { ArrayBufferTarget, Muxer } from 'mp4-muxer'
import { clipDur, overlayDur, audioDur, clamp, preloadImage } from './media.js'
import {
  drawMainClip,
  compositeTransition,
  drawOverlayClip,
  drawTextItem,
  locateMainTrack,
} from './compositor.js'

function makeHiddenVideo() {
  const hidden = document.createElement('video')
  hidden.muted = true
  hidden.playsInline = true
  hidden.preload = 'auto'
  hidden.crossOrigin = 'anonymous'
  hidden.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none;'
  document.body.appendChild(hidden)
  return hidden
}

function waitFor(el, event, timeoutMs = 4000) {
  return new Promise((res) => {
    const t = setTimeout(res, timeoutMs)
    el.addEventListener(event, () => { clearTimeout(t); res() }, { once: true })
  })
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function renderProjectAudioOffline({ clips, overlays, audios, totalDur, outSampleRate = 48000 }) {
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx || !window.OfflineAudioContext || totalDur <= 0.05) return null

  const decodeCtx = new Ctx()
  const decodeCache = new Map()

  async function decodeItem(fileOrBlob, key) {
    if (!fileOrBlob) return null
    if (decodeCache.has(key)) return decodeCache.get(key)
    let buf = null
    // First attempt: decode the raw file/blob metadata (works for MP4/AAC, WAV, MP3...).
    try {
      const ab = await fileOrBlob.arrayBuffer()
      buf = await decodeCtx.decodeAudioData(ab.slice(0))
    } catch {
      buf = null
    }
    // Fallback: for video files whose audio codec isn't decodable by
    // decodeAudioData (Opus/AC3/...), pull the audio track out via a
    // hidden <video> + captureStream + MediaElementSource and record it
    // into an AudioBuffer via a short real-time capture.
    if (!buf && fileOrBlob instanceof Blob) {
      try {
        buf = await captureAudioViaVideoElement(fileOrBlob, key)
      } catch {
        buf = null
      }
    }
    decodeCache.set(key, buf)
    return buf
  }

  const scheduled = []

  // 1) Main video track audio
  let acc = 0
  for (const clip of clips) {
    const d = clipDur(clip)
    if (clip.kind === 'video' && !clip.muted && (clip.volume ?? 1) > 0.001 && (clip.file || clip.url)) {
      const buf = await decodeItem(clip.file || clip.url, clip.mediaId || clip.url || clip.id)
      if (buf) {
        scheduled.push({
          buf,
          start: acc,
          trimStart: clip.trimStart || 0,
          trimEnd: clip.trimEnd || d,
          speed: clip.speed || 1,
          volume: clip.volume ?? 1,
          fadeIn: clip.audioFadeIn || 0,
          fadeOut: clip.audioFadeOut || 0,
        })
      }
    }
    acc += d
  }

  // 2) Overlay video clips audio
  for (const ov of overlays) {
    if (ov.kind === 'video' && !ov.muted && (ov.volume ?? 1) > 0.001 && (ov.file || ov.url)) {
      const buf = await decodeItem(ov.file || ov.url, ov.mediaId || ov.url || ov.id)
      if (buf) {
        scheduled.push({
          buf,
          start: ov.start || 0,
          trimStart: ov.trimStart || 0,
          trimEnd: ov.trimEnd || overlayDur(ov),
          speed: ov.speed || 1,
          volume: ov.volume ?? 1,
          fadeIn: ov.fadeIn || 0,
          fadeOut: ov.fadeOut || 0,
        })
      }
    }
  }

  // 3) Dedicated Audio Track clips
  for (const a of audios) {
    if (!a.muted && (a.volume ?? 1) > 0.001 && (a.file || a.url)) {
      const buf = await decodeItem(a.file || a.url, a.mediaId || a.url || a.id)
      if (buf) {
        scheduled.push({
          buf,
          start: a.start || 0,
          trimStart: a.trimStart || 0,
          trimEnd: a.trimEnd || audioDur(a),
          speed: a.speed || 1,
          volume: a.volume ?? 1,
          fadeIn: a.fadeIn || 0,
          fadeOut: a.fadeOut || 0,
        })
      }
    }
  }

  try { await decodeCtx.close() } catch {}
  if (!scheduled.length) return null

  try {
    const totalSamples = Math.max(1, Math.ceil(totalDur * outSampleRate))
    const offline = new OfflineAudioContext(2, totalSamples, outSampleRate)

    for (const item of scheduled) {
      const { buf, start, trimStart, trimEnd, speed, volume, fadeIn, fadeOut } = item
      const offset = clamp(trimStart, 0, Math.max(0, buf.duration - 0.01))
      const srcSpan = Math.min(trimEnd, buf.duration) - offset
      if (srcSpan <= 0.01 || start >= totalDur) continue

      const outDur = srcSpan / speed
      const src = offline.createBufferSource()
      src.buffer = buf
      src.playbackRate.value = speed

      const gain = offline.createGain()
      const vol = clamp(volume, 0, 2)
      const fi = Math.min(fadeIn || 0, outDur * 0.5)
      const fo = Math.min(fadeOut || 0, outDur * 0.5)

      if (fi > 0.02 || fo > 0.02) {
        gain.gain.setValueAtTime(fi > 0.02 ? 0.0001 : vol, Math.max(0, start))
        if (fi > 0.02) {
          gain.gain.linearRampToValueAtTime(vol, Math.max(0, start + fi))
        }
        if (fo > 0.02) {
          const fadeOutStart = Math.max(start + fi, start + outDur - fo)
          gain.gain.setValueAtTime(vol, fadeOutStart)
          gain.gain.linearRampToValueAtTime(0.0001, start + outDur)
        }
      } else {
        gain.gain.setValueAtTime(vol, Math.max(0, start))
      }

      src.connect(gain)
      gain.connect(offline.destination)
      src.start(Math.max(0, start), offset, srcSpan)
    }

    return await offline.startRendering()
  } catch {
    return null
  }
}

// Records the audio of a video/audio blob into an AudioBuffer using a hidden
// media element + MediaElementSource + MediaStreamDestination, then decodes the
// captured WAV/PCM. Used as a fallback when decodeAudioData can't handle the
// container's audio codec.
async function captureAudioViaVideoElement(blob, cacheKey) {
  const url = URL.createObjectURL(blob)
  const isVideo = (blob.type || '').startsWith('video/')
  const el = document.createElement(isVideo ? 'video' : 'audio')
  el.muted = false
  el.playsInline = true
  el.preload = 'auto'
  el.crossOrigin = 'anonymous'
  el.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none;'
  document.body.appendChild(el)
  el.src = url

  await new Promise((res) => {
    const t = setTimeout(res, 6000)
    el.addEventListener('loadeddata', () => { clearTimeout(t); res() }, { once: true })
    el.addEventListener('error', () => { clearTimeout(t); res() }, { once: true })
  })

  const Ctx = window.AudioContext || window.webkitAudioContext
  const ctx = new Ctx()
  let srcNode = null
  try {
    srcNode = ctx.createMediaElementSource(el)
  } catch {
    srcNode = null
  }
  if (!srcNode) return null

  const dest = ctx.createMediaStreamDestination()
  srcNode.connect(dest)
  const stream = dest.stream
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4']
    .find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || ''
  if (!mime) return null

  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
  const chunks = []
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
  const stopped = new Promise((res) => { recorder.onstop = res })

  try {
    el.currentTime = 0
  } catch {}
  recorder.start(200)
  try {
    await el.play().catch(() => {})
  } catch {}
  await stopped

  let audioBlob = null
  if (chunks.length) audioBlob = new Blob(chunks, { type: mime })
  try { el.pause() } catch {}
  try { el.remove() } catch {}
  try { srcNode.disconnect() } catch {}
  try { await ctx.close() } catch {}
  URL.revokeObjectURL(url)

  if (!audioBlob) return null
  const ab = await audioBlob.arrayBuffer()
  const decodeCtx = new Ctx()
  try {
    const buf = await decodeCtx.decodeAudioData(ab.slice(0))
    try { await decodeCtx.close() } catch {}
    return buf
  } catch {
    try { await decodeCtx.close() } catch {}
    return null
  }
}

export async function exportProjectWebCodecs({
  clips,
  overlays,
  texts,
  audios,
  totalDur,
  width: w,
  height: h,
  fps = 30,
  bitrate = 8,
  stageBgColor = '#000000',
  cancelRef,
  onProgress,
}) {
  const OUT_SR = 48000
  const startWall = performance.now()

  // Preload all images so synchronous canvas draws never miss
  for (const c of clips) {
    if (c.kind === 'image' && c.url) await preloadImage(c.url)
  }
  for (const o of overlays) {
    if (o.kind === 'image' && o.url) await preloadImage(o.url)
  }

  // 1) Pick supported H.264 codec
  let videoCodec = null
  for (const c of ['avc1.640028', 'avc1.64002A', 'avc1.4D4028', 'avc1.42E01E']) {
    try {
      const res = await VideoEncoder.isConfigSupported({
        codec: c,
        width: w,
        height: h,
        bitrate: Math.round(bitrate * 1_000_000),
        framerate: fps,
      })
      if (res && res.supported) { videoCodec = c; break }
    } catch {}
  }
  if (!videoCodec) throw new Error('codec_unsupported')

  // 2) Render mixed multi-track project audio
  let audioPcm = await renderProjectAudioOffline({ clips, overlays, audios, totalDur, outSampleRate: OUT_SR })
  let audioCodec = null
  if (audioPcm) {
    try {
      const res = await AudioEncoder.isConfigSupported({
        codec: 'mp4a.40.2',
        numberOfChannels: 2,
        sampleRate: OUT_SR,
        bitrate: 128000,
      })
      if (res && res.supported) audioCodec = 'mp4a.40.2'
    } catch {}
    if (!audioCodec) audioPcm = null
  }

  // 3) Create MP4 muxer
  const target = new ArrayBufferTarget()
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: w, height: h },
    ...(audioCodec ? { audio: { codec: 'aac', numberOfChannels: 2, sampleRate: OUT_SR } } : {}),
    fastStart: 'in-memory',
  })

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => console.error('VideoEncoder error:', err),
  })
  videoEncoder.configure({
    codec: videoCodec,
    width: w,
    height: h,
    bitrate: Math.round(bitrate * 1_000_000),
    framerate: fps,
  })

  // 4) Encode audio chunks
  if (audioCodec && audioPcm) {
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (err) => console.error('AudioEncoder error:', err),
    })
    audioEncoder.configure({ codec: audioCodec, numberOfChannels: 2, sampleRate: OUT_SR, bitrate: 128000 })
    const ch0 = audioPcm.getChannelData(0)
    const ch1 = audioPcm.numberOfChannels > 1 ? audioPcm.getChannelData(1) : ch0
    const CHUNK = 16384
    for (let off = 0; off < audioPcm.length; off += CHUNK) {
      if (cancelRef?.current) break
      const len = Math.min(CHUNK, audioPcm.length - off)
      const data = new Float32Array(len * 2)
      data.set(ch0.subarray(off, off + len), 0)
      data.set(ch1.subarray(off, off + len), len)
      const ad = new AudioData({
        format: 'f32-planar',
        sampleRate: OUT_SR,
        numberOfFrames: len,
        numberOfChannels: 2,
        timestamp: Math.round((off / OUT_SR) * 1e6),
        data,
      })
      audioEncoder.encode(ad)
      ad.close()
    }
    if (cancelRef?.current) {
      try { audioEncoder.close() } catch {}
      try { videoEncoder.close() } catch {}
      throw new Error('cancelled')
    }
    await audioEncoder.flush()
    audioEncoder.close()
  }

  // 5) Offscreen canvases for compositing transitions cleanly
  const outCanvas = document.createElement('canvas'); outCanvas.width = w; outCanvas.height = h
  const outCtx = outCanvas.getContext('2d')
  const prevSnapCanvas = document.createElement('canvas'); prevSnapCanvas.width = w; prevSnapCanvas.height = h
  const prevSnapCtx = prevSnapCanvas.getContext('2d')
  const currClipCanvas = document.createElement('canvas'); currClipCanvas.width = w; currClipCanvas.height = h
  const currClipCtx = currClipCanvas.getContext('2d')

  // Hidden video decoders for main track & video overlays
  const mainHidden = makeHiddenVideo()
  let mainLoadedUrl = ''
  const seekVideoEl = async (el, targetTime) => {
    if (Math.abs(el.currentTime - targetTime) < 1 / (fps * 3)) return
    let resolved = false
    const p = new Promise((r) => {
      const hdl = () => { if (!resolved) { resolved = true; r() } }
      el.addEventListener('seeked', hdl, { once: true })
    })
    try { el.currentTime = targetTime } catch { return }
    await Promise.race([p, sleep(650)])
  }

  const overlayVideos = new Map()
  for (const ov of overlays) {
    if (ov.kind === 'video' && ov.url) {
      const v = makeHiddenVideo()
      v.src = ov.url
      await waitFor(v, 'loadeddata', 4000)
      overlayVideos.set(ov.id, v)
    }
  }

  const cleanupVideos = () => {
    mainHidden.remove()
    for (const v of overlayVideos.values()) v.remove()
  }

  const totalFrames = Math.max(1, Math.round(totalDur * fps))
  let lastActiveClipId = null

  try {
    for (let f = 0; f < totalFrames; f++) {
      if (cancelRef?.current) throw new Error('cancelled')
      const t = f / fps

      // A) Render Main Video Track (+ Transitions)
      const loc = locateMainTrack(clips, t)
      if (!loc.active || loc.beyondEnd) {
        outCtx.fillStyle = stageBgColor || '#000000'
        outCtx.fillRect(0, 0, w, h)
      } else {
        const clip = loc.active
        // Snapshot outgoing frame right when transitioning to a new clip
        if (lastActiveClipId && lastActiveClipId !== clip.id) {
          prevSnapCtx.clearRect(0, 0, w, h)
          prevSnapCtx.drawImage(currClipCanvas, 0, 0, w, h)
        }
        lastActiveClipId = clip.id

        let srcEl = null
        if (clip.kind === 'video' && clip.url) {
          if (mainLoadedUrl !== clip.url) {
            mainHidden.src = clip.url
            mainLoadedUrl = clip.url
            await waitFor(mainHidden, 'loadeddata', 4000)
          }
          const safeEnd = Math.max(clip.trimStart, clip.trimEnd - 1 / fps)
          const mediaTime = Math.min(clip.trimStart + loc.localTime * (clip.speed || 1), safeEnd)
          await seekVideoEl(mainHidden, mediaTime)
          srcEl = mainHidden
        }

        drawMainClip(currClipCtx, w, h, clip, srcEl, loc.localTime, stageBgColor)

        if (loc.transition && f > 0) {
          compositeTransition(outCtx, w, h, prevSnapCanvas, currClipCanvas, loc.transition.type, loc.transition.progress)
        } else {
          outCtx.drawImage(currClipCanvas, 0, 0, w, h)
        }
      }

      // B) Render Active PiP / Overlays
      for (const ov of overlays) {
        const od = overlayDur(ov)
        if (t >= ov.start && t <= ov.start + od) {
          const ovLocal = t - ov.start
          let ovEl = null
          if (ov.kind === 'video') {
            ovEl = overlayVideos.get(ov.id)
            if (ovEl) {
              const safeEnd = Math.max(ov.trimStart, ov.trimEnd - 1 / fps)
              const mediaT = Math.min(ov.trimStart + ovLocal * (ov.speed || 1), safeEnd)
              await seekVideoEl(ovEl, mediaT)
            }
          }
          drawOverlayClip(outCtx, w, h, ov, ovEl, ovLocal)
        }
      }

      // C) Render Active Text Overlays
      for (const txt of texts) {
        const td = txt.duration || 3
        if (t >= txt.start && t <= txt.start + td) {
          drawTextItem(outCtx, w, h, txt, t - txt.start)
        }
      }

      // D) Encode Frame
      const ts = Math.round(t * 1e6)
      const frame = new VideoFrame(outCanvas, {
        timestamp: ts,
        duration: Math.round(1e6 / fps),
        keyFrame: f % (fps * 2) === 0,
      })
      videoEncoder.encode(frame, { keyFrame: f % (fps * 2) === 0 })
      frame.close()

      while (videoEncoder.encodeQueueSize > 24 && !cancelRef?.current) {
        await sleep(4)
      }

      if (f % 4 === 0 || f === totalFrames - 1) {
        const wallSec = Math.max(0.1, (performance.now() - startWall) / 1000)
        const renderedSec = (f + 1) / fps
        onProgress?.({
          percent: Math.min(99, ((f + 1) / totalFrames) * 100),
          frame: f + 1,
          totalFrames,
          speedFactor: renderedSec / wallSec,
          engine: 'WebCodecs MP4',
        })
      }
      if (f % 15 === 0) await sleep(0)
    }

    await videoEncoder.flush()
    videoEncoder.close()
    cleanupVideos()
    muxer.finalize()
    return {
      blob: new Blob([target.buffer], { type: 'video/mp4' }),
      engine: 'Renderização rápida (WebCodecs MP4)',
    }
  } catch (err) {
    cleanupVideos()
    try { videoEncoder.close() } catch {}
    throw err
  }
}

export async function exportProjectMediaRecorder({
  clips,
  overlays,
  texts,
  audios,
  totalDur,
  width: w,
  height: h,
  fps = 30,
  bitrate = 8,
  stageBgColor = '#000000',
  cancelRef,
  onProgress,
}) {
  for (const c of clips) {
    if (c.kind === 'image' && c.url) await preloadImage(c.url)
  }
  for (const o of overlays) {
    if (o.kind === 'image' && o.url) await preloadImage(o.url)
  }

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')

  // Pre-render the full audio mix (video clips + overlays + dedicated audio
  // track) offline, exactly like the WebCodecs path. This guarantees the
  // exported audio matches the preview and includes every track.
  const audioPcm = await renderProjectAudioOffline({ clips, overlays, audios, totalDur })

  const canvasStream = canvas.captureStream(fps)
  let stream = canvasStream
  let audioCtx = null
  let audioSourceNode = null
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    audioCtx = new Ctx()
    if (audioCtx.state === 'suspended') {
      try { await audioCtx.resume() } catch {}
    }
    const dest = audioCtx.createMediaStreamDestination()
    if (audioPcm) {
      // Play the full mix through a buffer source so the recorder captures it.
      audioSourceNode = audioCtx.createBufferSource()
      audioSourceNode.buffer = audioPcm
      audioSourceNode.connect(dest)
      // Also connect to the live destination so the user hears it while exporting.
      audioSourceNode.connect(audioCtx.destination)
    }
    stream = new MediaStream([...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks()])
  } catch {}

  const mime = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    .find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || ''

  const chunks = []
  let recorder
  try {
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: Math.round(bitrate * 1_000_000) } : undefined)
  } catch {
    recorder = new MediaRecorder(stream)
  }
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
  const stopped = new Promise(res => { recorder.onstop = res })
  recorder.start(200)

  if (audioSourceNode) {
    try { audioSourceNode.start(0) } catch {}
  }

  const totalFrames = Math.max(1, Math.round(totalDur * fps))
  let loadedUrl = ''
  const hidden = makeHiddenVideo()
  hidden.muted = true // audio comes from the pre-rendered mix, not the element

  // Pace rendering to real time so the recorded duration matches totalDur
  // (MediaRecorder captures wall-clock time, so unpaced rendering would
  // produce a longer file than the project).
  const startWall = performance.now()
  const targetEndMs = totalDur * 1000

  try {
    for (let f = 0; f < totalFrames; f++) {
      if (cancelRef?.current) throw new Error('cancelled')
      const t = f / fps

      // Pace: wait until this frame's scheduled wall-clock time arrives.
      const elapsed = performance.now() - startWall
      const scheduledMs = (f / fps) * 1000
      const wait = scheduledMs - elapsed
      if (wait > 0) await sleep(wait)
      if (performance.now() - startWall >= targetEndMs + 200) break

      const loc = locateMainTrack(clips, t)

      if (loc.active && !loc.beyondEnd) {
        const clip = loc.active
        let srcEl = null
        if (clip.kind === 'video' && clip.url) {
          if (loadedUrl !== clip.url) {
            hidden.src = clip.url
            loadedUrl = clip.url
            await waitFor(hidden, 'loadeddata', 3500)
          }
          const mediaT = Math.min(clip.trimStart + loc.localTime * (clip.speed || 1), clip.trimEnd)
          if (Math.abs(hidden.currentTime - mediaT) > 0.25) {
            try { hidden.currentTime = mediaT } catch {}
          }
          srcEl = hidden
        }
        drawMainClip(ctx, w, h, clip, srcEl, loc.localTime, stageBgColor)
      } else {
        ctx.fillStyle = stageBgColor || '#000000'
        ctx.fillRect(0, 0, w, h)
      }

      for (const ov of overlays) {
        const od = overlayDur(ov)
        if (t >= ov.start && t <= ov.start + od) {
          drawOverlayClip(ctx, w, h, ov, null, t - ov.start)
        }
      }
      for (const txt of texts) {
        const td = txt.duration || 3
        if (t >= txt.start && t <= txt.start + td) {
          drawTextItem(ctx, w, h, txt, t - txt.start)
        }
      }

      onProgress?.({
        percent: Math.min(99, ((f + 1) / totalFrames) * 100),
        frame: f + 1,
        totalFrames,
        speedFactor: 1,
        engine: 'Tempo real',
      })
    }

    hidden.remove()
    try { await audioCtx?.close() } catch {}
    recorder.stop()
    await stopped
    return {
      blob: new Blob(chunks, { type: recorder.mimeType || 'video/webm' }),
      engine: 'Modo compatibilidade (MediaRecorder)',
    }
  } catch (err) {
    hidden.remove()
    try { await audioCtx?.close() } catch {}
    try { recorder.stop() } catch {}
    throw err
  }
}

export function downloadCanvasSnapshot(canvas, projectName = 'filmuse') {
  if (!canvas) return
  const url = canvas.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = url
  a.download = `${(projectName || 'frame').replace(/\s+/g, '-').toLowerCase()}-frame.png`
  a.click()
}

// Validates the exported blob: reports the real duration measured from the
// container and whether an audio track is present. Used to confirm the export
// has sound and the expected length instead of guessing from the project state.
export async function validateExportBlob(blob, expectedDur, expectedHasAudio) {
  const url = URL.createObjectURL(blob)
  const v = document.createElement('video')
  v.preload = 'metadata'
  v.muted = false
  v.src = url

  const result = {
    duration: null,
    hasAudio: false,
    durationOk: false,
    audioOk: false,
    warnings: [],
  }

  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 8000)
    const settle = () => { clearTimeout(timer); resolve() }
    v.onloadedmetadata = settle
    v.onerror = settle
  })

  const dur = v.duration
  if (isFinite(dur) && dur > 0) {
    result.duration = dur
    result.durationOk = Math.abs(dur - expectedDur) < Math.max(0.15, expectedDur * 0.03)
  } else {
    result.warnings.push('Não foi possível medir a duração do arquivo gerado.')
  }

  // Detect audio presence: try playing muted to sample frames, and check
  // whether the element reports an audio track via webkitAudioDecodedByteCount
  // or by capturing a stream.
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    const ctx = new Ctx()
    const el = document.createElement('video')
    el.src = url
    el.muted = true
    await new Promise((resolve) => {
      const t = setTimeout(resolve, 4000)
      el.onloadedmetadata = () => { clearTimeout(t); resolve() }
      el.onerror = () => { clearTimeout(t); resolve() }
    })
    let audioFound = false
    // Browsers that expose audio track info
    const anyEl = el
    if (typeof anyEl.webkitAudioDecodedByteCount === 'number') {
      audioFound = anyEl.webkitAudioDecodedByteCount > 0
    } else if (anyEl.mozHasAudio !== undefined) {
      audioFound = !!anyEl.mozHasAudio
    } else if (anyEl.audioTracks && anyEl.audioTracks.length > 0) {
      audioFound = true
    }
    // Fallback: try to extract audio via a MediaStream capture
    if (!audioFound) {
      try {
        const dest = ctx.createMediaStreamDestination()
        const srcNode = ctx.createMediaElementSource(el)
        srcNode.connect(dest)
        const tracks = dest.stream.getAudioTracks()
        audioFound = tracks.length > 0
        try { srcNode.disconnect() } catch {}
      } catch {}
    }
    try { await ctx.close() } catch {}
    result.hasAudio = audioFound
  } catch {
    result.hasAudio = false
  }

  result.audioOk = expectedHasAudio ? result.hasAudio : !result.hasAudio
  if (expectedHasAudio && !result.hasAudio) {
    result.warnings.push('O arquivo exportado não contém áudio, mas o projeto possui faixas de som.')
  }

  try { v.removeAttribute('src'); v.load() } catch {}
  URL.revokeObjectURL(url)
  return result
}
