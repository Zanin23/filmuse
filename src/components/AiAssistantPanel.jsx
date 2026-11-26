import React, { useEffect, useRef, useState } from 'react'
import {
  Sparkles,
  Send,
  Mic,
  MicOff,
  Check,
  Undo2,
  Camera,
  Settings2,
  ChevronDown,
  ChevronUp,
  Bot,
  Trash2,
} from 'lucide-react'
import {
  QUICK_AI_RECIPES,
  runAiEditorAssistant,
  runWithOptionalExternalLlm,
} from '../utils/aiAssistant.js'
import { fmt } from '../utils/media.js'

function formatRichText(text = '') {
  const lines = text.split('\n')
  return lines.map((line, li) => {
    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
    return (
      <React.Fragment key={li}>
        {parts.map((part, pi) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={pi}>{part.slice(2, -2)}</strong>
          }
          if (part.startsWith('*') && part.endsWith('*')) {
            return <em key={pi}>{part.slice(1, -1)}</em>
          }
          return <React.Fragment key={pi}>{part}</React.Fragment>
        })}
        {li < lines.length - 1 && <br />}
      </React.Fragment>
    )
  })
}

export const WELCOME_AI_MSG = {
  id: 'welcome',
  role: 'assistant',
  text:
    'Olá! Sou seu **Ajudante de IA** do Filmuse ✨\n' +
    'Posso **colocar capa**, **criar introdução/tela final**, **cortar trechos**, **adaptar para Reels 9:16**, **aplicar efeitos** e **adicionar música**.\n\n' +
    'Escolha um atalho rápido acima ou escreva o que deseja fazer!',
  actions: [],
  suggestions: [
    'Coloque uma capa escrito "Episódio 1"',
    'Adicione uma introdução animada e música de fundo',
    'Aplique filtro de cinema e vinheta',
  ],
}

export default function AiAssistantPanel({
  messages: propMessages,
  setMessages: propSetMessages,
  project,
  projectName,
  currentTime,
  totalDur,
  selection,
  canUndo,
  onApplyAiResult,
  onUndo,
  onDownloadCoverSnapshot,
  externalInputRef,
}) {
  const [localMessages, setLocalMessages] = useState([WELCOME_AI_MSG])
  const messages = propMessages || localMessages
  const setMessages = propSetMessages || setLocalMessages
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [recipesOpen, setRecipesOpen] = useState(true)
  const [listening, setListening] = useState(false)
  const [showApiConfig, setShowApiConfig] = useState(false)

  const [apiConfig, setApiConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('filmuse_ai_config')
      return saved ? JSON.parse(saved) : { apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }
    } catch {
      return { apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }
    }
  })

  const feedEndRef = useRef(null)
  const recognitionRef = useRef(null)

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  const saveConfig = (patch) => {
    setApiConfig((prev) => {
      const next = { ...prev, ...patch }
      try { localStorage.setItem('filmuse_ai_config', JSON.stringify(next)) } catch {}
      return next
    })
  }

  const handleSend = async (overridePrompt) => {
    const promptText = (overridePrompt ?? input).trim()
    if (!promptText || busy) return

    if (!overridePrompt) setInput('')

    const userMsg = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: promptText,
    }
    setMessages((prev) => [...prev, userMsg])
    setBusy(true)

    try {
      let commandToRun = promptText
      let customReply = null

      if (apiConfig.apiKey?.trim()) {
        try {
          const projectSummary = {
            projectName,
            aspect: project.aspect,
            clipsCount: project.clips.length,
            totalDurationSec: Number(totalDur.toFixed(1)),
            textsCount: project.texts.length,
            audiosCount: project.audios.length,
            currentTimeSec: Number(currentTime.toFixed(1)),
          }
          const llmOut = await runWithOptionalExternalLlm({
            apiKey: apiConfig.apiKey.trim(),
            baseUrl: apiConfig.baseUrl || 'https://api.openai.com/v1',
            model: apiConfig.model || 'gpt-4o-mini',
            userPrompt: promptText,
            projectSummary,
          })
          if (llmOut?.normalizedCommand) commandToRun = llmOut.normalizedCommand
          if (llmOut?.customReply) customReply = llmOut.customReply
        } catch {
          // Gracefully fall back to local NLU engine if external API call fails
        }
      }

      const result = await runAiEditorAssistant({
        prompt: commandToRun,
        project,
        projectName,
        currentTime,
        selection,
      })

      if (result.nextProject) {
        onApplyAiResult({
          nextProject: result.nextProject,
          seekTime: result.seekTime,
          nextSelection: result.nextSelection,
          summaryToast: result.actions[0] || 'Edição IA aplicada',
        })
      }

      const botMsg = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: customReply || result.reply,
        actions: result.actions || [],
        offerCoverDownload: Boolean(result.offerCoverDownload),
        suggestions: result.suggestions || [],
        didMutate: Boolean(result.nextProject),
      }
      setMessages((prev) => [...prev, botMsg])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          text: 'Ops, tive um contratempo ao aplicar essa edição. Tente reformular seu pedido!',
          actions: [],
          suggestions: ['Coloque uma introdução animada', 'Aplique filtro de cinema'],
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  const toggleVoiceInput = () => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRec) {
      alert('Seu navegador não suporta ditado de voz nativo. Digite seu pedido no campo abaixo!')
      return
    }
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop()
      setListening(false)
      return
    }
    const rec = new SpeechRec()
    rec.lang = 'pt-BR'
    rec.interimResults = false
    rec.maxAlternatives = 1
    recognitionRef.current = rec
    setListening(true)

    rec.onresult = (ev) => {
      const transcript = ev.results?.[0]?.[0]?.transcript || ''
      setListening(false)
      if (transcript.trim()) {
        handleSend(transcript.trim())
      }
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    rec.start()
  }

  const hasSpeechApi =
    typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)

  const latestMutatingId = [...messages].reverse().find((m) => m.didMutate)?.id

  return (
    <div className="cc-ai-panel">
      {/* Context & Engine Status Bar */}
      <div className="cc-ai-status-bar">
        <div className="cc-ai-context-badge">
          <span className="cc-ai-pulse" />
          <span>
            {project.clips.length > 0
              ? `${project.clips.length} clipe(s) · ${fmt(totalDur)} · ${project.aspect}`
              : 'Pronto para criar'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {messages.length > 1 && (
            <button
              className="cc-icon-btn cc-icon-sm"
              onClick={() => setMessages([WELCOME_AI_MSG])}
              title="Limpar conversa"
            >
              <Trash2 size={13} />
            </button>
          )}
          <button
            className={`cc-icon-btn cc-icon-sm ${showApiConfig ? 'active' : ''}`}
            onClick={() => setShowApiConfig((v) => !v)}
            title="Configurar API de IA externa (opcional)"
          >
            <Settings2 size={14} />
          </button>
        </div>
      </div>

      {/* Optional External LLM Config Box */}
      {showApiConfig && (
        <div className="cc-ai-config-box">
          <strong>Motor IA</strong>
          <p>
            O <b>Motor Local</b> já funciona 100% grátis sem chave. Opcionalmente, conecte uma chave compatível com OpenAI/Groq para interpretação livre extra:
          </p>
          <input
            type="password"
            placeholder="Chave API opcional (sk-...)"
            value={apiConfig.apiKey}
            onChange={(e) => saveConfig({ apiKey: e.target.value })}
          />
          <div className="cc-row">
            <input
              type="text"
              placeholder="URL Base"
              value={apiConfig.baseUrl}
              onChange={(e) => saveConfig({ baseUrl: e.target.value })}
            />
            <input
              type="text"
              placeholder="Modelo"
              value={apiConfig.model}
              onChange={(e) => saveConfig({ model: e.target.value })}
            />
          </div>
        </div>
      )}

      {/* Collapsible Quick 1-Click AI Recipes */}
      <div className="cc-ai-recipes-wrap">
        <button
          className="cc-ai-recipes-toggle"
          onClick={() => setRecipesOpen((o) => !o)}
        >
          <span>⚡ Tarefas rápidas com 1 clique</span>
          {recipesOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {recipesOpen && (
          <div className="cc-ai-recipe-grid">
            {QUICK_AI_RECIPES.map((r) => (
              <button
                key={r.id}
                className="cc-ai-recipe-card"
                disabled={busy}
                onClick={() => handleSend(r.prompt)}
                title={r.desc}
              >
                <span className="cc-ai-recipe-ico">{r.icon}</span>
                <div className="cc-ai-recipe-txt">
                  <strong>{r.label}</strong>
                  <span>{r.desc}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chat Messages Feed */}
      <div className="cc-ai-feed">
        {messages.map((m) => (
          <div key={m.id} className={`cc-ai-msg ${m.role}`}>
            {m.role === 'assistant' && (
              <div className="cc-ai-avatar">
                <Bot size={14} />
              </div>
            )}

            <div className="cc-ai-bubble">
              <div className="cc-ai-text">{formatRichText(m.text)}</div>

              {m.actions?.length > 0 && (
                <div className="cc-ai-action-list">
                  {m.actions.map((act, idx) => (
                    <div key={idx} className="cc-ai-action-pill">
                      <Check size={12} />
                      <span>{act}</span>
                    </div>
                  ))}
                </div>
              )}

              {(m.offerCoverDownload || (m.didMutate && m.id === latestMutatingId && canUndo)) && (
                <div className="cc-ai-msg-tools">
                  {m.offerCoverDownload && (
                    <button
                      className="cc-ai-inline-btn accent"
                      onClick={onDownloadCoverSnapshot}
                    >
                      <Camera size={12} />
                      <span>Baixar Capa (PNG)</span>
                    </button>
                  )}
                  {m.didMutate && m.id === latestMutatingId && canUndo && (
                    <button className="cc-ai-inline-btn" onClick={onUndo}>
                      <Undo2 size={12} />
                      <span>Desfazer</span>
                    </button>
                  )}
                </div>
              )}

              {m.suggestions?.length > 0 && m.id === messages[messages.length - 1]?.id && (
                <div className="cc-ai-suggestions">
                  {m.suggestions.map((sug, si) => (
                    <button
                      key={si}
                      className="cc-ai-sug-chip"
                      disabled={busy}
                      onClick={() => handleSend(sug)}
                    >
                      <Sparkles size={11} />
                      <span>{sug}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="cc-ai-msg assistant">
            <div className="cc-ai-avatar">
              <Sparkles size={14} />
            </div>
            <div className="cc-ai-bubble cc-ai-typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
        <div ref={feedEndRef} />
      </div>

      {/* Composer Input Bar */}
      <div className="cc-ai-composer">
        <textarea
          ref={externalInputRef}
          rows={2}
          value={input}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder='Peça algo... Ex: "Coloque uma capa escrito Vlog #1 e filtro cinema"'
        />
        <div className="cc-ai-composer-actions">
          {hasSpeechApi && (
            <button
              className={`cc-icon-btn cc-icon-sm ${listening ? 'active' : ''}`}
              onClick={toggleVoiceInput}
              title={listening ? 'Ouvindo... clique para parar' : 'Falar comando por voz'}
            >
              {listening ? <MicOff size={15} /> : <Mic size={15} />}
            </button>
          )}
          <button
            className="cc-ai-send-btn"
            disabled={!input.trim() || busy}
            onClick={() => handleSend()}
            title="Enviar pedido para a IA (Enter)"
          >
            <Send size={14} />
            <span>Aplicar</span>
          </button>
        </div>
      </div>
    </div>
  )
}
