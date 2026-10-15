# Pokenauts Showdown

## Demo

[![Watch the Pokenauts Showdown demo](https://img.youtube.com/vi/VEGTR_RrASY/hqdefault.jpg)](https://www.youtube.com/watch?v=VEGTR_RrASY)

[Watch the demo on YouTube](https://www.youtube.com/watch?v=VEGTR_RrASY).

Self-hosted Pokemon Showdown battles for a Discord/Pokenauts server.

This repo is a two-service monorepo:

- `showdown/` - the Pokemon Showdown server with AshKetchup private-link battle hooks.
- `ashketchup/` - the Discord bot and local integration API.

Run it from two PowerShell windows: one for Showdown, one for AshKetchup.

## First-Time Setup

Install dependencies in both services:

```powershell
cd C:\Users\Peter\Documents\Code\pokemon\showdown
npm install

cd C:\Users\Peter\Documents\Code\pokemon\ashketchup
npm install
```

Create AshKetchup's local environment file:

```powershell
cd C:\Users\Peter\Documents\Code\pokemon\ashketchup
Copy-Item .env.example .env
```

Fill in the Discord values in `ashketchup\.env`:

```env
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-discord-application-client-id
DISCORD_GUILD_ID=your-discord-server-id
DISCORD_MATCH_CHANNEL_NAME=pokemon-in-space
DISCORD_RESULT_CHANNEL_IDS=pokemon-in-space-channel-id,commons-channel-id
```

The private-link bridge uses the same shared secret on both services:

```env
POKENAUTS_SHOWDOWN_API_SECRET=local-pokenauts-v2-secret
```

For local-only testing, keep:

```env
SHOWDOWN_PUBLIC_URL=http://localhost:8000
SHOWDOWN_INTERNAL_API_URL=http://localhost:8000
SHOWDOWN_RESULT_CALLBACK_URL=http://localhost:3001/showdown/pokenauts/results
SHOWDOWN_ROOT=../showdown
```

If friends outside your network need battle links, set `SHOWDOWN_PUBLIC_URL` to your public URL or IP:

```env
SHOWDOWN_PUBLIC_URL=http://YOUR_PUBLIC_IP:8000
```

Register Discord slash commands after first setup or command changes:

```powershell
cd C:\Users\Peter\Documents\Code\pokemon\ashketchup
npm run register:commands
```

## Terminal 1: Showdown

```powershell
cd C:\Users\Peter\Documents\Code\pokemon\showdown
npm run build
npm start
```

Open:

```text
http://localhost:8000
```

## Terminal 2: AshKetchup

```powershell
cd C:\Users\Peter\Documents\Code\pokemon\ashketchup
npm run dev
```

Expected logs include:

```text
[service] ashketchup started
[service] HTTP listening on http://localhost:3001
[discord] Logged in as AshKetchup#....
```

## Discord Flow

Use these commands:

```text
/help
/ashketchup challenge opponent:@user wager:50
/ashketchup test wager:1
```

Normal match flow:

1. A player runs `/ashketchup challenge opponent:@user`.
2. Both players run `@Pokenauts pokemon` in the match channel.
3. Each player pages through inventory until their 3 desired slots have appeared.
4. Each player clicks **Submit Team** and enters 3 Pokenauts slot numbers.
5. AshKetchup creates a private Showdown battle and enables **Join Battle**.
6. Each player clicks **Join Battle** to receive their private Showdown link.
7. Showdown injects their selected team automatically. No Teambuilder needed.
8. When the battle ends, AshKetchup posts the result and updates local W-L-D records.

Solo test flow:

```text
/ashketchup test wager:1
```

Then submit your 3 slots. AshKetchup gives you both private links, so you can open one side in a normal browser and the other in incognito, then forfeit one side to test result reporting.

## Battle Rules

- Battles are 3v3.
- Players must use Pokemon from their Pokenauts inventory.
- Pokemon above level 50 are capped at level 50.
- Movesets are generated from local Showdown data.
- Team Preview is disabled with `gen9customgame@@@!teampreview`.
- Wagers are manual: after the result, the loser pays the winner with a Pokenauts trade.
- W-L-D records are stored locally by AshKetchup in `ashketchup\data\discord-battle-records.json`.

## Common Fixes

If Discord commands do not show up:

```powershell
cd C:\Users\Peter\Documents\Code\pokemon\ashketchup
npm run register:commands
```

If AshKetchup cannot see Pokenauts inventory output:

- Enable **Message Content Intent** in the Discord Developer Portal.
- Make sure AshKetchup can read the match channel.
- Make sure players run `@Pokenauts pokemon` in that channel.

If private battle links fail:

- Restart both services after code/config changes.
- Confirm `POKENAUTS_SHOWDOWN_API_SECRET` matches in `ashketchup\.env` and `showdown\config\config.js`.
- Confirm `SHOWDOWN_INTERNAL_API_URL` points to the local Showdown server.
- Confirm `SHOWDOWN_PUBLIC_URL` is reachable by the people clicking Discord links.

## Repo Notes

This repo intentionally keeps Showdown and AshKetchup together because v2 private-link battles require both sides to change together.

The old nested Git metadata from the pre-monorepo repos is backed up locally in `.repo-git-backups/` and ignored by this repo.
