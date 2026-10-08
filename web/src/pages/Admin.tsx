import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronRight, CircleAlert, Clapperboard, DatabaseZap, KeyRound, LoaderCircle, RotateCw, SkipForward, Square, Tv, X } from 'lucide-react'
import { api, ApiError, type StepResult, type SyncMode, type SyncRun, type SyncStep } from '../api'
import { useAuth } from '../auth'
import { ErrorState } from '../components/States'
import { Sk } from '../components/Skeleton'
import '../admin.css'

const MODES: { mode: SyncMode; label: string; text: string; icon: typeof DatabaseZap }[] = [
  { mode: 'full', label: 'Sincronizar todo', text: 'Importa estrenos de cada estudio, quita lo que ya no califica y actualiza dónde ver.', icon: DatabaseZap },
  { mode: 'import', label: 'Solo importar novedades', text: 'Busca títulos nuevos y actualiza datos. No quita nada.', icon: Clapperboard },
  { mode: 'providers', label: 'Solo plataformas', text: 'Actualiza en qué plataformas de Argentina está cada título.', icon: Tv },
]
const MODE_NAME: Record<SyncMode, string> = { full: 'Sincronización completa', import: 'Solo novedades', providers: 'Solo plataformas' }

const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const n = (v: unknown) => (typeof v === 'number' ? v : 0)

/** One line per step result, in words. */
function stepSummary(st: SyncStep): string {
  const s = st.summary ?? {}
  if (st.kind === 'import') {
    return `${n(s.new)} ${n(s.new) === 1 ? 'nuevo' : 'nuevos'}, ${n(s.updated)} ${n(s.updated) === 1 ? 'actualizado' : 'actualizados'}`
  }
  if (st.kind === 'prune') {
    const skipped = Array.isArray(s.skipped) ? s.skipped : []
    return `${n(s.deleted)} ${n(s.deleted) === 1 ? 'quitado' : 'quitados'}${skipped.length ? `; sin limpiar por precaución: ${skipped.join(', ')}` : ''}`
  }
  return `${n(s.updated)} revisados, ${n(s.with)} con plataforma${n(s.failed) ? `, ${n(s.failed)} con error` : ''}`
}

function stepLabel(st: SyncStep, running: boolean): string {
  if (st.kind === 'providers' && st.progress) {
    return st.progress.total > 0 ? `Plataformas ${st.progress.done}/${st.progress.total}` : 'Plataformas: todas al día'
  }
  return running ? `${st.label.replace(/\.$/, '')}…` : st.label
}

type Phase = 'idle' | 'running' | 'error' | 'cancelling' | 'finished'

export default function Admin() {
  const status = useQuery({ queryKey: ['admin-status'], queryFn: api.admin.status, retry: false })

  if (status.error && !status.data) {
    const e = status.error
    if (e instanceof ApiError && e.code === 'admin_disabled') {
      return <div className="state is-error" role="alert"><CircleAlert size={28} aria-hidden="true" /><p className="state-title">La administración no está configurada</p><p>Falta <code>admin_password_hash</code> en la configuración del servidor.</p></div>
    }
    return <ErrorState error={e} onRetry={() => void status.refetch()} />
  }
  if (!status.data) {
    return (
      <div className="admin" aria-busy="true">
        <Sk className="sk-title" />
        <Sk className="admin-sk-card" />
        <Sk className="admin-sk-card short" />
      </div>
    )
  }
  if (!status.data.unlocked) return <Unlock onDone={() => void status.refetch()} />
  return <Panel status={status.data} refresh={() => void status.refetch()} />
}

/** Compact password gate: a separate admin password, never the site one. */
function Unlock({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!password || busy) return
    setBusy(true)
    setError(null)
    try {
      await api.admin.unlock(password)
      onDone()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'bad_password') {
        const left = n(err.data.attemptsLeft)
        setError(left > 0 ? `Contraseña incorrecta. Te quedan ${left} ${left === 1 ? 'intento' : 'intentos'}.` : 'Contraseña incorrecta. Se bloqueó por 10 minutos.')
      } else if (err instanceof ApiError && err.code === 'locked_out') {
        setError(`Demasiados intentos fallidos. Espera ${Math.ceil(n(err.data.retryAfter) / 60)} min y vuelve a intentarlo.`)
      } else {
        setError('No se pudo verificar la contraseña. Inténtalo de nuevo.')
      }
      setPassword('')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="admin-unlock" onSubmit={(e) => void submit(e)}>
      <KeyRound size={26} aria-hidden="true" />
      <h1>Administración</h1>
      <p>Sincronizar el catálogo a mano necesita la contraseña de administración.</p>
      <label htmlFor="admin-pw">Contraseña de administración</label>
      <input
        id="admin-pw" type="password" value={password} autoComplete="current-password" autoFocus
        aria-invalid={error !== null} aria-describedby={error ? 'admin-pw-error' : undefined}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <p className="error small" id="admin-pw-error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary btn-block" disabled={!password || busy}>
        {busy ? <><LoaderCircle size={16} className="spin" aria-hidden="true" />Verificando…</> : 'Desbloquear'}
      </button>
    </form>
  )
}

function Panel({ status, refresh }: { status: Extract<Awaited<ReturnType<typeof api.admin.status>>, { unlocked: true }>; refresh: () => void }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [run, setRun] = useState<SyncRun | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [current, setCurrent] = useState(0)
  const [log, setLog] = useState<string[]>([])
  const [startedAt, setStartedAt] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [startError, setStartError] = useState<string | null>(null)
  const cancelRef = useRef(false)
  const runRef = useRef<SyncRun | null>(null)

  const active = phase === 'running' || phase === 'cancelling'
  // Leaving mid-run would stop the steps (the browser drives them): ask first.
  useEffect(() => {
    if (!active) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      window.removeEventListener('beforeunload', warn)
      clearInterval(t)
    }
  }, [active])

  const patchStep = (i: number, st: SyncStep) => {
    const r = runRef.current
    if (!r) return
    const steps = r.steps.slice()
    steps[i] = st
    runRef.current = { ...r, steps }
    setRun(runRef.current)
  }

  const finish = useCallback(async (cancelled: boolean) => {
    const r = runRef.current
    if (!r) return
    try {
      const done = await api.admin.finish(r.id, cancelled)
      runRef.current = done
      setRun(done)
    } catch {
      /* the lock expires by itself after 15 min without steps */
    }
    setPhase('finished')
    setNow(Date.now())
    refresh()
    if (!cancelled || (runRef.current?.totals?.new ?? 0) > 0) {
      for (const k of ['studios', 'home', 'titles', 'catalog', 'search', 'providers', 'progress']) void qc.invalidateQueries({ queryKey: [k] })
    }
  }, [qc, refresh])

  /** Drives the steps from `from`: each request runs one step (or part of it, "partial" = call again). */
  const drive = useCallback(async (from: number) => {
    setPhase('running')
    cancelRef.current = false
    const total = runRef.current?.steps.length ?? 0
    for (let i = from; i < total; i++) {
      if (runRef.current!.steps[i].status === 'done') continue
      setCurrent(i)
      let res: StepResult | null = null
      do {
        if (cancelRef.current) {
          await finish(true)
          return
        }
        patchStep(i, { ...runRef.current!.steps[i], status: 'partial' })
        try {
          res = await api.admin.step(runRef.current!.id, i)
        } catch (e) {
          const msg = e instanceof ApiError && e.code === 'run_inactive'
            ? 'La corrida ya no está activa (se liberó el bloqueo).'
            : e instanceof ApiError && e.code === 'admin_locked'
              ? 'Se venció el desbloqueo. Recarga la página y vuelve a desbloquear.'
              : 'La conexión con el servidor falló en este paso.'
          res = { ...runRef.current!.steps[i], status: 'error', error: msg, index: i, log: [] }
        }
        const { log: lines, index: _index, ...st } = res
        void _index
        patchStep(i, st)
        if (lines.length) setLog((l) => [...l, `— ${st.label}`, ...lines].slice(-600))
      } while (res.status === 'partial')
      if (res.status === 'error') {
        setPhase('error')
        return
      }
    }
    await finish(false)
  }, [finish])

  const start = async (mode: SyncMode) => {
    setStartError(null)
    try {
      const r = await api.admin.start(mode)
      runRef.current = r
      setRun(r)
      setLog([])
      setStartedAt(Date.now())
      setNow(Date.now())
      void drive(0)
    } catch (e) {
      setStartError(e instanceof ApiError && e.code === 'locked'
        ? 'Ya hay una sincronización en curso (la semanal o la de otra persona). Espera a que termine.'
        : 'No se pudo iniciar la sincronización. Inténtalo de nuevo.')
      refresh()
    }
  }

  const resume = (r: SyncRun) => {
    runRef.current = r
    setRun(r)
    setLog([])
    setStartedAt(Date.parse(r.startedAt) || Date.now())
    void drive(Math.max(0, r.steps.findIndex((s) => s.status !== 'done')))
  }

  const other = status.running && (!run || status.running.id !== run.id) ? status.running : null
  const mine = other && other.by === user?.tag && phase === 'idle'
  const last = run?.finishedAt ? run : status.lastRun

  return (
    <div className="admin">
      <header className="page-head admin-head">
        <h1 className="title">Sincronización del catálogo</h1>
        <p className="lead">Lo mismo que hace el servidor cada lunes a las 4: importa estrenos, quita lo que ya no califica y actualiza dónde ver cada título.</p>
      </header>

      {phase === 'idle' && last && <LastRun run={last} />}

      {phase === 'idle' && other && (
        <div className="admin-busy" role="status">
          <LoaderCircle size={18} className="spin" aria-hidden="true" />
          <p>
            {mine ? 'Dejaste una sincronización a medias' : `Hay una sincronización en curso, iniciada por ${other.by === 'cron' ? 'la tarea semanal' : `@${other.by}`}`} ({MODE_NAME[other.mode]}, {fmtDate(other.startedAt)}).
            {' '}{status.lockExpiresIn !== null && `Si nadie la continúa, se libera sola en ${Math.ceil(status.lockExpiresIn / 60)} min.`}
          </p>
          {mine && (
            <span className="admin-busy-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => resume(other)}>Continuar</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { runRef.current = other; void finish(true) }}>Descartarla</button>
            </span>
          )}
        </div>
      )}

      {run && phase !== 'idle' && (
        <Progress
          run={run} phase={phase} current={current} log={log}
          elapsed={now - startedAt}
          onCancel={() => { cancelRef.current = true; setPhase('cancelling') }}
          onRetry={() => void drive(current)}
          onSkip={() => void drive(current + 1)}
          onStop={() => void finish(true)}
        />
      )}
      {(phase === 'idle' || phase === 'finished') && (
        <section className="admin-modes" aria-label="Iniciar una sincronización">
          {MODES.map(({ mode, label, text, icon: Icon }) => (
            <button key={mode} type="button" className={`admin-mode ${mode === 'full' ? 'is-main' : ''}`} disabled={!!other} onClick={() => void start(mode)}>
              <Icon size={22} aria-hidden="true" />
              <span className="admin-mode-text"><strong>{label}</strong><small>{text}</small></span>
              <span className="admin-mode-steps">{status.steps[mode]} {status.steps[mode] === 1 ? 'paso' : 'pasos'}</span>
            </button>
          ))}
          {startError && <p className="error small" role="alert">{startError}</p>}
        </section>
      )}
    </div>
  )
}

function LastRun({ run }: { run: SyncRun }) {
  const t = run.totals
  const failed = run.steps.filter((s) => s.status === 'error').length
  const state = run.abandoned ? 'Quedó a medias' : run.cancelled ? 'Cancelada' : failed ? `Terminó con ${failed} ${failed === 1 ? 'paso fallido' : 'pasos fallidos'}` : 'Terminó bien'
  return (
    <section className="admin-last" aria-labelledby="admin-last-title">
      <h2 id="admin-last-title">Última sincronización</h2>
      <p className="admin-last-meta">
        <span className={`tag ${failed || run.abandoned ? 'warn' : 'ok'}`}>{state}</span>
        {MODE_NAME[run.mode]}, {fmtDate(run.finishedAt ?? run.startedAt)}, por {run.by === 'cron' ? 'la tarea semanal' : `@${run.by}`}
      </p>
      {t && (
        <dl className="admin-totals">
          <div><dt>Títulos nuevos</dt><dd>{t.new}</dd></div>
          <div><dt>Actualizados</dt><dd>{t.updated}</dd></div>
          <div><dt>Quitados</dt><dd>{t.deleted}</dd></div>
          <div><dt>Con plataforma</dt><dd>{t.withProviders}<small> de {t.providersUpdated}</small></dd></div>
        </dl>
      )}
    </section>
  )
}

function Progress({ run, phase, current, log, elapsed, onCancel, onRetry, onSkip, onStop }: {
  run: SyncRun; phase: Phase; current: number; log: string[]; elapsed: number
  onCancel: () => void; onRetry: () => void; onSkip: () => void; onStop: () => void
}) {
  const total = run.steps.length
  const doneCount = run.steps.filter((s) => s.status === 'done').length
  const step = run.steps[current]
  const finished = phase === 'finished'
  const headline = finished
    ? run.cancelled ? 'Sincronización cancelada' : 'Sincronización terminada'
    : phase === 'error' ? `Falló: ${step.label}` : phase === 'cancelling' ? 'Cancelando al terminar este paso…' : stepLabel(step, true)

  return (
    <section className={`admin-run is-${phase}`} aria-labelledby="admin-run-title">
      <div className="admin-run-top">
        <p className="admin-run-count">{finished ? `${doneCount} de ${total} pasos` : `Paso ${current + 1} de ${total}`}</p>
        <p className="admin-run-clock" aria-label="Tiempo transcurrido">{fmtTime(elapsed)}</p>
      </div>
      <h2 id="admin-run-title" className="admin-run-title" aria-live="polite">{headline}</h2>

      {/* One segment per step, in order: the run at a glance. */}
      <ol className="admin-strip" aria-label={`Progreso: ${doneCount} de ${total} pasos`}>
        {run.steps.map((s, i) => {
          const fill = s.progress && s.progress.total > 0 ? s.progress.done / s.progress.total : 0
          const live = !finished && i === current && phase !== 'error'
          return (
            <li key={i} className={`seg ${s.status} ${live ? 'live' : ''}`} title={`${s.label}: ${s.status === 'done' ? 'listo' : s.status === 'error' ? 'falló' : live ? 'en curso' : 'pendiente'}`}>
              {s.status !== 'done' && fill > 0 && <i style={{ width: `${fill * 100}%` }} />}
            </li>
          )
        })}
      </ol>

      <div className="admin-run-actions">
        {(phase === 'running' || phase === 'cancelling') && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={phase === 'cancelling'}>
            <Square size={14} aria-hidden="true" />{phase === 'cancelling' ? 'Cancelando…' : 'Cancelar'}
          </button>
        )}
        {phase === 'error' && (
          <>
            <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}><RotateCw size={14} aria-hidden="true" />Reintentar paso</button>
            {current + 1 < total && <button type="button" className="btn btn-ghost btn-sm" onClick={onSkip}><SkipForward size={14} aria-hidden="true" />Saltar este paso</button>}
            <button type="button" className="btn btn-quiet btn-sm" onClick={onStop}><X size={14} aria-hidden="true" />Terminar acá</button>
          </>
        )}
      </div>

      {finished && run.totals && (
        <dl className="admin-totals is-final">
          <div><dt>Títulos nuevos</dt><dd>{run.totals.new}</dd></div>
          <div><dt>Actualizados</dt><dd>{run.totals.updated}</dd></div>
          <div><dt>Quitados</dt><dd>{run.totals.deleted}</dd></div>
          <div><dt>Con plataforma</dt><dd>{run.totals.withProviders}<small> de {run.totals.providersUpdated}</small></dd></div>
        </dl>
      )}

      <ul className="admin-steps">
        {run.steps.map((s, i) => {
          if (s.status === 'pending' && !(i === current && !finished)) return null
          const live = !finished && i === current && s.status === 'partial' && phase !== 'error'
          return (
            <li key={i} className={`admin-step ${s.status} ${live ? 'live' : ''}`}>
              <span className="admin-step-icon" aria-hidden="true">
                {s.status === 'done' ? <Check size={14} strokeWidth={3} /> : s.status === 'error' ? <X size={14} strokeWidth={3} /> : <LoaderCircle size={14} className={live ? 'spin' : ''} />}
              </span>
              <span className="admin-step-body">
                <strong>{stepLabel(s, live)}</strong>
                {s.status === 'done' && <small>{stepSummary(s)}</small>}
                {s.status === 'error' && <small className="admin-step-error">{s.error}</small>}
              </span>
              {s.durationMs > 0 && <span className="admin-step-time">{(s.durationMs / 1000).toFixed(1)} s</span>}
            </li>
          )
        })}
      </ul>

      {log.length > 0 && (
        <details className="admin-log">
          <summary><ChevronRight size={14} aria-hidden="true" />Registro detallado ({log.length} líneas)</summary>
          <pre>{log.join('\n')}</pre>
        </details>
      )}
    </section>
  )
}
