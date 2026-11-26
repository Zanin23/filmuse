import { useCallback, useRef, useState } from 'react'

const MAX_HISTORY = 50

export function useProjectHistory(initialState) {
  const [history, setHistory] = useState(() => ({
    present: initialState,
    past: [],
    future: [],
    lastKey: null,
    lastTs: 0,
  }))

  const historyRef = useRef(history)
  historyRef.current = history

  const commit = useCallback((updater, coalesceKey = null) => {
    const now = performance.now()
    setHistory((h) => {
      const next = typeof updater === 'function' ? updater(h.present) : updater
      if (next === h.present) return h

      const shouldCoalesce =
        Boolean(coalesceKey) &&
        h.lastKey === coalesceKey &&
        now - h.lastTs < 600

      const nextPast = shouldCoalesce
        ? h.past
        : [...h.past.slice(-(MAX_HISTORY - 1)), h.present]

      return {
        present: next,
        past: nextPast,
        future: [],
        lastKey: coalesceKey,
        lastTs: now,
      }
    })
  }, [])

  const undo = useCallback(() => {
    if (!historyRef.current.past.length) return false
    setHistory((h) => {
      if (!h.past.length) return h
      const previous = h.past[h.past.length - 1]
      return {
        present: previous,
        past: h.past.slice(0, -1),
        future: [h.present, ...h.future],
        lastKey: null,
        lastTs: 0,
      }
    })
    return true
  }, [])

  const redo = useCallback(() => {
    if (!historyRef.current.future.length) return false
    setHistory((h) => {
      if (!h.future.length) return h
      const next = h.future[0]
      return {
        present: next,
        past: [...h.past, h.present],
        future: h.future.slice(1),
        lastKey: null,
        lastTs: 0,
      }
    })
    return true
  }, [])

  const resetHistory = useCallback((newState) => {
    setHistory({
      present: newState,
      past: [],
      future: [],
      lastKey: null,
      lastTs: 0,
    })
  }, [])

  return {
    state: history.present,
    commit,
    undo,
    redo,
    resetHistory,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  }
}
