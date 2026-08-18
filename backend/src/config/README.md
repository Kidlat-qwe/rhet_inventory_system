# Backend config

Environment is loaded by `dotenv` in `env.js`, then validated with Zod.

## Database

`NODE_ENV` selects the `DB_*` block:

| `NODE_ENV` | Variables used | Typical database |
|---|---|---|
| `development` (default locally) | `DB_*_DEVELOPMENT` | `inventsys_dev` |
| `test` | `DB_*_TEST` | optional |
| `production` | `DB_*_PRODUCTION` | `inventsys_prod` |

Required per environment: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL`.

`DATABASE_URL` is a fallback only when the discrete `DB_*_<ENV>` set is incomplete.

On Coolify, set `NODE_ENV=production` so the API uses `inventsys_prod`. Keep local `NODE_ENV=development`.

Changing `NODE_ENV` in `.env` does nothing until the API process restarts. After restart, the console must print `Database: inventsys_dev` or `Database: inventsys_prod`. If those names never change, you are still on one database.

The Neon pooler connection includes the database in the URL path so `inventsys_dev` and `inventsys_prod` stay isolated.

After `pg_restore`, if the API says `users` does not exist, the database `search_path` is often empty. `npm run db:migrate` sets `search_path TO public` on that database.
