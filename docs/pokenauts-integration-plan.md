# Pokenauts Showdown Integration Plan

## Current Structure

This project is now a two-service monorepo:

```text
showdown/
ashketchup/
```

`showdown/` is the self-hosted Pokemon Showdown server. It includes a small Pokenauts match broker that lets AshKetchup create private-link battles with server-injected teams.

`ashketchup/` is the Discord bot and local integration API. It parses visible Pokenauts inventory embeds, creates 3v3 Showdown teams, sends private Discord join links, and records results.

## Local Startup

Start Showdown:

```powershell
cd C:\Users\Peter\Documents\Code\pokemon\showdown
npm run build
npm start
```

Start AshKetchup:

```powershell
cd C:\Users\Peter\Documents\Code\pokemon\ashketchup
npm run dev
```

Showdown runs at:

```text
http://localhost:8000
```

AshKetchup runs at:

```text
http://localhost:3001
```

## Current V2 Flow

1. A Discord user starts `/ashketchup challenge opponent:@user`.
2. Both players run `@Pokenauts pokemon` in the configured match channel.
3. AshKetchup parses visible inventory pages from Pokenauts embeds.
4. Each player clicks **Submit Team** and enters 3 visible inventory slots.
5. AshKetchup generates and validates packed Showdown teams.
6. AshKetchup calls Showdown's local `/pokenauts/api/matches` endpoint.
7. Showdown creates a pending battle with two single-use private join tokens.
8. Each player clicks **Join Battle** and receives their own ephemeral link.
9. Showdown renames the browser session to a temporary name like `Balance-7oPMRk2A`, injects that player's team, and starts when both players join.
10. Showdown reports the result back to AshKetchup, which posts the result and updates local W-L-D records.

## Why One Repo

Private-link battles require both services to change together. Keeping Showdown hooks and AshKetchup code in one repo makes setup, versioning, and debugging much easier than coordinating two separate repos.

## Next Milestones

1. Harden private-link joins for players sharing the same public IP.
2. Add better match cancellation/expiry messages.
3. Improve move generation and format rules.
4. Add local persistence for pending matches if restarts become painful.
5. Improve wager UX, while keeping Pokecoin movement manual unless Pokenauts exposes a safe automation path.
