import {
  DEFAULT_FILTERS,
  FILTER_PRESETS,
  TEXT_PRESETS,
  COLOR_BACKGROUNDS,
} from '../constants/presets.js'
import {
  uid,
  clamp,
  clipDur,
  overlayDur,
  audioDur,
  fmt,
  generateColorCardThumb,
  synthesizeSfxWav,
  extractAudioPeaks,
} from './media.js'

// Normalize string removing accents for resilient Portuguese matching
function norm(str = '') {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

// Extract quoted text or text after trigger words like "escrito", "com titulo", "dizendo"
function extractCustomLabel(rawText) {
  if (!rawText) return null
  const quoted =
    rawText.match(/"([^"]+)"/) ||
    rawText.match(/'([^']+)'/) ||
    rawText.match(/“([^”]+)”/)
  if (quoted && quoted[1]?.trim()) return quoted[1].trim()

  const afterKeyword = rawText.match(
    /(?:escrito|escrevendo|escreva|com\s+o?\s*t[ií]tulo|chamado|chamada|dizendo|texto|legenda)\s*[:=-]?\s*([^,.;!?\n]+?)(?=\s+(?:e\s+adicion|e\s+coloc|e\s+aplic|e\s+mud|e\s+deix|no\s+come[cç]o|no\s+final|com\s+efeito|com\s+filtro|com\s+m[uú]sica)|$)/i
  )
  if (afterKeyword && afterKeyword[1]?.trim()) {
    const cleaned = afterKeyword[1].trim().replace(/^["']|["']$/g, '')
    if (cleaned.length >= 2 && cleaned.length <= 70) return cleaned
  }
  return null
}

// Pick a background style based on color/mood keywords in prompt
function pickBackgroundByMood(nText, fallbackIndex = 0) {
  if (/oceano|azul|frio|tech|cyber|agua/.test(nText)) return COLOR_BACKGROUNDS[1]
  if (/por do sol|laranja|quente|fogo|verao/.test(nText)) return COLOR_BACKGROUNDS[2]
  if (/verde|natureza|floresta/.test(nText)) return COLOR_BACKGROUNDS[3]
  if (/noite|escuro|dark|cinema/.test(nText)) return COLOR_BACKGROUNDS[4]
  if (/ouro|dourad|amarel|sol|energia/.test(nText)) return COLOR_BACKGROUNDS[5]
  if (/rosa|pink|doce/.test(nText)) return COLOR_BACKGROUNDS[6]
  if (/preto|black/.test(nText)) return COLOR_BACKGROUNDS[7]
  if (/branco|clean|minimal/.test(nText)) return COLOR_BACKGROUNDS[8]
  if (/vermelh/.test(nText)) return COLOR_BACKGROUNDS[10]
  return COLOR_BACKGROUNDS[fallbackIndex % COLOR_BACKGROUNDS.length]
}

// Parse seconds from expressions like "3 segundos", "4.5s", "0:12", "1 min"
function parseSeconds(nText, pattern) {
  const m = nText.match(pattern)
  if (!m) return null
  if (m[2] !== undefined && nText.includes(':')) {
    return parseInt(m[1], 10) * 60 + parseFloat(m[2])
  }
  const val = parseFloat((m[1] || '').replace(',', '.'))
  if (!isFinite(val)) return null
  if (m[2] && /min/.test(m[2])) return val * 60
  return val
}

function makeColorClip(bgDef, duration = 3.2, extra = {}) {
  const thumb = generateColorCardThumb(bgDef)
  return {
    id: uid(),
    mediaId: uid(),
    kind: 'color',
    name: extra.name || bgDef.name,
    url: '',
    file: null,
    sourceDuration: 300,
    thumb,
    filmstrip: [thumb],
    peaks: [],
    videoW: 1280,
    videoH: 720,
    colorStyle: bgDef,
    trimStart: 0,
    trimEnd: duration,
    speed: 1,
    volume: 1,
    muted: true,
    audioFadeIn: 0,
    audioFadeOut: 0,
    fitMode: 'contain',
    blurFill: false,
    scale: 1,
    posX: 0,
    posY: 0,
    rotation: 0,
    flipH: false,
    flipV: false,
    borderRadius: 0,
    cropEnabled: false,
    cropX: 0,
    cropY: 0,
    cropW: 1,
    cropH: 1,
    preset: 'original',
    ...DEFAULT_FILTERS,
    fadeIn: 0,
    fadeOut: 0,
    transition: { type: 'none', duration: 0.6 },
    motion: 'zoom-in',
    ...extra,
  }
}

async function makeSynthesizedAudioClip(kind, name, duration, start = 0, volume = 0.6) {
  const blob = synthesizeSfxWav(kind, duration)
  const url = URL.createObjectURL(blob)
  const peakInfo = await extractAudioPeaks(blob, 90)
  return {
    id: uid(),
    mediaId: uid(),
    name,
    url,
    file: blob,
    sourceDuration: duration,
    peaks: peakInfo.peaks,
    start: Math.max(0, start),
    trimStart: 0,
    trimEnd: duration,
    speed: 1,
    volume,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  }
}

function calcMainDuration(clips) {
  return clips.reduce((acc, c) => acc + clipDur(c), 0)
}

export const QUICK_AI_RECIPES = [
  {
    id: 'cover',
    icon: '🖼️',
    label: 'Colocar Capa',
    desc: 'Cria uma capa estilizada no início',
    prompt: 'Coloque uma capa estilizada no início do vídeo',
  },
  {
    id: 'intro',
    icon: '🎬',
    label: 'Criar Introdução',
    desc: 'Abertura animada com título e som',
    prompt: 'Adicione uma introdução animada com título e efeito sonoro',
  },
  {
    id: 'outro',
    icon: '🏁',
    label: 'Tela Final',
    desc: 'Encerramento pedindo like e inscrição',
    prompt: 'Adicione uma tela final de encerramento pedindo like e inscrição',
  },
  {
    id: 'reels',
    icon: '📱',
    label: 'Adaptar p/ Reels',
    desc: 'Vertical 9:16 + fundo desfocado',
    prompt: 'Transforme em formato vertical 9:16 para Reels com fundo desfocado',
  },
  {
    id: 'trim-edges',
    icon: '✂️',
    label: 'Limpar Pontas',
    desc: 'Corta 1s do início e 1s do final',
    prompt: 'Corte 1 segundo do início e 1 segundo do final do clipe',
  },
  {
    id: 'cinema',
    icon: '🎨',
    label: 'Visual Cinema',
    desc: 'Filtro cinema + vinheta + transições',
    prompt: 'Aplique filtro de cinema, vinheta suave e transições dissolver em tudo',
  },
  {
    id: 'music',
    icon: '🎵',
    label: 'Música de Fundo',
    desc: 'Trilha suave mixada no tamanho certo',
    prompt: 'Coloque uma música de fundo lo-fi suave ajustada ao vídeo',
  },
  {
    id: 'magic',
    icon: '🪄',
    label: 'Edição Mágica',
    desc: 'Produção completa em 1 clique',
    prompt: 'Faça uma edição automática completa deixando o vídeo incrível',
  },
]

/**
 * Executes a natural-language user request against the current Filmuse project state.
 * Returns { nextProject, actions, reply, seekTime, nextSelection, offerCoverDownload, suggestions }
 */
export async function runAiEditorAssistant({
  prompt,
  project,
  projectName,
  currentTime,
  selection,
}) {
  const raw = (prompt || '').trim()
  const n = norm(raw)

  // Clone mutable copies of project arrays
  let next = {
    ...project,
    clips: project.clips.map((c) => ({ ...c, transition: c.transition ? { ...c.transition } : { type: 'none', duration: 0.6 } })),
    overlays: project.overlays.map((o) => ({ ...o })),
    texts: project.texts.map((t) => ({ ...t })),
    audios: project.audios.map((a) => ({ ...a })),
  }

  const actions = []
  let seekTime = null
  let nextSelection = selection
  let offerCoverDownload = false
  let consumedLabel = false

  const customLabel = extractCustomLabel(raw)
  const cleanProjectTitle =
    projectName && norm(projectName) !== 'meu projeto' && norm(projectName) !== 'meu video'
      ? projectName.trim()
      : null

  // Resolve target main clip (selected main clip, or clip under playhead, or first clip)
  const getTargetMainIndex = () => {
    if (selection?.track === 'main') {
      const idx = next.clips.findIndex((c) => c.id === selection.id)
      if (idx >= 0) return idx
    }
    let acc = 0
    for (let i = 0; i < next.clips.length; i++) {
      const d = clipDur(next.clips[i])
      if (currentTime <= acc + d || i === next.clips.length - 1) return i
      acc += d
    }
    return next.clips.length ? 0 : -1
  }

  // =========================================================================
  // 0) FULL AUTO-EDIT / MAGIC COMPOSE ("edição automática", "deixe incrível")
  // =========================================================================
  const isMagicAuto =
    /edicao automatica|edicao magica|edite meu video|edita pra mim|deixe o video incrivel|deixa bonito|piloto automatico|auto ?edit|produz(?:ir|a) tudo/.test(n)

  if (isMagicAuto) {
    if (next.clips.length === 0) {
      const bg1 = COLOR_BACKGROUNDS[0]
      const bg2 = COLOR_BACKGROUNDS[1]
      const bg3 = COLOR_BACKGROUNDS[2]
      const c1 = makeColorClip(bg1, 3.0, { name: 'Cena 1 · Abertura', fadeIn: 0.5, motion: 'zoom-in' })
      const c2 = makeColorClip(bg2, 3.4, { name: 'Cena 2 · Destaque', motion: 'pan-right', transition: { type: 'slide-left', duration: 0.6 } })
      const c3 = makeColorClip(bg3, 3.2, { name: 'Cena 3 · Fechamento', fadeOut: 0.6, motion: 'zoom-out', transition: { type: 'crossfade', duration: 0.7 } })
      next.clips = [c1, c2, c3]
      actions.push('Storyboard de 3 cenas criado automaticamente')
    } else {
      // Apply Cinema color grade + gentle fades + crossfade transitions
      const cinemaPreset = FILTER_PRESETS.find((p) => p.id === 'cinema')
      next.clips = next.clips.map((c, idx) => ({
        ...c,
        ...(cinemaPreset ? cinemaPreset.f : {}),
        preset: 'cinema',
        blurFill: next.aspect === '9:16' ? true : c.blurFill,
        motion: c.kind === 'image' && (!c.motion || c.motion === 'none') ? 'zoom-in' : c.motion,
        fadeIn: idx === 0 ? Math.max(c.fadeIn || 0, 0.5) : c.fadeIn,
        fadeOut: idx === next.clips.length - 1 ? Math.max(c.fadeOut || 0, 0.6) : c.fadeOut,
        transition:
          idx > 0 && (!c.transition || c.transition.type === 'none')
            ? { type: 'crossfade', duration: 0.6 }
            : c.transition,
      }))
      actions.push('Filtro Cinema + Fades aplicados nos clipes')
      if (next.clips.length > 1) {
        actions.push('Transições Dissolver (0.6s) adicionadas entre cortes')
      }
    }

    // Add opening hook title if none near 0s
    const hasOpeningTitle = next.texts.some((t) => (t.start || 0) < 1.5)
    if (!hasOpeningTitle) {
      const hookTitle = {
        id: uid(),
        name: 'Título de Abertura',
        start: 0.25,
        duration: Math.min(2.8, Math.max(1.8, calcMainDuration(next.clips) * 0.45)),
        align: 'center',
        opacity: 1,
        ...TEXT_PRESETS[2].props,
        text: (customLabel || cleanProjectTitle || 'DESTAQUE DO DIA').toUpperCase(),
        y: 0.18,
      }
      next.texts.push(hookTitle)
      nextSelection = { track: 'text', id: hookTitle.id }
      actions.push(`Título de destaque "${hookTitle.text}" inserido`)
    }

    // Add background ambient track if no audio track exists yet
    if (next.audios.length === 0) {
      const dur = clamp(calcMainDuration(next.clips), 2, 24)
      const bgTrack = await makeSynthesizedAudioClip('lofi-loop', 'Trilha IA · Chill Synth', dur, 0, 0.35)
      bgTrack.fadeIn = 0.5
      bgTrack.fadeOut = Math.min(1.4, dur * 0.25)
      next.audios.push(bgTrack)
      actions.push('Trilha sonora ambiente mixada em 35% com fade')
    }

    seekTime = 0.5
    return {
      nextProject: next,
      actions,
      seekTime,
      nextSelection,
      offerCoverDownload: false,
      reply:
        'Prontinho! Fiz uma produção completa: ajustei as cores com estética de cinema, suavizei entradas/transições, adicionei um título de impacto e mixei uma trilha ambiente suave.',
      suggestions: [
        'Coloque uma capa no início',
        'Transforme em formato Reels 9:16',
        'Adicione uma tela final',
      ],
    }
  }

  // =========================================================================
  // 1) TEMPORAL TRIM & SPLIT ("cortar início", "cortar últimos Xs", "dividir")
  // =========================================================================
  const trimBothMatch = n.match(
    /(?:cort\w*|tir\w*|remov\w*)\s+(\d+(?:[.,]\d+)?)\s*(?:s|seg\w*)\s+do\s+(?:inicio|comeco)\s+e\s+(\d+(?:[.,]\d+)?)\s*(?:s|seg\w*)\s+do\s+(?:fim|final)/
  )
  if (trimBothMatch && next.clips.length > 0) {
    const cutStart = parseFloat(trimBothMatch[1].replace(',', '.'))
    const cutEnd = parseFloat(trimBothMatch[2].replace(',', '.'))
    const idx = getTargetMainIndex()
    if (idx >= 0) {
      const c = next.clips[idx]
      const sp = c.speed || 1
      const newStart = clamp(c.trimStart + cutStart * sp, 0, c.trimEnd - 0.3)
      const newEnd = clamp(c.trimEnd - cutEnd * sp, newStart + 0.25, c.sourceDuration || c.trimEnd)
      next.clips[idx] = { ...c, trimStart: newStart, trimEnd: newEnd }
      nextSelection = { track: 'main', id: c.id }
      actions.push(`Cortado ${cutStart}s do início e ${cutEnd}s do fim de "${c.name}"`)
    }
  } else {
    // Range trim: "corte de 2s até 8s" / "entre 1s e 6s"
    const rangeMatch = n.match(
      /(?:cort\w*|recort\w*|deix\w*(?:\s+so)?)\s+(?:de|do\s+segundo|entre)\s+(\d+(?:[.,]\d+)?)\s*(?:s|seg\w*)?\s+(?:ate|ao?|e)\s+(\d+(?:[.,]\d+)?)\s*(?:s|seg\w*)?/
    )
    if (rangeMatch && next.clips.length > 0) {
      const tA = parseFloat(rangeMatch[1].replace(',', '.'))
      const tB = parseFloat(rangeMatch[2].replace(',', '.'))
      if (tB > tA + 0.2) {
        const idx = getTargetMainIndex()
        const c = next.clips[idx]
        const maxD = c.sourceDuration || c.trimEnd
        const ns = clamp(tA, 0, Math.max(0, maxD - 0.3))
        const ne = clamp(tB, ns + 0.25, maxD)
        next.clips[idx] = { ...c, trimStart: ns, trimEnd: ne }
        nextSelection = { track: 'main', id: c.id }
        seekTime = 0
        actions.push(`Clipe recortado do trecho ${fmt(ns)} até ${fmt(ne)}`)
      }
    } else {
      // Trim beginning: "corte os primeiros 3 segundos" / "tira 2s do começo"
      const startCutSec =
        parseSeconds(n, /(?:primeiros?|inicio\s+de)\s+(\d+(?:[.,]\d+)?)\s*(s|seg\w*|min\w*)?/) ??
        parseSeconds(n, /(?:cort\w*|tir\w*|remov\w*)\s+(\d+(?:[.,]\d+)?)\s*(s|seg\w*|min\w*)\s+(?:do\s+)?(?:inicio|comeco)/)
      if (startCutSec !== null && startCutSec > 0 && next.clips.length > 0) {
        const idx = /primeiro clipe|inicio do video/.test(n) ? 0 : getTargetMainIndex()
        const c = next.clips[idx]
        const sp = c.speed || 1
        const ns = clamp(c.trimStart + startCutSec * sp, 0, c.trimEnd - 0.25)
        next.clips[idx] = { ...c, trimStart: ns }
        nextSelection = { track: 'main', id: c.id }
        actions.push(`Removidos ${startCutSec}s iniciais de "${c.name}"`)
      }

      // Trim end: "corte os últimos 4 segundos" / "tira 3s do final"
      const endCutSec =
        parseSeconds(n, /(?:ultimos?)\s+(\d+(?:[.,]\d+)?)\s*(s|seg\w*|min\w*)?/) ??
        parseSeconds(n, /(?:cort\w*|tir\w*|remov\w*)\s+(\d+(?:[.,]\d+)?)\s*(s|seg\w*|min\w*)\s+(?:do\s+)?(?:fim|final)/)
      if (endCutSec !== null && endCutSec > 0 && next.clips.length > 0) {
        const idx = /ultimo clipe|final do video/.test(n) ? next.clips.length - 1 : getTargetMainIndex()
        const c = next.clips[idx]
        const sp = c.speed || 1
        const ne = clamp(c.trimEnd - endCutSec * sp, c.trimStart + 0.25, c.sourceDuration || c.trimEnd)
        next.clips[idx] = { ...c, trimEnd: ne }
        nextSelection = { track: 'main', id: c.id }
        actions.push(`Removidos ${endCutSec}s finais de "${c.name}"`)
      }

      // Set exact clip duration: "deixe o clipe com 5 segundos"
      const exactDurSec = parseSeconds(
        n,
        /(?:deix\w*|limit\w*|ajust\w*|reduz\w*)(?:\s+o\s+(?:video|clipe|cartao))?\s+(?:com|para|em)\s+(\d+(?:[.,]\d+)?)\s*(s|seg\w*)/
      )
      if (exactDurSec !== null && exactDurSec >= 0.3 && next.clips.length > 0) {
        const idx = getTargetMainIndex()
        const c = next.clips[idx]
        const maxSrc = c.kind === 'image' || c.kind === 'color' ? 300 : (c.sourceDuration || c.trimEnd)
        const ne = clamp(c.trimStart + exactDurSec * (c.speed || 1), c.trimStart + 0.25, maxSrc)
        next.clips[idx] = { ...c, trimEnd: ne }
        nextSelection = { track: 'main', id: c.id }
        actions.push(`Duração de "${c.name}" ajustada para ${fmt(clipDur(next.clips[idx]))}`)
      }
    }
  }

  // Split clip: "divida ao meio", "divida em partes de 2s", "divida aos 4s", "divida na agulha"
  if (/\b(divid\w*|cort\w+\s+ao\s+meio|cort\w+\s+no\s+meio|fati\w*|separar\s+em\s+partes)\b/.test(n) && next.clips.length > 0) {
    const chunkSec = parseSeconds(n, /(?:partes?|cenas?|cortes?|a\s+cada)\s+(?:de\s+)?(\d+(?:[.,]\d+)?)\s*(s|seg\w*)/)
    if (chunkSec && chunkSec >= 0.5) {
      const idx = getTargetMainIndex()
      const c = next.clips[idx]
      const dur = clipDur(c)
      if (dur > chunkSec + 0.25) {
        const pieces = []
        let curOff = 0
        let partNum = 1
        while (curOff < dur - 0.15 && pieces.length < 20) {
          const segDur = Math.min(chunkSec, dur - curOff)
          const ts = c.trimStart + curOff * (c.speed || 1)
          const te = c.trimStart + (curOff + segDur) * (c.speed || 1)
          pieces.push({
            ...c,
            id: partNum === 1 ? c.id : uid(),
            name: `${c.name.replace(/\s*\(parte.*\)$/i, '')} (parte ${partNum})`,
            trimStart: ts,
            trimEnd: te,
            transition: partNum === 1 ? c.transition : { type: 'none', duration: 0.5 },
          })
          curOff += segDur
          partNum++
        }
        next.clips.splice(idx, 1, ...pieces)
        actions.push(`Clipe fatiado em ${pieces.length} partes de ~${chunkSec}s`)
      }
    } else if (/meio|metade/.test(n) && !/metade\s+(?:esquerda|direita|cima|baixo)/.test(n)) {
      const idx = getTargetMainIndex()
      const c = next.clips[idx]
      const midMedia = (c.trimStart + c.trimEnd) / 2
      if (c.trimEnd - c.trimStart > 0.4) {
        const left = { ...c, trimEnd: midMedia, fadeOut: 0, audioFadeOut: 0 }
        const right = { ...c, id: uid(), trimStart: midMedia, fadeIn: 0, audioFadeIn: 0, transition: { type: 'none', duration: 0.6 } }
        next.clips.splice(idx, 1, left, right)
        nextSelection = { track: 'main', id: right.id }
        actions.push(`Clipe "${c.name}" dividido exatamente ao meio`)
      }
    } else {
      const atSec = parseSeconds(n, /(?:aos?|em)\s+(\d+(?:[.,]\d+)?)\s*(s|seg\w*)/)
      const splitGlobalT = atSec !== null ? atSec : currentTime
      let acc = 0
      for (let i = 0; i < next.clips.length; i++) {
        const c = next.clips[i]
        const dur = clipDur(c)
        if (splitGlobalT > acc + 0.15 && splitGlobalT < acc + dur - 0.15) {
          const off = splitGlobalT - acc
          const splitMedia = c.trimStart + off * (c.speed || 1)
          const left = { ...c, trimEnd: splitMedia, fadeOut: 0, audioFadeOut: 0 }
          const right = { ...c, id: uid(), trimStart: splitMedia, fadeIn: 0, audioFadeIn: 0, transition: { type: 'none', duration: 0.6 } }
          next.clips.splice(i, 1, left, right)
          nextSelection = { track: 'main', id: right.id }
          seekTime = splitGlobalT
          actions.push(`Clipe dividido em ${fmt(splitGlobalT)}`)
          break
        }
        acc += dur
      }
    }
  }

  // =========================================================================
  // 2) ASPECT RATIO, SPATIAL CROP, BLUR FILL & TRANSFORM
  // =========================================================================
  if (/9\s*:\s*16|vertical|reels|tiktok|shorts|stories|story/.test(n)) {
    next.aspect = '9:16'
    next.clips = next.clips.map((c) => (c.kind !== 'color' ? { ...c, blurFill: true } : c))
    actions.push('Formato alterado para 9:16 (Reels/TikTok) com fundo desfocado ativo')
  } else if (/16\s*:\s*9|horizontal|youtube|widescreen/.test(n)) {
    next.aspect = '16:9'
    actions.push('Formato alterado para 16:9 (Widescreen / YouTube)')
  } else if (/1\s*:\s*1|quadrad/.test(n)) {
    next.aspect = '1:1'
    next.clips = next.clips.map((c) => (c.kind !== 'color' ? { ...c, blurFill: true } : c))
    actions.push('Formato alterado para 1:1 (Quadrado)')
  } else if (/4\s*:\s*5|retrato/.test(n)) {
    next.aspect = '4:5'
    next.clips = next.clips.map((c) => (c.kind !== 'color' ? { ...c, blurFill: true } : c))
    actions.push('Formato alterado para 4:5 (Retrato Instagram)')
  } else if (/21\s*:\s*9|ultrawide/.test(n)) {
    next.aspect = '21:9'
    actions.push('Formato alterado para 21:9 (Cinema Ultrawide)')
  }

  if (/fundo desfocado|blur\s*fill|desfocar\s+o?\s*fundo|bordas\s+desfocadas/.test(n) && next.clips.length > 0) {
    const disable = /sem\s+fundo\s+desfocado|tirar\s+fundo\s+desfocado|remover\s+fundo\s+desfocado/.test(n)
    next.clips = next.clips.map((c) => ({ ...c, blurFill: !disable }))
    if (!actions.some((a) => a.includes('fundo desfocado'))) {
      actions.push(disable ? 'Fundo desfocado desativado' : 'Fundo desfocado ativado nos clipes')
    }
  }

  if (/preencher\s+a?\s*tela|tirar\s+bordas\s+pretas|sem\s+bordas\s+pretas|modo\s+cover/.test(n) && next.clips.length > 0) {
    next.clips = next.clips.map((c) => ({ ...c, fitMode: 'cover' }))
    actions.push('Enquadramento ajustado para Preencher Tela')
  } else if (/ajustar\s+a?\s*tela|mostrar\s+inteiro|modo\s+contain/.test(n) && next.clips.length > 0) {
    next.clips = next.clips.map((c) => ({ ...c, fitMode: 'contain' }))
    actions.push('Enquadramento ajustado para Mostrar Inteiro')
  }

  // Spatial Crop regions ("recortar centro", "recortar esquerda", "dar zoom")
  if (next.clips.length > 0) {
    const idx = getTargetMainIndex()
    if (/recort\w*\s+(?:a\s+)?(?:metade\s+)?esquerda|focar\s+na\s+esquerda/.test(n)) {
      next.clips[idx] = { ...next.clips[idx], cropEnabled: true, cropX: 0, cropY: 0, cropW: 0.5, cropH: 1 }
      actions.push('Recorte espacial aplicado na metade esquerda')
    } else if (/recort\w*\s+(?:a\s+)?(?:metade\s+)?direita|focar\s+na\s+direita/.test(n)) {
      next.clips[idx] = { ...next.clips[idx], cropEnabled: true, cropX: 0.5, cropY: 0, cropW: 0.5, cropH: 1 }
      actions.push('Recorte espacial aplicado na metade direita')
    } else if (/recort\w*\s+(?:o\s+)?centro|focar\s+no\s+centro|recorte\s+central/.test(n)) {
      next.clips[idx] = { ...next.clips[idx], cropEnabled: true, cropX: 0.15, cropY: 0.15, cropW: 0.7, cropH: 0.7 }
      actions.push('Recorte central aplicado no quadro')
    } else if (/resetar\s+recorte|remover\s+recorte|tela\s+original/.test(n)) {
      next.clips[idx] = { ...next.clips[idx], cropEnabled: false, cropX: 0, cropY: 0, cropW: 1, cropH: 1, scale: 1 }
      actions.push('Recorte espacial resetado')
    }

    const zoomMatch = n.match(/(?:dar\s+zoom|zoom\s+de|escala(?:\s+de)?)\s*(\d+(?:[.,]\d+)?)\s*x?/)
    if (zoomMatch && !/transic/.test(n)) {
      const zVal = clamp(parseFloat(zoomMatch[1].replace(',', '.')), 0.3, 3)
      next.clips[idx] = { ...next.clips[idx], scale: zVal }
      actions.push(`Zoom do clipe ajustado para ${zVal}×`)
    }

    if (/girar|rotacionar/.test(n)) {
      const deg = /180/.test(n) ? 180 : 90
      next.clips[idx] = { ...next.clips[idx], rotation: ((next.clips[idx].rotation || 0) + deg) % 360 }
      actions.push(`Clipe girado em ${deg}°`)
    }
    if (/espelhar|inverter\s+horizontal/.test(n)) {
      next.clips[idx] = { ...next.clips[idx], flipH: !next.clips[idx].flipH }
      actions.push('Clipe espelhado horizontalmente')
    }
    if (/cantos?\s+arredondad|bordas?\s+arredondad/.test(n)) {
      next.clips[idx] = { ...next.clips[idx], borderRadius: 28 }
      actions.push('Cantos arredondados aplicados (28px)')
    }
  }

  // =========================================================================
  // 3) SPEED ("acelerar", "câmera lenta", "2x", "0.5x")
  // =========================================================================
  if (next.clips.length > 0 && /velocidade|aceler\w*|camera\s+lenta|slow\s*motion|mais\s+rapido|mais\s+devagar|timelapse/.test(n)) {
    const spMatch = n.match(/(\d+(?:[.,]\d+)?)\s*x/)
    let targetSp = 1
    if (spMatch) {
      targetSp = clamp(parseFloat(spMatch[1].replace(',', '.')), 0.25, 4)
    } else if (/camera\s+lenta|slow\s*motion|mais\s+devagar/.test(n)) {
      targetSp = 0.5
    } else if (/timelapse/.test(n)) {
      targetSp = 3
    } else if (/aceler\w*|mais\s+rapido/.test(n)) {
      targetSp = 1.5
    }

    const applyAll = /tudo|todos|video\s+inteiro/.test(n)
    if (applyAll) {
      next.clips = next.clips.map((c) => (c.kind === 'video' ? { ...c, speed: targetSp } : c))
      actions.push(`Velocidade de todos os vídeos ajustada para ${targetSp}×`)
    } else {
      const idx = getTargetMainIndex()
      if (idx >= 0) {
        next.clips[idx] = { ...next.clips[idx], speed: targetSp }
        actions.push(`Velocidade de "${next.clips[idx].name}" ajustada para ${targetSp}×`)
      }
    }
  }

  // =========================================================================
  // 4) FILTERS, COLOR EFFECTS, VIGNETTE & CAMERA MOTION
  // =========================================================================
  if (next.clips.length > 0) {
    const filterMap = [
      [/preto\s+e\s+branco|p&b|pb|escala\s+de\s+cinza|monocromatic/, 'pb'],
      [/cinema|cinematografic|teal/, 'cinema'],
      [/vintage|retro|anos\s+90|filme\s+antigo|vhs/, 'vintage'],
      [/sepia/, 'sepia'],
      [/cyber|neon\s+cyber|futurist/, 'cyber'],
      [/dramatic|intenso|sombrio/, 'dramatico'],
      [/vibrante|cores?\s+vivas?|colorido|pop/, 'vibrante'],
      [/quente|ensolarad|verao|dourad/, 'quente'],
      [/frio|artico|gelad|inverno/, 'frio'],
      [/suave|delicad|sonho|dream/, 'suave'],
      [/desbotad|matte|indie/, 'desbotado'],
      [/sem\s+filtro|remover\s+filtro|resetar\s+(?:cor\w*|filtro\w*|efeito\w*)|cor\s+original/, 'original'],
    ]

    for (const [regex, presetId] of filterMap) {
      // Avoid matching "neon" if the user specifically only said "texto neon"
      if (presetId === 'cyber' && /texto\s+neon|titulo\s+neon/.test(n) && !/filtro|efeito|cor/.test(n)) {
        continue
      }
      if (regex.test(n)) {
        const presetObj = FILTER_PRESETS.find((p) => p.id === presetId)
        if (presetObj) {
          const applySingle = /neste\s+clipe|clipe\s+atual|clipe\s+selecionado/.test(n)
          if (applySingle) {
            const idx = getTargetMainIndex()
            next.clips[idx] = { ...next.clips[idx], ...presetObj.f, preset: presetObj.id }
            actions.push(`Filtro "${presetObj.name}" aplicado em "${next.clips[idx].name}"`)
          } else {
            next.clips = next.clips.map((c) => ({ ...c, ...presetObj.f, preset: presetObj.id }))
            actions.push(`Filtro "${presetObj.name}" aplicado ao vídeo`)
          }
        }
        break
      }
    }

    // Generic "adicionar efeitos" if no specific filter matched yet
    if (
      actions.length === 0 &&
      /(?:adicion\w*|coloc\w*|aplic\w*)\s+(?:uns?\s+)?efeitos?(?:\s+no\s+video)?$/.test(n)
    ) {
      const cinemaObj = FILTER_PRESETS.find((p) => p.id === 'cinema')
      next.clips = next.clips.map((c, idx) => ({
        ...c,
        ...(cinemaObj ? cinemaObj.f : {}),
        preset: 'cinema',
        motion: c.motion === 'none' ? 'zoom-in' : c.motion,
        transition: idx > 0 ? { type: 'crossfade', duration: 0.6 } : c.transition,
      }))
      actions.push('Pacote de efeitos aplicado (Filtro Cinema + Movimento Suave + Transições)')
    }

    // Fine tweaks: vinheta, brilho, contraste, saturação, desfoque
    if (/vinheta|bordas?\s+escuras?/.test(n)) {
      const vVal = /forte|intensa/.test(n) ? 0.7 : /suave|leve/.test(n) ? 0.35 : 0.5
      next.clips = next.clips.map((c) => ({ ...c, vignette: vVal }))
      actions.push(`Vinheta (${Math.round(vVal * 100)}%) adicionada`)
    }
    if (/mais\s+brilho|aumentar\s+o?\s*brilho|deixar\s+mais\s+claro|clarear\s+o?\s*video/.test(n)) {
      next.clips = next.clips.map((c) => ({ ...c, brightness: clamp((c.brightness ?? 1) + 0.16, 0.4, 1.6), preset: 'custom' }))
      actions.push('Brilho aumentado (+16%)')
    } else if (/menos\s+brilho|diminuir\s+o?\s*brilho|deixar\s+mais\s+escuro/.test(n)) {
      next.clips = next.clips.map((c) => ({ ...c, brightness: clamp((c.brightness ?? 1) - 0.16, 0.4, 1.6), preset: 'custom' }))
      actions.push('Brilho reduzido (-16%)')
    }
    if (/mais\s+contraste|aumentar\s+o?\s*contraste/.test(n)) {
      next.clips = next.clips.map((c) => ({ ...c, contrast: clamp((c.contrast ?? 1) + 0.2, 0.4, 1.8), preset: 'custom' }))
      actions.push('Contraste realçado (+20%)')
    }
    if (/mais\s+saturacao|aumentar\s+saturacao/.test(n)) {
      next.clips = next.clips.map((c) => ({ ...c, saturate: clamp((c.saturate ?? 1) + 0.3, 0, 2.2), preset: 'custom' }))
      actions.push('Saturação de cores intensificada')
    }

    // Camera Motion (Ken Burns)
    if (/ken\s*burns|movimento\s+de\s+camera|zoom\s+lento|aproximar\s+devagar/.test(n)) {
      next.clips = next.clips.map((c) => ({ ...c, motion: 'zoom-in' }))
      actions.push('Movimento de câmera (Zoom In suave) ativado')
    } else if (/afastar\s+devagar|zoom\s+out/.test(n)) {
      next.clips = next.clips.map((c) => ({ ...c, motion: 'zoom-out' }))
      actions.push('Movimento de câmera (Zoom Out suave) ativado')
    } else if (/panoramica/.test(n)) {
      next.clips = next.clips.map((c) => ({ ...c, motion: 'pan-right' }))
      actions.push('Movimento panorâmico horizontal ativado')
    }
  }

  // =========================================================================
  // 5) TRANSITIONS & FADES
  // =========================================================================
  if (/transic\w*|dissolver|crossfade|cortina|wipe/.test(n) && next.clips.length > 0) {
    let trType = 'crossfade'
    if (/sem\s+transic|remover\s+transic|tirar\s+transic/.test(n)) trType = 'none'
    else if (/zoom/.test(n)) trType = 'zoom'
    else if (/deslizar\s+dir|slide\s+right/.test(n)) trType = 'slide-right'
    else if (/deslizar|slide/.test(n)) trType = 'slide-left'
    else if (/branco|flash/.test(n)) trType = 'fade-white'
    else if (/escurecer|preto/.test(n)) trType = 'fade-black'
    else if (/cortina|wipe/.test(n)) trType = 'wipe'

    const trDur = parseSeconds(n, /(\d+(?:[.,]\d+)?)\s*(s|seg\w*)/) || 0.6

    if (next.clips.length < 2) {
      // If there's only 1 clip, apply smooth visual fade-in & fade-out so the user still gets smooth transitions!
      next.clips[0] = { ...next.clips[0], fadeIn: 0.6, fadeOut: 0.6 }
      actions.push('Fade de entrada e saída aplicado (adicione um 2º clipe para transições entre cortes)')
    } else {
      next.clips = next.clips.map((c, idx) =>
        idx === 0 ? c : { ...c, transition: { type: trType, duration: clamp(trDur, 0.2, 2.0) } }
      )
      actions.push(
        trType === 'none'
          ? 'Transições removidas'
          : `Transição "${trType}" (${clamp(trDur, 0.2, 2.0).toFixed(1)}s) aplicada nos cortes`
      )
    }
  }

  if (/fade\s*in|entrada\s+suave|entrada\s+gradual/.test(n) && next.clips.length > 0) {
    next.clips[0] = { ...next.clips[0], fadeIn: 0.8, audioFadeIn: 0.8 }
    actions.push('Fade In suave adicionado no início')
  }
  if (/fade\s*out|saida\s+suave|saida\s+gradual/.test(n) && next.clips.length > 0) {
    const last = next.clips.length - 1
    next.clips[last] = { ...next.clips[last], fadeOut: 0.9, audioFadeOut: 1.0 }
    actions.push('Fade Out suave adicionado no final')
  }

  // =========================================================================
  // 6) COVER ("colocar uma capa") & INTRO ("colocar uma introdução")
  // =========================================================================
  const wantsCover = /\b(capa|thumbnail|thumb|poster)\b/.test(n)
  const wantsIntro = /\b(intro|introducao|abertura|vinheta\s+de\s+abertura)\b/.test(n)

  if (wantsCover) {
    const coverDur = 2.0
    const bg = pickBackgroundByMood(n, 4) // Midnight Studio default or mood color
    const titleStr = (customLabel || cleanProjectTitle || 'EPISÓDIO EM DESTAQUE').toUpperCase()
    consumedLabel = true

    const coverCard = makeColorClip(bg, coverDur, {
      name: `Capa · ${titleStr.slice(0, 18)}`,
      fadeIn: 0.2,
      motion: 'zoom-in',
      vignette: 0.35,
    })

    // Ripple existing timeline elements forward by coverDur so nothing loses sync
    next.texts = next.texts.map((t) => ({ ...t, start: (t.start || 0) + coverDur }))
    next.overlays = next.overlays.map((o) => ({ ...o, start: (o.start || 0) + coverDur }))
    next.audios = next.audios.map((a) => ({ ...a, start: (a.start || 0) + coverDur }))

    if (next.clips.length > 0) {
      next.clips[0] = {
        ...next.clips[0],
        transition: { type: 'crossfade', duration: 0.5 },
      }
    }
    next.clips = [coverCard, ...next.clips]

    const badgeText = {
      id: uid(),
      name: 'Tag da Capa',
      start: 0.05,
      duration: coverDur - 0.1,
      align: 'center',
      opacity: 1,
      ...TEXT_PRESETS[2].props,
      text: 'NOVO VÍDEO',
      fontSize: 24,
      y: 0.33,
      animation: 'pop',
    }
    const mainCoverTitle = {
      id: uid(),
      name: 'Título da Capa',
      start: 0.05,
      duration: coverDur - 0.1,
      align: 'center',
      opacity: 1,
      ...TEXT_PRESETS[3].props,
      text: titleStr,
      fontSize: 58,
      y: 0.54,
      animation: 'pop',
    }

    next.texts.unshift(badgeText, mainCoverTitle)
    nextSelection = { track: 'text', id: mainCoverTitle.id }
    seekTime = 0.5
    offerCoverDownload = true
    actions.push(`Capa "${titleStr}" (${coverDur.toFixed(1)}s) adicionada em 00:00`)
  } else if (wantsIntro) {
    const introDur = 3.2
    const bg = pickBackgroundByMood(n, 0) // Aurora Violeta default
    const titleStr = (customLabel || cleanProjectTitle || 'BEM-VINDO!').toUpperCase()
    consumedLabel = true

    const introClip = makeColorClip(bg, introDur, {
      name: `Intro · ${titleStr.slice(0, 18)}`,
      fadeIn: 0.45,
      motion: 'zoom-in',
    })

    // Ripple existing timeline elements forward by introDur
    next.texts = next.texts.map((t) => ({ ...t, start: (t.start || 0) + introDur }))
    next.overlays = next.overlays.map((o) => ({ ...o, start: (o.start || 0) + introDur }))
    next.audios = next.audios.map((a) => ({ ...a, start: (a.start || 0) + introDur }))

    if (next.clips.length > 0) {
      next.clips[0] = {
        ...next.clips[0],
        transition: { type: 'slide-left', duration: 0.65 },
      }
    }
    next.clips = [introClip, ...next.clips]

    const headline = {
      id: uid(),
      name: 'Título da Intro',
      start: 0.2,
      duration: introDur - 0.3,
      align: 'center',
      opacity: 1,
      ...TEXT_PRESETS[0].props,
      text: titleStr,
      y: 0.45,
      animation: 'pop',
    }
    const subline = {
      id: uid(),
      name: 'Subtítulo da Intro',
      start: 0.45,
      duration: introDur - 0.55,
      align: 'center',
      opacity: 1,
      ...TEXT_PRESETS[1].props,
      text: 'Assista até o final ✨',
      fontSize: 30,
      y: 0.64,
      animation: 'slide-up',
    }
    next.texts.unshift(headline, subline)

    // Add subtle crystal ding + transition whoosh SFX
    const ding = await makeSynthesizedAudioClip('ding', 'Efeito · Entrada Intro', 0.9, 0.15, 0.65)
    const whoosh = await makeSynthesizedAudioClip('whoosh', 'Transição Whoosh', 0.55, Math.max(0, introDur - 0.4), 0.75)
    next.audios.push(ding, whoosh)

    nextSelection = { track: 'text', id: headline.id }
    seekTime = 0.9
    actions.push(`Introdução animada "${titleStr}" (${introDur.toFixed(1)}s) criada com efeito sonoro`)
  }

  // =========================================================================
  // 7) OUTRO / END SCREEN ("tela final", "encerramento")
  // =========================================================================
  if (/\b(tela\s+final|encerramento|outro|creditos?\s+finais|fechamento)\b/.test(n)) {
    const outroDur = 3.5
    const startAt = calcMainDuration(next.clips)
    const bg = pickBackgroundByMood(n, 2) // Sunset or mood
    const mainMsg =
      !consumedLabel && customLabel
        ? customLabel.toUpperCase()
        : 'OBRIGADO POR ASSISTIR!'
    consumedLabel = true

    const outroClip = makeColorClip(bg, outroDur, {
      name: 'Tela Final (Outro)',
      fadeOut: 0.7,
      motion: 'zoom-out',
      transition: { type: next.clips.length > 0 ? 'crossfade' : 'none', duration: 0.7 },
    })
    next.clips.push(outroClip)

    const endTitle = {
      id: uid(),
      name: 'Título Final',
      start: startAt + 0.25,
      duration: outroDur - 0.35,
      align: 'center',
      opacity: 1,
      ...TEXT_PRESETS[0].props,
      text: mainMsg,
      fontSize: 48,
      y: 0.43,
      animation: 'pop',
    }
    const ctaPill = {
      id: uid(),
      name: 'CTA Like',
      start: startAt + 0.5,
      duration: outroDur - 0.6,
      align: 'center',
      opacity: 1,
      ...TEXT_PRESETS[2].props,
      text: 'CURTA E INSCREVA-SE ❤️',
      fontSize: 32,
      y: 0.64,
      animation: 'slide-up',
    }
    next.texts.push(endTitle, ctaPill)

    const chime = await makeSynthesizedAudioClip('success', 'Acorde Encerramento', 1.2, startAt + 0.2, 0.7)
    next.audios.push(chime)

    nextSelection = { track: 'text', id: endTitle.id }
    seekTime = startAt + 1.0
    actions.push(`Tela final de encerramento (${outroDur.toFixed(1)}s) adicionada no fim`)
  }

  // =========================================================================
  // 8) STANDALONE TEXT, CAPTIONS, LOWER THIRDS & STICKERS
  // =========================================================================
  if (
    !consumedLabel &&
    (/\b(texto|titulo|legenda|escrev\w*|tarja)\b/.test(n) ||
      (customLabel && /\b(coloc\w*|adicion\w*|insir\w*)\b/.test(n)))
  ) {
    const content = customLabel || 'Sua legenda aqui'
    let preset = TEXT_PRESETS[1] // Legenda Social default
    if (/tarja|apresentac/.test(n)) preset = TEXT_PRESETS[4]
    else if (/neon/.test(n)) preset = TEXT_PRESETS[5]
    else if (/amarel|impacto/.test(n)) preset = TEXT_PRESETS[3]
    else if (/maquina\s+de\s+escrever|codigo/.test(n)) preset = TEXT_PRESETS[7]
    else if (/titulo\s+grande|destaque/.test(n)) preset = TEXT_PRESETS[0]

    const mainDur = calcMainDuration(next.clips)
    let startPos = currentTime
    if (/no\s+comeco|no\s+inicio/.test(n)) startPos = 0.2
    else if (/no\s+fim|no\s+final/.test(n) && mainDur > 2.5) startPos = Math.max(0, mainDur - 3.0)
    else {
      const atS = parseSeconds(n, /(?:aos?|em)\s+(\d+(?:[.,]\d+)?)\s*(s|seg\w*)/)
      if (atS !== null) startPos = atS
    }

    let yPos = preset.props.y
    if (/topo|em\s+cima|superior/.test(n)) yPos = 0.15
    else if (/centro|no\s+meio/.test(n)) yPos = 0.5
    else if (/base|embaixo|rodape|inferior/.test(n)) yPos = 0.84

    const newTxt = {
      id: uid(),
      name: preset.name,
      start: Math.max(0, startPos),
      duration: 3.5,
      align: 'center',
      opacity: 1,
      stylePreset: preset.id,
      ...preset.props,
      text: content,
      y: yPos,
    }
    next.texts.push(newTxt)
    nextSelection = { track: 'text', id: newTxt.id }
    seekTime = startPos + 0.3
    actions.push(`Texto "${content}" adicionado em ${fmt(startPos)}`)
  }

  // Emoji / Sticker requests
  if (/\b(emoji|figurinha|adesivo|sticker)\b/.test(n)) {
    let emoji = '🔥'
    if (/coracao|like|amor/.test(n)) emoji = '❤️'
    else if (/foguete/.test(n)) emoji = '🚀'
    else if (/brilho|estrela/.test(n)) emoji = '✨'
    else if (/raio|energia/.test(n)) emoji = '⚡'
    else if (/festa|comemor/.test(n)) emoji = '🎉'
    else if (/ideia|lampada/.test(n)) emoji = '💡'
    else if (/check|ok/.test(n)) emoji = '✅'

    const st = {
      id: uid(),
      name: `Sticker ${emoji}`,
      text: emoji,
      start: currentTime,
      duration: 3.0,
      x: 0.8,
      y: 0.24,
      fontFamily: 'Inter',
      fontSize: 78,
      fontWeight: 800,
      italic: false,
      uppercase: false,
      align: 'center',
      color: '#ffffff',
      bgEnabled: false,
      bgColor: '#000000',
      bgOpacity: 0,
      bgPadding: 8,
      bgRadius: 8,
      strokeWidth: 0,
      strokeColor: '#000000',
      shadow: true,
      opacity: 1,
      animation: 'pop',
    }
    next.texts.push(st)
    nextSelection = { track: 'text', id: st.id }
    actions.push(`Adesivo animado ${emoji} adicionado no palco`)
  }

  // =========================================================================
  // 9) AUDIO, BACKGROUND MUSIC, SFX, VOLUME & DETACH
  // =========================================================================
  if (/\b(musica|trilha\s+sonora|trilha\s+de\s+fundo|lo-?fi|batida)\b/.test(n)) {
    const isUpbeat = /animad|tech|agitad|eletronic|pulso|rapida/.test(n)
    const loopKind = isUpbeat ? 'tech-loop' : 'lofi-loop'
    const loopTitle = isUpbeat ? 'Trilha · Pulso Tech' : 'Trilha · Chill Lo-Fi'
    const projDur = Math.max(4, calcMainDuration(next.clips) || 8)
    const genDur = clamp(projDur, 3, 30)

    const musicClip = await makeSynthesizedAudioClip(loopKind, loopTitle, genDur, 0, 0.4)
    musicClip.fadeIn = 0.5
    musicClip.fadeOut = Math.min(1.5, genDur * 0.25)
    next.audios.push(musicClip)
    nextSelection = { track: 'audio', id: musicClip.id }
    actions.push(`${loopTitle} (${fmt(genDur)}) adicionada como música de fundo`)
  }

  if (/\b(efeito\s+sonoro|sfx|som\s+de\s+(?:impacto|whoosh|transicao|pop|sino|sucesso|suspense))\b/.test(n)) {
    let sfxKind = 'whoosh'
    let sfxName = 'Transição Whoosh'
    let sfxDur = 0.55
    if (/impacto|boom|explos/.test(n)) { sfxKind = 'impact'; sfxName = 'Impacto Cinema'; sfxDur = 1.1 }
    else if (/pop|bolha/.test(n)) { sfxKind = 'pop'; sfxName = 'Pop Suave'; sfxDur = 0.25 }
    else if (/sino|ding|notific/.test(n)) { sfxKind = 'ding'; sfxName = 'Sino Cristal'; sfxDur = 0.9 }
    else if (/sucesso|vitoria/.test(n)) { sfxKind = 'success'; sfxName = 'Acorde Sucesso'; sfxDur = 1.2 }
    else if (/suspense|subida|riser/.test(n)) { sfxKind = 'riser'; sfxName = 'Subida Suspense'; sfxDur = 1.5 }

    const sfxClip = await makeSynthesizedAudioClip(sfxKind, sfxName, sfxDur, currentTime, 0.85)
    next.audios.push(sfxClip)
    nextSelection = { track: 'audio', id: sfxClip.id }
    actions.push(`Efeito sonoro "${sfxName}" inserido em ${fmt(currentTime)}`)
  }

  if (/tirar\s+o?\s*(?:som|audio)|mutar|silenciar|deixar\s+mudo|sem\s+som/.test(n) && next.clips.length > 0) {
    next.clips = next.clips.map((c) => ({ ...c, muted: true }))
    actions.push('Áudio dos clipes de vídeo silenciado')
  } else if (/ativar\s+o?\s*(?:som|audio)|desmutar|ligar\s+o?\s*som/.test(n) && next.clips.length > 0) {
    next.clips = next.clips.map((c) => ({ ...c, muted: false }))
    actions.push('Áudio dos clipes de vídeo reativado')
  }

  if (/volume/.test(n)) {
    const pctMatch = n.match(/(\d+)\s*%/)
    const targetVol = pctMatch
      ? clamp(parseInt(pctMatch[1], 10) / 100, 0, 2)
      : /aumentar|alto|maximo|boost/.test(n)
      ? 1.5
      : /abaixar|diminuir|baixo|suave/.test(n)
      ? 0.35
      : null

    if (targetVol !== null) {
      if (/musica|trilha/.test(n) && next.audios.length > 0) {
        next.audios = next.audios.map((a) => ({ ...a, volume: targetVol, muted: false }))
        actions.push(`Volume da trilha de áudio ajustado para ${Math.round(targetVol * 100)}%`)
      } else if (next.clips.length > 0) {
        next.clips = next.clips.map((c) => ({ ...c, volume: targetVol, muted: false }))
        actions.push(`Volume dos clipes ajustado para ${Math.round(targetVol * 100)}%`)
      }
    }
  }

  if (/separar\s+o?\s*audio|extrair\s+o?\s*audio/.test(n) && next.clips.length > 0) {
    const idx = getTargetMainIndex()
    const target = next.clips[idx]
    if (target && target.kind === 'video') {
      let clipStart = 0
      for (let i = 0; i < idx; i++) clipStart += clipDur(next.clips[i])
      const detached = {
        id: uid(),
        mediaId: target.mediaId,
        name: `Áudio · ${target.name}`,
        url: target.url,
        file: target.file,
        sourceDuration: target.sourceDuration,
        peaks: target.peaks || [],
        start: clipStart,
        trimStart: target.trimStart,
        trimEnd: target.trimEnd,
        speed: target.speed || 1,
        volume: target.volume ?? 1,
        muted: false,
        fadeIn: target.audioFadeIn || 0,
        fadeOut: target.audioFadeOut || 0,
      }
      next.clips[idx] = { ...target, muted: true }
      next.audios.push(detached)
      nextSelection = { track: 'audio', id: detached.id }
      actions.push(`Áudio de "${target.name}" separado para a trilha de áudio`)
    }
  }

  // =========================================================================
  // BUILD HELPFUL CONVERSATIONAL RESPONSE
  // =========================================================================
  if (actions.length === 0) {
    const emptyHint =
      next.clips.length === 0
        ? ' Notei que sua timeline ainda está vazia — você pode importar um vídeo ou me pedir: **"Crie uma introdução"**, **"Coloque uma capa"** ou **"Faça uma edição automática"**!'
        : ''

    return {
      nextProject: null, // no state mutation needed
      actions: [],
      seekTime: null,
      nextSelection: selection,
      offerCoverDownload: false,
      reply:
        `Posso fazer cortes, capas, aberturas, telas finais, filtros, formatos e trilhas para você! Experimente pedir algo como:\n` +
        `• *"Coloque uma capa escrito Meu Vlog"*\n` +
        `• *"Crie uma introdução animada"*\n` +
        `• *"Corte os primeiros 3 segundos"*\n` +
        `• *"Mude para 9:16 Reels com fundo desfocado"*\n` +
        `• *"Aplique efeito de cinema e transições"*` +
        emptyHint,
      suggestions: [
        'Coloque uma capa estilizada',
        'Adicione uma introdução animada',
        'Faça uma edição automática completa',
      ],
    }
  }

  // Contextual smart next suggestions based on what hasn't been done yet
  const suggestions = []
  if (!wantsCover && !wantsIntro) suggestions.push('Coloque uma introdução animada')
  if (next.clips.length >= 2 && next.clips.some((c, i) => i > 0 && (!c.transition || c.transition.type === 'none'))) {
    suggestions.push('Coloque transições suaves entre os cortes')
  }
  if (next.audios.length === 0) suggestions.push('Coloque uma música de fundo suave')
  if (next.aspect !== '9:16') suggestions.push('Transforme em formato Reels 9:16')
  if (!next.clips.some((c) => c.name?.includes('Tela Final'))) suggestions.push('Adicione uma tela final de encerramento')

  const reply =
    actions.length === 1
      ? `Feito! ${actions[0]}. Se quiser ajustar algum detalhe ou desfazer, é só clicar abaixo.`
      : `Pronto! Executei **${actions.length} edições** no seu projeto de uma só vez:`

  return {
    nextProject: next,
    actions,
    seekTime,
    nextSelection,
    offerCoverDownload,
    reply,
    suggestions: suggestions.slice(0, 3),
  }
}

/**
 * Optional external OpenAI-compatible LLM translator:
 * Translates freeform creative user requests into normalized Portuguese assistant commands,
 * then executes them safely through `runAiEditorAssistant`.
 */
export async function runWithOptionalExternalLlm({
  apiKey,
  baseUrl = 'https://api.openai.com/v1',
  model = 'gpt-4o-mini',
  userPrompt,
  projectSummary,
}) {
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`
  const systemPrompt = `Você é o copiloto de edição de vídeo do Filmuse.
Converta o pedido criativo do usuário em comandos diretos de edição em português que nosso motor executa, separados por " e ".
Ações suportadas pelo motor:
- "coloque uma capa escrito '<TÍTULO>'" (pode citar cor: roxo, azul, por do sol, noite, dourado)
- "adicione uma introdução escrito '<TÍTULO>'"
- "adicione uma tela final escrito '<TEXTO>'"
- "corte os primeiros X segundos" / "corte os últimos X segundos" / "corte de Xs até Ys" / "divida ao meio" / "divida em partes de Xs"
- "mude para 9:16 reels com fundo desfocado" / "16:9" / "1:1" / "4:5" / "preencher tela" / "dar zoom de 1.4x"
- "aplique filtro cinema" (ou: preto e branco, vintage, quente, frio, dramatico, vibrante, cyber, sepia, suave)
- "adicione vinheta" / "mais brilho" / "mais contraste" / "movimento de camera"
- "coloque transições dissolver" (ou: zoom, deslizar, flash branco, escurecer, cortina) / "fade in e fade out"
- "velocidade 1.5x" / "camera lenta 0.5x"
- "adicione legenda '<TEXTO>' na base" / "adicione emoji de fogo"
- "coloque música de fundo lo-fi" / "música animada" / "som de impacto" / "silenciar video" / "separar audio"
Responda APENAS um JSON válido no formato: {"normalizedCommand": "...", "customReply": "..."}`

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Estado atual do projeto: ${JSON.stringify(projectSummary)}\nPedido do usuário: ${userPrompt}`,
        },
      ],
    }),
  })

  if (!resp.ok) throw new Error(`API status ${resp.status}`)
  const data = await resp.json()
  const content = data?.choices?.[0]?.message?.content || '{}'
  return JSON.parse(content)
}
