import React, { useMemo, useState } from 'react'
import { Download, X, CheckCircle2, AlertTriangle, Sparkles, Film } from 'lucide-react'
import { ASPECTS, EXPORT_RESOLUTIONS } from '../constants/presets.js'
import { fmt, fmtSize } from '../utils/media.js'

export default function ExportModal({
  projectName,
  aspect,
  totalDur,
  exporting,
  progressInfo,
  exportResult,
  onStartExport,
  onCancelExport,
  onClose,
}) {
  const [resKey, setResKey] = useState('720p')
  const [fps, setFps] = useState(30)
  const [bitrate, setBitrate] = useState(6)

  const dims = useMemo(() => {
    const base = ASPECTS[aspect] || ASPECTS['16:9']
    const scale = resKey === '1080p' ? (base.hdW / base.w) : resKey === '480p' ? 0.6667 : 1
    const even = (n) => Math.max(2, Math.round(n / 2) * 2)
    return {
      w: even(base.w * scale),
      h: even(base.h * scale),
    }
  }, [aspect, resKey])

  const estMB = useMemo(() => ((bitrate + 0.13) * totalDur) / 8, [bitrate, totalDur])

  const handleSelectRes = (key) => {
    setResKey(key)
    setBitrate(EXPORT_RESOLUTIONS[key]?.defaultBr || 6)
  }

  return (
    <div className="cc-modal-backdrop" onClick={() => !exporting && onClose()}>
      <div className="cc-modal cc-export-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cc-modal-top">
          <div>
            <h2>
              {exportResult
                ? 'Seu vídeo está pronto!'
                : exporting
                ? 'Renderizando seu vídeo...'
                : 'Exportar vídeo'}
            </h2>
            <p>
              {exportResult
                ? `${exportResult.w}×${exportResult.h} · ${exportResult.fps} fps · ${exportResult.engine}`
                : exporting
                ? 'Processando quadros e mixando faixas de áudio no navegador.'
                : `Duração total: ${fmt(totalDur)} · Proporção ${aspect}`}
            </p>
          </div>
          {!exporting && (
            <button className="cc-icon-btn" onClick={onClose}>
              <X size={18} />
            </button>
          )}
        </div>

        {/* Configuration Step */}
        {!exporting && !exportResult && (
          <div className="cc-export-config">
            <h3 className="cc-sec-title" style={{ marginTop: 0 }}>Qualidade do vídeo</h3>
            <div className="cc-res-cards">
              {Object.entries(EXPORT_RESOLUTIONS).map(([key, item]) => (
                <button
                  key={key}
                  className={`cc-res-card ${resKey === key ? 'active' : ''}`}
                  onClick={() => handleSelectRes(key)}
                >
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.desc}</span>
                  </div>
                  {key === '1080p' && <em className="cc-hd-tag">HD+</em>}
                </button>
              ))}
            </div>

            <div className="cc-row" style={{ marginTop: 14, alignItems: 'flex-end' }}>
              <div className="cc-field" style={{ marginBottom: 0 }}>
                <label>Taxa de quadros (FPS)</label>
                <div className="cc-seg">
                  {[24, 30, 60].map((f) => (
                    <button key={f} className={fps === f ? 'active' : ''} onClick={() => setFps(f)}>
                      {f} fps
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="cc-field" style={{ marginTop: 14 }}>
              <label>
                <span>Taxa de bits / Compressão</span>
                <output>{bitrate} Mbps</output>
              </label>
              <input
                type="range"
                min={1}
                max={16}
                step={0.5}
                value={bitrate}
                onChange={(e) => setBitrate(parseFloat(e.target.value))}
              />
            </div>

            <div className="cc-export-summary">
              <div>
                <Film size={16} />
                <span>
                  Saída: <b>{dims.w}×{dims.h}</b> ({fps} fps)
                </span>
              </div>
              <span>
                Estimado: <b>~{fmtSize(estMB)}</b>
              </span>
            </div>
          </div>
        )}

        {/* Rendering Step */}
        {exporting && (
          <div className="cc-export-progress-box">
            <div className="cc-big-pct">{Math.round(progressInfo?.percent || 0)}%</div>
            <div className="cc-progress-bar">
              <i style={{ width: `${progressInfo?.percent || 0}%` }} />
            </div>
            <div className="cc-progress-meta">
              <span>
                Quadro {progressInfo?.frame || 0} de {progressInfo?.totalFrames || 0}
              </span>
              {progressInfo?.speedFactor > 0 && (
                <span>{progressInfo.speedFactor.toFixed(1)}× tempo real</span>
              )}
            </div>
          </div>
        )}

        {/* Done Step */}
        {exportResult && !exporting && (
          <div className="cc-export-done">
            <video
              src={exportResult.url}
              controls
              className="cc-exported-player"
            />

            {exportResult.validation && (
              <div
                className={`cc-validate-box ${
                  exportResult.validation.durationOk && exportResult.validation.audioOk
                    ? 'ok'
                    : 'warn'
                }`}
              >
                <div className="cc-validate-title">
                  {exportResult.validation.durationOk && exportResult.validation.audioOk
                    ? <CheckCircle2 size={15} />
                    : <AlertTriangle size={15} />}
                  <span>Validação da exportação</span>
                </div>
                <ul className="cc-validate-list">
                  <li>
                    <span>Duração</span>
                    <b>
                      {exportResult.validation.duration != null
                        ? `${fmt(exportResult.validation.duration)} (esperado ${fmt(totalDur)})`
                        : 'não medida'}
                    </b>
                  </li>
                  <li>
                    <span>Áudio</span>
                    <b>
                      {exportResult.validation.hasAudio ? 'presente ✅' : 'ausente ⚠️'}
                    </b>
                  </li>
                </ul>
                {exportResult.validation.warnings?.length > 0 && (
                  <ul className="cc-validate-warnings">
                    {exportResult.validation.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="cc-export-summary success">
              <div>
                <CheckCircle2 size={16} />
                <span>Arquivo pronto para baixar</span>
              </div>
              <b>{fmtSize(exportResult.size / (1024 * 1024))}</b>
            </div>
          </div>
        )}

        <div className="cc-modal-footer">
          {!exporting && !exportResult && (
            <>
              <button className="cc-btn cc-btn-ghost" onClick={onClose}>Cancelar</button>
              <button
                className="cc-btn cc-btn-export"
                onClick={() => onStartExport({ width: dims.w, height: dims.h, fps, bitrate })}
              >
                <Sparkles size={15} />
                <span>Exportar em MP4</span>
              </button>
            </>
          )}

          {exporting && (
            <button className="cc-btn cc-btn-danger-solid" onClick={onCancelExport}>
              Cancelar renderização
            </button>
          )}

          {exportResult && !exporting && (
            <>
              <button className="cc-btn cc-btn-ghost" onClick={onClose}>
                Voltar ao editor
              </button>
              <a
                className="cc-btn cc-btn-export"
                href={exportResult.url}
                download={exportResult.name}
              >
                <Download size={16} />
                <span>Baixar {exportResult.name}</span>
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
