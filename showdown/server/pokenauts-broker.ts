/**
 * Pokenauts match broker
 *
 * Local-only bridge for AshKetchup-created battles. This intentionally avoids
 * the normal ladder/challenge flow so Pokenauts teams can be injected without
 * requiring players to use Teambuilder.
 */

import { Utils } from '../lib';
import * as crypto from 'crypto';
import type { RoomBattle } from './room-battle';

const TOKEN_BYTES = 18;
const NAME_SUFFIX_LENGTH = 8;
const DEFAULT_TOKEN_TTL = 30 * 60 * 1000;
const DEFAULT_AUTO_CLAIM_TTL = 2 * 60 * 1000;

interface PokenautsCreateMatchRequest {
	secret?: string;
	publicBaseUrl?: string;
	matchId?: string;
	format?: string;
	callbackUrl?: string;
	players?: PokenautsCreatePlayer[];
}

interface PokenautsCreatePlayer {
	key?: string;
	discordId?: string;
	displayName?: string;
	team?: string;
	selectedPokemon?: PokenautsSelectedPokemon[];
}

interface PokenautsSelectedPokemon {
	slot?: number;
	species?: string;
	pokenautsLevel?: number;
	showdownLevel?: number;
}

interface PokenautsPendingPlayer {
	key: string;
	discordId: string;
	displayName: string;
	showdownName: string;
	slot: SideID;
	team: string;
	token: string;
	claimedUserId: ID | null;
	claimedAt: number | null;
	selectedPokemon: PokenautsSelectedPokemon[];
}

interface PokenautsPendingMatch {
	matchId: string;
	format: string;
	roomId: RoomID;
	callbackUrl: string | null;
	createdAt: number;
	expiresAt: number;
	players: PokenautsPendingPlayer[];
	resultPosted: boolean;
}

interface PendingAutoClaim {
	token: string;
	expiresAt: number;
}

export interface PokenautsHttpResponse {
	statusCode: number;
	body: string;
	headers?: Record<string, string>;
}

class PokenautsBroker {
	private readonly matches = new Map<string, PokenautsPendingMatch>();
	private readonly tokenToMatch = new Map<string, string>();
	private readonly pendingAutoClaimsByIp = new Map<string, PendingAutoClaim[]>();

	async handleCreateMatchRequest(rawBody: string, headers: Record<string, string | undefined>): Promise<PokenautsHttpResponse> {
		let body: PokenautsCreateMatchRequest;
		try {
			body = JSON.parse(rawBody || '{}');
		} catch {
			return this.json({ok: false, error: 'Invalid JSON body'}, 400);
		}

		const configuredSecret = this.readSecret();
		const providedSecret = body.secret || readBearer(headers.authorization) || headers['x-pokenauts-secret'];
		if (!configuredSecret || providedSecret !== configuredSecret) {
			return this.json({ok: false, error: 'Missing or invalid Pokenauts API secret'}, 403);
		}

		try {
			const match = await this.createMatch(body);
			return this.json({
				ok: true,
				match: {
					matchId: match.matchId,
					format: match.format,
					roomId: match.roomId,
					joinLinks: Object.fromEntries(match.players.map(player => [
						player.key,
						`${normalizeBaseUrl(body.publicBaseUrl || '')}/pokenauts/join/${player.token}`,
					])),
					players: Object.fromEntries(match.players.map(player => [
						player.key,
						{
							discordId: player.discordId,
							showdownName: player.showdownName,
							slot: player.slot,
						},
					])),
				},
			});
		} catch (error) {
			return this.json({ok: false, error: error instanceof Error ? error.message : String(error)}, 400);
		}
	}

	handleJoinLinkRequest(token: string, ip: string): PokenautsHttpResponse {
		this.cleanup();

		const player = this.getPlayerByToken(token);
		if (!player) return this.html('AshKetchup link expired', '<p>This private battle link is expired or invalid.</p>', 404);

		const match = this.matches.get(this.tokenToMatch.get(token)!);
		if (!match) return this.html('AshKetchup link expired', '<p>This private battle link is expired or invalid.</p>', 404);

		const pendingClaims = this.pendingAutoClaimsByIp.get(ip) || [];
		pendingClaims.push({
			token,
			expiresAt: Date.now() + DEFAULT_AUTO_CLAIM_TTL,
		});
		this.pendingAutoClaimsByIp.set(ip, pendingClaims);

		const roomPath = `/${match.roomId}`;
		return {
			statusCode: 302,
			headers: {
				Location: roomPath,
				'Cache-Control': 'no-store',
			},
			body: `Redirecting to ${roomPath}`,
		};
	}

	tryAutoClaim(ip: string, user: User, connection: Connection): void {
		const pendingClaims = this.pendingAutoClaimsByIp.get(ip);
		if (!pendingClaims?.length) return;

		const now = Date.now();
		while (pendingClaims.length && pendingClaims[0].expiresAt <= now) {
			pendingClaims.shift();
		}
		if (!pendingClaims.length) {
			this.pendingAutoClaimsByIp.delete(ip);
			return;
		}

		const claim = pendingClaims.shift()!;
		if (!pendingClaims.length) this.pendingAutoClaimsByIp.delete(ip);

		void this.claimToken(claim.token, user, connection);
	}

	async claimToken(token: string, user: User, connection: Connection): Promise<void> {
		this.cleanup();

		const matchId = this.tokenToMatch.get(token);
		const match = matchId ? this.matches.get(matchId) : undefined;
		const player = match?.players.find(curPlayer => curPlayer.token === token);
		if (!match || !player) {
			connection.popup('This AshKetchup battle link is expired or invalid.');
			return;
		}

		const room = Rooms.get(match.roomId);
		const battle = room?.game as RoomBattle | undefined;
		if (!room || !battle || battle.ended) {
			connection.popup('This AshKetchup battle room is no longer available.');
			return;
		}

		if (player.claimedUserId && player.claimedUserId !== user.id) {
			connection.popup('This AshKetchup battle link has already been claimed.');
			return;
		}

		player.showdownName = this.ensureAvailableShowdownName(player.showdownName, player.displayName, user);
		if (!user.forceRename(player.showdownName, false)) {
			connection.popup('AshKetchup could not prepare your temporary Showdown name. Try the link again.');
			return;
		}

		// Token possession is the invite for this reserved slot. RoomBattle.joinGame
		// enforces that non-staff users are invited before joining an empty slot.
		battle[player.slot].invite = user.id;
		user.joinRoom(room, connection);
		const joined = battle.joinGame(user, player.slot, {team: player.team});
		if (!joined) return;

		player.claimedUserId = user.id;
		player.claimedAt = Date.now();
		connection.popup(`AshKetchup joined you to ${room.roomid}. Good luck!`);
	}

	onBattleEnd(battle: RoomBattle, winner: ID): void {
		const match = [...this.matches.values()].find(curMatch => curMatch.roomId === battle.roomid);
		if (!match || match.resultPosted) return;
		match.resultPosted = true;

		if (!match.callbackUrl) return;

		const players = match.players.map(player => ({
			key: player.key,
			discordId: player.discordId,
			showdownName: player.showdownName,
			userId: toID(player.showdownName),
			slot: player.slot,
			selectedPokemon: player.selectedPokemon,
		}));
		const winnerPlayer = players.find(player => player.userId === winner);
		const payload = {
			ok: true,
			matchId: match.matchId,
			roomId: match.roomId,
			winner: winner || null,
			winnerKey: winnerPlayer?.key || null,
			winnerDiscordId: winnerPlayer?.discordId || null,
			tied: !winner,
			players,
		};

		void this.postCallback(match.callbackUrl, payload);
	}

	private async createMatch(body: PokenautsCreateMatchRequest): Promise<PokenautsPendingMatch> {
		this.cleanup();

		const matchId = body.matchId?.trim();
		const format = body.format?.trim();
		if (!matchId) throw new Error('matchId is required');
		if (!format) throw new Error('format is required');
		if (this.matches.has(matchId)) throw new Error(`Match ${matchId} already exists`);
		if (!body.players || body.players.length !== 2) throw new Error('Exactly two players are required');

		for (const player of body.players) {
			if (!player.key) throw new Error('Each player requires a key');
			if (!player.discordId) throw new Error('Each player requires a discordId');
			if (!player.displayName) throw new Error('Each player requires a displayName');
			if (!player.team) throw new Error('Each player requires a packed team');

			const validationResult = await TeamValidatorAsync.get(format).validateTeam(player.team, {removeNicknames: true});
			if (validationResult?.startsWith('0')) {
				throw new Error(`Team for ${player.key} was rejected: ${validationResult.slice(1).replace(/\n/g, ' ')}`);
			}
		}

		const room = Rooms.createBattle({
			format,
			players: [],
			rated: 0,
			challengeType: 'challenge',
			delayedStart: true,
		});
		if (!room?.game) throw new Error('Could not create Showdown battle room');

		const slots = ['p1', 'p2'] as SideID[];
		const players = body.players.map((rawPlayer, index): PokenautsPendingPlayer => ({
			key: rawPlayer.key!,
			discordId: rawPlayer.discordId!,
			displayName: rawPlayer.displayName!,
			showdownName: makeShowdownName(rawPlayer.displayName!),
			slot: slots[index],
			team: rawPlayer.team!,
			token: crypto.randomBytes(TOKEN_BYTES).toString('base64url'),
			claimedUserId: null,
			claimedAt: null,
			selectedPokemon: rawPlayer.selectedPokemon || [],
		}));

		const match: PokenautsPendingMatch = {
			matchId,
			format,
			roomId: room.roomid,
			callbackUrl: body.callbackUrl || null,
			createdAt: Date.now(),
			expiresAt: Date.now() + DEFAULT_TOKEN_TTL,
			players,
			resultPosted: false,
		};

		this.matches.set(match.matchId, match);
		for (const player of players) this.tokenToMatch.set(player.token, match.matchId);
		return match;
	}

	private ensureAvailableShowdownName(currentName: string, displayName: string, user: User): string {
		if (!Users.getExact(toID(currentName)) || Users.getExact(toID(currentName)) === user) {
			return currentName;
		}

		for (let i = 0; i < 10; i++) {
			const candidate = makeShowdownName(displayName);
			if (!Users.getExact(toID(candidate)) || Users.getExact(toID(candidate)) === user) {
				return candidate;
			}
		}

		return makeShowdownName('Pokenauts');
	}

	private getPlayerByToken(token: string): PokenautsPendingPlayer | undefined {
		const matchId = this.tokenToMatch.get(token);
		const match = matchId ? this.matches.get(matchId) : undefined;
		return match?.players.find(player => player.token === token);
	}

	private cleanup(): void {
		const now = Date.now();
		for (const [matchId, match] of this.matches) {
			if (match.expiresAt > now && !match.resultPosted) continue;
			this.matches.delete(matchId);
			for (const player of match.players) this.tokenToMatch.delete(player.token);
		}

		for (const [ip, claims] of this.pendingAutoClaimsByIp) {
			const activeClaims = claims.filter(claim => claim.expiresAt > now);
			if (activeClaims.length) {
				this.pendingAutoClaimsByIp.set(ip, activeClaims);
			} else {
				this.pendingAutoClaimsByIp.delete(ip);
			}
		}
	}

	private readSecret(): string {
		return String(Config.pokenautsapisecret || '').trim();
	}

	private json(payload: AnyObject, statusCode = 200): PokenautsHttpResponse {
		return {
			statusCode,
			headers: {
				'Content-Type': 'application/json; charset=utf-8',
				'Cache-Control': 'no-store',
			},
			body: JSON.stringify(payload),
		};
	}

	private html(title: string, body: string, statusCode = 200): PokenautsHttpResponse {
		return {
			statusCode,
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
				'Cache-Control': 'no-store',
			},
			body: `<!doctype html><meta charset="utf-8"><title>${Utils.escapeHTML(title)}</title>${body}`,
		};
	}

	private async postCallback(callbackUrl: string, payload: AnyObject): Promise<void> {
		try {
			const response = await (globalThis as any).fetch(callbackUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this.readSecret()}`,
				},
				body: JSON.stringify(payload),
			});
			if (!response.ok) {
				Monitor.warn(`[pokenauts] Result callback failed with HTTP ${response.status}`);
			}
		} catch (error) {
			Monitor.warn(`[pokenauts] Result callback failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
}

function makeShowdownName(displayName: string): string {
	const suffix = crypto.randomBytes(6).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, NAME_SUFFIX_LENGTH);
	const base = displayName.replace(/[^A-Za-z0-9]/g, '') || 'Pokenauts';
	const maxBaseLength = 18 - suffix.length - 1;
	return `${base.slice(0, maxBaseLength)}-${suffix}`;
}

function normalizeBaseUrl(url: string): string {
	const trimmed = url.trim().replace(/\/+$/, '');
	return trimmed || `http://localhost:${Config.port || 8000}`;
}

function readBearer(header: string | undefined): string | undefined {
	if (!header) return undefined;
	const match = header.match(/^Bearer\s+(.+)$/i);
	return match?.[1]?.trim();
}

export const Pokenauts = new PokenautsBroker();
