import React, { useEffect, useRef, useState } from 'react'
import { Monitor, Camera, Mic, Circle, Square, Check, RotateCcw, X } from 'lucide-react'
import { fmt } from '../utils/media.js'

const MODE_LABELS = {
  'screen-cam': { title: 'Gravar Tela e Câmera', desc: 'A tela vai para a faixa principal e sua webcam fica editável em Picture-in-Picture.' },
  screen: { title: 'Gravar Tela', desc: 'Compartilhe uma aba, janela ou a tela cheia para gravar.' },
  webcam: { title: 'Gravar Câmera', desc: 'Grave usando sua webcam e microfone direto no navegador.' },
  voice: { title: 'Gravar Narração (Voiceover)', desc: 'Grave sua voz e adicione direto na faixa de áudio na posição atual.' },
}

export default function RecordModal({ mode, onClose, onSaveRecording }) {
  const [phase, setPhase] = useState('idle') // idle | recording | review
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [asOverlay, setAsOverlay] = useState(false)
  const [recordedResult, setRecordedResult] = useState(null)

  const screenVideoRef = useRef(null)
  const camVideoRef = useRef(null)
  const meterCanvasRef = useRef(null)

  const streamsRef = useRef([])
  const recordersRef = useRef([])
  const timerRef = useRef(null)
  const rafMeterRef = useRef(null)
  const audioCtxRef = useRef(null)
  const startTimeRef = useRef(0)

  const cleanupStreams = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (rafMeterRef.current) cancelAnimationFrame(rafMeterRef.current)
    for (const s of streamsRef.current) {
      try { s.getTracks().forEach((t) => t.stop()) } catch {}
    }
    streamsRef.current = []
    try { audioCtxRef.current?.close() } catch {}
    audioCtxRef.current = null
  }

  useEffect(() => {
    return () => cleanupStreams()
  }, [])

  const drawAudioVisualizer = (stream) => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx || !stream.getAudioTracks().length) return
      const ctx = new Ctx()
      audioCtxRef.current = ctx
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 64
      src.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)

      const loop = () => {
        const cv = meterCanvasRef.current
        if (cv) {
          const c = cv.getContext('2d')
          analyser.getByteFrequencyData(data)
          c.clearRect(0, 0, cv.width, cv.height)
          const bars = 24
          const bw = cv.width / bars
          for (let i = 0; i < bars; i++) {
            const v = (data[i] || 0) / 255
            const bh = Math.max(4, v * (cv.height - 6))
            c.fillStyle = v > 0.7 ? '#a855f7' : '#2dd4bf'
            c.fillRect(i * bw + 2, (cv.height - bh) / 2, Math.max(2, bw - 4), bh)
          }
        }
        rafMeterRef.current = requestAnimationFrame(loop)
      }
      loop()
    } catch {}
  }

  const pickMime = (isAudioOnly) => {
    const candidates = isAudioOnly
      ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
      : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    return candidates.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || ''
  }

  const startRecording = async () => {
    setError('')
    setRecordedResult(null)
    cleanupStreams()

    try {
      if (mode === 'voice') {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        streamsRef.current.push(micStream)
        drawAudioVisualizer(micStream)

        const chunks = []
        const mime = pickMime(true)
        const rec = new MediaRecorder(micStream, mime ? { mimeType: mime } : undefined)
        rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
        rec.onstop = () => {
          const dur = Math.max(0.4, (performance.now() - startTimeRef.current) / 1000)
          const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
          setRecordedResult({
            kind: 'voice',
            audioBlob: blob,
            audioUrl: URL.createObjectURL(blob),
            duration: dur,
          })
          cleanupStreams()
          setPhase('review')
        }
        recordersRef.current = [rec]
        startTimeRef.current = performance.now()
        rec.start(200)
      } else if (mode === 'webcam') {
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        })
        streamsRef.current.push(camStream)
        if (camVideoRef.current) {
          camVideoRef.current.srcObject = camStream
          camVideoRef.current.play().catch(() => {})
        }

        const chunks = []
        const mime = pickMime(false)
        const rec = new MediaRecorder(camStream, mime ? { mimeType: mime } : undefined)
        rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
        rec.onstop = () => {
          const dur = Math.max(0.5, (performance.now() - startTimeRef.current) / 1000)
          const blob = new Blob(chunks, { type: rec.mimeType || 'video/webm' })
          setRecordedResult({
            kind: 'webcam',
            videoBlob: blob,
            videoUrl: URL.createObjectURL(blob),
            duration: dur,
          })
          cleanupStreams()
          setPhase('review')
        }
        recordersRef.current = [rec]
        startTimeRef.current = performance.now()
        rec.start(200)
      } else if (mode === 'screen') {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        })
        streamsRef.current.push(screenStream)
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = screenStream
          screenVideoRef.current.play().catch(() => {})
        }

        const chunks = []
        const mime = pickMime(false)
        const rec = new MediaRecorder(screenStream, mime ? { mimeType: mime } : undefined)
        rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
        rec.onstop = () => {
          const dur = Math.max(0.5, (performance.now() - startTimeRef.current) / 1000)
          const blob = new Blob(chunks, { type: rec.mimeType || 'video/webm' })
          setRecordedResult({
            kind: 'screen',
            videoBlob: blob,
            videoUrl: URL.createObjectURL(blob),
            duration: dur,
          })
          cleanupStreams()
          setPhase('review')
        }
        screenStream.getVideoTracks()[0]?.addEventListener('ended', () => {
          if (rec.state === 'recording') rec.stop()
        })
        recordersRef.current = [rec]
        startTimeRef.current = performance.now()
        rec.start(200)
      } else if (mode === 'screen-cam') {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 640 } },
          audio: true,
        })
        streamsRef.current.push(screenStream, camStream)
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = screenStream
          screenVideoRef.current.play().catch(() => {})
        }
        if (camVideoRef.current) {
          camVideoRef.current.srcObject = camStream
          camVideoRef.current.play().catch(() => {})
        }

        const screenChunks = []
        const camChunks = []
        const mime = pickMime(false)
        const recScreen = new MediaRecorder(screenStream, mime ? { mimeType: mime } : undefined)
        const recCam = new MediaRecorder(camStream, mime ? { mimeType: mime } : undefined)

        let stoppedCount = 0
        const onBothStopped = () => {
          stoppedCount++
          if (stoppedCount < 2) return
          const dur = Math.max(0.5, (performance.now() - startTimeRef.current) / 1000)
          const sBlob = new Blob(screenChunks, { type: recScreen.mimeType || 'video/webm' })
          const cBlob = new Blob(camChunks, { type: recCam.mimeType || 'video/webm' })
          setRecordedResult({
            kind: 'screen-cam',
            videoBlob: sBlob,
            videoUrl: URL.createObjectURL(sBlob),
            camBlob: cBlob,
            camUrl: URL.createObjectURL(cBlob),
            duration: dur,
          })
          cleanupStreams()
          setPhase('review')
        }

        recScreen.ondataavailable = (e) => { if (e.data.size) screenChunks.push(e.data) }
        recCam.ondataavailable = (e) => { if (e.data.size) camChunks.push(e.data) }
        recScreen.onstop = onBothStopped
        recCam.onstop = onBothStopped
        screenStream.getVideoTracks()[0]?.addEventListener('ended', () => {
          if (recScreen.state === 'recording') recScreen.stop()
          if (recCam.state === 'recording') recCam.stop()
        })

        recordersRef.current = [recScreen, recCam]
        startTimeRef.current = performance.now()
        recScreen.start(200)
        recCam.start(200)
      }

      setElapsed(0)
      setPhase('recording')
      timerRef.current = setInterval(() => {
        setElapsed((performance.now() - startTimeRef.current) / 1000)
      }, 100)
    } catch (err) {
      cleanupStreams()
      setError('Não foi possível acessar câmera, tela ou microfone. Verifique as permissões do navegador.')
    }
  }

  const stopRecording = () => {
    for (const r of recordersRef.current) {
      try {
        if (r.state === 'recording') r.stop()
      } catch {}
    }
  }

  const info = MODE_LABELS[mode] || MODE_LABELS.screen

  return (
    <div className="cc-modal-backdrop" onClick={() => phase !== 'recording' && onClose()}>
      <div className="cc-modal cc-record-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cc-modal-top">
          <div>
            <h2>{info.title}</h2>
            <p>{info.desc}</p>
          </div>
          {phase !== 'recording' && (
            <button className="cc-icon-btn" onClick={onClose}>
              <X size={18} />
            </button>
          )}
        </div>

        {error && <div className="cc-error-box">{error}</div>}

        <div className="cc-rec-stage">
          {mode === 'voice' ? (
            <div className="cc-voice-stage">
              <div className={`cc-mic-orb ${phase === 'recording' ? 'live' : ''}`}>
                <Mic size={32} />
              </div>
              {phase === 'recording' && (
                <canvas ref={meterCanvasRef} width={280} height={64} className="cc-voice-canvas" />
              )}
              {phase === 'review' && recordedResult?.audioUrl && (
                <audio src={recordedResult.audioUrl} controls style={{ width: '90%', marginTop: 12 }} />
              )}
            </div>
          ) : (
            <div className="cc-video-rec-box">
              {phase === 'review' && recordedResult?.videoUrl ? (
                <video src={recordedResult.videoUrl} controls style={{ width: '100%', maxHeight: 280, borderRadius: 10 }} />
              ) : (
                <>
                  {(mode === 'screen' || mode === 'screen-cam') && (
                    <video
                      ref={screenVideoRef}
                      muted
                      playsInline
                      className="cc-rec-screen-vid"
                      style={{ display: phase === 'recording' ? 'block' : 'none' }}
                    />
                  )}
                  {(mode === 'webcam' || mode === 'screen-cam') && (
                    <video
                      ref={camVideoRef}
                      muted
                      playsInline
                      className={mode === 'screen-cam' ? 'cc-rec-pip-vid' : 'cc-rec-screen-vid'}
                      style={{ display: phase === 'recording' ? 'block' : 'none', transform: 'scaleX(-1)' }}
                    />
                  )}
                  {phase === 'idle' && (
                    <div className="cc-rec-placeholder">
                      {mode === 'webcam' ? <Camera size={40} /> : <Monitor size={40} />}
                      <span>Clique em <b>Iniciar gravação</b> para começar</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {phase === 'recording' && (
            <div className="cc-rec-live-badge">
              <span className="cc-rec-dot" />
              <b>GRAVANDO · {fmt(elapsed)}</b>
            </div>
          )}
        </div>

        {mode === 'webcam' && phase === 'review' && (
          <label className="cc-checkbox-row">
            <input
              type="checkbox"
              checked={asOverlay}
              onChange={(e) => setAsOverlay(e.target.checked)}
            />
            <span>Adicionar como sobreposição circular (Picture-in-Picture) sobre o vídeo</span>
          </label>
        )}

        <div className="cc-modal-footer">
          {phase === 'idle' && (
            <>
              <button className="cc-btn cc-btn-ghost" onClick={onClose}>Cancelar</button>
              <button className="cc-btn cc-btn-danger-solid" onClick={startRecording}>
                <Circle size={15} fill="currentColor" />
                <span>Iniciar gravação</span>
              </button>
            </>
          )}

          {phase === 'recording' && (
            <button className="cc-btn cc-btn-danger-solid" onClick={stopRecording}>
              <Square size={15} fill="currentColor" />
              <span>Parar gravação ({fmt(elapsed)})</span>
            </button>
          )}

          {phase === 'review' && (
            <>
              <button className="cc-btn cc-btn-ghost" onClick={() => { setPhase('idle'); setRecordedResult(null) }}>
                <RotateCcw size={15} />
                <span>Regravar</span>
              </button>
              <button
                className="cc-btn cc-btn-export"
                onClick={() => onSaveRecording({ ...recordedResult, asOverlay })}
              >
                <Check size={16} />
                <span>Adicionar ao projeto</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
