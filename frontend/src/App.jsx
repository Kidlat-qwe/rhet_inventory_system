import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import './App.css'
import { EmptyState } from './components/EmptyState'
import { Header } from './components/Header'
import { PageLoading } from './components/PageLoading'
import { Sidebar } from './components/Sidebar'
import {
  AdminApiKeys,
  AdminCategories,
  AdminDashboard,
  AdminInventory,
  AdminReleaseLogs,
  AdminReports,
  AdminSettings,
  AdminStockMovements,
  AdminStockRequests,
  AdminUsers,
  AdminOnlineOrders,
} from './pages/admin'
import Login from './pages/Login'
import {
  UserCategories,
  UserDashboard,
  UserInventory,
  UserReleaseLogs,
  UserReports,
  UserStockMovements,
  UserStockRequests,
  UserOnlineOrders,
} from './pages/user'
import { ADMIN_PAGES, USER_PAGES, pageFromPath, pathForPage, roleBasePath } from './routes/paths'
import { downloadCsv } from './services/api'
import { firebaseConfigured, observeAuth, signOutAdmin } from './services/firebase'
import {
  fetchUsers,
  fetchCategories,
  fetchDashboard,
  fetchInventory,
  fetchMe,
  fetchMovements,
  fetchStockRequests,
  fetchIntegrationClients,
} from './services/inventoryApi'
import { fetchChannelAllocations } from './services/channelAllocationApi'
import { fetchOnlineOrders } from './services/onlineOrdersApi'

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
  const [stockRequests, setStockRequests] = useState([])
  const [onlineOrders, setOnlineOrders] = useState([])
  const [channelAllocations, setChannelAllocations] = useState([])
  const [integrationClients, setIntegrationClients] = useState([])
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const stockRequestsRefreshInFlight = useRef(false)

  const routeInfo = useMemo(() => pageFromPath(location.pathname), [location.pathname])
  const page = routeInfo?.page || 'Dashboard'

  const reload = useCallback(async (options = {}) => {
    const silent = Boolean(options?.silent)
    if (!silent) setLoading(true)
    setError('')
    try {
      const me = await fetchMe()
      const roleIsAdmin = String(me?.role || 'ADMIN').toUpperCase() === 'ADMIN'
      const [dash, cats, inv, mov, requests, online, allocations, adminList, clients] = await Promise.all([
        fetchDashboard(),
        fetchCategories(),
        fetchInventory({ limit: 100, sortBy: 'updatedAt', order: 'desc' }),
        fetchMovements({ limit: 50 }),
        fetchStockRequests({ limit: 100 }),
        fetchOnlineOrders({ limit: 100 }),
        fetchChannelAllocations(),
        roleIsAdmin ? fetchUsers() : Promise.resolve([]),
        roleIsAdmin ? fetchIntegrationClients() : Promise.resolve([]),
      ])
      setAdmin(me)
      setDashboard(dash)
      setCategories(cats)
      setInventory(inv.data)
      setMovements(mov.data)
      setStockRequests(requests.data)
      setOnlineOrders(online.data)
      setChannelAllocations(allocations)
      setIntegrationClients(clients)
      setAdmins(adminList)
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  const refreshQuietly = useCallback(() => reload({ silent: true }), [reload])

  const refreshStockRequests = useCallback(async () => {
    if (stockRequestsRefreshInFlight.current) return
    stockRequestsRefreshInFlight.current = true
    try {
      const requests = await fetchStockRequests({ limit: 100 })
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
      const [requests, inv, mov, dash] = await Promise.all([
        fetchStockRequests({ limit: 100 }),
        fetchInventory({ limit: 100, sortBy: 'updatedAt', order: 'desc' }),
        fetchMovements({ limit: 50 }),
        fetchDashboard(),
      ])
      setStockRequests(requests.data)
      setInventory(inv.data)
      setMovements(mov.data)
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
    if (!firebaseConfigured || !user || loading) return
    if (page !== 'Stock Requests') return

    let cancelled = false

    const poll = async () => {
      if (cancelled) return
      if (document.visibilityState !== 'visible') return
      await refreshStockRequests()
    }

    poll()
    const intervalId = setInterval(poll, 10000)

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

  async function handleExport() {
    try {
      await downloadCsv('/reports/inventory.csv', 'inventory-report.csv')
    } catch (err) {
      setError(err.message)
    }
  }

  function goTo(pageName) {
    navigate(pathForPage(isAdmin, pageName))
  }

  if (user === undefined) return <div className="auth-loading">Checking your session…</div>
  if (firebaseConfigured && !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  const content = (() => {
    if (loading) return <PageLoading />
    if (error) return <div className="page-error">{error}</div>

    if (isAdmin) {
      switch (page) {
        case 'Dashboard':
          return <AdminDashboard dashboard={dashboard} admin={admin} goInventory={() => goTo('Inventory')} goMovements={() => goTo('Stock Movements')} />
        case 'Inventory':
          return <AdminInventory items={inventory} categories={categories} allocations={channelAllocations} onRefresh={refreshQuietly} onExport={handleExport} />
        case 'Stock Requests':
          return <AdminStockRequests requests={stockRequests} onRefresh={refreshAfterStockDecision} />
        case 'Online Orders':
          return <AdminOnlineOrders orders={onlineOrders} inventory={inventory} onRefresh={refreshQuietly} canManage />
        case 'Release Logs':
          return <AdminReleaseLogs requests={stockRequests} />
        case 'Stock Movements':
          return <AdminStockMovements movements={movements} />
        case 'Categories':
          return <AdminCategories categories={categories} items={inventory} onRefresh={refreshQuietly} />
        case 'Users':
          return <AdminUsers users={admins} currentAdmin={admin} onRefresh={refreshQuietly} />
        case 'API Keys':
          return <AdminApiKeys clients={integrationClients} onRefresh={refreshQuietly} />
        case 'Reports':
          return <AdminReports dashboard={dashboard} onExport={handleExport} />
        case 'Settings':
          return <AdminSettings admin={admin} />
        default:
          return <EmptyState title={page} message="This page is not available." />
      }
    }

    switch (page) {
      case 'Dashboard':
        return <UserDashboard dashboard={dashboard} admin={admin} goInventory={() => goTo('Inventory')} goMovements={() => goTo('Stock Movements')} />
      case 'Inventory':
        return <UserInventory items={inventory} categories={categories} allocations={channelAllocations} onRefresh={refreshQuietly} onExport={handleExport} />
      case 'Stock Requests':
        return <UserStockRequests requests={stockRequests} onRefresh={refreshAfterStockDecision} />
      case 'Online Orders':
        return <UserOnlineOrders orders={onlineOrders} inventory={inventory} onRefresh={refreshQuietly} />
      case 'Release Logs':
        return <UserReleaseLogs requests={stockRequests} />
      case 'Stock Movements':
        return <UserStockMovements movements={movements} />
      case 'Categories':
        return <UserCategories categories={categories} onRefresh={refreshQuietly} />
      case 'Reports':
        return <UserReports dashboard={dashboard} onExport={handleExport} />
      default:
        return <EmptyState title="Access restricted" message="You do not have access to this page." />
    }
  })()

  return (
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
        <Header page={page} menu={() => setMenu(true)} logout={firebaseConfigured ? signOutAdmin : undefined} admin={admin} />
        <div className="content">{content}</div>
      </main>
    </div>
  )
}

function LoginRoute() {
  const [user, setUser] = useState(firebaseConfigured ? undefined : null)
  const location = useLocation()

  useEffect(() => (firebaseConfigured ? observeAuth(setUser) : undefined), [])

  if (user === undefined) return <div className="auth-loading">Checking your session…</div>
  if (user) {
    const from = location.state?.from
    if (typeof from === 'string' && from.startsWith('/') && from !== '/login') {
      return <Navigate to={from} replace />
    }
    return <Navigate to="/" replace />
  }
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
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/admin/*" element={<AppShell />} />
      <Route path="/user/*" element={<AppShell />} />
      <Route path="/" element={<HomeRedirect />} />
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  )
}
