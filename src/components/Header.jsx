import React from 'react'
import {
  Clapperboard,
  Undo2,
  Redo2,
  Camera,
  Keyboard,
  FilePlus2,
  Download,
  Sparkles,
} from 'lucide-react'
import { ASPECTS } from '../constants/presets.js'
import { fmt } from '../utils/media.js'

export default function Header({
  projectName,
  setProjectName,
  aspect,
  onChangeAspect,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  totalDur,
  hasContent,
  onCaptureSnapshot,
  onOpenShortcuts,
  onNewProject,
  onOpenExport,
  onLoadDemo,
}) {
  return (
    <header className="cc-header">
      <div className="cc-header-left">
        <div className="cc-brand">
          <span className="cc-logo-mark">
            <Clapperboard size={18} strokeWidth={2.4} />
          </span>
          <span className="cc-brand-text">Filmuse</span>
        </div>

        <div className="cc-divider-v" />

        <input
          className="cc-proj-input"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="Vídeo sem título"
          aria-label="Nome do projeto"
        />

        <div className="cc-history-group">
          <button
            className="cc-icon-btn"
            disabled={!canUndo}
            onClick={onUndo}
            title="Desfazer (Ctrl+Z)"
          >
            <Undo2 size={16} />
          </button>
          <button
            className="cc-icon-btn"
            disabled={!canRedo}
            onClick={onRedo}
            title="Refazer (Ctrl+Y)"
          >
            <Redo2 size={16} />
          </button>
        </div>
      </div>

      <div className="cc-header-center">
        <div className="cc-aspect-pills" role="group" aria-label="Proporção do vídeo">
          {Object.entries(ASPECTS).map(([key, info]) => {
            const isWide = info.w > info.h
            const isTall = info.h > info.w
            return (
              <button
                key={key}
                className={`cc-aspect-pill ${aspect === key ? 'active' : ''}`}
                onClick={() => onChangeAspect(key)}
                title={info.sub}
              >
                <span
                  className="cc-aspect-box"
                  style={{
                    width: isWide ? 14 : isTall ? 9 : 11,
                    height: isTall ? 14 : isWide ? 9 : 11,
                  }}
                />
                <span>{key}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="cc-header-right">
        {!hasContent && (
          <button
            className="cc-btn cc-btn-subtle"
            onClick={onLoadDemo}
            title="Gerar projeto demonstrativo completo"
          >
            <Sparkles size={15} />
            <span className="hide-sm">Demo</span>
          </button>
        )}

        <button
          className="cc-icon-btn"
          disabled={!hasContent}
          onClick={onCaptureSnapshot}
          title="Salvar frame atual em PNG"
        >
          <Camera size={16} />
        </button>

        <button
          className="cc-icon-btn"
          onClick={onOpenShortcuts}
          title="Atalhos de teclado (?)"
        >
          <Keyboard size={16} />
        </button>

        <button
          className="cc-btn cc-btn-ghost"
          onClick={onNewProject}
          title="Limpar e criar novo projeto"
        >
          <FilePlus2 size={15} />
          <span className="hide-md">Novo</span>
        </button>

        <button
          className="cc-btn cc-btn-export"
          disabled={!hasContent}
          onClick={onOpenExport}
        >
          <Download size={16} />
          <span>Exportar</span>
          {totalDur > 0 && <small className="cc-export-dur">{fmt(totalDur)}</small>}
        </button>
      </div>
    </header>
  )
}
