# AshKetchup

Discord bot and local API for Pokenauts-backed Showdown battles.

Use the top-level `README.md` for the full two-service setup. This folder is only the Discord/integration service.

## Setup

```powershell
cd C:\Users\Peter\Documents\Code\pokemon\ashketchup
npm install
Copy-Item .env.example .env
```

Required Discord env vars:

```env
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
```

Important Showdown env vars:

```env
SHOWDOWN_PUBLIC_URL=http://localhost:8000
SHOWDOWN_INTERNAL_API_URL=http://localhost:8000
SHOWDOWN_RESULT_CALLBACK_URL=http://localhost:3001/showdown/pokenauts/results
POKENAUTS_SHOWDOWN_API_SECRET=local-pokenauts-v2-secret
SHOWDOWN_ROOT=../showdown
```

## Commands

Register Discord commands:

```powershell
npm run register:commands
```

Run locally:

```powershell
npm run dev
```

Health check:

```powershell
Invoke-RestMethod http://localhost:3001/health
```

## Discord Usage

```text
/ashketchup challenge opponent:@user wager:50
/ashketchup test wager:1
/help
```

Players reveal inventory by running:

```text
@Pokenauts pokemon
```

Then they click **Submit Team**, choose 3 visible Pokenauts slots, and receive a private Showdown join link when both teams are ready. No Teambuilder import is needed for the v2 private-link flow.

## Scripts

- `npm run dev` - run with `tsx watch`.
- `npm run build` - compile TypeScript to `dist/`.
- `npm run start` - run compiled JavaScript.
- `npm run typecheck` - TypeScript check without emitting files.
- `npm run register:commands` - register Discord slash commands for the configured guild.
