import React from 'react'
import {
  Sun,
  Moon,
  Palette,
  Droplet,
  Sparkles,
  Crop,
  Maximize,
  Minimize,
  RotateCw,
  Bold,
  Italic,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  RotateCcw,
  Gauge,
  Volume2,
  VolumeX,
  Scissors,
  Clock,
  Circle,
  Film,
} from 'lucide-react'
import { FILTER_PRESETS, DEFAULT_FILTERS } from '../constants/presets.js'
import { clipDur, overlayDur, fmt, clamp } from '../utils/media.js'

const QUICK_PRESETS = [
  { id: 'cinema', label: 'Estilo Cinema' },
  { id: 'quente', label: 'Luz Quente' },
  { id: 'frio', label: 'Ártico Frio' },
  { id: 'vintage', label: 'Filme Retrô' },
  { id: 'pb', label: 'P&B Clássico' },
  { id: 'vibrante', label: 'Cores Vibrantes' },
  { id: 'cyber', label: 'Neon' },
  { id: 'suave', label: 'Suave' },
]

const TEXT_COLORS = [
  { value: '#ffffff', label: 'Branco' },
  { value: '#facc15', label: 'Amarelo' },
  { value: '#ef4444', label: 'Vermelho' },
  { value: '#ec4899', label: 'Rosa' },
  { value: '#22d3ee', label: 'Ciano' },
  { value: '#34d399', label: 'Verde' },
  { value: '#a78bfa', label: 'Roxo' },
  { value: '#111827', label: 'Preto' },
]

const TEXT_SIZES = [
  { label: 'Pequeno', value: 28 },
  { label: 'Médio', value: 44 },
  { label: 'Grande', value: 72 },
  { label: 'Gigante', value: 110 },
]

const TEXT_DURATIONS = [
  { label: '1s', value: 1 },
  { label: '3s', value: 3 },
  { label: '5s', value: 5 },
  { label: '10s', value: 10 },
]

const ANIMATIONS = [
  { id: 'none', label: 'Nenhuma' },
  { id: 'pop', label: 'Pop' },
  { id: 'fade', label: 'Fade' },
  { id: 'slide-up', label: 'Subir' },
  { id: 'glow', label: 'Neon' },
  { id: 'typewriter', label: 'Escrever' },
]

function QuickBtn({ Icon, label, sub, onClick, active, disabled }) {
  return (
    <button
      className={`cc-quick-btn ${active ? 'active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={sub ? `${label} — ${sub}` : label}
    >
      {Icon && <Icon size={16} />}
      <span className="cc-quick-label">{label}</span>
      {sub && <span className="cc-quick-sub">{sub}</span>}
    </button>
  )
}

/**
 * Painel de ajustes simples: tudo em um clique, com linguagem de utilário.
 * O usuário não precisa entender termos técnicos — só clica e vê o resultado no palco.
 */
export default function SimpleAdjustPanel({
  track,
  item,
  currentTime,
  clips,
  mainVideoDuration,
  onUpdateMainClip,
  onUpdateOverlay,
  onUpdateText,
  onUpdateAudio,
  onToast,
}) {
  if (!item) return null

  const isMain = track === 'main'
  const isOverlay = track === 'overlay'
  const isVisual = isMain || isOverlay
  const isText = track === 'text'
  const isAudio = track === 'audio'

  const toast = (msg) => onToast && onToast(msg)
  const key = (k) => `sa-${item.id}-${k}`

  const apply = (patch, k) => {
    if (isMain) onUpdateMainClip(item.id, patch, key(k))
    else if (isOverlay) onUpdateOverlay(item.id, patch, key(k))
    else if (isText) onUpdateText(item.id, patch, key(k))
    else if (isAudio) onUpdateAudio(item.id, patch, key(k))
  }

  const step = (current, delta, min, max) =>
    clamp(Number(current || 0) + delta, min, max)

  // Crop presets: same math as the advanced "Ajustar" tab so both stay consistent.
  const ratioCrop = (ratio) => {
    const vw = item.videoW || 1280
    const vh = item.videoH || 720
    const vr = vw / vh
    if (vr >= ratio) {
      const w = (vh * ratio) / vw
      return { cropX: (1 - w) / 2, cropY: 0, cropW: w, cropH: 1 }
    }
    const h = (vw / ratio) / vh
    return { cropX: 0, cropY: (1 - h) / 2, cropW: 1, cropH: h }
  }

  // --- Helpers de recorte com a agulha (playhead) ---
  const trimInfo = (() => {
    if (isMain) {
      let acc = 0
      for (const c of clips) {
        if (c.id === item.id) {
          const start = acc
          const end = acc + clipDur(c)
          return { start, end, dur: clipDur(c), mediaAt: (t) => item.trimStart + (t - start) * (item.speed || 1) }
        }
        acc += clipDur(c)
      }
      return null
    }
    if (isOverlay) {
      const dur = overlayDur(item)
      return {
        start: item.start || 0,
        end: (item.start || 0) + dur,
        dur,
        mediaAt: (t) => item.trimStart + (t - (item.start || 0)) * (item.speed || 1),
      }
    }
    if (isAudio) {
      const span = (item.trimEnd - item.trimStart) / (item.speed || 1)
      const start = item.start || 0
      return {
        start,
        end: start + span,
        dur: span,
        mediaAt: (t) => item.trimStart + (t - start) * (item.speed || 1),
      }
    }
    return null
  })()

  const playheadReady =
    trimInfo &&
    currentTime >= trimInfo.start + 0.2 &&
    currentTime <= trimInfo.end - 0.2

  const trimToStart = () => {
    if (!playheadReady) return
    const mediaT = trimInfo.mediaAt(currentTime)
    if (mediaT < item.trimEnd - 0.2) {
      apply({ trimStart: mediaT })
      toast('✂ Início ajustado para onde está a agulha')
    } else {
      toast('A agulha está muito perto do fim do clipe')
    }
  }

  const trimToEnd = () => {
    if (!playheadReady) return
    const mediaT = trimInfo.mediaAt(currentTime)
    if (mediaT > item.trimStart + 0.2) {
      apply({ trimEnd: mediaT })
      toast('✂ Fim ajustado para onde está a agulha')
    } else {
      toast('A agulha está muito perto do início do clipe')
    }
  }

  // ==================== VÍDEO / FOTO / CAMADA ====================
  if (isVisual) {
    const isColor = item.kind === 'color'
    const isVideo = item.kind === 'video'

    return (
      <>
        <div className="cc-quick-note">
          🎯 Basta clicar: a mudança aparece no palco na hora. Se não gostar, use
          <b> Ctrl+Z</b> para desfazer.
        </div>

        <h3 className="cc-sec-title" style={{ marginTop: 12 }}>Aparência</h3>
        <div className="cc-quick-grid">
          <QuickBtn Icon={Sun} label="Mais clara" sub="aumenta o brilho" onClick={() => { apply({ brightness: step(item.brightness, 0.12, 0.4, 1.6), preset: 'custom' }); toast('🌞 Imagem mais clara') }} />
          <QuickBtn Icon={Moon} label="Mais escura" sub="diminui o brilho" onClick={() => { apply({ brightness: step(item.brightness, -0.12, 0.4, 1.6), preset: 'custom' }); toast('🌙 Imagem mais escura') }} />
          <QuickBtn Icon={Palette} label="Mais colorida" sub="aumenta a cor" onClick={() => { apply({ saturate: step(item.saturate, 0.15, 0, 2.2), preset: 'custom' }); toast('🎨 Cores mais intensas') }} />
          <QuickBtn Icon={Droplet} label="Mais sem cor" sub="apaga a cor" onClick={() => { apply({ saturate: step(item.saturate, -0.15, 0, 2.2), preset: 'custom' }); toast('💧 Cores mais suaves') }} />
          <QuickBtn Icon={Sparkles} label="Mais nítida" sub="aumenta contraste" onClick={() => { apply({ contrast: step(item.contrast, 0.08, 0.4, 1.8), preset: 'custom' }); toast('✨ Imagem mais nítida') }} />
          <QuickBtn Icon={Crop} label="Mais desfocada" sub="enevoa a imagem" onClick={() => { apply({ blur: step(item.blur, 0.5, 0, 8), preset: 'custom' }); toast('🌫️ Imagem mais desfocada') }} />
          <QuickBtn Icon={Circle} label="Vinheta" sub="escurece as bordas" active={(item.vignette || 0) > 0.05} onClick={() => { apply({ vignette: (item.vignette || 0) > 0.05 ? 0 : 0.4, preset: 'custom' }); toast('⭕ Vinheta ligada') }} />
          <QuickBtn Icon={RotateCcw} label="Remover efeitos" sub="volta ao original" onClick={() => { apply({ ...DEFAULT_FILTERS, preset: 'original' }); toast('♻️ Cores voltadas ao original') }} />
        </div>

        <h3 className="cc-sec-title">Estilos prontos</h3>
        <div className="cc-quick-grid">
          {QUICK_PRESETS.map((pq) => {
            const preset = FILTER_PRESETS.find((p) => p.id === pq.id)
            if (!preset) return null
            return (
              <QuickBtn
                key={pq.id}
                label={pq.label}
                active={(item.preset || 'original') === pq.id}
                onClick={() => {
                  apply({ ...preset.f, preset: pq.id })
                  toast(`✨ Filtro "${pq.label}" aplicado`)
                }}
              />
            )
          })}
        </div>

        {isMain && (
          <>
            <h3 className="cc-sec-title">Enquadramento</h3>
            <div className="cc-seg" style={{ marginBottom: 12 }}>
              <button
                className={(item.fitMode || 'contain') === 'contain' ? 'active' : ''}
                onClick={() => apply({ fitMode: 'contain' })}
              >
                <Maximize size={14} /> Ajustar à tela
              </button>
              <button
                className={item.fitMode === 'cover' ? 'active' : ''}
                onClick={() => apply({ fitMode: 'cover' })}
              >
                <Minimize size={14} /> Preencher tela
              </button>
            </div>

            <div className="cc-quick-grid">
              {[
                ['16:9', 16 / 9, 'horizontal'],
                ['9:16', 9 / 16, 'vertical · Reels'],
                ['1:1', 1, 'quadrado'],
                ['4:5', 4 / 5, 'retrato'],
              ].map(([label, ratio, sub]) => {
                const target = ratioCrop(ratio)
                const active =
                  !!item.cropEnabled &&
                  Math.abs(item.cropW - target.cropW) < 0.01 &&
                  Math.abs(item.cropH - target.cropH) < 0.01
                return (
                  <QuickBtn
                    key={label}
                    Icon={Film}
                    label={label}
                    sub={sub}
                    active={active}
                    onClick={() => apply({ ...target, cropEnabled: true })}
                  />
                )
              })}
            </div>

            {!isColor && (
              <div className="cc-toggle-line" style={{ marginTop: 10 }}>
                <span>Fundo desfocado (preenche as bordas)</span>
                <button
                  className={`cc-switch ${item.blurFill ? 'on' : ''}`}
                  onClick={() => apply({ blurFill: !item.blurFill })}
                />
              </div>
            )}
          </>
        )}

        {isOverlay && (
          <>
            <h3 className="cc-sec-title">Tamanho da camada</h3>
            <div className="cc-quick-grid">
              <QuickBtn Icon={Maximize} label="Aumentar" sub="tamanho maior" onClick={() => apply({ width: clamp((item.width || 0.3) + 0.05, 0.1, 1) })} />
              <QuickBtn Icon={Minimize} label="Diminuir" sub="tamanho menor" onClick={() => apply({ width: clamp((item.width || 0.3) - 0.05, 0.1, 1) })} />
              <QuickBtn Icon={RotateCcw} label="Voltar ao tamanho" sub="padrão 32%" onClick={() => apply({ width: 0.32 })} />
              <QuickBtn Icon={Circle} label="Formato circular" sub="webcam redonda" active={(item.borderRadius || 0) >= 500} onClick={() => apply({ borderRadius: (item.borderRadius || 0) >= 500 ? 16 : 999 })} />
            </div>
          </>
        )}

        <h3 className="cc-sec-title">Tamanho e rotação</h3>
        <div className="cc-quick-grid">
          <QuickBtn Icon={Maximize} label="Aumentar" sub="zoom do clipe" onClick={() => apply({ scale: clamp((item.scale || 1) + 0.15, 0.3, 3) })} />
          <QuickBtn Icon={Minimize} label="Diminuir" sub="zoom do clipe" onClick={() => apply({ scale: clamp((item.scale || 1) - 0.15, 0.3, 3) })} />
          <QuickBtn Icon={RotateCcw} label="Tamanho original" sub="zoom 1×" onClick={() => apply({ scale: 1 })} />
          <QuickBtn Icon={RotateCw} label="Rotacionar 90°" sub="gira o clipe" onClick={() => apply({ rotation: ((item.rotation || 0) + 90) % 360 })} />
        </div>

        <h3 className="cc-sec-title">Movimento de câmera</h3>
        <div className="cc-field" style={{ marginBottom: 12 }}>
          <label>Efeito suave em fotos e vídeos</label>
          <select
            className="cc-select"
            value={item.motion || 'none'}
            onChange={(e) => apply({ motion: e.target.value })}
          >
            <option value="none">Sem movimento</option>
            <option value="zoom-in">Câmera se aproximando</option>
            <option value="zoom-out">Câmera se afastando</option>
            <option value="pan-right">Panorâmica para a direita</option>
            <option value="pan-left">Panorâmica para a esquerda</option>
          </select>
        </div>

        {isVideo && isMain && (
          <>
            <h3 className="cc-sec-title">Duração e corte</h3>
            <div className="cc-quick-grid">
              <QuickBtn Icon={Scissors} label="Início aqui" sub="corta onde está a agulha" disabled={!playheadReady} onClick={trimToStart} />
              <QuickBtn Icon={Scissors} label="Fim aqui" sub="corta onde está a agulha" disabled={!playheadReady} onClick={trimToEnd} />
            </div>
            <p className="cc-panel-hint" style={{ marginTop: 8 }}>
              Movimente a agulha (espaço para reproduzir) e depois clique. Duração atual: <b>{fmt(clipDur(item))}</b>
            </p>

            <h3 className="cc-sec-title">Ritmo</h3>
            <div className="cc-quick-grid">
              <QuickBtn Icon={Gauge} label="Mais lento" sub="0,5×" active={Math.abs((item.speed || 1) - 0.5) < 0.02} onClick={() => apply({ speed: 0.5 })} />
              <QuickBtn Icon={Gauge} label="Normal" sub="1×" active={Math.abs((item.speed || 1) - 1) < 0.02} onClick={() => apply({ speed: 1 })} />
              <QuickBtn Icon={Gauge} label="Mais rápido" sub="2×" active={Math.abs((item.speed || 1) - 2) < 0.02} onClick={() => apply({ speed: 2 })} />
              <QuickBtn Icon={Scissors} label="Fade de entrada" sub="aparece suave" onClick={() => apply({ fadeIn: 0.5 })} />
              <QuickBtn Icon={Scissors} label="Fade de saída" sub="desaparece suave" onClick={() => apply({ fadeOut: 0.5 })} />
              <QuickBtn Icon={RotateCcw} label="Remover fades" sub="entrada e saída" onClick={() => apply({ fadeIn: 0, fadeOut: 0 })} />
            </div>
          </>
        )}

        {(item.kind === 'image' || isColor) && isMain && (
          <>
            <h3 className="cc-sec-title">Tempo na tela</h3>
            <div className="cc-quick-grid">
              <QuickBtn Icon={Clock} label="Mais curto" sub="-1 segundo" onClick={() => apply({ trimEnd: clamp((item.trimEnd || 4) - 1, 0.5, item.sourceDuration || 30) })} />
              <QuickBtn Icon={Clock} label="Mais longo" sub="+1 segundo" onClick={() => apply({ trimEnd: clamp((item.trimEnd || 4) + 1, 0.5, item.sourceDuration || 30) })} />
              {[2, 4, 6, 10].map((s) => (
                <QuickBtn
                  key={s}
                  Icon={Clock}
                  label={`${s}s`}
                  sub="duração fixa"
                  active={Math.abs((item.trimEnd || 0) - s) < 0.1}
                  onClick={() => apply({ trimStart: 0, trimEnd: s })}
                />
              ))}
            </div>
          </>
        )}
      </>
    )
  }

  // ==================== TEXTO ====================
  if (isText) {
    return (
      <>
        <div className="cc-quick-note">
          🎯 Basta clicar: o texto muda no palco na hora. Se não gostar, use <b> Ctrl+Z</b>.
        </div>

        <h3 className="cc-sec-title" style={{ marginTop: 12 }}>Tamanho</h3>
        <div className="cc-quick-grid">
          {TEXT_SIZES.map((s) => (
            <QuickBtn
              key={s.value}
              Icon={Type}
              label={s.label}
              sub={`${s.value}px`}
              active={Math.abs((item.fontSize || 44) - s.value) < 4}
              onClick={() => apply({ fontSize: s.value })}
            />
          ))}
        </div>

        <h3 className="cc-sec-title">Estilo</h3>
        <div className="cc-quick-grid">
          <QuickBtn Icon={Bold} label="Negrito" active={(item.fontWeight || 0) >= 700} onClick={() => apply({ fontWeight: (item.fontWeight || 0) >= 700 ? 500 : 800 })} />
          <QuickBtn Icon={Italic} label="Itálico" active={!!item.italic} onClick={() => apply({ italic: !item.italic })} />
          <QuickBtn Icon={Type} label="Maiúsculas" active={!!item.uppercase} onClick={() => apply({ uppercase: !item.uppercase })} />
        </div>

        <h3 className="cc-sec-title">Posição</h3>
        <div className="cc-seg" style={{ marginBottom: 12 }}>
          <button className={(item.align || 'center') === 'left' ? 'active' : ''} onClick={() => apply({ align: 'left' })}>
            <AlignLeft size={14} /> Esquerda
          </button>
          <button className={(item.align || 'center') === 'center' ? 'active' : ''} onClick={() => apply({ align: 'center' })}>
            <AlignCenter size={14} /> Centro
          </button>
          <button className={(item.align || 'center') === 'right' ? 'active' : ''} onClick={() => apply({ align: 'right' })}>
            <AlignRight size={14} /> Direita
          </button>
        </div>

        <h3 className="cc-sec-title">Cor do texto</h3>
        <div className="cc-quick-colors">
          {TEXT_COLORS.map((c) => (
            <button
              key={c.value}
              className={`cc-quick-color ${(item.color || '#ffffff') === c.value ? 'active' : ''}`}
              style={{ background: c.value }}
              title={c.label}
              onClick={() => apply({ color: c.value })}
            />
          ))}
        </div>

        <h3 className="cc-sec-title">Caixa de fundo</h3>
        <div className="cc-toggle-line">
          <span>Mostrar caixa por trás do texto</span>
          <button
            className={`cc-switch ${item.bgEnabled ? 'on' : ''}`}
            onClick={() => apply({ bgEnabled: !item.bgEnabled })}
          />
        </div>
        {item.bgEnabled && (
          <div className="cc-quick-colors" style={{ marginTop: 10 }}>
            {[
              { value: '#0f172a', label: 'Escura' },
              { value: '#ffffff', label: 'Clara' },
              { value: '#7c3aed', label: 'Roxa' },
              { value: '#0d9488', label: 'Verde' },
            ].map((c) => (
              <button
                key={c.value}
                className={`cc-quick-color ${(item.bgColor || '#000000') === c.value ? 'active' : ''}`}
                style={{ background: c.value }}
                title={c.label}
                onClick={() => apply({ bgColor: c.value })}
              />
            ))}
          </div>
        )}

        <h3 className="cc-sec-title">Contorno</h3>
        <div className="cc-quick-grid">
          <QuickBtn Icon={Scissors} label="Contorno ligado" active={(item.strokeWidth || 0) > 0} onClick={() => apply({ strokeWidth: (item.strokeWidth || 0) > 0 ? 0 : 4 })} />
          <QuickBtn Icon={Sparkles} label="Contorno largo" sub="mais visível" onClick={() => apply({ strokeWidth: 6 })} />
          <QuickBtn Icon={RotateCcw} label="Sem contorno" sub="limpo" onClick={() => apply({ strokeWidth: 0 })} />
        </div>

        <h3 className="cc-sec-title">Animação</h3>
        <div className="cc-quick-grid">
          {ANIMATIONS.map((a) => (
            <QuickBtn
              key={a.id}
              Icon={Sparkles}
              label={a.label}
              active={(item.animation || 'none') === a.id}
              onClick={() => apply({ animation: a.id })}
            />
          ))}
        </div>

        <h3 className="cc-sec-title">Duração na tela</h3>
        <div className="cc-quick-grid">
          <QuickBtn Icon={Clock} label="Mais curto" sub="-0,5s" onClick={() => apply({ duration: clamp((item.duration || 3) - 0.5, 0.5, 20) })} />
          <QuickBtn Icon={Clock} label="Mais longo" sub="+0,5s" onClick={() => apply({ duration: clamp((item.duration || 3) + 0.5, 0.5, 20) })} />
          {TEXT_DURATIONS.map((d) => (
            <QuickBtn
              key={d.value}
              Icon={Clock}
              label={d.label}
              active={Math.abs((item.duration || 3) - d.value) < 0.1}
              onClick={() => apply({ duration: d.value })}
            />
          ))}
        </div>
      </>
    )
  }

  // ==================== ÁUDIO ====================
  if (isAudio) {
    const vol = item.muted ? 0 : (item.volume ?? 1)
    const audioSpan = (item.trimEnd - item.trimStart) / (item.speed || 1)
    const tooLong = mainVideoDuration > 0.2 && item.start + audioSpan > mainVideoDuration + 0.1
    return (
      <>
        <div className="cc-quick-note">
          🎧 Ouça o resultado em tempo real. Se não gostar, use <b> Ctrl+Z</b>.
        </div>

        <h3 className="cc-sec-title" style={{ marginTop: 12 }}>Volume</h3>
        <div className="cc-quick-grid">
          <QuickBtn Icon={Volume2} label="Baixo" sub="50%" active={Math.abs(vol - 0.5) < 0.02} onClick={() => { apply({ volume: 0.5, muted: false }); toast('🔉 Volume baixo') }} />
          <QuickBtn Icon={Volume2} label="Médio" sub="100%" active={Math.abs(vol - 1) < 0.02} onClick={() => { apply({ volume: 1, muted: false }); toast('🔊 Volume normal') }} />
          <QuickBtn Icon={Volume2} label="Alto" sub="150%" active={Math.abs(vol - 1.5) < 0.02} onClick={() => { apply({ volume: 1.5, muted: false }); toast('📣 Volume alto') }} />
          <QuickBtn Icon={VolumeX} label="Mudo" sub="silenciar" active={!!item.muted} onClick={() => { apply({ muted: !item.muted }); toast(item.muted ? '🔊 Áudio ativado' : '🔇 Áudio mudo') }} />
        </div>

        <h3 className="cc-sec-title">Entrada e saída suaves</h3>
        <div className="cc-quick-grid">
          <QuickBtn Icon={Sparkles} label="Entrada suave" sub="fade in 1s" active={(item.fadeIn || 0) >= 1} onClick={() => { apply({ fadeIn: 1 }); toast('🌅 Entrada suave') }} />
          <QuickBtn Icon={Sparkles} label="Saída suave" sub="fade out 1s" active={(item.fadeOut || 0) >= 1} onClick={() => { apply({ fadeOut: 1 }); toast('🌆 Saída suave') }} />
          <QuickBtn Icon={RotateCcw} label="Remover fades" sub="entrada e saída" onClick={() => { apply({ fadeIn: 0, fadeOut: 0 }); toast('♻️ Fases removidas') }} />
        </div>

        <h3 className="cc-sec-title">Ritmo</h3>
        <div className="cc-quick-grid">
          <QuickBtn Icon={Gauge} label="Mais lento" sub="0,75×" active={Math.abs((item.speed || 1) - 0.75) < 0.02} onClick={() => apply({ speed: 0.75 })} />
          <QuickBtn Icon={Gauge} label="Normal" sub="1×" active={Math.abs((item.speed || 1) - 1) < 0.02} onClick={() => apply({ speed: 1 })} />
          <QuickBtn Icon={Gauge} label="Mais rápido" sub="1,5×" active={Math.abs((item.speed || 1) - 1.5) < 0.02} onClick={() => apply({ speed: 1.5 })} />
        </div>

        {mainVideoDuration > 0.2 && (
          <>
            <h3 className="cc-sec-title">Cortes</h3>
            <div className="cc-quick-grid">
              {tooLong && (
                <QuickBtn
                  Icon={Scissors}
                  label="Cortar no fim do vídeo"
                  sub={fmt(mainVideoDuration)}
                  onClick={() => {
                    const maxAllowed = Math.max(0.2, mainVideoDuration - item.start)
                    apply({
                      trimEnd: item.trimStart + maxAllowed * (item.speed || 1),
                      fadeOut: Math.min(1.5, maxAllowed * 0.3),
                    })
                    toast('✂ Áudio cortado no fim do vídeo')
                  }}
                />
              )}
              <QuickBtn
                Icon={Scissors}
                label="Início aqui"
                sub="usa a agulha"
                disabled={!playheadReady}
                onClick={trimToStart}
              />
              <QuickBtn
                Icon={Scissors}
                label="Fim aqui"
                sub="usa a agulha"
                disabled={!playheadReady}
                onClick={trimToEnd}
              />
              <QuickBtn Icon={Clock} label="Duração atual" sub={fmt(audioSpan)} onClick={() => toast(`Duração: ${fmt(audioSpan)}`)} />
            </div>
          </>
        )}
      </>
    )
  }

  return null
}
