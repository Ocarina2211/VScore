import { describe, expect, it } from "vitest";
import {
	createGameIdentityMatcher,
	dedupeGamesByIdentity,
	findSameGameIndex,
	gameNameSet,
	hasMeaningfulRating,
	isSameGame,
	normalizeGameName,
} from "../../services/gameIdentity";

describe("cross-provider game identity", () => {
	it("matches legacy RAWG ratings and lists to their IGDB game by title", () => {
		const legacyRating = { id: 3328, name: "The Witcher 3: Wild Hunt" };
		const legacyList = { gameId: 3328, gameName: "The Witcher 3: Wild Hunt" };
		const igdbGame = { id: 1_000_001_942, name: "The Witcher 3: Wild Hunt" };
		expect(isSameGame(legacyRating, igdbGame)).toBe(true);
		expect(isSameGame(legacyList, igdbGame)).toBe(true);
	});

	it("keeps different editions separate unless their normalized names are identical", () => {
		expect(isSameGame(
			{ id: 1, name: "Persona 5" },
			{ id: 2, name: "Persona 5 Royal" },
		)).toBe(false);
	});

	it("keeps distinct IGDB games that happen to share the same title", () => {
		const first = { id: 1_000_000_101, name: "Doom" };
		const second = { id: 1_000_000_202, name: "Doom" };

		expect(isSameGame(first, second)).toBe(false);
		expect(dedupeGamesByIdentity([first, second])).toHaveLength(2);
	});

	it("does not bridge an ambiguous legacy title to arbitrary IGDB homonyms", () => {
		const legacy = { id: 42, name: "Doom" };
		const original = { id: 1_000_000_101, name: "Doom" };
		const reboot = { id: 1_000_000_202, name: "Doom" };

		expect(dedupeGamesByIdentity([legacy, original, reboot])).toHaveLength(3);
		expect(dedupeGamesByIdentity([original, legacy, reboot])).toHaveLength(3);
		expect(createGameIdentityMatcher([original, reboot])(legacy)).toBe(false);
		expect(findSameGameIndex([original, reboot], legacy)).toBe(-1);
	});

	it("matches a unique cross-provider title without hiding a same-provider homonym", () => {
		const legacy = { id: 42, name: "Hades" };
		const canonical = { id: 1_000_000_101, name: "Hades" };
		const differentIgdbGame = { id: 1_000_000_202, name: "Hades" };

		expect(createGameIdentityMatcher([legacy])(canonical)).toBe(true);
		expect(createGameIdentityMatcher([canonical])(differentIgdbGame)).toBe(false);
	});

	it("supports the explicit legacy Fall Guys alias", () => {
		expect(normalizeGameName("Fall Guys: Ultimate Knockout")).toBe("fall guys");
		expect(gameNameSet([{ gameName: "Fall Guys: Ultimate Knockout" }]).has("fall guys")).toBe(true);
	});

	it("deduplicates migrated list entries and prefers the newest representation", () => {
		const result = dedupeGamesByIdentity([
			{ gameId: 123, gameName: "Hades", status: "wishlist" },
			{ gameId: 1_000_000_001, gameName: "Hades", status: "playing" },
		]);
		expect(result).toEqual([{ gameId: 1_000_000_001, gameName: "Hades", status: "playing" }]);
	});

	it("keeps the canonical ID even when the newest local payload is legacy", () => {
		const result = dedupeGamesByIdentity([
			{ id: 1_000_000_001, name: "Hades", general: 3 },
			{ id: 123, name: "Hades", general: 5 },
		]);
		expect(result).toEqual([{ id: 1_000_000_001, name: "Hades", general: 5 }]);
	});

	it("identifies list-created zero-score placeholders without deleting real ratings", () => {
		expect(hasMeaningfulRating({ general: 0, graphics: 0, gameplay: 0, story: 0, lifespan: 0 })).toBe(false);
		expect(hasMeaningfulRating({ general: 4, graphics: 0, gameplay: 0, story: 0, lifespan: 0 })).toBe(true);
	});
});
