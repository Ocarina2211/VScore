import { decodeProtectedHeader, importX509, jwtVerify } from "jose";

interface WorkerEnv {
	RAWG_API_KEY: string;
	STEAM_API_KEY: string;
	DEEPL_API_KEY: string;
	FIREBASE_PROJECT_ID: string;
}

const RAWG_BASE_URL = "https://api.rawg.io/api";
const STEAM_BASE_URL = "https://api.steampowered.com";
const DEEPL_URL = "https://api-free.deepl.com/v2/translate";
const RAWG_LIST_CACHE_SECONDS = 6 * 60 * 60;
const RAWG_DETAIL_CACHE_SECONDS = 7 * 24 * 60 * 60;
const FIREBASE_CERTIFICATES_URL =
	"https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const AUTH_RATE_LIMIT = 120;
const AUTH_RATE_WINDOW_MS = 60_000;

let firebaseCertificates: { expiresAt: number; values: Record<string, string> } | undefined;
const requestCounters = new Map<string, { count: number; resetsAt: number }>();

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Authorization, Content-Type",
	"Access-Control-Max-Age": "86400",
};

const RAWG_QUERY_PARAMS = new Set([
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
	return pathname.startsWith("/rawg/") || pathname.startsWith("/steam/") || pathname === "/translate";
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

async function handleRawg(request: Request, env: WorkerEnv, ctx: ExecutionContext, url: URL): Promise<Response> {
	if (request.method !== "GET") throw new ApiError(405, "RAWG routes only accept GET.");

	const match = url.pathname.match(/^\/rawg\/games(?:\/(\d+)(?:\/(screenshots|stores|suggested))?)?$/);
	if (!match) throw new ApiError(404, "Unknown RAWG route.");
	assertAllowedQueryParams(url, RAWG_QUERY_PARAMS);

	const gameId = match[1];
	const resource = match[2];
	const page = readInteger(url, "page", 1, 1, 1000);
	const pageSize = readInteger(url, "page_size", 20, 1, 60);
	const search = url.searchParams.get("search");
	if (search && search.length > 120) throw new ApiError(400, "Search is too long.");

	const upstream = new URL(`${RAWG_BASE_URL}/games${gameId ? `/${gameId}` : ""}${resource ? `/${resource}` : ""}`);
	url.searchParams.forEach((value, key) => upstream.searchParams.set(key, value));
	upstream.searchParams.set("page", String(page));
	upstream.searchParams.set("page_size", String(pageSize));
	upstream.searchParams.set("key", requireSecret(env.RAWG_API_KEY, "RAWG_API_KEY"));

	const cacheKey = new Request(url.toString(), { method: "GET" });
	const cache = caches.default;
	const hit = await cache.match(cacheKey);
	if (hit) return cachedResponse(hit, "HIT");

	const upstreamResponse = await fetch(upstream, { headers: { Accept: "application/json" } });
	const data = await readJsonResponse(upstreamResponse, "RAWG");
	const cacheSeconds = gameId ? RAWG_DETAIL_CACHE_SECONDS : RAWG_LIST_CACHE_SECONDS;
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
			if (url.pathname.startsWith("/rawg/")) return await handleRawg(request, env, ctx, url);
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
