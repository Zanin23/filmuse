import React, { useEffect, useState } from 'react'
import {
  Sliders,
  Crop,
  Sparkles,
  FolderOpen,
  Gauge,
  Volume2,
  Type,
  ChevronRight,
  RotateCcw,
  Wand2,
  Unlink,
  VolumeX,
  Bold,
  Italic,
  CaseUpper,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Scissors,
} from 'lucide-react'
import {
  FILTER_PRESETS,
  DEFAULT_FILTERS,
  TRANSITIONS,
  FONTS,
} from '../constants/presets.js'
import { clipDur, overlayDur, audioDur, fmt } from '../utils/media.js'
import SimpleAdjustPanel from './SimpleAdjustPanel.jsx'

export default function RightInspector({
  selection,
  clips,
  overlays,
  texts,
  audios,
  mainVideoDuration,
  currentTime,
  cropping,
  setCropping,
  onUpdateMainClip,
  onApplyFiltersAll,
  onUpdateOverlay,
  onUpdateText,
  onUpdateAudio,
  onDetachAudio,
  onToast,
  onOpenLibrary,
  onLoadDemo,
  inspectorOpen,
  setInspectorOpen,
}) {
  const [tab, setTab] = useState('simples')
  const [tabByTrack, setTabByTrack] = useState({})

  const selTrack = selection?.track || null
  const mainClip = selTrack === 'main' ? clips.find((c) => c.id === selection.id) : null
  const mainIndex = selTrack === 'main' ? clips.findIndex((c) => c.id === selection.id) : -1
  const overlayClip = selTrack === 'overlay' ? overlays.find((o) => o.id === selection.id) : null
  const textClip = selTrack === 'text' ? texts.find((t) => t.id === selection.id) : null
  const audioClip = selTrack === 'audio' ? audios.find((a) => a.id === selection.id) : null

  // Automatically open the simple-adjust tab (the friendliest) when the selection
  // changes, remembering which tab the user last picked for each track type.
  useEffect(() => {
    if (!selection) return
    const remembered = tabByTrack[selection.track]
    setTab(remembered || 'simples')
  }, [selection?.track, selection?.id, tabByTrack])

  const visualItem = mainClip || overlayClip
  const simpleItem = selTrack === 'main'
    ? mainClip
    : selTrack === 'overlay'
      ? overlayClip
      : selTrack === 'text'
        ? textClip
        : selTrack === 'audio'
          ? audioClip
          : null
  const updateVisual = (patch, coalesceKey) => {
    if (mainClip) onUpdateMainClip(mainClip.id, patch, coalesceKey)
    else if (overlayClip) onUpdateOverlay(overlayClip.id, patch, coalesceKey)
  }

  const tabs = (() => {
    if (selTrack === 'text') {
      return [
        { id: 'simples', label: 'Simples', Icon: Wand2 },
        { id: 'texto', label: 'Texto', Icon: Type },
      ]
    }
    if (selTrack === 'audio') {
      return [
        { id: 'simples', label: 'Simples', Icon: Wand2 },
        { id: 'audio', label: 'Áudio', Icon: Volume2 },
        { id: 'velocidade', label: 'Ritmo', Icon: Gauge },
      ]
    }
    return [
      { id: 'simples', label: 'Simples', Icon: Wand2 },
      { id: 'filtros', label: 'Filtros', Icon: Sliders },
      { id: 'ajustar', label: 'Ajustar', Icon: Crop },
      { id: 'fade', label: 'Fade', Icon: Sparkles },
      { id: 'velocidade', label: 'Tempo', Icon: Gauge },
      { id: 'audio', label: 'Áudio', Icon: Volume2 },
    ]
  })()

  const handleRailClick = (id) => {
    if (tab === id && inspectorOpen) {
      setInspectorOpen(false)
      return
    }
    setTab(id)
    setInspectorOpen(true)
    if (selTrack) {
      setTabByTrack((prev) => (prev[selTrack] === id ? prev : { ...prev, [selTrack]: id }))
    }
  }

  const applyCropPreset = (presetName) => {
    if (!mainClip) return
    const vw = mainClip.videoW || 1280
    const vh = mainClip.videoH || 720
    const vr = vw / vh
    const mk = (r) => {
      if (vr >= r) {
        const w = (vh * r) / vw
        return { cropX: (1 - w) / 2, cropY: 0, cropW: w, cropH: 1 }
      }
      const h = (vw / r) / vh
      return { cropX: 0, cropY: (1 - h) / 2, cropW: 1, cropH: h }
    }
    const map = {
      cheia: { cropX: 0, cropY: 0, cropW: 1, cropH: 1 },
      '16:9': mk(16 / 9),
      '9:16': mk(9 / 16),
      '1:1': mk(1),
      '4:5': mk(4 / 5),
    }
    const p = map[presetName]
    if (p) {
      onUpdateMainClip(mainClip.id, { ...p, cropEnabled: presetName !== 'cheia' })
    }
  }

  return (
    <div className="cc-right-area">
      {inspectorOpen && (
        <aside className="cc-inspector">
          <div className="cc-drawer-header">
            <h2>
              {!selection
                ? 'Propriedades'
                : tab === 'simples'
                  ? 'Ajustes simples'
                  : tabs.find((t) => t.id === tab)?.label || 'Propriedades'}
            </h2>
            <button
              className="cc-icon-btn cc-icon-sm"
              onClick={() => setInspectorOpen(false)}
              title="Recolher inspetor"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="cc-drawer-body">
            {!selection && (
              <div className="cc-empty-box">
                <div className="cc-guide-list">
                  <div className="cc-guide-step">
                    <span className="cc-guide-num">1</span>
                    <div>
                      <strong>Importe seus vídeos e fotos</strong>
                      <p>Vá em “Sua mídia” e arraste arquivos ou clique em importar.</p>
                    </div>
                  </div>
                  <div className="cc-guide-step">
                    <span className="cc-guide-num">2</span>
                    <div>
                      <strong>Selecione o que quer ajustar</strong>
                      <p>Clique em qualquer clipe da timeline ou direto no palco.</p>
                    </div>
                  </div>
                  <div className="cc-guide-step">
                    <span className="cc-guide-num">3</span>
                    <div>
                      <strong>Use a aba “Simples”</strong>
                      <p>Tudo aqui é em um clique: brilho, cor, tamanho, duração e volume. Se não gostar, use Ctrl+Z.</p>
                    </div>
                  </div>
                </div>
                <div className="cc-row" style={{ marginTop: 4 }}>
                  <button
                    className="cc-btn cc-btn-subtle"
                    style={{ justifyContent: 'center' }}
                    onClick={onOpenLibrary}
                  >
                    <FolderOpen size={14} />
                    <span>Importar mídia</span>
                  </button>
                  <button
                    className="cc-btn cc-btn-subtle"
                    style={{ justifyContent: 'center' }}
                    onClick={onLoadDemo}
                  >
                    <Sparkles size={14} />
                    <span>Carregar exemplo</span>
                  </button>
                </div>
              </div>
            )}

            {selTrack && tab === 'simples' && simpleItem && (
              <SimpleAdjustPanel
                track={selTrack}
                item={simpleItem}
                currentTime={currentTime}
                clips={clips}
                mainVideoDuration={mainVideoDuration}
                onUpdateMainClip={onUpdateMainClip}
                onUpdateOverlay={onUpdateOverlay}
                onUpdateText={onUpdateText}
                onUpdateAudio={onUpdateAudio}
                onToast={onToast}
              />
            )}

            {/* TEXT INSPECTOR */}
            {selTrack === 'text' && textClip && (
              <>
                <div className="cc-field">
                  <label>Texto</label>
                  <textarea
                    className="cc-textarea"
                    rows={3}
                    value={textClip.text}
                    onChange={(e) => onUpdateText(textClip.id, { text: e.target.value }, `txt-${textClip.id}`)}
                    placeholder="Digite seu título ou legenda..."
                  />
                </div>

                <div className="cc-field">
                  <label>Fonte</label>
                  <select
                    className="cc-select"
                    value={textClip.fontFamily || 'Inter'}
                    onChange={(e) => onUpdateText(textClip.id, { fontFamily: e.target.value })}
                  >
                    {FONTS.map((f) => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>
                </div>

                <div className="cc-row" style={{ marginBottom: 12 }}>
                  <div className="cc-seg">
                    <button
                      className={(textClip.fontWeight || 800) >= 700 ? 'active' : ''}
                      onClick={() => onUpdateText(textClip.id, { fontWeight: (textClip.fontWeight || 800) >= 700 ? 500 : 800 })}
                      title="Negrito"
                    >
                      <Bold size={14} />
                    </button>
                    <button
                      className={textClip.italic ? 'active' : ''}
                      onClick={() => onUpdateText(textClip.id, { italic: !textClip.italic })}
                      title="Itálico"
                    >
                      <Italic size={14} />
                    </button>
                    <button
                      className={textClip.uppercase ? 'active' : ''}
                      onClick={() => onUpdateText(textClip.id, { uppercase: !textClip.uppercase })}
                      title="Maiúsculas"
                    >
                      <CaseUpper size={15} />
                    </button>
                  </div>

                  <div className="cc-seg">
                    {[
                      ['left', AlignLeft],
                      ['center', AlignCenter],
                      ['right', AlignRight],
                    ].map(([al, Icon]) => (
                      <button
                        key={al}
                        className={(textClip.align || 'center') === al ? 'active' : ''}
                        onClick={() => onUpdateText(textClip.id, { align: al })}
                      >
                        <Icon size={14} />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="cc-field">
                  <label>
                    <span>Tamanho</span>
                    <output>{textClip.fontSize}px</output>
                  </label>
                  <input
                    type="range"
                    min={16}
                    max={120}
                    value={textClip.fontSize || 44}
                    onChange={(e) => onUpdateText(textClip.id, { fontSize: parseInt(e.target.value) }, `tsize-${textClip.id}`)}
                  />
                </div>

                <div className="cc-row" style={{ marginBottom: 12 }}>
                  <div className="cc-field" style={{ marginBottom: 0 }}>
                    <label>Cor do texto</label>
                    <input
                      type="color"
                      value={textClip.color || '#ffffff'}
                      onChange={(e) => onUpdateText(textClip.id, { color: e.target.value }, `tcol-${textClip.id}`)}
                    />
                  </div>
                  <div className="cc-field" style={{ marginBottom: 0 }}>
                    <label>Cor da borda</label>
                    <input
                      type="color"
                      value={textClip.strokeColor || '#000000'}
                      onChange={(e) => onUpdateText(textClip.id, { strokeColor: e.target.value }, `tscol-${textClip.id}`)}
                    />
                  </div>
                </div>

                <div className="cc-field">
                  <label>
                    <span>Espessura do contorno</span>
                    <output>{textClip.strokeWidth || 0}px</output>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={0.5}
                    value={textClip.strokeWidth || 0}
                    onChange={(e) => onUpdateText(textClip.id, { strokeWidth: parseFloat(e.target.value) }, `tstrk-${textClip.id}`)}
                  />
                </div>

                <div className="cc-toggle-line">
                  <span>Caixa de fundo</span>
                  <button
                    className={`cc-switch ${textClip.bgEnabled ? 'on' : ''}`}
                    onClick={() => onUpdateText(textClip.id, { bgEnabled: !textClip.bgEnabled })}
                  />
                </div>

                {textClip.bgEnabled && (
                  <div style={{ marginTop: 10 }}>
                    <div className="cc-field">
                      <label>Cor do fundo</label>
                      <input
                        type="color"
                        value={(textClip.bgColor || '#000000').startsWith('#') ? textClip.bgColor : '#000000'}
                        onChange={(e) => onUpdateText(textClip.id, { bgColor: e.target.value }, `tbg-${textClip.id}`)}
                      />
                    </div>
                    <div className="cc-field">
                      <label>
                        <span>Opacidade do fundo</span>
                        <output>{Math.round((textClip.bgOpacity ?? 0.75) * 100)}%</output>
                      </label>
                      <input
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={textClip.bgOpacity ?? 0.75}
                        onChange={(e) => onUpdateText(textClip.id, { bgOpacity: parseFloat(e.target.value) }, `tbgo-${textClip.id}`)}
                      />
                    </div>
                  </div>
                )}

                <div className="cc-field" style={{ marginTop: 12 }}>
                  <label>Animação</label>
                  <select
                    className="cc-select"
                    value={textClip.animation || 'none'}
                    onChange={(e) => onUpdateText(textClip.id, { animation: e.target.value })}
                  >
                    <option value="none">Sem animação</option>
                    <option value="pop">Pop Elástico</option>
                    <option value="fade">Fade Suave</option>
                    <option value="slide-up">Subir Suave</option>
                    <option value="typewriter">Máquina de Escrever</option>
                    <option value="glow">Pulso Neon</option>
                  </select>
                </div>

                <div className="cc-field">
                  <label>
                    <span>Duração na tela</span>
                    <output>{(textClip.duration || 3).toFixed(1)}s</output>
                  </label>
                  <input
                    type="range"
                    min={0.5}
                    max={20}
                    step={0.1}
                    value={textClip.duration || 3}
                    onChange={(e) => onUpdateText(textClip.id, { duration: parseFloat(e.target.value) }, `tdur-${textClip.id}`)}
                  />
                </div>
              </>
            )}

            {/* VISUAL FILTERS TAB */}
            {visualItem && tab === 'filtros' && (
              <>
                <h3 className="cc-sec-title" style={{ marginTop: 0 }}>Filtros cinematográficos</h3>
                <div className="cc-preset-grid">
                  {FILTER_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      className={`cc-preset-btn ${(visualItem.preset || 'original') === p.id ? 'active' : ''}`}
                      onClick={() => updateVisual({ ...p.f, preset: p.id })}
                    >
                      <div className="cc-preset-swatch" style={{ background: p.swatch }} />
                      <span>{p.name}</span>
                    </button>
                  ))}
                </div>

                {mainClip && clips.length > 1 && (
                  <button
                    className="cc-btn cc-btn-subtle"
                    style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
                    onClick={() => onApplyFiltersAll(mainClip)}
                  >
                    <Wand2 size={14} />
                    <span>Aplicar filtro a todos os clipes</span>
                  </button>
                )}

                <h3 className="cc-sec-title">Ajuste fino de cor</h3>
                {[
                  ['brightness', 'Exposição / Brilho', 0.4, 1.6, 0.01],
                  ['contrast', 'Contraste', 0.4, 1.8, 0.01],
                  ['saturate', 'Saturação', 0, 2.2, 0.01],
                  ['hue', 'Temperatura / Matiz', -180, 180, 1],
                  ['vignette', 'Vinheta', 0, 1, 0.02],
                  ['blur', 'Desfoque', 0, 8, 0.1],
                  ['opacity', 'Opacidade', 0.1, 1, 0.02],
                ].map(([key, label, min, max, step]) => (
                  <div className="cc-field" key={key}>
                    <label>
                      <span>{label}</span>
                      <output>
                        {key === 'hue'
                          ? `${Math.round(visualItem[key] || 0)}°`
                          : Number(visualItem[key] ?? DEFAULT_FILTERS[key] ?? 1).toFixed(2)}
                      </output>
                    </label>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={visualItem[key] ?? DEFAULT_FILTERS[key] ?? 0}
                      onChange={(e) =>
                        updateVisual({ [key]: parseFloat(e.target.value), preset: 'custom' }, `flt-${key}-${visualItem.id}`)
                      }
                    />
                  </div>
                ))}

                <button
                  className="cc-btn cc-btn-ghost"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => updateVisual({ ...DEFAULT_FILTERS, preset: 'original' })}
                >
                  <RotateCcw size={14} />
                  <span>Resetar cores</span>
                </button>
              </>
            )}

            {/* TRANSFORM & CROP TAB */}
            {visualItem && tab === 'ajustar' && (
              <>
                {mainClip && (
                  <>
                    <h3 className="cc-sec-title" style={{ marginTop: 0 }}>Enquadramento</h3>
                    <div className="cc-seg" style={{ marginBottom: 12 }}>
                      <button
                        className={(mainClip.fitMode || 'contain') === 'contain' ? 'active' : ''}
                        onClick={() => onUpdateMainClip(mainClip.id, { fitMode: 'contain' })}
                      >
                        Ajustar (Inteiro)
                      </button>
                      <button
                        className={mainClip.fitMode === 'cover' ? 'active' : ''}
                        onClick={() => onUpdateMainClip(mainClip.id, { fitMode: 'cover' })}
                      >
                        Preencher tela
                      </button>
                    </div>

                    {mainClip.kind !== 'color' && (
                      <div className="cc-toggle-line" style={{ marginBottom: 12 }}>
                        <span>Fundo desfocado (Blur Fill)</span>
                        <button
                          className={`cc-switch ${mainClip.blurFill ? 'on' : ''}`}
                          onClick={() => onUpdateMainClip(mainClip.id, { blurFill: !mainClip.blurFill })}
                        />
                      </div>
                    )}

                    <div className="cc-field">
                      <label>
                        <span>Zoom / Escala</span>
                        <output>{(mainClip.scale || 1).toFixed(2)}×</output>
                      </label>
                      <input
                        type="range"
                        min={0.3}
                        max={3}
                        step={0.02}
                        value={mainClip.scale || 1}
                        onChange={(e) => onUpdateMainClip(mainClip.id, { scale: parseFloat(e.target.value) }, `sc-${mainClip.id}`)}
                      />
                    </div>

                    <div className="cc-field">
                      <label>
                        <span>Cantos arredondados</span>
                        <output>{mainClip.borderRadius || 0}px</output>
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={64}
                        step={2}
                        value={mainClip.borderRadius || 0}
                        onChange={(e) => onUpdateMainClip(mainClip.id, { borderRadius: parseInt(e.target.value) }, `rad-${mainClip.id}`)}
                      />
                    </div>

                    <div className="cc-field">
                      <label>Movimento de câmera (Ken Burns)</label>
                      <select
                        className="cc-select"
                        value={mainClip.motion || 'none'}
                        onChange={(e) => onUpdateMainClip(mainClip.id, { motion: e.target.value })}
                      >
                        <option value="none">Estático</option>
                        <option value="zoom-in">Aproximar suave (Zoom In)</option>
                        <option value="zoom-out">Afastar suave (Zoom Out)</option>
                        <option value="pan-right">Panorâmica Direita</option>
                        <option value="pan-left">Panorâmica Esquerda</option>
                      </select>
                    </div>

                    <h3 className="cc-sec-title">Recortar quadro</h3>
                    <button
                      className="cc-btn cc-btn-export"
                      style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }}
                      onClick={() => setCropping((c) => !c)}
                    >
                      <Crop size={15} />
                      <span>{cropping ? 'Concluir recorte na tela' : 'Recortar direto no vídeo'}</span>
                    </button>

                    <div className="cc-chip-wrap">
                      {[
                        ['cheia', 'Original'],
                        ['16:9', '16:9'],
                        ['9:16', '9:16'],
                        ['1:1', '1:1'],
                        ['4:5', '4:5'],
                      ].map(([k, lbl]) => (
                        <button key={k} className="cc-chip" onClick={() => applyCropPreset(k)}>
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {overlayClip && (
                  <>
                    <h3 className="cc-sec-title" style={{ marginTop: 0 }}>Camada Picture-in-Picture</h3>
                    <div className="cc-field">
                      <label>
                        <span>Tamanho da camada</span>
                        <output>{Math.round((overlayClip.width || 0.3) * 100)}%</output>
                      </label>
                      <input
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.01}
                        value={overlayClip.width || 0.3}
                        onChange={(e) => onUpdateOverlay(overlayClip.id, { width: parseFloat(e.target.value) }, `ovw-${overlayClip.id}`)}
                      />
                    </div>

                    <div className="cc-toggle-line">
                      <span>Formato circular (Webcam)</span>
                      <button
                        className={`cc-switch ${(overlayClip.borderRadius || 0) >= 500 ? 'on' : ''}`}
                        onClick={() =>
                          onUpdateOverlay(overlayClip.id, {
                            borderRadius: (overlayClip.borderRadius || 0) >= 500 ? 16 : 999,
                          })
                        }
                      />
                    </div>

                    {(overlayClip.borderRadius || 0) < 500 && (
                      <div className="cc-field" style={{ marginTop: 10 }}>
                        <label>
                          <span>Arredondamento</span>
                          <output>{overlayClip.borderRadius ?? 16}px</output>
                        </label>
                        <input
                          type="range"
                          min={0}
                          max={80}
                          value={overlayClip.borderRadius ?? 16}
                          onChange={(e) => onUpdateOverlay(overlayClip.id, { borderRadius: parseInt(e.target.value) }, `ovr-${overlayClip.id}`)}
                        />
                      </div>
                    )}

                    <div className="cc-field" style={{ marginTop: 10 }}>
                      <label>
                        <span>Espessura da moldura</span>
                        <output>{overlayClip.borderWidth ?? 2}px</output>
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={12}
                        value={overlayClip.borderWidth ?? 2}
                        onChange={(e) => onUpdateOverlay(overlayClip.id, { borderWidth: parseInt(e.target.value) }, `ovb-${overlayClip.id}`)}
                      />
                    </div>

                    <div className="cc-field">
                      <label>Cor da moldura</label>
                      <input
                        type="color"
                        value={overlayClip.borderColor || '#ffffff'}
                        onChange={(e) => onUpdateOverlay(overlayClip.id, { borderColor: e.target.value }, `ovbc-${overlayClip.id}`)}
                      />
                    </div>
                  </>
                )}
              </>
            )}

            {/* FADE & TRANSITION TAB */}
            {visualItem && tab === 'fade' && (
              <>
                <h3 className="cc-sec-title" style={{ marginTop: 0 }}>Fade visual</h3>
                <div className="cc-field">
                  <label>
                    <span>Fade In (Entrada gradual)</span>
                    <output>{(visualItem.fadeIn || 0).toFixed(1)}s</output>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={3}
                    step={0.1}
                    value={visualItem.fadeIn || 0}
                    onChange={(e) => updateVisual({ fadeIn: parseFloat(e.target.value) }, `fi-${visualItem.id}`)}
                  />
                </div>
                <div className="cc-field">
                  <label>
                    <span>Fade Out (Saída gradual)</span>
                    <output>{(visualItem.fadeOut || 0).toFixed(1)}s</output>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={3}
                    step={0.1}
                    value={visualItem.fadeOut || 0}
                    onChange={(e) => updateVisual({ fadeOut: parseFloat(e.target.value) }, `fo-${visualItem.id}`)}
                  />
                </div>

                {mainClip && mainIndex > 0 && (
                  <>
                    <h3 className="cc-sec-title">Transição de entrada</h3>
                    <div className="cc-field">
                      <label>Estilo</label>
                      <select
                        className="cc-select"
                        value={mainClip.transition?.type || 'none'}
                        onChange={(e) =>
                          onUpdateMainClip(mainClip.id, {
                            transition: {
                              type: e.target.value,
                              duration: mainClip.transition?.duration || 0.6,
                            },
                          })
                        }
                      >
                        {TRANSITIONS.map((tr) => (
                          <option key={tr.id} value={tr.id}>{tr.name}</option>
                        ))}
                      </select>
                    </div>
                    {mainClip.transition?.type && mainClip.transition.type !== 'none' && (
                      <div className="cc-field">
                        <label>
                          <span>Duração da transição</span>
                          <output>{(mainClip.transition.duration || 0.6).toFixed(1)}s</output>
                        </label>
                        <input
                          type="range"
                          min={0.2}
                          max={2.0}
                          step={0.1}
                          value={mainClip.transition.duration || 0.6}
                          onChange={(e) =>
                            onUpdateMainClip(
                              mainClip.id,
                              {
                                transition: {
                                  ...mainClip.transition,
                                  duration: parseFloat(e.target.value),
                                },
                              },
                              `trd-${mainClip.id}`
                            )
                          }
                        />
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {/* SPEED & TIMING TAB */}
            {tab === 'velocidade' && (visualItem || audioClip) && (
              <>
                {(() => {
                  const target = visualItem || audioClip
                  const isStatic = target.kind === 'image' || target.kind === 'color'
                  if (isStatic) {
                    const dur = target.trimEnd - target.trimStart
                    return (
                      <>
                        <h3 className="cc-sec-title" style={{ marginTop: 0 }}>Duração da imagem / cartão</h3>
                        <div className="cc-field">
                          <label>
                            <span>Duração</span>
                            <output>{dur.toFixed(1)}s</output>
                          </label>
                          <input
                            type="range"
                            min={0.5}
                            max={30}
                            step={0.5}
                            value={dur}
                            onChange={(e) => {
                              const nextDur = parseFloat(e.target.value)
                              updateVisual({ trimStart: 0, trimEnd: nextDur }, `imgdur-${target.id}`)
                            }}
                          />
                        </div>
                        <div className="cc-chip-wrap">
                          {[2, 4, 6, 10, 15].map((s) => (
                            <button
                              key={s}
                              className={`cc-chip ${Math.abs(dur - s) < 0.1 ? 'active' : ''}`}
                              onClick={() => updateVisual({ trimStart: 0, trimEnd: s })}
                            >
                              {s}s
                            </button>
                          ))}
                        </div>
                      </>
                    )
                  }

                  const applySpeed = (sp) => {
                    if (mainClip) onUpdateMainClip(mainClip.id, { speed: sp }, `spd-${mainClip.id}`)
                    else if (overlayClip) onUpdateOverlay(overlayClip.id, { speed: sp }, `spd-${overlayClip.id}`)
                    else if (audioClip) onUpdateAudio(audioClip.id, { speed: sp }, `spd-${audioClip.id}`)
                  }

                  return (
                    <>
                      <h3 className="cc-sec-title" style={{ marginTop: 0 }}>Velocidade do clipe</h3>
                      <div className="cc-field">
                        <label>
                          <span>Multiplicador</span>
                          <output>{(target.speed || 1).toFixed(2)}×</output>
                        </label>
                        <input
                          type="range"
                          min={0.25}
                          max={4}
                          step={0.05}
                          value={target.speed || 1}
                          onChange={(e) => applySpeed(parseFloat(e.target.value))}
                        />
                      </div>
                      <div className="cc-chip-wrap" style={{ marginBottom: 16 }}>
                        {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4].map((v) => (
                          <button
                            key={v}
                            className={`cc-chip ${Math.abs((target.speed || 1) - v) < 0.02 ? 'active' : ''}`}
                            onClick={() => applySpeed(v)}
                          >
                            {v}×
                          </button>
                        ))}
                      </div>

                      {mainClip && (
                        <>
                          <h3 className="cc-sec-title">Corte preciso (Trim)</h3>
                          <div className="cc-field">
                            <label>
                              <span>Início</span>
                              <output>{fmt(mainClip.trimStart)}</output>
                            </label>
                            <input
                              type="range"
                              min={0}
                              max={mainClip.sourceDuration || mainClip.trimEnd}
                              step={0.05}
                              value={mainClip.trimStart}
                              onChange={(e) =>
                                onUpdateMainClip(
                                  mainClip.id,
                                  { trimStart: Math.min(parseFloat(e.target.value), mainClip.trimEnd - 0.15) },
                                  `ts-${mainClip.id}`
                                )
                              }
                            />
                          </div>
                          <div className="cc-field">
                            <label>
                              <span>Fim</span>
                              <output>{fmt(mainClip.trimEnd)}</output>
                            </label>
                            <input
                              type="range"
                              min={0}
                              max={mainClip.sourceDuration || mainClip.trimEnd}
                              step={0.05}
                              value={mainClip.trimEnd}
                              onChange={(e) =>
                                onUpdateMainClip(
                                  mainClip.id,
                                  { trimEnd: Math.max(parseFloat(e.target.value), mainClip.trimStart + 0.15) },
                                  `te-${mainClip.id}`
                                )
                              }
                            />
                          </div>
                          <p className="cc-panel-hint">
                            Duração final deste clipe: <b>{fmt(clipDur(mainClip))}</b>
                          </p>
                        </>
                      )}
                    </>
                  )
                })()}
              </>
            )}

            {/* AUDIO INSPECTOR TAB */}
            {tab === 'audio' && (visualItem || audioClip) && (
              <>
                {(() => {
                  const target = visualItem || audioClip
                  if (target.kind === 'image' || target.kind === 'color') {
                    return (
                      <div className="cc-empty-box">
                        <p>Este item visual estático não possui áudio próprio. Use a aba <b>Áudio e SFX</b> à esquerda para adicionar música ou narração.</p>
                      </div>
                    )
                  }

                  const setAudioProp = (patch, cKey) => {
                    if (mainClip) onUpdateMainClip(mainClip.id, patch, cKey)
                    else if (overlayClip) onUpdateOverlay(overlayClip.id, patch, cKey)
                    else if (audioClip) onUpdateAudio(audioClip.id, patch, cKey)
                  }

                  const fadeInKey = mainClip ? 'audioFadeIn' : 'fadeIn'
                  const fadeOutKey = mainClip ? 'audioFadeOut' : 'fadeOut'

                  return (
                    <>
                      <h3 className="cc-sec-title" style={{ marginTop: 0 }}>Volume e Mixagem</h3>
                      <div className="cc-field">
                        <label>
                          <span>Volume (até 200% boost)</span>
                          <output>{ target.muted ? 'Mudo' : `${Math.round((target.volume ?? 1) * 100)}%` }</output>
                        </label>
                        <input
                          type="range"
                          min={0}
                          max={2}
                          step={0.02}
                          value={target.muted ? 0 : (target.volume ?? 1)}
                          onChange={(e) =>
                            setAudioProp({ volume: parseFloat(e.target.value), muted: false }, `vol-${target.id}`)
                          }
                        />
                      </div>

                      <div className="cc-toggle-line" style={{ marginBottom: 14 }}>
                        <span>Silenciar áudio</span>
                        <button
                          className={`cc-switch ${target.muted ? 'on' : ''}`}
                          onClick={() => setAudioProp({ muted: !target.muted })}
                        />
                      </div>

                      <h3 className="cc-sec-title">Suavização de áudio (Fade)</h3>
                      <div className="cc-field">
                        <label>
                          <span>Fade In de áudio</span>
                          <output>{(target[fadeInKey] || 0).toFixed(1)}s</output>
                        </label>
                        <input
                          type="range"
                          min={0}
                          max={5}
                          step={0.1}
                          value={target[fadeInKey] || 0}
                          onChange={(e) => setAudioProp({ [fadeInKey]: parseFloat(e.target.value) }, `afi-${target.id}`)}
                        />
                      </div>
                      <div className="cc-field">
                        <label>
                          <span>Fade Out de áudio</span>
                          <output>{(target[fadeOutKey] || 0).toFixed(1)}s</output>
                        </label>
                        <input
                          type="range"
                          min={0}
                          max={5}
                          step={0.1}
                          value={target[fadeOutKey] || 0}
                          onChange={(e) => setAudioProp({ [fadeOutKey]: parseFloat(e.target.value) }, `afo-${target.id}`)}
                        />
                      </div>

                      {mainClip && mainClip.kind === 'video' && (
                        <button
                          className="cc-btn cc-btn-subtle"
                          style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
                          onClick={() => onDetachAudio(mainClip.id)}
                        >
                          <Unlink size={14} />
                          <span>Separar áudio na trilha</span>
                        </button>
                      )}

                      {audioClip && mainVideoDuration > 0.2 && audioClip.start + audioDur(audioClip) > mainVideoDuration + 0.1 && (
                        <button
                          className="cc-btn cc-btn-subtle"
                          style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
                          onClick={() => {
                            const maxAllowed = Math.max(0.2, mainVideoDuration - audioClip.start)
                            onUpdateAudio(audioClip.id, {
                              trimEnd: audioClip.trimStart + maxAllowed * (audioClip.speed || 1),
                              fadeOut: Math.min(1.5, maxAllowed * 0.3),
                            })
                          }}
                        >
                          <Scissors size={14} />
                          <span>Cortar no fim do vídeo ({fmt(mainVideoDuration)})</span>
                        </button>
                      )}
                    </>
                  )
                })()}
              </>
            )}
          </div>
        </aside>
      )}

      <nav className="cc-rail cc-right-rail" aria-label="Inspetor de propriedades">
        {tabs.map(({ id, label, Icon }) => {
          const isActive = tab === id && inspectorOpen
          return (
            <button
              key={id}
              className={`cc-rail-btn ${isActive ? 'active' : ''}`}
              onClick={() => handleRailClick(id)}
              title={label}
            >
              <Icon size={19} strokeWidth={1.9} />
              <span>{label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
