# Shared UI Components

Reusable presentational and modal components used across admin and user pages.

| File | Purpose |
|------|---------|
| `Icon.jsx` | SVG icon set (`grid`, `box`, `swap`, `report`, `tag`, `users`, `settings`, `link`, `list`, `cart`, `bell`, `help`, `back`, `search`) |
| `EmptyState.jsx` | Empty list / no-data placeholder |
| `PageLoading.jsx` | Full-page loading indicator |
| `ProcessingModal.jsx` | Global progress modal for mutating API calls (add / update / delete). Driven by `services/api.js`. |
| `ConfirmModal.jsx` | In-app confirmation dialog (replaces `window.confirm`). Used via `useConfirm()` from `ConfirmContext` on admin and user pages. |
| `StatusBadge.jsx` | Status pill with color class. Optional `label` overrides display text (used for Shopee-aligned online-order fulfillment labels). |
| `MovementTable.jsx` | Stock movement history table (optional order/notes column for online logs). `compact` hides Processed by for dashboard side-by-side layout. Always shows column headers; empty state renders inside the table body. |
| `Sidebar.jsx` | App navigation sidebar; organization name from Settings |
| `Header.jsx` | Top bar with breadcrumbs, stock-request notifications (count badge, toast alert, **Mark all as Read**), account menu (**Forgot password** / **Log out**) |
| `CategoryModal.jsx` | Create / edit category. **Category type**: Merchandise / Supplies. **Kind**: Uniform (subtype School / PE / Shirt), **Bundle** (stored as `LEARNING_KIT` — Learning Kit, Moving Up Kit, similar packs), Others. Others can enable **Parent items with child SKUs**. Optional **category image** with **Upload / Change / Remove** (PNG/JPG/WEBP/GIF, max 10 MB) shown as the item icon on inventory tables. |
| `CategoryThumb.jsx` | Renders a category `imageUrl` or a box-icon fallback (used in inventory item rows). |
| `DeleteCategoryModal.jsx` | Admin-only delete confirm: must type the exact category name. Can delete categories that still have items (cascades item delete when safe). |
| `DeleteInventoryModal.jsx` | Admin-only delete confirm for an inventory item: must type the exact item name. Shows SKU; completed stock requests are unlinked; blocked for online orders / active requests / kit BOM. |
| `ItemModal.jsx` | Create / edit a single inventory item. Requires **Selling price** and **Internal selling price**. **Bundle** (`LEARNING_KIT`): category-slot BOM with editable **Qty / kit** (default 1); modal stays within the viewport (header/actions pinned; included-categories table scrolls; **+ Add row** scrolls to the new row). Empty extra rows are ignored on save; a category can appear only once **per bundle**. **Tool Kit**: parent metadata only — raw children are added from the Tool Kit raw-items page modal. For **Shirt** (`LCA_SHIRT`), shows Gender / **Logo** (Beeli, LCA, **+ Add logo**) / Size. Non-uniform SKUs regenerate on rename; uniform SKUs stay locked. |
| `ToolKitRawItemModal.jsx` | Popup to add or **edit** a Tool Kit raw child: **Create new**, **Use existing** (shared SKU/stock across parents), or rename item name / variation on an existing raw item. Typing a name that already exists prompts to link the shared item. |
| `UniformItemModal.jsx` | Add / edit School or PE uniform. Toggle **Per piece** (Polo+Short / Shirt+Pants, each own stock) or **Set** (one SKU with independent set stock, type `Set` / SKU code `SET`). LCA T-Shirt uses `ItemModal` instead. |
| `HelpAssistant.jsx` | Floating help button (bottom-right). Cleared from pagination via content/pager padding. Rule-based FAQ; visibility from org Settings (`helpAssistantEnabled`). |
| `SantaSleighParade.jsx` | Compact Santa + reindeer (2-frame gallop) left→right, with a mini landscape **banner hitched to Santa’s vehicle** showing **Christmas Day countdown** in `Asia/Manila` (UTC+8). Part of snowfall. |
| `SnowfallOverlay.jsx` | Full-viewport `react-snowfall` with real snowflake SVGs, plus `SantaSleighParade` (sleigh banner + reindeer + Santa). Pointer-events none. Toggled from org Settings (`snowfallEnabled`). |
| `ActionsMenu.jsx` | Floating ellipsis (•••) actions menu rendered in a portal |
| `StockRequestExportModal.jsx` | 2-step export: select all/multiple branches, then period (today / date / week / month). Delivered lines only → XLSX. |
| `TableHeadSelect.jsx` | Borderless table-header filter (Inventory Categories / Merchandise / Supplies). Custom menu in a portal so native `<select>` chrome is not used. |
| `Pagination.jsx` | Presentational pager (pairs with the `usePagination` hook) |
| `StockModal.jsx` | Add / deduct / adjust stock form |
| `AllocationModal.jsx` | Legacy Shopee allocate/deallocate form (UI hidden; reserved for future Open API) |

Import with named exports from each file, for example:

```js
import { Icon } from '../components/Icon'
import { Sidebar } from '../components/Sidebar'
import { Header } from '../components/Header'
```
