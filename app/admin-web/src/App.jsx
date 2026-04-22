import { useEffect, useMemo, useState } from 'react'

import AdminDashboard from './components/AdminDashboard'
import LoginScreen from './components/LoginScreen'
import { API_BASE_URL } from './config/api'
import { createAdminSocket } from './lib/socket'
import { useTheme } from './hooks/useTheme'

const AUTH_STORAGE_KEY = 'resto001:auth:admin'

const initialMenuForm = {
  id: '',
  nombre: '',
  descripcion: '',
  precio: '',
  categoria: '',
}

const initialUserForm = {
  nombre: '',
  usuario: '',
  contrasena: '',
  rol: 'mesonero',
}

const initialSettingsForm = {
  bcv: '',
  cop: '',
}

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data?.message || 'No se pudo completar la solicitud.')
  }

  return data
}

function App() {
  const { theme, toggleTheme } = useTheme()
  const [isMenuModalOpen, setIsMenuModalOpen] = useState(false)
  const [isStaffDrawerOpen, setIsStaffDrawerOpen] = useState(false)
  const [usuario, setUsuario] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [banner, setBanner] = useState(null)
  const [session, setSession] = useState(() => {
    try {
      const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })
  const [authChecking, setAuthChecking] = useState(() => Boolean(session?.token))
  const [menuItems, setMenuItems] = useState([])
  const [users, setUsers] = useState([])
  const [report, setReport] = useState(null)
  const [reportRange, setReportRange] = useState('today')
  const [resolvedRates, setResolvedRates] = useState(null)
  const [latestRateUpdate, setLatestRateUpdate] = useState(null)
  const [rateHistory, setRateHistory] = useState([])
  const [menuForm, setMenuForm] = useState(initialMenuForm)
  const [userForm, setUserForm] = useState(initialUserForm)
  const [settingsForm, setSettingsForm] = useState(initialSettingsForm)
  const [menuSaving, setMenuSaving] = useState(false)
  const [userSaving, setUserSaving] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const apiRequestPrefix = API_BASE_URL || '/api'

  useEffect(() => {
    if (!session?.token) {
      return undefined
    }

    const originalFetch = window.fetch.bind(window)

    window.fetch = (input, init = {}) => {
      const requestUrl = typeof input === 'string' ? input : input?.url || ''
      const isApiRequest = requestUrl.startsWith(apiRequestPrefix) || requestUrl.startsWith('/api')

      if (!isApiRequest) {
        return originalFetch(input, init)
      }

      return originalFetch(input, {
        ...init,
        headers: {
          ...(init.headers || {}),
          Authorization: `Bearer ${session.token}`,
        },
      })
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [apiRequestPrefix, session?.token])

  const canRenderApp = useMemo(() => !authChecking && Boolean(session?.token && session?.rol === 'admin'), [authChecking, session])

  useEffect(() => {
    if (!session?.token) {
      setAuthChecking(false)
      return
    }

    let ignore = false
    setAuthChecking(true)

    fetch(`${API_BASE_URL}/api/admin/settings`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(response.status === 401 || response.status === 403 ? 'SESSION_INVALID' : 'SESSION_CHECK_FAILED')
        }

        return response.json().catch(() => ({}))
      })
      .then(() => {
        if (ignore) {
          return
        }

        setAuthChecking(false)
      })
      .catch((sessionError) => {
        if (ignore) {
          return
        }

        window.localStorage.removeItem(AUTH_STORAGE_KEY)
        setSession(null)
        setBanner(null)
        setError(sessionError.message === 'SESSION_INVALID' ? 'Inicia sesion nuevamente para acceder al panel admin.' : '')
        setAuthChecking(false)
      })

    return () => {
      ignore = true
    }
  }, [session?.token])

  async function fetchDashboardData(nextRange = reportRange) {
    const [menuData, usersData, settingsData, reportData] = await Promise.all([
      fetch(`${API_BASE_URL}/api/admin/menu`).then(parseResponse),
      fetch(`${API_BASE_URL}/api/admin/users`).then(parseResponse),
      fetch(`${API_BASE_URL}/api/admin/settings`).then(parseResponse),
      fetch(`${API_BASE_URL}/api/admin/reports?range=${encodeURIComponent(nextRange)}`).then(parseResponse),
    ])

    setMenuItems(menuData.items || [])
    setUsers(usersData.users || [])
    setResolvedRates(settingsData.resolvedRates || null)
    setLatestRateUpdate(settingsData.latestRateUpdate || null)
    setRateHistory(settingsData.rateHistory || [])
    setSettingsForm({
      bcv: settingsData.manualRates?.bcv?.value ?? '',
      cop: settingsData.manualRates?.cop?.value ?? '',
    })
    setReport(reportData)
  }

  useEffect(() => {
    if (!canRenderApp) {
      return
    }

    fetchDashboardData().catch((fetchError) => {
      setBanner({ type: 'error', message: fetchError.message || 'No se pudo cargar el dashboard admin.' })
    })
  }, [canRenderApp])

  useEffect(() => {
    if (!canRenderApp) {
      return undefined
    }

    const socket = createAdminSocket(session.token)

    socket.on('menu_updated', (payload) => {
      setMenuItems(payload.items || [])
      setBanner({ type: 'success', message: 'Menu sincronizado automaticamente.' })
    })

    socket.on('staff_status_updated', (payload) => {
      setUsers(payload.users || [])
    })

    socket.on('global_settings_updated', () => {
      fetch(`${API_BASE_URL}/api/admin/settings`)
        .then(parseResponse)
        .then((settingsData) => {
          setResolvedRates(settingsData.resolvedRates || null)
          setLatestRateUpdate(settingsData.latestRateUpdate || null)
          setRateHistory(settingsData.rateHistory || [])
          setSettingsForm({
            bcv: settingsData.manualRates?.bcv?.value ?? '',
            cop: settingsData.manualRates?.cop?.value ?? '',
          })
        })
        .catch(() => {})
    })

    const refreshReport = () => {
      fetch(`${API_BASE_URL}/api/admin/reports?range=${encodeURIComponent(reportRange)}`)
        .then(parseResponse)
        .then(setReport)
        .catch(() => {})
    }

    socket.on('orden_actualizada', refreshReport)
    socket.on('mesa_actualizada', refreshReport)

    return () => {
      socket.disconnect()
    }
  }, [canRenderApp, reportRange, session?.token])

  function handleAbrirCrearPlato() {
    console.log('Accion ejecutada: abrir modal de plato')
    setMenuForm(initialMenuForm)
    setIsMenuModalOpen(true)
  }

  function handleCerrarCrearPlato() {
    setMenuForm(initialMenuForm)
    setIsMenuModalOpen(false)
  }

  function handleAbrirCrearUsuario() {
    console.log('Accion ejecutada: abrir drawer de usuario')
    setUserForm(initialUserForm)
    setIsStaffDrawerOpen(true)
  }

  function handleCerrarCrearUsuario() {
    setUserForm(initialUserForm)
    setIsStaffDrawerOpen(false)
  }

  async function handleLogin(event) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ usuario, contrasena }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Credenciales no validas')
        }

        throw new Error(data?.message || 'No se pudo iniciar sesion.')
      }

      if (data.rol !== 'admin') {
        throw new Error('Este dashboard solo permite usuarios con rol admin.')
      }

      const nextSession = {
        token: data.token,
        nombre: data.nombre,
        usuario: data.usuario,
        rol: data.rol,
      }

      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession))
      setSession(nextSession)
      setContrasena('')
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : 'No se pudo iniciar sesion.'
      setError(message === 'Failed to fetch' ? 'No se pudo conectar con el backend.' : message)
    } finally {
      setLoading(false)
    }
  }

  function handleLogout() {
    fetch(`${API_BASE_URL}/api/logout`, { method: 'POST' }).catch(() => {})
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
    setSession(null)
    setBanner(null)
  }

  function handleMenuChange(event) {
    const { name, value } = event.target
    setMenuForm((current) => ({ ...current, [name]: value }))
  }

  function handleUserChange(event) {
    const { name, value } = event.target
    setUserForm((current) => ({ ...current, [name]: value }))
  }

  function handleSettingsChange(event) {
    const { name, value } = event.target
    setSettingsForm((current) => ({ ...current, [name]: value }))
  }

  async function handleCrearPlato(event) {
    event.preventDefault()
    console.log('Accion ejecutada: crear o actualizar plato')
    setMenuSaving(true)

    try {
      const endpoint = menuForm.id ? `${API_BASE_URL}/api/admin/menu/${menuForm.id}` : `${API_BASE_URL}/api/admin/menu`
      const method = menuForm.id ? 'PATCH' : 'POST'

      await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: menuForm.nombre,
          descripcion: menuForm.descripcion,
          precio: menuForm.precio,
          categoria: menuForm.categoria,
        }),
      }).then(parseResponse)

      handleCerrarCrearPlato()
      setBanner({ type: 'success', message: 'Menu actualizado correctamente.' })
      await fetchDashboardData()
    } catch (submitError) {
      setBanner({ type: 'error', message: submitError.message || 'No se pudo guardar el plato.' })
    } finally {
      setMenuSaving(false)
    }
  }

  function handleMenuEdit(item) {
    console.log('Accion ejecutada: editar plato')
    setMenuForm({
      id: item._id,
      nombre: item.nombre,
      descripcion: item.descripcion || '',
      precio: item.precio,
      categoria: item.categoria,
    })
    setIsMenuModalOpen(true)
  }

  async function handleMenuDelete(item) {
    if (!window.confirm(`Eliminar ${item.nombre} del menu?`)) {
      return
    }

    try {
      await fetch(`${API_BASE_URL}/api/admin/menu/${item._id}`, { method: 'DELETE' }).then(parseResponse)
      setBanner({ type: 'success', message: 'Plato eliminado.' })
      await fetchDashboardData()
    } catch (deleteError) {
      setBanner({ type: 'error', message: deleteError.message || 'No se pudo eliminar el plato.' })
    }
  }

  async function handleCrearUsuario(event) {
    event.preventDefault()
    console.log('Accion ejecutada: crear usuario')
    setUserSaving(true)

    try {
      await fetch(`${API_BASE_URL}/api/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userForm),
      }).then(parseResponse)

      handleCerrarCrearUsuario()
      setBanner({ type: 'success', message: 'Trabajador creado correctamente.' })
      await fetchDashboardData()
    } catch (submitError) {
      setBanner({ type: 'error', message: submitError.message || 'No se pudo crear el trabajador.' })
    } finally {
      setUserSaving(false)
    }
  }

  async function handleUserDelete(user) {
    if (!user?._id) {
      return
    }

    if (!window.confirm(`Eliminar a ${user.nombre}?`)) {
      return
    }

    try {
      await fetch(`${API_BASE_URL}/api/admin/users/${user._id}`, { method: 'DELETE' }).then(parseResponse)
      setBanner({ type: 'success', message: 'Trabajador eliminado correctamente.' })
      await fetchDashboardData()
    } catch (deleteError) {
      setBanner({ type: 'error', message: deleteError.message || 'No se pudo eliminar el trabajador.' })
    }
  }

  async function handleUpdateTasas(event) {
    event.preventDefault()
    console.log('Accion ejecutada: actualizar tasas')
    setSettingsSaving(true)

    try {
      await fetch(`${API_BASE_URL}/api/admin/settings/rates`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsForm),
      }).then(parseResponse)

      setBanner({ type: 'success', message: 'Tasas manuales actualizadas.' })
      await fetchDashboardData()
    } catch (submitError) {
      setBanner({ type: 'error', message: submitError.message || 'No se pudieron guardar las tasas.' })
    } finally {
      setSettingsSaving(false)
    }
  }

  async function handleReportRangeChange(event) {
    const nextRange = event.target.value
    setReportRange(nextRange)

    try {
      const reportData = await fetch(`${API_BASE_URL}/api/admin/reports?range=${encodeURIComponent(nextRange)}`).then(parseResponse)
      setReport(reportData)
    } catch (rangeError) {
      setBanner({ type: 'error', message: rangeError.message || 'No se pudo actualizar el rango del reporte.' })
    }
  }

  if (authChecking) {
    return null
  }

  if (!canRenderApp) {
    return (
      <LoginScreen
        usuario={usuario}
        contrasena={contrasena}
        error={error}
        loading={loading}
        theme={theme}
        onToggleTheme={toggleTheme}
        onUsuarioChange={(event) => setUsuario(event.target.value)}
        onContrasenaChange={(event) => setContrasena(event.target.value)}
        onSubmit={handleLogin}
      />
    )
  }

  return (
    <AdminDashboard
      session={session}
      onLogout={handleLogout}
      theme={theme}
      onToggleTheme={toggleTheme}
      banner={banner}
      menuItems={menuItems}
      menuForm={menuForm}
      onMenuChange={handleMenuChange}
      onMenuSubmit={handleCrearPlato}
      onMenuEdit={handleMenuEdit}
      onMenuDelete={handleMenuDelete}
      onOpenMenuModal={handleAbrirCrearPlato}
      onCloseMenuModal={handleCerrarCrearPlato}
      isMenuModalOpen={isMenuModalOpen}
      menuSaving={menuSaving}
      users={users}
      userForm={userForm}
      onUserChange={handleUserChange}
      onUserSubmit={handleCrearUsuario}
      onUserDelete={handleUserDelete}
      onOpenUserDrawer={handleAbrirCrearUsuario}
      onCloseUserDrawer={handleCerrarCrearUsuario}
      isUserDrawerOpen={isStaffDrawerOpen}
      userSaving={userSaving}
      currentUsername={session?.usuario || ''}
      settingsForm={settingsForm}
      resolvedRates={resolvedRates}
      latestRateUpdate={latestRateUpdate}
      rateHistory={rateHistory}
      onSettingsChange={handleSettingsChange}
      onSettingsSubmit={handleUpdateTasas}
      settingsSaving={settingsSaving}
      report={report}
      reportRange={reportRange}
      onReportRangeChange={handleReportRangeChange}
    />
  )
}

export default App