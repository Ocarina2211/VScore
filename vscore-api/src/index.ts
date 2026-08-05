import { decodeProtectedHeader, importX509, jwtVerify } from "jose";

interface WorkerEnv {
	IGDB_CLIENT_ID: string;
	IGDB_CLIENT_SECRET: string;
	STEAM_API_KEY: string;
	DEEPL_API_KEY: string;
	FIREBASE_PROJECT_ID: string;
}

const IGDB_BASE_URL = "https://api.igdb.com/v4";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const STEAM_BASE_URL = "https://api.steampowered.com";
const DEEPL_URL = "https://api-free.deepl.com/v2/translate";
const IGDB_LIST_CACHE_SECONDS = 6 * 60 * 60;
const IGDB_DETAIL_CACHE_SECONDS = 7 * 24 * 60 * 60;
const IGDB_GAME_ID_OFFSET = 1_000_000_000;
const IGDB_REQUESTS_PER_SECOND = 4;
// A perfect score based on one or two outlets is too misleading to surface.
const MIN_EXTERNAL_CRITIC_RATINGS = 5;
const IGDB_CACHE_SCHEMA = "7";
const FIREBASE_CERTIFICATES_URL =
	"https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const AUTH_RATE_LIMIT = 120;
const AUTH_RATE_WINDOW_MS = 60_000;

let firebaseCertificates: { expiresAt: number; values: Record<string, string> } | undefined;
let igdbToken: { accessToken: string; expiresAt: number } | undefined;
let igdbTokenRequest: Promise<string> | undefined;
let igdbRateQueue: Promise<void> = Promise.resolve();
let igdbRequestStarts: number[] = [];
const requestCounters = new Map<string, { count: number; resetsAt: number }>();

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Authorization, Content-Type",
	"Access-Control-Max-Age": "86400",
};

const IGDB_QUERY_PARAMS = new Set([
	"dates",
	"genres",
	"lang",
	"metacritic",
	"ordering",
	"page",
	"page_size",
	"platforms",
	"search",
	"tags",
]);

class ApiError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

function jsonResponse(data: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"X-Content-Type-Options": "nosniff",
			...CORS_HEADERS,
			...extraHeaders,
		},
	});
}

function requireSecret(value: string | undefined, name: string): string {
	if (!value) throw new ApiError(503, `Server secret ${name} is not configured.`);
	return value;
}

function bearerToken(request: Request): string {
	const authorization = request.headers.get("authorization") ?? "";
	const match = authorization.match(/^Bearer\s+(\S+)$/i);
	if (!match) throw new ApiError(401, "Authentication required.");
	return match[1];
}

async function getFirebaseCertificates(): Promise<Record<string, string>> {
	if (firebaseCertificates && firebaseCertificates.expiresAt > Date.now()) return firebaseCertificates.values;

	const response = await fetch(FIREBASE_CERTIFICATES_URL, { headers: { Accept: "application/json" } });
	if (!response.ok) throw new ApiError(503, "Authentication service unavailable.");
	const values = (await response.json()) as Record<string, string>;
	const maxAge = Number(response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1] ?? 3600);
	firebaseCertificates = { values, expiresAt: Date.now() + Math.max(60, maxAge) * 1000 };
	return values;
}

async function authenticateFirebase(request: Request, env: WorkerEnv): Promise<string> {
	const token = bearerToken(request);
	const projectId = env.FIREBASE_PROJECT_ID;
	if (!projectId) throw new ApiError(503, "Firebase project is not configured.");

	try {
		const header = decodeProtectedHeader(token);
		if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported token header");
		const certificate = (await getFirebaseCertificates())[header.kid];
		if (!certificate) throw new Error("Unknown signing key");
		const key = await importX509(certificate, "RS256");
		const { payload } = await jwtVerify(token, key, {
			algorithms: ["RS256"],
			audience: projectId,
			issuer: `https://securetoken.google.com/${projectId}`,
		});
		const now = Math.floor(Date.now() / 1000);
		if (!payload.sub || payload.sub.length > 128 || typeof payload.iat !== "number" || payload.iat > now) {
			throw new Error("Invalid Firebase claims");
		}
		if (typeof payload.auth_time !== "number" || payload.auth_time > now) throw new Error("Invalid auth_time");
		return payload.sub;
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(401, "Invalid or expired Firebase token.");
	}
}

function enforceUserRateLimit(uid: string): void {
	const now = Date.now();
	const current = requestCounters.get(uid);
	if (!current || current.resetsAt <= now) {
		requestCounters.set(uid, { count: 1, resetsAt: now + AUTH_RATE_WINDOW_MS });
		return;
	}
	if (current.count >= AUTH_RATE_LIMIT) {
		throw new ApiError(429, "Too many requests. Try again in one minute.");
	}
	current.count += 1;
}

function isProtectedRoute(pathname: string): boolean {
	return pathname.startsWith("/igdb/") || pathname.startsWith("/steam/") || pathname === "/translate";
}

function assertAllowedQueryParams(url: URL, allowed: Set<string>): void {
	for (const key of url.searchParams.keys()) {
		if (!allowed.has(key)) throw new ApiError(400, `Unsupported query parameter: ${key}`);
	}
}

function readInteger(url: URL, key: string, fallback: number, min: number, max: number): number {
	const raw = url.searchParams.get(key);
	if (raw == null || raw === "") return fallback;
	const value = Number(raw);
	if (!Number.isInteger(value) || value < min || value > max) {
		throw new ApiError(400, `Invalid ${key}; expected an integer from ${min} to ${max}.`);
	}
	return value;
}

async function readJsonResponse(response: Response, provider: string): Promise<unknown> {
	const contentType = response.headers.get("content-type") ?? "";
	const body = await response.text();
	if (!response.ok) throw new ApiError(502, `${provider} returned HTTP ${response.status}.`);
	if (!contentType.toLowerCase().includes("json")) {
		throw new ApiError(502, `${provider} returned a non-JSON response.`);
	}
	try {
		return JSON.parse(body);
	} catch {
		throw new ApiError(502, `${provider} returned invalid JSON.`);
	}
}

function cachedResponse(response: Response, cacheStatus: "HIT" | "MISS"): Response {
	const headers = new Headers(response.headers);
	Object.entries(CORS_HEADERS).forEach(([key, value]) => headers.set(key, value));
	headers.set("X-VScore-Cache", cacheStatus);
	return new Response(response.body, { status: response.status, headers });
}

type IgdbNamedEntity = { id: number; name?: string; slug?: string };
type IgdbImage = { image_id?: string };
type IgdbCompany = {
	company?: { name?: string };
	developer?: boolean;
	publisher?: boolean;
};
type IgdbGame = {
	id: number;
	name?: string;
	slug?: string;
	summary?: string;
	storyline?: string;
	first_release_date?: number;
	aggregated_rating?: number;
	aggregated_rating_count?: number;
	total_rating?: number;
	total_rating_count?: number;
	rating_count?: number;
	hypes?: number;
	cover?: IgdbImage;
	artworks?: IgdbImage[];
	screenshots?: IgdbImage[];
	genres?: IgdbNamedEntity[];
	themes?: IgdbNamedEntity[];
	game_modes?: IgdbNamedEntity[];
	platforms?: IgdbNamedEntity[];
	involved_companies?: IgdbCompany[];
	similar_games?: IgdbGame[];
	external_games?: { external_game_source?: number; uid?: string; url?: string }[];
	websites?: { type?: number; url?: string }[];
};

const IGDB_LIST_FIELDS = [
	"id",
	"name",
	"slug",
	"summary",
	"first_release_date",
	"aggregated_rating",
	"aggregated_rating_count",
	"total_rating",
	"total_rating_count",
	"rating_count",
	"hypes",
	"cover.image_id",
	"genres.id",
	"genres.name",
	"genres.slug",
	"platforms.id",
	"platforms.name",
	"platforms.slug",
	"themes.id",
	"themes.name",
	"themes.slug",
	"game_modes.id",
	"game_modes.name",
	"game_modes.slug",
].join(",");

const IGDB_DETAIL_FIELDS = [
	IGDB_LIST_FIELDS,
	"storyline",
	"artworks.image_id",
	"screenshots.image_id",
	"involved_companies.developer",
	"involved_companies.publisher",
	"involved_companies.company.name",
	"similar_games.id",
	"similar_games.name",
	"similar_games.slug",
	"similar_games.first_release_date",
	"similar_games.aggregated_rating",
	"similar_games.aggregated_rating_count",
	"similar_games.total_rating_count",
	"similar_games.rating_count",
	"similar_games.hypes",
	"similar_games.cover.image_id",
	"similar_games.genres.id",
	"similar_games.genres.name",
	"similar_games.genres.slug",
	"similar_games.platforms.id",
	"similar_games.platforms.name",
	"similar_games.platforms.slug",
	"external_games.external_game_source",
	"external_games.uid",
	"external_games.url",
	"websites.type",
	"websites.url",
].join(",");

const GENRE_IDS: Record<string, number[]> = {
	action: [4, 5, 8, 25, 31, 33],
	adventure: [31],
	arcade: [33],
	"board-games": [35],
	"card-and-board-game": [35],
	casual: [9, 26, 33, 35],
	family: [9, 26, 35],
	fighting: [4],
	"hack-and-slash-beat-em-up": [25],
	indie: [32],
	moba: [36],
	"point-and-click": [2],
	platform: [8],
	platformer: [8],
	puzzle: [9],
	quiz: [26],
	racing: [10],
	"real-time-strategy-rts": [11],
	"role-playing-games-rpg": [12],
	"role-playing-rpg": [12],
	shooter: [5],
	simulation: [13],
	simulator: [13],
	sport: [14],
	sports: [14],
	strategy: [11, 15, 16, 24],
	tactical: [24],
	"turn-based-strategy-tbs": [16],
	"visual-novel": [34],
};

const CLIENT_TO_IGDB_PLATFORMS: Record<number, number[]> = {
	4: [6],
	7: [130],
	18: [48],
	186: [49, 169],
	187: [167],
};

const IGDB_TO_CLIENT_PLATFORM: Record<number, number> = {
	6: 4,
	48: 18,
	49: 186,
	130: 7,
	167: 187,
	169: 186,
};

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reserveIgdbRequestSlot(): Promise<void> {
	const reservation = igdbRateQueue.then(async () => {
		while (true) {
			const now = Date.now();
			igdbRequestStarts = igdbRequestStarts.filter((startedAt) => now - startedAt < 1000);
			if (igdbRequestStarts.length < IGDB_REQUESTS_PER_SECOND) {
				igdbRequestStarts.push(now);
				return;
			}
			await delay(Math.max(10, 1010 - (now - igdbRequestStarts[0])));
		}
	});
	igdbRateQueue = reservation.catch(() => {});
	await reservation;
}

async function requestIgdbToken(env: WorkerEnv): Promise<string> {
	if (igdbToken && igdbToken.expiresAt > Date.now() + 60_000) return igdbToken.accessToken;
	if (igdbTokenRequest) return igdbTokenRequest;

	igdbTokenRequest = (async () => {
		const url = new URL(TWITCH_TOKEN_URL);
		url.searchParams.set("client_id", requireSecret(env.IGDB_CLIENT_ID, "IGDB_CLIENT_ID"));
		url.searchParams.set("client_secret", requireSecret(env.IGDB_CLIENT_SECRET, "IGDB_CLIENT_SECRET"));
		url.searchParams.set("grant_type", "client_credentials");
		const response = await fetch(url, { method: "POST", headers: { Accept: "application/json" } });
		const payload = (await readJsonResponse(response, "Twitch authentication")) as {
			access_token?: string;
			expires_in?: number;
		};
		if (!payload.access_token || !Number.isFinite(payload.expires_in)) {
			throw new ApiError(502, "Twitch authentication returned an invalid token response.");
		}
		igdbToken = {
			accessToken: payload.access_token,
			expiresAt: Date.now() + Math.max(60, payload.expires_in ?? 0) * 1000,
		};
		return payload.access_token;
	})().finally(() => {
		igdbTokenRequest = undefined;
	});

	return igdbTokenRequest;
}

async function igdbQuery(env: WorkerEnv, endpoint: string, body: string, retryAuth = true): Promise<unknown> {
	await reserveIgdbRequestSlot();
	const response = await fetch(`${IGDB_BASE_URL}/${endpoint}`, {
		method: "POST",
		headers: {
			Accept: "application/json",
			Authorization: `Bearer ${await requestIgdbToken(env)}`,
			"Client-ID": requireSecret(env.IGDB_CLIENT_ID, "IGDB_CLIENT_ID"),
			"Content-Type": "text/plain",
		},
		body,
	});
	if (response.status === 401 && retryAuth) {
		igdbToken = undefined;
		return igdbQuery(env, endpoint, body, false);
	}
	if (response.status === 429) throw new ApiError(503, "IGDB rate limit reached. Try again shortly.");
	return readJsonResponse(response, "IGDB");
}

function encodeIgdbGameId(id: number): number {
	return IGDB_GAME_ID_OFFSET + id;
}

function decodeIgdbGameId(id: string): number {
	const clientId = Number(id);
	const igdbId = clientId - IGDB_GAME_ID_OFFSET;
	if (!Number.isSafeInteger(clientId) || !Number.isInteger(igdbId) || igdbId <= 0) {
		throw new ApiError(404, "Unknown IGDB game ID.");
	}
	return igdbId;
}

function igdbImageUrl(imageId: string | undefined, size: "cover_big" | "1080p" = "cover_big"): string {
	return imageId ? `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg` : "";
}

function isoDate(timestamp: number | undefined): string | null {
	if (!timestamp) return null;
	return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function mapNamedEntity(entity: IgdbNamedEntity): { id: number; name: string; slug: string } {
	return { id: entity.id, name: entity.name ?? "", slug: entity.slug ?? "" };
}

function mapPlatform(platform: IgdbNamedEntity): { platform: { id: number; name: string; slug: string } } {
	return {
		platform: {
			id: IGDB_TO_CLIENT_PLATFORM[platform.id] ?? 100_000 + platform.id,
			name: platform.name ?? "",
			slug: platform.slug ?? "",
		},
	};
}

function mapIgdbGame(game: IgdbGame): Record<string, unknown> {
	const developers = (game.involved_companies ?? [])
		.filter((entry) => entry.developer && entry.company?.name)
		.map((entry) => ({ name: entry.company?.name ?? "" }));
	const publishers = (game.involved_companies ?? [])
		.filter((entry) => entry.publisher && entry.company?.name)
		.map((entry) => ({ name: entry.company?.name ?? "" }));
	const popularity = Math.max(game.total_rating_count ?? 0, game.rating_count ?? 0, game.hypes ?? 0, 1);
	const criticScoreCount = game.aggregated_rating_count ?? 0;
	const criticScore =
		game.aggregated_rating != null && criticScoreCount >= MIN_EXTERNAL_CRITIC_RATINGS
			? Math.round(game.aggregated_rating)
			: null;

	return {
		id: encodeIgdbGameId(game.id),
		name: game.name ?? "",
		slug: game.slug ?? "",
		background_image: igdbImageUrl(game.cover?.image_id),
		description_raw: game.summary ?? game.storyline ?? "",
		released: isoDate(game.first_release_date),
		// `metacritic` remains as a temporary compatibility alias for older clients.
		// IGDB's value is an aggregate of external critic ratings, not Metacritic itself.
		metacritic: criticScore,
		critic_score: criticScore,
		critic_score_count: criticScoreCount,
		added: popularity,
		genres: (game.genres ?? []).map(mapNamedEntity),
		tags: [...(game.themes ?? []), ...(game.game_modes ?? [])].map(mapNamedEntity),
		platforms: (game.platforms ?? []).map(mapPlatform),
		developers,
		publishers,
		website: game.websites?.find((website) => website.type === 1)?.url ?? "",
		_igdbId: game.id,
		_provider: "IGDB",
	};
}

function escapeSearch(value: string): string {
	return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizeGameName(value: string | undefined): string {
	const normalized = (value ?? "")
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLocaleLowerCase("en-US")
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.replace(/\s+/g, " ");
	const legacyAliases: Record<string, string> = {
		"fall guys ultimate knockout": "fall guys",
	};
	return legacyAliases[normalized] ?? normalized;
}

function readResolveNames(url: URL): string[] {
	const serialized = url.searchParams.get("names");
	if (!serialized) throw new ApiError(400, "Missing game names.");
	let names: unknown;
	try {
		names = JSON.parse(serialized);
	} catch {
		throw new ApiError(400, "Invalid game names.");
	}
	if (!Array.isArray(names) || names.length === 0 || names.length > 20) {
		throw new ApiError(400, "Provide between 1 and 20 game names.");
	}
	const cleanNames = names.map((name) => (typeof name === "string" ? name.trim() : ""));
	if (cleanNames.some((name) => !name || name.length > 120)) {
		throw new ApiError(400, "Each game name must contain between 1 and 120 characters.");
	}
	return cleanNames;
}

async function resolveIgdbGamesByName(env: WorkerEnv, names: string[]): Promise<unknown> {
	const searchTerms = Array.from(new Set([...names, ...names.map(normalizeGameName)]));
	const titleFilters = searchTerms.map((name) => `name ~ "${escapeSearch(name)}"`).join(" | ");
	const body = `fields ${IGDB_LIST_FIELDS}; where cover != null & game_type = (0,4,8,9,10,11) & (${titleFilters}); limit ${Math.min(500, names.length * 10)};`;
	const candidates = (await igdbQuery(env, "games", body)) as IgdbGame[];

	return {
		results: names.map((sourceName) => ({
			source_name: sourceName,
			game: (() => {
				const wanted = normalizeGameName(sourceName);
				const exact = candidates.find((game) => normalizeGameName(game.name) === wanted);
				return exact ? mapIgdbGame(exact) : null;
			})(),
		})),
	};
}

function parseDateRange(value: string): [number, number] {
	const [start, end] = value.split(",");
	if (!/^\d{4}-\d{2}-\d{2}$/.test(start ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(end ?? "")) {
		throw new ApiError(400, "Invalid dates range.");
	}
	const startMs = Date.parse(`${start}T00:00:00Z`);
	const endMs = Date.parse(`${end}T23:59:59Z`);
	if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) {
		throw new ApiError(400, "Invalid dates range.");
	}
	return [Math.floor(startMs / 1000), Math.floor(endMs / 1000)];
}

function buildListQuery(url: URL, page: number, pageSize: number): string {
	const clauses = ["cover != null", "game_type = (0,4,8,9,10,11)"];
	const search = url.searchParams.get("search")?.trim() ?? "";
	if (search.length > 120) throw new ApiError(400, "Search is too long.");

	const genre = url.searchParams.get("genres");
	if (genre) {
		if (genre === "massively-multiplayer") clauses.push("game_modes = 5");
		else if (genre === "horror") clauses.push("themes = 19");
		else {
			const ids = GENRE_IDS[genre];
			if (!ids) throw new ApiError(400, "Unsupported genre.");
			clauses.push(`genres = (${ids.join(",")})`);
		}
	}

	const platform = url.searchParams.get("platforms");
	if (platform) {
		const clientPlatform = Number(platform);
		const ids = CLIENT_TO_IGDB_PLATFORMS[clientPlatform];
		if (!Number.isInteger(clientPlatform) || !ids) throw new ApiError(400, "Unsupported platform.");
		clauses.push(`platforms = (${ids.join(",")})`);
	}

	const tag = url.searchParams.get("tags");
	if (tag === "singleplayer") clauses.push("game_modes = 1");
	else if (tag === "multiplayer") clauses.push("game_modes = (2,3,4,5,6)");
	else if (tag === "horror") clauses.push("themes = 19");
	else if (tag) throw new ApiError(400, "Unsupported tag.");

	const dates = url.searchParams.get("dates");
	if (dates) {
		const [start, end] = parseDateRange(dates);
		clauses.push(`first_release_date >= ${start}`, `first_release_date <= ${end}`);
	}

	const metacritic = url.searchParams.get("metacritic");
	if (metacritic) {
		const match = metacritic.match(/^(\d{1,3})-(\d{1,3})$/);
		if (!match) throw new ApiError(400, "Invalid critic score range.");
		const min = Number(match[1]);
		const max = Number(match[2]);
		if (min < 0 || max > 100 || min > max) throw new ApiError(400, "Invalid critic score range.");
		clauses.push(`aggregated_rating >= ${min}`, `aggregated_rating <= ${max}`);
		clauses.push(`aggregated_rating_count >= ${MIN_EXTERNAL_CRITIC_RATINGS}`);
	}

	const ordering = url.searchParams.get("ordering") ?? "-metacritic";
	const sortByOrdering: Record<string, string> = {
		"": "",
		"-added": "sort total_rating_count desc;",
		"-metacritic": "sort aggregated_rating desc;",
		"-released": "sort first_release_date desc;",
		name: "sort name asc;",
	};
	if (!(ordering in sortByOrdering)) throw new ApiError(400, "Unsupported ordering.");
	if (!search && ordering === "-metacritic" && !metacritic) {
		clauses.push(`aggregated_rating_count >= ${MIN_EXTERNAL_CRITIC_RATINGS}`);
	}

	const searchStatement = search ? `search "${escapeSearch(search)}";` : "";
	const sortStatement = search ? "" : sortByOrdering[ordering];
	const offset = (page - 1) * pageSize;
	return `fields ${IGDB_LIST_FIELDS}; ${searchStatement} where ${clauses.join(" & ")}; ${sortStatement} limit ${pageSize + 1}; offset ${offset};`;
}

async function fetchIgdbRouteData(
	env: WorkerEnv,
	url: URL,
	clientGameId: string | undefined,
	resource: string | undefined,
	page: number,
	pageSize: number,
): Promise<unknown> {
	if (!clientGameId) {
		const games = (await igdbQuery(env, "games", buildListQuery(url, page, pageSize))) as IgdbGame[];
		const hasNext = games.length > pageSize;
		return { results: games.slice(0, pageSize).map(mapIgdbGame), next: hasNext };
	}

	const igdbId = decodeIgdbGameId(clientGameId);
	const games = (await igdbQuery(env, "games", `fields ${IGDB_DETAIL_FIELDS}; where id = ${igdbId}; limit 1;`)) as IgdbGame[];
	const game = games[0];
	if (!game) throw new ApiError(404, "Game not found on IGDB.");

	if (resource === "screenshots") {
		return {
			results: (game.screenshots ?? []).map((screenshot, index) => ({
				id: index,
				image: igdbImageUrl(screenshot.image_id, "1080p"),
			})),
		};
	}
	if (resource === "stores") {
		const websiteUrl = game.websites?.find((website) => website.type === 13 && website.url)?.url;
		const externalSteam = game.external_games?.find((external) => external.external_game_source === 1);
		const externalUrl = externalSteam?.url || (externalSteam?.uid
			? `https://store.steampowered.com/app/${encodeURIComponent(externalSteam.uid)}`
			: undefined);
		const steamUrl = websiteUrl ?? externalUrl;
		return { results: steamUrl ? [{ url: steamUrl }] : [] };
	}
	if (resource === "suggested") {
		return { results: (game.similar_games ?? []).slice(0, pageSize).map(mapIgdbGame) };
	}
	return mapIgdbGame(game);
}

async function handleIgdb(request: Request, env: WorkerEnv, ctx: ExecutionContext, url: URL): Promise<Response> {
	if (request.method !== "GET") throw new ApiError(405, "IGDB routes only accept GET.");

	const isResolveRoute = url.pathname === "/igdb/games/resolve";
	if (isResolveRoute) assertAllowedQueryParams(url, new Set(["names"]));
	const match = url.pathname.match(/^\/igdb\/games(?:\/(\d+)(?:\/(screenshots|stores|suggested))?)?$/);
	if (!isResolveRoute && !match) throw new ApiError(404, "Unknown IGDB route.");
	if (!isResolveRoute) assertAllowedQueryParams(url, IGDB_QUERY_PARAMS);

	const clientGameId = match?.[1];
	const resource = match?.[2];
	const page = readInteger(url, "page", 1, 1, 1000);
	const pageSize = readInteger(url, "page_size", resource === "suggested" ? 8 : 20, 1, 60);

	const cacheKeyUrl = new URL(url);
	cacheKeyUrl.searchParams.set("__schema", IGDB_CACHE_SCHEMA);
	const cacheKey = new Request(cacheKeyUrl.toString(), { method: "GET" });
	const cache = caches.default;
	const hit = await cache.match(cacheKey);
	if (hit) return cachedResponse(hit, "HIT");

	const data = isResolveRoute
		? await resolveIgdbGamesByName(env, readResolveNames(url))
		: await fetchIgdbRouteData(env, url, clientGameId, resource, page, pageSize);
	const cacheSeconds = clientGameId ? IGDB_DETAIL_CACHE_SECONDS : IGDB_LIST_CACHE_SECONDS;
	const response = jsonResponse(data, 200, {
		"Cache-Control": `public, max-age=${cacheSeconds}`,
		"X-VScore-Cache": "MISS",
	});
	ctx.waitUntil(cache.put(cacheKey, response.clone()));
	return response;
}

function readSteamId(url: URL): string {
	const steamId = url.searchParams.get("steamId") ?? "";
	if (!/^\d{17}$/.test(steamId)) throw new ApiError(400, "steamId must contain exactly 17 digits.");
	return steamId;
}

async function handleSteam(request: Request, env: WorkerEnv, url: URL): Promise<Response> {
	if (request.method !== "GET") throw new ApiError(405, "Steam routes only accept GET.");
	let upstream: URL;

	if (url.pathname === "/steam/resolve") {
		assertAllowedQueryParams(url, new Set(["vanity"]));
		const vanity = url.searchParams.get("vanity") ?? "";
		if (!/^[a-zA-Z0-9_-]{2,64}$/.test(vanity)) throw new ApiError(400, "Invalid Steam vanity name.");
		upstream = new URL(`${STEAM_BASE_URL}/ISteamUser/ResolveVanityURL/v1/`);
		upstream.searchParams.set("vanityurl", vanity);
	} else if (url.pathname === "/steam/player") {
		assertAllowedQueryParams(url, new Set(["steamId"]));
		upstream = new URL(`${STEAM_BASE_URL}/ISteamUser/GetPlayerSummaries/v2/`);
		upstream.searchParams.set("steamids", readSteamId(url));
	} else if (url.pathname === "/steam/games") {
		assertAllowedQueryParams(url, new Set(["steamId"]));
		upstream = new URL(`${STEAM_BASE_URL}/IPlayerService/GetOwnedGames/v1/`);
		upstream.searchParams.set("steamid", readSteamId(url));
		upstream.searchParams.set("include_appinfo", "1");
		upstream.searchParams.set("include_played_free_games", "1");
		upstream.searchParams.set("format", "json");
	} else {
		throw new ApiError(404, "Unknown Steam route.");
	}

	upstream.searchParams.set("key", requireSecret(env.STEAM_API_KEY, "STEAM_API_KEY"));
	const response = await fetch(upstream, { headers: { Accept: "application/json" } });
	return jsonResponse(await readJsonResponse(response, "Steam"));
}

async function handleTranslate(request: Request, env: WorkerEnv): Promise<Response> {
	if (request.method !== "POST") throw new ApiError(405, "Translate only accepts POST.");
	if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
		throw new ApiError(415, "Expected application/json.");
	}

	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		throw new ApiError(400, "Invalid JSON body.");
	}
	const text = typeof (payload as { text?: unknown })?.text === "string" ? (payload as { text: string }).text.trim() : "";
	if (!text || text.length > 500) throw new ApiError(400, "text must contain between 1 and 500 characters.");

	const response = await fetch(DEEPL_URL, {
		method: "POST",
		headers: {
			Authorization: `DeepL-Auth-Key ${requireSecret(env.DEEPL_API_KEY, "DEEPL_API_KEY")}`,
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: JSON.stringify({ text: [text], source_lang: "EN", target_lang: "FR" }),
	});
	return jsonResponse(await readJsonResponse(response, "DeepL"));
}

const worker = {
	async fetch(request, env, ctx): Promise<Response> {
		if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
		const url = new URL(request.url);

		try {
			if (url.pathname === "/health") return jsonResponse({ ok: true, service: "vscore-api" });
			if (!isProtectedRoute(url.pathname)) throw new ApiError(404, "Route not found.");
			const uid = await authenticateFirebase(request, env);
			enforceUserRateLimit(uid);
			if (url.pathname.startsWith("/igdb/")) return await handleIgdb(request, env, ctx, url);
			if (url.pathname.startsWith("/steam/")) return await handleSteam(request, env, url);
			if (url.pathname === "/translate") return await handleTranslate(request, env);
			throw new ApiError(404, "Route not found.");
		} catch (error) {
			if (error instanceof ApiError) return jsonResponse({ error: error.message }, error.status);
			console.error("Unhandled Worker error", error instanceof Error ? error.message : error);
			return jsonResponse({ error: "Internal server error." }, 500);
		}
	},
} satisfies ExportedHandler<WorkerEnv>;

export default worker;
