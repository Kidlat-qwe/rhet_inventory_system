# Context

React context providers shared across the authenticated app shell.

| File | Purpose |
|------|---------|
| `SettingsContext.jsx` | Org settings from `GET /settings` (threshold, couriers, sizes, shirt logos, branding, Help Assistant, Snowfall). Use `useSettings()`. |
| `ConfirmContext.jsx` | App-wide confirmation modal. Use `const confirm = useConfirm()` then `await confirm({ title, message, danger })`. Mounted in `App.jsx` for admin and user routes. |
