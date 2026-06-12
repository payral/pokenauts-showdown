/**
 * Pokenauts / AshKetchup integration hooks.
 */

import {Pokenauts} from '../pokenauts-broker';

export const handlers: Chat.Handlers = {
	onBattleEnd(battle, winner) {
		Pokenauts.onBattleEnd(battle, winner);
	},
};
