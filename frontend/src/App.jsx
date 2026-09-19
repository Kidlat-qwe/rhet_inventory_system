import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import './App.css'
import './typography.css'
import './theme-dark.css'
import { EmptyState } from './components/EmptyState'
import { Header } from './components/Header'
import { HelpAssistant } from './components/HelpAssistant'
import { PageLoading } from './components/PageLoading'
import { ProcessingModalHost } from './components/ProcessingModal'
import { Sidebar } from './components/Sidebar'
import { SnowfallOverlay } from './components/SnowfallOverlay'
import { ConfirmProvider } from './context/ConfirmContext'
import { DEFAULT_SETTINGS, SettingsProvider } from './context/SettingsContext'
import {
  AdminApiKeys,
  AdminCategories,
  AdminDashboard,
  AdminInventory,
  AdminReleaseLogs,
  AdminSettings,
  AdminStockMovements,
  AdminStockRequests,
  AdminUsers,
  AdminOnlineOrders,
  AdminManualOrders,
} from './pages/admin'
import Login from './pages/Login'
import {
  UserCategories,
  UserDashboard,
  UserInventory,
  UserReleaseLogs,
  UserStockMovements,
  UserStockRequests,
  UserOnlineOrders,
  UserManualOrders,
} from './pages/user'
import { ADMIN_PAGES, USER_PAGES, pageFromPath, pathForPage, roleBasePath } from './routes/paths'
import { firebaseConfigured, observeAuth, signOutAdmin } from './services/firebase'
import {
  fetchUsers,
  fetchCategories,
  fetchDashboard,
  fetchInventory,
  fetchMe,
  fetchMovements,
  fetchSettings,
  fetchStockRequests,
  fetchIntegrationClients,
} from './services/inventoryApi'
import { fetchManualOrders } from './services/manualOrdersApi'
import { fetchOnlineOrders } from './services/onlineOrdersApi'
import { hydrateCategoryImages } from './utils/categoryImage'
import { setAppTimezone } from './utils/format'

/** Movement types owned by marketplace / HQ outbound flows (Release Logs → Online orders). */
const ONLINE_ORDER_MOVEMENT_TYPES = 'ONLINE_SALE,MANUAL_SALE,CANCELLED,RETURN,CHANNEL_ALLOCATION'

function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const [menu, setMenu] = useState(false)
  const [user, setUser] = useState(firebaseConfigured ? undefined : null)
  const [admin, setAdmin] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [categories, setCategories] = useState([])
  const [inventory, setInventory] = useState([])
  const [movements, setMovements] = useState([])
  const [onlineMovements, setOnlineMovements] = useState([])
  const [stockRequests, setStockRequests] = useState([])
  const [onlineOrders, setOnlineOrders] = useState([])
  const [manualOrders, setManualOrders] = useState([])
  const [integrationClients, setIntegrationClients] = useState([])
  const [admins, setAdmins] = useState([])
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [inventoryFocusCategoryId, setInventoryFocusCategoryId] = useState(null)
  const [headerBreadcrumbs, setHeaderBreadcrumbs] = useState(null)
  const stockRequestsRefreshInFlight = useRef(false)
  const adminRef = useRef(admin)
  adminRef.current = admin

  const routeInfo = useMemo(() => pageFromPath(location.pathname), [location.pathname])
  const page = routeInfo?.page || 'Dashboard'

  useEffect(() => {
    if (page !== 'Inventory') {
      setHeaderBreadcrumbs(null)
    }
  }, [page])

  const reload = useCallback(async (options = {}) => {
    const silent = Boolean(options?.silent)
    const scopes = Array.isArray(options?.scopes) && options.scopes.length
      ? new Set(options.scopes)
      : null
    const want = (key) => !scopes || scopes.has(key)

    if (!silent) setLoading(true)
    setError('')
    try {
      const me = want('me') || want('users') || want('clients') || !scopes
        ? await fetchMe()
        : adminRef.current
      const roleIsAdmin = String((me || adminRef.current)?.role || 'ADMIN').toUpperCase() === 'ADMIN'

      const [
        dash,
        cats,
        inv,
        mov,
        onlineMov,
        requests,
        online,
        manual,
        adminList,
        clients,
        appSettings,
      ] = await Promise.all([
        want('dashboard') ? fetchDashboard({ period: 'year' }) : Promise.resolve(null),
        want('categories') ? fetchCategories() : Promise.resolve(null),
        want('inventory') ? fetchInventory({ limit: 100, sortBy: 'updatedAt', order: 'desc' }) : Promise.resolve(null),
        want('movements') ? fetchMovements({ limit: 100, excludeTypes: ONLINE_ORDER_MOVEMENT_TYPES }) : Promise.resolve(null),
        want('onlineMovements') ? fetchMovements({ limit: 100, types: ONLINE_ORDER_MOVEMENT_TYPES }) : Promise.resolve(null),
        want('stockRequests') ? fetchStockRequests({ limit: 500 }) : Promise.resolve(null),
        want('onlineOrders') ? fetchOnlineOrders({ limit: 100 }) : Promise.resolve(null),
        want('manualOrders') ? fetchManualOrders({ limit: 100 }) : Promise.resolve(null),
        want('users') && roleIsAdmin ? fetchUsers() : Promise.resolve(null),
        want('clients') && roleIsAdmin ? fetchIntegrationClients() : Promise.resolve(null),
        want('settings') ? fetchSettings() : Promise.resolve(null),
      ])

      if (me && (want('me') || !scopes)) setAdmin(me)
      if (dash) setDashboard(dash)
      if (cats) {
        setCategories((prev) => hydrateCategoryImages(cats, prev))
      }
      if (inv) setInventory(inv.data)
      if (mov) setMovements(mov.data)
      if (onlineMov) setOnlineMovements(onlineMov.data)
      if (requests) setStockRequests(requests.data)
      if (online) setOnlineOrders(online.data)
      if (manual) setManualOrders(manual.data)
      if (adminList) setAdmins(adminList)
      if (clients) setIntegrationClients(clients)
      if (appSettings) {
        setSettings(appSettings || DEFAULT_SETTINGS)
        setAppTimezone(appSettings?.timezone)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  const refreshQuietly = useCallback(() => reload({ silent: true }), [reload])
  const refreshInventoryData = useCallback(
    () => reload({ silent: true, scopes: ['categories', 'inventory', 'movements', 'onlineMovements', 'dashboard'] }),
    [reload],
  )
  const refreshCategoriesData = useCallback(
    () => reload({ silent: true, scopes: ['categories', 'inventory'] }),
    [reload],
  )
  const refreshUsersData = useCallback(
    () => reload({ silent: true, scopes: ['users', 'me'] }),
    [reload],
  )
  const refreshClientsData = useCallback(
    () => reload({ silent: true, scopes: ['clients'] }),
    [reload],
  )
  const refreshSettingsData = useCallback(
    () => reload({ silent: true, scopes: ['settings'] }),
    [reload],
  )
  const refreshOnlineOrdersData = useCallback(
    () => reload({ silent: true, scopes: ['onlineOrders', 'inventory', 'movements', 'onlineMovements'] }),
    [reload],
  )
  const refreshManualOrdersData = useCallback(
    () => reload({ silent: true, scopes: ['manualOrders', 'inventory', 'movements', 'onlineMovements'] }),
    [reload],
  )

  const refreshStockRequests = useCallback(async () => {
    if (stockRequestsRefreshInFlight.current) return
    stockRequestsRefreshInFlight.current = true
    try {
      const requests = await fetchStockRequests({ limit: 500 })
      setStockRequests(requests.data)
    } catch (err) {
      // Silent polling: do not surface transient errors to the user UI.
      // This avoids spamming error banners while the connection is flaky.
      // eslint-disable-next-line no-console
      console.warn('StockRequests polling failed:', err?.message || err)
    } finally {
      stockRequestsRefreshInFlight.current = false
    }
  }, [])

  // After approve/reject: refresh requests + warehouse stock + movements (approve deducts stock).
  const refreshAfterStockDecision = useCallback(async () => {
    try {
      const [requests, inv, mov, onlineMov, dash] = await Promise.all([
        fetchStockRequests({ limit: 500 }),
        fetchInventory({ limit: 100, sortBy: 'updatedAt', order: 'desc' }),
        fetchMovements({ limit: 100, excludeTypes: ONLINE_ORDER_MOVEMENT_TYPES }),
        fetchMovements({ limit: 100, types: ONLINE_ORDER_MOVEMENT_TYPES }),
        fetchDashboard({ period: 'year' }),
      ])
      setStockRequests(requests.data)
      setInventory(inv.data)
      setMovements(mov.data)
      setOnlineMovements(onlineMov.data)
      setDashboard(dash)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => (firebaseConfigured ? observeAuth(setUser) : undefined), [])

  useEffect(() => {
    if (firebaseConfigured && user === undefined) return
    if (firebaseConfigured && !user) return
    reload()
  }, [user, reload])

  useEffect(() => {
    if (loading) return
    if (firebaseConfigured && !user) return

    let cancelled = false

    const poll = async () => {
      if (cancelled) return
      if (document.visibilityState !== 'visible') return
      await refreshStockRequests()
    }

    // Poll on every page so the header notification badge updates when
    // an external system submits a new stock request.
    poll()
    const intervalId = setInterval(poll, page === 'Stock Requests' ? 10000 : 20000)

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') poll()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [firebaseConfigured, user, loading, page, refreshStockRequests])

  const isAdmin = String(admin?.role || 'ADMIN').toUpperCase() === 'ADMIN'
  const allowedPages = isAdmin ? ADMIN_PAGES : USER_PAGES

  useEffect(() => {
    if (!user || !admin || loading) return

    const parsed = pageFromPath(location.pathname)
    const home = pathForPage(isAdmin, 'Dashboard')

    if (!parsed) {
      navigate(home, { replace: true })
      return
    }

    if (parsed.isAdminPath !== isAdmin) {
      navigate(pathForPage(isAdmin, parsed.page), { replace: true })
      return
    }

    if (!allowedPages.includes(parsed.page)) {
      navigate(home, { replace: true })
    }
  }, [user, admin, loading, location.pathname, isAdmin, allowedPages, navigate])

  function goTo(pageName) {
    navigate(pathForPage(isAdmin, pageName))
  }

  if (user === undefined) return <div className="auth-loading">Checking your session…</div>
  if (firebaseConfigured && !user) {
    return <Navigate to="/login" replace />
  }

  const content = (() => {
    if (loading) return <PageLoading />
    if (error) return <div className="page-error">{error}</div>

    if (isAdmin) {
      switch (page) {
        case 'Dashboard':
          return <AdminDashboard dashboard={dashboard} admin={admin} goInventory={() => goTo('Inventory')} goMovements={() => goTo('Stock Movements')} />
        case 'Inventory':
          return (
            <AdminInventory
              items={inventory}
              categories={categories}
              onRefresh={refreshInventoryData}
              initialCategoryId={inventoryFocusCategoryId}
              onInitialCategoryConsumed={() => setInventoryFocusCategoryId(null)}
              onBreadcrumbChange={setHeaderBreadcrumbs}
            />
          )
        case 'Stock Requests':
          return <AdminStockRequests requests={stockRequests} onRefresh={refreshAfterStockDecision} admin={admin} />
        case 'Online Orders':
          return <AdminOnlineOrders orders={onlineOrders} inventory={inventory} onRefresh={refreshOnlineOrdersData} canManage />
        case 'Manual Orders':
          return <AdminManualOrders orders={manualOrders} inventory={inventory} onRefresh={refreshManualOrdersData} canManage />
        case 'Release Logs':
          return <AdminReleaseLogs requests={stockRequests} onlineMovements={onlineMovements} />
        case 'Stock Movements':
          return <AdminStockMovements movements={movements} />
        case 'Categories':
          return (
            <AdminCategories
              categories={categories}
              items={inventory}
              onRefresh={refreshCategoriesData}
              onOpenInventory={(categoryId) => {
                setInventoryFocusCategoryId(categoryId)
                goTo('Inventory')
              }}
            />
          )
        case 'Users':
          return <AdminUsers users={admins} currentAdmin={admin} onRefresh={refreshUsersData} />
        case 'API Keys':
          return <AdminApiKeys clients={integrationClients} onRefresh={refreshClientsData} />
        case 'Settings':
          return <AdminSettings settings={settings} onRefresh={refreshSettingsData} />
        default:
          return <EmptyState title={page} message="This page is not available." />
      }
    }

    switch (page) {
      case 'Dashboard':
        return <UserDashboard dashboard={dashboard} admin={admin} goInventory={() => goTo('Inventory')} goMovements={() => goTo('Stock Movements')} />
      case 'Inventory':
        return (
          <UserInventory
            items={inventory}
            categories={categories}
            onRefresh={refreshInventoryData}
            initialCategoryId={inventoryFocusCategoryId}
            onInitialCategoryConsumed={() => setInventoryFocusCategoryId(null)}
            onBreadcrumbChange={setHeaderBreadcrumbs}
          />
        )
      case 'Stock Requests':
        return <UserStockRequests requests={stockRequests} onRefresh={refreshAfterStockDecision} admin={admin} />
      case 'Online Orders':
        return <UserOnlineOrders orders={onlineOrders} inventory={inventory} onRefresh={refreshOnlineOrdersData} canManage />
      case 'Manual Orders':
        return <UserManualOrders orders={manualOrders} inventory={inventory} onRefresh={refreshManualOrdersData} canManage />
      case 'Release Logs':
        return <UserReleaseLogs requests={stockRequests} onlineMovements={onlineMovements} />
      case 'Stock Movements':
        return <UserStockMovements movements={movements} />
      case 'Categories':
        return (
          <UserCategories
            categories={categories}
            items={inventory}
            onRefresh={refreshCategoriesData}
            onOpenInventory={(categoryId) => {
              setInventoryFocusCategoryId(categoryId)
              goTo('Inventory')
            }}
          />
        )
      default:
        return <EmptyState title="Access restricted" message="You do not have access to this page." />
    }
  })()

  return (
    <SettingsProvider settings={settings}>
      <div className="app">
        <Sidebar
          open={menu}
          close={() => setMenu(false)}
          admin={admin}
          pendingRequests={stockRequests.filter((request) => request.status === 'PENDING').length}
          attentionOrders={onlineOrders.filter((order) => order.orderStatus === 'NEEDS_ATTENTION').length}
        />
        {menu && <div className="mobile-overlay" onClick={() => setMenu(false)} />}
        <main>
          <Header
            page={page}
            menu={() => setMenu(true)}
            logout={firebaseConfigured ? signOutAdmin : undefined}
            admin={admin}
            pendingRequests={stockRequests.filter((request) => request.status === 'PENDING')}
            onOpenStockRequests={() => goTo('Stock Requests')}
            breadcrumbs={page === 'Inventory' ? headerBreadcrumbs : null}
          />
          <div className="content">{content}</div>
        </main>
        {settings.helpAssistantEnabled !== false && <HelpAssistant admin={admin} />}
        <SnowfallOverlay />
      </div>
    </SettingsProvider>
  )
}

function LoginRoute() {
  const [user, setUser] = useState(firebaseConfigured ? undefined : null)

  useEffect(() => (firebaseConfigured ? observeAuth(setUser) : undefined), [])

  if (user === undefined) return <div className="auth-loading">Checking your session…</div>
  // Always land on role Dashboard after sign-in (do not restore the previous deep link).
  if (user) return <Navigate to="/" replace />
  return <Login />
}

function HomeRedirect() {
  const [user, setUser] = useState(firebaseConfigured ? undefined : null)
  const [home, setHome] = useState('')

  useEffect(() => (firebaseConfigured ? observeAuth(setUser) : undefined), [])

  useEffect(() => {
    if (user === undefined) return
    if (!user) {
      setHome('/login')
      return
    }
    let active = true
    fetchMe()
      .then((me) => {
        if (!active) return
        const isAdmin = String(me?.role || 'ADMIN').toUpperCase() === 'ADMIN'
        setHome(`${roleBasePath(isAdmin)}/dashboard`)
      })
      .catch(() => {
        if (active) setHome('/login')
      })
    return () => { active = false }
  }, [user])

  if (user === undefined || !home) return <div className="auth-loading">Loading…</div>
  return <Navigate to={home} replace />
}

export default function App() {
  return (
    <ConfirmProvider>
      <ProcessingModalHost />
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/admin/*" element={<AppShell />} />
        <Route path="/user/*" element={<AppShell />} />
        <Route path="/" element={<HomeRedirect />} />
        <Route path="*" element={<HomeRedirect />} />
      </Routes>
    </ConfirmProvider>
  )
}
