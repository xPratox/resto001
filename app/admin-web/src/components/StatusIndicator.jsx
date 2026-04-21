function StatusIndicator({ online, small = false }) {
  return (
    <span
      className={`admin-status-indicator inline-flex rounded-full ${small ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5'} ${online ? 'admin-status-indicator--online bg-emerald-400 shadow-[0_0_14px_rgba(74,222,128,0.7)]' : 'admin-status-indicator--offline bg-slate-500/80'}`}
      aria-label={online ? 'Trabajador conectado' : 'Trabajador desconectado'}
      title={online ? 'En linea' : 'Desconectado'}
    />
  )
}

export default StatusIndicator