import React, { useRef, useState } from 'react'
import {
  FolderOpen,
  Video,
  Type,
  Music,
  Sparkles,
  Palette,
  Upload,
  Plus,
  Layers,
  Trash2,
  Monitor,
  Camera,
  Mic,
  Play,
  Square,
  ChevronLeft,
  Wand2,
  Film,
  Image as ImageIcon,
} from 'lucide-react'
import {
  TEXT_PRESETS,
  STICKERS,
  TRANSITIONS,
  COLOR_BACKGROUNDS,
  BUILTIN_SFX,
} from '../constants/presets.js'
import { fmt, synthesizeSfxWav } from '../utils/media.js'

const RAIL_ITEMS = [
  { id: 'midia', label: 'Sua mídia', Icon: FolderOpen },
  { id: 'gravar', label: 'Gravar e criar', Icon: Video },
  { id: 'texto', label: 'Texto', Icon: Type },
  { id: 'audio', label: 'Áudio e SFX', Icon: Music },
  { id: 'transicoes', label: 'Transições', Icon: Sparkles },
  { id: 'fundos', label: 'Fundos', Icon: Palette },
]

export default function LeftSidebar({
  activeTab,
  setActiveTab,
  drawerOpen,
  setDrawerOpen,
  mediaItems,
  onImportFiles,
  onAddMediaToTimeline,
  onAddMediaAsOverlay,
  onRemoveMediaItem,
  onOpenRecorder,
  onAddTextPreset,
  onAddSticker,
  onAddBuiltinSfx,
  onAddColorBackground,
  selectedMainClip,
  mainClipIndex,
  clipsCount,
  onApplyTransition,
  onApplyTransitionAll,
  stageBgColor,
  onChangeStageBg,
  onEnableBlurFillAll,
  onLoadDemo,
}) {
  const fileInputRef = useRef(null)
  const audioInputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const [mediaFilter, setMediaFilter] = useState('all')
  const [previewingSfx, setPreviewingSfx] = useState(null)
  const previewAudioRef = useRef(null)
  const [transDuration, setTransDuration] = useState(0.6)

  const handleRailClick = (id) => {
    if (activeTab === id && drawerOpen) {
      setDrawerOpen(false)
    } else {
      setActiveTab(id)
      setDrawerOpen(true)
    }
  }

  const filteredMedia = mediaItems.filter((m) => {
    if (mediaFilter === 'all') return true
    return m.kind === mediaFilter
  })

  const togglePreviewSfx = (sfx) => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause()
      previewAudioRef.current = null
    }
    if (previewingSfx === sfx.id) {
      setPreviewingSfx(null)
      return
    }
    const blob = synthesizeSfxWav(sfx.kind, sfx.duration)
    const url = URL.createObjectURL(blob)
    const a = new Audio(url)
    previewAudioRef.current = a
    setPreviewingSfx(sfx.id)
    a.onended = () => {
      setPreviewingSfx(null)
      URL.revokeObjectURL(url)
    }
    a.play().catch(() => setPreviewingSfx(null))
  }

  return (
    <div className="cc-left-area">
      <nav className="cc-rail" aria-label="Ferramentas de criação">
        {RAIL_ITEMS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id && drawerOpen
          return (
            <button
              key={id}
              className={`cc-rail-btn ${isActive ? 'active' : ''}`}
              onClick={() => handleRailClick(id)}
              title={label}
            >
              <Icon size={20} strokeWidth={1.9} />
              <span>{label}</span>
            </button>
          )
        })}
      </nav>

      {drawerOpen && (
        <aside className="cc-drawer">
          <div className="cc-drawer-header">
            <h2>{RAIL_ITEMS.find((r) => r.id === activeTab)?.label}</h2>
            <button
              className="cc-icon-btn cc-icon-sm"
              onClick={() => setDrawerOpen(false)}
              title="Recolher painel"
            >
              <ChevronLeft size={16} />
            </button>
          </div>

          <div className="cc-drawer-body">
            {activeTab === 'midia' && (
              <>
                <button
                  className="cc-import-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={17} />
                  <span>Importar mídia</span>
                </button>

                <div
                  className={`cc-dropzone ${dragOver ? 'drag' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragOver(false)
                    onImportFiles(e.dataTransfer.files)
                  }}
                >
                  <strong>Arraste vídeos, fotos ou áudios</strong>
                  <span>MP4 · MOV · WebM · PNG · JPG · MP3 · WAV</span>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*,image/*,audio/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    onImportFiles(e.target.files)
                    e.target.value = ''
                  }}
                />

                {mediaItems.length > 0 && (
                  <div className="cc-filter-pills">
                    {[
                      ['all', 'Todos'],
                      ['video', 'Vídeos'],
                      ['image', 'Imagens'],
                      ['audio', 'Áudio'],
                    ].map(([k, lbl]) => (
                      <button
                        key={k}
                        className={`cc-pill-sm ${mediaFilter === k ? 'active' : ''}`}
                        onClick={() => setMediaFilter(k)}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                )}

                {mediaItems.length === 0 ? (
                  <div className="cc-empty-box">
                    <p>Sua biblioteca está vazia. Tudo é processado 100% no navegador com privacidade total.</p>
                    <button className="cc-btn cc-btn-subtle" style={{ width: '100%', justifyContent: 'center' }} onClick={onLoadDemo}>
                      <Sparkles size={15} />
                      <span>Carregar projeto exemplo</span>
                    </button>
                  </div>
                ) : (
                  <div className="cc-media-grid">
                    {filteredMedia.map((item) => (
                      <div
                        key={item.id}
                        className="cc-media-card"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/x-filmuse-media', item.id)
                        }}
                      >
                        <div
                          className="cc-media-thumb"
                          onClick={() => onAddMediaToTimeline(item.id)}
                          title="Clique para adicionar à timeline"
                        >
                          {item.thumb ? (
                            <img src={item.thumb} alt={item.name} draggable={false} />
                          ) : (
                            <div className={`cc-media-placeholder ${item.kind}`}>
                              {item.kind === 'audio' ? <Music size={22} /> : item.kind === 'image' ? <ImageIcon size={22} /> : <Film size={22} />}
                            </div>
                          )}

                          <span className="cc-media-badge">
                            {item.kind === 'audio' ? 'ÁUDIO' : item.kind === 'image' ? 'FOTO' : fmt(item.duration)}
                          </span>

                          <div className="cc-media-hover-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              className="cc-card-action primary"
                              title="Adicionar na timeline"
                              onClick={() => onAddMediaToTimeline(item.id)}
                            >
                              <Plus size={15} />
                            </button>
                            {(item.kind === 'video' || item.kind === 'image') && (
                              <button
                                className="cc-card-action"
                                title="Adicionar como sobreposição (Picture-in-Picture)"
                                onClick={() => onAddMediaAsOverlay(item.id)}
                              >
                                <Layers size={14} />
                              </button>
                            )}
                            <button
                              className="cc-card-action danger"
                              title="Remover da biblioteca"
                              onClick={() => onRemoveMediaItem(item.id)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                        <div className="cc-media-title" title={item.name}>
                          {item.name}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === 'gravar' && (
              <div className="cc-record-list">
                <p className="cc-panel-hint">
                  Capture direto do navegador e envie automaticamente para sua timeline — inspirado no estúdio Clipchamp.
                </p>

                <button className="cc-record-card featured" onClick={() => onOpenRecorder('screen-cam')}>
                  <div className="cc-rec-icon purple">
                    <Monitor size={20} />
                  </div>
                  <div className="cc-rec-info">
                    <strong>Tela e câmera</strong>
                    <span>Grava a tela na faixa principal e sua webcam redonda no canto (PiP)</span>
                  </div>
                </button>

                <button className="cc-record-card" onClick={() => onOpenRecorder('screen')}>
                  <div className="cc-rec-icon blue">
                    <Monitor size={20} />
                  </div>
                  <div className="cc-rec-info">
                    <strong>Gravar tela</strong>
                    <span>Capture uma janela, aba ou a tela inteira com áudio</span>
                  </div>
                </button>

                <button className="cc-record-card" onClick={() => onOpenRecorder('webcam')}>
                  <div className="cc-rec-icon pink">
                    <Camera size={20} />
                  </div>
                  <div className="cc-rec-info">
                    <strong>Câmera (Webcam)</strong>
                    <span>Grave um vlog ou reação com contagem regressiva</span>
                  </div>
                </button>

                <button className="cc-record-card" onClick={() => onOpenRecorder('voice')}>
                  <div className="cc-rec-icon teal">
                    <Mic size={20} />
                  </div>
                  <div className="cc-rec-info">
                    <strong>Narração de voz</strong>
                    <span>Grave sua voz com microfone direto na faixa de áudio</span>
                  </div>
                </button>
              </div>
            )}

            {activeTab === 'texto' && (
              <>
                <button
                  className="cc-import-btn"
                  onClick={() => onAddTextPreset(TEXT_PRESETS[1])}
                >
                  <Plus size={17} />
                  <span>Adicionar texto na agulha</span>
                </button>

                <h3 className="cc-sec-title">Estilos de título</h3>
                <div className="cc-text-preset-grid">
                  {TEXT_PRESETS.map((tp) => (
                    <button
                      key={tp.id}
                      className="cc-text-card"
                      onClick={() => onAddTextPreset(tp)}
                      title={`Inserir "${tp.name}"`}
                    >
                      <div className="cc-text-preview" style={{ background: tp.previewBg }}>
                        <span
                          style={{
                            fontFamily: tp.props.fontFamily,
                            fontWeight: tp.props.fontWeight,
                            fontStyle: tp.props.italic ? 'italic' : 'normal',
                            color: tp.props.color,
                            background: tp.props.bgEnabled ? tp.props.bgColor : 'transparent',
                            padding: tp.props.bgEnabled ? '3px 8px' : 0,
                            borderRadius: 5,
                            fontSize: 12,
                            textShadow: tp.props.strokeWidth ? '0 1px 4px #000' : 'none',
                          }}
                        >
                          {tp.sample}
                        </span>
                      </div>
                      <div className="cc-text-card-label">
                        <span>{tp.name}</span>
                        <Plus size={14} />
                      </div>
                    </button>
                  ))}
                </div>

                <h3 className="cc-sec-title">Adesivos e reações</h3>
                <div className="cc-sticker-grid">
                  {STICKERS.map((st) => (
                    <button
                      key={st.emoji}
                      className="cc-sticker-btn"
                      onClick={() => onAddSticker(st)}
                      title={`Adicionar ${st.label}`}
                    >
                      {st.emoji}
                    </button>
                  ))}
                </div>
              </>
            )}

            {activeTab === 'audio' && (
              <>
                <button
                  className="cc-import-btn"
                  onClick={() => audioInputRef.current?.click()}
                >
                  <Upload size={17} />
                  <span>Importar música ou áudio</span>
                </button>
                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    onImportFiles(e.target.files)
                    e.target.value = ''
                  }}
                />

                <h3 className="cc-sec-title">Trilhas e efeitos prontos</h3>
                <p className="cc-panel-hint">
                   Clique em ▶ para ouvir ou em + para inserir na posição atual da agulha.
                </p>

                <div className="cc-sfx-list">
                  {BUILTIN_SFX.map((sfx) => {
                    const isPlayingThis = previewingSfx === sfx.id
                    return (
                      <div key={sfx.id} className="cc-sfx-item">
                        <button
                          className={`cc-sfx-play ${isPlayingThis ? 'playing' : ''}`}
                          onClick={() => togglePreviewSfx(sfx)}
                          title="Ouvir prévia"
                        >
                          {isPlayingThis ? <Square size={12} /> : <Play size={13} />}
                        </button>
                        <div className="cc-sfx-meta">
                          <strong>{sfx.name}</strong>
                          <span>{sfx.category} · {sfx.duration.toFixed(1)}s</span>
                        </div>
                        <button
                          className="cc-icon-btn cc-icon-sm"
                          onClick={() => onAddBuiltinSfx(sfx)}
                          title="Adicionar à faixa de áudio"
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {activeTab === 'transicoes' && (
              <>
                <p className="cc-panel-hint">
                  Suavize a passagem entre dois clipes na faixa principal. Você também pode clicar no ícone <b>❖</b> entre os clipes na timeline.
                </p>

                {clipsCount < 2 && (
                  <div className="cc-info-banner">
                    Adicione pelo menos <b>2 clipes</b> na faixa principal (ou divida um clipe com <kbd>S</kbd>) para usar transições entre cortes.
                  </div>
                )}

                <div className="cc-field" style={{ marginTop: 10 }}>
                  <label>
                    <span>Duração da transição</span>
                    <output>{transDuration.toFixed(1)}s</output>
                  </label>
                  <input
                    type="range"
                    min={0.2}
                    max={2.0}
                    step={0.1}
                    value={selectedMainClip?.transition?.duration ?? transDuration}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value)
                      setTransDuration(val)
                      if (selectedMainClip && mainClipIndex > 0) {
                        onApplyTransition(selectedMainClip.id, selectedMainClip.transition?.type || 'crossfade', val)
                      }
                    }}
                  />
                </div>

                <div className="cc-trans-grid">
                  {TRANSITIONS.map((tr) => {
                    const currentType = selectedMainClip?.transition?.type || 'none'
                    const active = mainClipIndex > 0 && currentType === tr.id
                    return (
                      <button
                        key={tr.id}
                        className={`cc-trans-card ${active ? 'active' : ''}`}
                        onClick={() => {
                          const dur = selectedMainClip?.transition?.duration || transDuration
                          if (selectedMainClip && mainClipIndex > 0) {
                            onApplyTransition(selectedMainClip.id, tr.id, dur)
                          } else if (clipsCount >= 2) {
                            onApplyTransitionAll(tr.id, dur)
                          }
                        }}
                      >
                        <div className="cc-trans-icon">{tr.icon}</div>
                        <strong>{tr.name}</strong>
                        <span>{tr.desc}</span>
                      </button>
                    )
                  })}
                </div>

                {clipsCount >= 2 && (
                  <button
                    className="cc-btn cc-btn-subtle"
                    style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
                    onClick={() => {
                      const tType = selectedMainClip?.transition?.type && selectedMainClip.transition.type !== 'none'
                        ? selectedMainClip.transition.type
                        : 'crossfade'
                      onApplyTransitionAll(tType, transDuration)
                    }}
                  >
                    <Wand2 size={15} />
                    <span>Aplicar a todos os cortes</span>
                  </button>
                )}
              </>
            )}

            {activeTab === 'fundos' && (
              <>
                <h3 className="cc-sec-title">Preenchimento de palco</h3>
                <p className="cc-panel-hint">
                  Para vídeos horizontais em formato 9:16 (Reels/TikTok), ative o <b>Fundo Desfocado</b> ou escolha uma cor de fundo.
                </p>
                <div className="cc-row" style={{ marginBottom: 12 }}>
                  <button className="cc-btn cc-btn-subtle" style={{ flex: 1, justifyContent: 'center' }} onClick={onEnableBlurFillAll}>
                    <Wand2 size={14} />
                    <span>Fundo desfocado em tudo</span>
                  </button>
                </div>
                <div className="cc-field">
                  <label>Cor do palco</label>
                  <input
                    type="color"
                    value={stageBgColor}
                    onChange={(e) => onChangeStageBg(e.target.value)}
                  />
                </div>

                <h3 className="cc-sec-title">Cartões e gradientes (4s)</h3>
                <p className="cc-panel-hint">
                  Ótimos para capas de abertura, capítulos ou telas finais com texto por cima.
                </p>
                <div className="cc-bg-grid">
                  {COLOR_BACKGROUNDS.map((bg) => (
                    <button
                      key={bg.id}
                      className="cc-bg-card"
                      onClick={() => onAddColorBackground(bg)}
                      title={`Inserir cartão "${bg.name}"`}
                    >
                      <div
                        className="cc-bg-swatch"
                        style={{
                          background: bg.bg2 && bg.bg2 !== bg.bg
                            ? `linear-gradient(${bg.angle || 135}deg, ${bg.bg}, ${bg.bg2})`
                            : bg.bg,
                        }}
                      >
                        <span className="cc-bg-plus"><Plus size={14} /></span>
                      </div>
                      <span>{bg.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}
