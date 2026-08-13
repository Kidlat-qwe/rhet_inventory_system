import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

// ---------------------------------------------------------------------------
// Knowledge base — predefined Q&A flows organised by topic.
// Each entry: { id, q (button label), answer (string | { steps }) }
// ---------------------------------------------------------------------------
const ALL_TOPICS = [
  {
    id: 'inventory-add',
    roles: ['ADMIN'],
    q: 'How do I add a new item to Inventory?',
    answer: {
      steps: [
        'Go to the **Inventory** page from the sidebar.',
        'Click the **+ Add Item** button (top-right).',
        'Select a **Category** (or create one first under Categories).',
        'Fill in: Item Name, SKU, Unit Price, Low Stock Threshold, and optionally Gender / Type / Size for uniforms.',
        'Click **Save**. The item appears in the Inventory list with status ACTIVE.',
      ],
    },
  },
  {
    id: 'stock-add',
    roles: ['ADMIN'],
    q: 'How do I add / deduct stock?',
    answer: {
      steps: [
        'Go to **Inventory** and find the item.',
        'Click the **···** actions menu on the row → choose **Add Stock** or **Deduct Stock**.',
        'Enter the quantity and an optional reason/note.',
        'Click **Confirm**. The movement is recorded in Stock Movements.',
      ],
    },
  },
  {
    id: 'stock-requests',
    q: 'How do I manage or invoice a Stock Request?',
    answer: {
      steps: [
        'Go to **Stock Requests** from the sidebar.',
        'Each CMS cart appears as one **request group** (multiple items stay together).',
        'Click **Manage** to see every line, internal selling price, and stock issues.',
        'Check the lines for **this shipment**. Unchecked ready lines stay Pending for shipment 2+. Out-of-stock lines cannot be selected.',
        'Tick **Items picked & verified**, then **Preview invoice**. Print if needed.',
        'Click **Confirm ship & save invoice** to deduct warehouse stock. Remaining Pending lines get a later invoice.',
        'Use **Reject** or **Return** on a single line when needed. Branch delivery is confirmed in CMS.',
      ],
    },
  },
  {
    id: 'categories',
    q: 'How do I create a Category?',
    answer: {
      steps: [
        'Go to **Categories** from the sidebar.',
        'Click **＋ Add category**.',
        'Enter a unique Category Name and choose the Category Type (e.g. School Uniform, Workbooks, Learning Kit, etc.).',
        'Click **Save**. Items can now be created under this category. Edit and delete remain admin-only.',
      ],
    },
  },
  {
    id: 'categories-delete',
    roles: ['ADMIN'],
    q: 'How do I delete a Category?',
    answer: {
      steps: [
        'Categories can only be deleted from the **Categories** page — not from Inventory.',
        'Open **Categories**, click **···** on the row → **Delete**.',
        'In the confirmation modal, **type the exact category name** to enable Delete.',
        'Click **Delete category**. This cannot be undone.',
      ],
    },
  },
  {
    id: 'release-logs',
    q: 'What is Release Logs?',
    answer: {
      steps: [
        '**Release Logs** shows the history of all approved and rejected stock requests.',
        'You can filter by date, status, or external reference.',
        'Each log entry links back to the original stock request and shows who approved/rejected it and when.',
      ],
    },
  },
  {
    id: 'stock-movements',
    q: 'What is Stock Movements?',
    answer: {
      steps: [
        '**Stock Movements** is the full audit trail of every stock change — adds, deductions, adjustments, returns, damage, and releases.',
        'Filter by date range or item to track down any quantity change.',
        'Each movement shows the user who performed the action and a timestamp.',
      ],
    },
  },
  {
    id: 'online-orders',
    q: 'How do Online Orders / Shopee work?',
    answer: {
      steps: [
        'Go to **Online Orders** in the sidebar.',
        'Import a Shopee CSV export using the **Import CSV** button, or create a manual order.',
        'Orders marked **Needs Attention** require you to check for inventory issues.',
        'Fulfilling an order automatically deducts stock from the matched inventory item.',
      ],
    },
  },
  {
    id: 'manual-orders',
    q: 'How do Manual Orders (non-Shopee) work?',
    answer: {
      steps: [
        'Go to **Manual Orders** — tabs match Scoring Shipping Management (Pending, Processing, Shipped, Delivered, Error, Ineligible, Needs attention).',
        'There is no Ready-to-ship step: from **Processing**, use **Update Status** → **Shipped** to deduct warehouse stock.',
        'For Scoring pushes with notes only, open the order → **Map items** using the remarks, then mark **Shipped**.',
        'Shopee marketplace orders stay on **Online Orders**, not Manual Orders.',
      ],
    },
  },
  {
    id: 'api-keys',
    roles: ['ADMIN'],
    q: 'How do I manage API Keys for external systems?',
    answer: {
      steps: [
        'Go to **API Keys** (Admin only).',
        'Click **+ Add Client** and enter the external system name (e.g. PSMS).',
        'Copy the generated key and provide it to the external system for their INVENTORY_INTEGRATION_KEY environment variable.',
        'You can revoke or regenerate a key from the ··· menu on the row.',
      ],
    },
  },
  {
    id: 'users',
    roles: ['ADMIN'],
    q: 'How do I manage Users?',
    answer: {
      steps: [
        'Go to **Users** (Admin only).',
        'Click **+ Invite User** to add a new user — enter their email, name, and role (Admin / User).',
        'To change a role or deactivate an account, click **···** → **Edit** on the user row.',
        'Deactivating blocks the user from signing in. You cannot deactivate your own account.',
      ],
    },
  },
  {
    id: 'settings',
    roles: ['ADMIN'],
    q: 'Where do I change org defaults (threshold, couriers, sizes)?',
    answer: {
      steps: [
        'Go to **Settings** (Admin only) under Management.',
        'Update organization name, timezone, default low-stock threshold, courier presets, and uniform/shirt sizes.',
        'Toggle **Help Assistant** on or off for all signed-in users.',
        'Click **Save settings**. New inventory items and Manual Orders pick up the new defaults immediately.',
      ],
    },
  },
  {
    id: 'notifications',
    q: 'How do notifications work?',
    answer: {
      steps: [
        'The bell icon (top-right header) shows a badge with the count of **unread pending stock requests**.',
        'A toast alert appears bottom-right when a new request arrives.',
        'Click the bell to open the notification panel and see the list.',
        'Click **Mark all as Read** to clear the badge, or **View all** to open the Stock Requests page.',
      ],
    },
  },
]

const GREETING_ADMIN = 'Hi! I\'m the RHET Inventory assistant (Admin). Choose a topic below or type a keyword to search.'
const GREETING_USER = 'Hi! I\'m the RHET Inventory assistant (User). Choose a topic below or type a keyword to search.'

const SUBTITLE_ADMIN = 'Manage inventory, handle stock approvals, and configure integrations.'
const SUBTITLE_USER = 'View inventory and stock request statuses, and track stock history.'

function matchTopics(query, topics) {
  if (!query.trim()) return topics
  const q = query.toLowerCase()
  return topics.filter(
    (t) =>
      t.q.toLowerCase().includes(q) ||
      (Array.isArray(t.answer?.steps) && t.answer.steps.some((s) => s.toLowerCase().includes(q))),
  )
}

function renderAnswer(answer) {
  if (!answer) return null
  if (typeof answer === 'string') {
    return <p className="ha-answer-text">{answer}</p>
  }
  if (answer.steps) {
    return (
      <ol className="ha-steps">
        {answer.steps.map((step, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: step.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
        ))}
      </ol>
    )
  }
  return null
}

export function HelpAssistant({ admin }) {
  const isAdmin = String(admin?.role || 'USER').toUpperCase() === 'ADMIN'

  const availableTopics = ALL_TOPICS.filter((topic) => {
    if (!Array.isArray(topic.roles) || topic.roles.length === 0) return true
    return isAdmin ? topic.roles.includes('ADMIN') : topic.roles.includes('USER')
  })

  const greeting = isAdmin ? GREETING_ADMIN : GREETING_USER
  const subtitle = isAdmin ? SUBTITLE_ADMIN : SUBTITLE_USER

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeTopic, setActiveTopic] = useState(null)
  const panelRef = useRef(null)
  const inputRef = useRef(null)

  const filtered = matchTopics(query, availableTopics)

  function openPanel() {
    setOpen(true)
    setActiveTopic(null)
    setQuery('')
  }

  function closePanel() {
    setOpen(false)
    setActiveTopic(null)
    setQuery('')
  }

  function pickTopic(topic) {
    setActiveTopic(topic)
    setQuery('')
  }

  function goBack() {
    setActiveTopic(null)
    setQuery('')
  }

  useEffect(() => {
    if (!open) return undefined
    function onKey(e) {
      if (e.key === 'Escape') closePanel()
    }
    function onPointer(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) closePanel()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [open])

  useEffect(() => {
    if (open && !activeTopic) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open, activeTopic])

  return (
    <div className="ha-root" ref={panelRef}>
      {open && (
        <div className="ha-panel" role="dialog" aria-label="RHET Help Assistant">
          <div className="ha-head">
            {activeTopic ? (
              <button type="button" className="ha-back" onClick={goBack} aria-label="Back to topics">
                <Icon name="back" size={14} />
                <span>Back</span>
              </button>
            ) : (
              <div className="ha-head-title">
                <span className="ha-bot-icon" aria-hidden="true"><Icon name="help" size={15} /></span>
                <div className="ha-head-title-text">
                  <strong>Help Assistant</strong>
                  <p>{subtitle}</p>
                </div>
              </div>
            )}
            <button type="button" className="ha-close" onClick={closePanel} aria-label="Close help">×</button>
          </div>

          <div className="ha-body">
            {activeTopic ? (
              <div className="ha-detail">
                <p className="ha-question">{activeTopic.q}</p>
                {renderAnswer(activeTopic.answer)}
              </div>
            ) : (
              <>
                <p className="ha-greeting">{greeting}</p>
                <div className="ha-search-wrap">
                  <input
                    ref={inputRef}
                    type="search"
                    className="ha-search"
                    placeholder="Search topics…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Search help topics"
                  />
                </div>
                <div className="ha-topics">
                  {filtered.length === 0 ? (
                    <p className="ha-empty">No results for "{query}"</p>
                  ) : (
                    filtered.map((topic) => (
                      <button
                        key={topic.id}
                        type="button"
                        className="ha-topic-btn"
                        onClick={() => pickTopic(topic)}
                      >
                        {topic.q}
                        <span className="ha-chevron" aria-hidden="true">›</span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        className={`ha-fab${open ? ' is-open' : ''}`}
        onClick={open ? closePanel : openPanel}
        aria-label={open ? 'Close help assistant' : 'Open help assistant'}
      >
        {open
          ? <span aria-hidden="true" style={{ fontSize: 22, lineHeight: 1 }}>×</span>
          : <Icon name="help" size={20} />}
      </button>
    </div>
  )
}
