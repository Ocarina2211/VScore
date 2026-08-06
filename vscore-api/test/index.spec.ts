import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { importPKCS8, SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCLaGFmT0R2VucT
yJbZNvG2MpUFxBjr+n2QjRvctsxiwC7N6Dy5wQuBVTWdcA83yk4Gl1jF6aDpd1DT
+kttO7JTD3OIcbSuWYUEf7TVG7/HW+Pxx9g3oN90cQ+QgQckYRw5z3ZYGS0DfcXq
JcMGmz1B6QlpyqW1PX6j5QK7D8HK07clC/2oeAji0hn38CCFCWijxJxdb1fPjYyV
gPE8fFzYkULgxNb0HEfqyqwa/6ZeXdvOpEEb/5IfKJczQ5uOcuHkP3Q7AOh0Trv/
cjvuDzWY3+FWuUAhwiFwHKE+XyIT3DwJeR80tDHefQI/mwLa2xkZejxbdtE9E1U2
Mqg89ULrAgMBAAECggEACruLABrrLOcs3B+NyYRK4JmNUofR2V0MDLRoaDokixe7
oruV7UEY9yiNu6S0bzmifyxot7fwXPkEHoW/B9ZYOL/QR7llTST0Mi/4xo1f2uPO
rT8S/NlkSq0noxrj51+YkjTQKiEqD4I/2fJ1TM1nzmq4AE6LKmRlGw4XAzrH0ysT
cFXkEMBhb8/GH4G/Tuq5/iP6jz5Kl2R0EVQ0v6PMsHsv9uPst8r2ZtDi+YKK2I6T
nZ4aAq8v8NSQ413N3sF1zEeiQNUYDAljrruezW2nCb1ysXw60EqSYxOs8QaZovUV
Y7T3mbhwXaXlObPOxwaZ4aNYPl7WK6D3HptAZKNIOQKBgQC92cApQkP+Nzc8mU44
TlOSoxVfhpngVmIDrEJo4OFTMvmnnJqG4SL7rxgtTUkZJhIFEkiDwL+6CiuB64W+
ZdTkrQCkG+v3C/qeE8uAAFwm1lZF/3enc6wxk+xktOqj4nyhxFVqJ9PIign/QsN/
I7ch7pyxrihlIeBG8MnVoURG6QKBgQC7+z1mULfmousCV/eJjZkL6zlC0Ka+wFQG
ptBgO07p3tTMtO/OWcUahVrHisnW6YdsEvUj70stf73aJfCxEGXyKwVZpjSimrcF
IO++o/qgLmhm5/24AoUe8AyeBTQfiaWalcuVqL4bpSkeJy5no+Q3scRbLM68waoz
tlwC5Cl+swKBgG0kPaB6g/Qlcg/YYmtkPA9Uyfi8vMGHZ5mM8jCw91iJOZTuJrfb
vezK4C9K+vcGN93KgP2dVZtyNUjfSWgHyrgb7P5rPuArdsxhvN+9VTzOg5KCJxuR
GDD4RTIv/6RvlA67fA8nDk1/bffdPd5dfe536oULBhX9v52I17+EkmfhAoGAeFT7
mONS1XC0v2tQKd1aeya4IO0v0CuNnjRqby+H9G2QCvpIB++vHKsA0XsmeUxERApe
ogIsPZPoFBz1VmMI31xqsFiUmQIw5jePQJn3dVI/wp/+6iuyy3semIj8NLQILkx1
Zff+ufOfvo2WRwHCtWQ2LachL/NI4JF7lN45McECgYBPNZQhHH+NtivsjwaARSq1
IufD53dezDwyiSxkgUO9yM9av5g0D8/l0q6wDtFn57HyG1HGfeEYXDU9wInbhNMl
8RzmsGXbgaJ1IE7p6CiVOox16OIL6A82o26Rm6MKuY/ac61UVOqSURCi91X0uQgo
EOvWQcN6gQypz2aL7zxorQ==
-----END PRIVATE KEY-----`;

const TEST_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIDDTCCAfWgAwIBAgIUShg6fklgcL+7BWIUY99Rpn11zY8wDQYJKoZIhvcNAQEL
BQAwFjEUMBIGA1UEAwwLdnNjb3JlLXRlc3QwHhcNMjYwODA1MTk1NDEwWhcNMzYw
ODAyMTk1NDEwWjAWMRQwEgYDVQQDDAt2c2NvcmUtdGVzdDCCASIwDQYJKoZIhvcN
AQEBBQADggEPADCCAQoCggEBAItoYWZPRHZW5xPIltk28bYylQXEGOv6fZCNG9y2
zGLALs3oPLnBC4FVNZ1wDzfKTgaXWMXpoOl3UNP6S207slMPc4hxtK5ZhQR/tNUb
v8db4/HH2Deg33RxD5CBByRhHDnPdlgZLQN9xeolwwabPUHpCWnKpbU9fqPlArsP
wcrTtyUL/ah4COLSGffwIIUJaKPEnF1vV8+NjJWA8Tx8XNiRQuDE1vQcR+rKrBr/
pl5d286kQRv/kh8olzNDm45y4eQ/dDsA6HROu/9yO+4PNZjf4Va5QCHCIXAcoT5f
IhPcPAl5HzS0Md59Aj+bAtrbGRl6PFt20T0TVTYyqDz1QusCAwEAAaNTMFEwHQYD
VR0OBBYEFFRn97Z4IK65DyjluTDoasSekgLWMB8GA1UdIwQYMBaAFFRn97Z4IK65
DyjluTDoasSekgLWMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEB
AGDBYq1cz1vX1rj0rjdf0WvehDlmRKt9vwjJS4Uk/dPdgCil0wdQ6PNou/hd6pcd
6qBvmz7A8RBhUNbucSWWabZdUC20lVaVbkjIJloM4cTSi0rVbIjpu+dKicSjVBv7
2UJx1uHvQJs9lQl6WuHi4OTXnFYm4BVWmUbX/stMfy7vOaNJEaZicM4HYUS9TUnt
EcoDNUbD7QF5ddHESpPNJykDTrTtQqYxEAk0Kmx85OZIY8hzxJX1TtFIh+D+mFsL
wtwgwTpjJC0bRtlf4dKiJj/rxMF2W1c1oOeOtNW6Xgn2/Wt+NPOErtDnDzm6rI8A
+tAA9IhC6bHexeOsNTCzhB0=
-----END CERTIFICATE-----`;

const TEST_ENV = {
	...env,
	IGDB_CLIENT_ID: "igdb-client",
	IGDB_CLIENT_SECRET: "igdb-secret",
	STEAM_API_KEY: "steam-secret",
	DEEPL_API_KEY: "deepl-secret",
	FIREBASE_PROJECT_ID: "vscore-test",
} as Env & Record<string, string>;

async function firebaseToken(): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const key = await importPKCS8(TEST_PRIVATE_KEY, "RS256");
	return new SignJWT({ auth_time: now, user_id: "test-user" })
		.setProtectedHeader({ alg: "RS256", kid: "test-key" })
		.setIssuer("https://securetoken.google.com/vscore-test")
		.setAudience("vscore-test")
		.setSubject("test-user")
		.setIssuedAt(now)
		.setExpirationTime(now + 3_600)
		.sign(key);
}

async function run(request: Request, workerEnv = env): Promise<Response> {
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, workerEnv as Env & {
		IGDB_CLIENT_ID: string;
		IGDB_CLIENT_SECRET: string;
		STEAM_API_KEY: string;
		DEEPL_API_KEY: string;
		FIREBASE_PROJECT_ID: string;
	}, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

afterEach(() => vi.restoreAllMocks());

describe("VScore API worker", () => {
	it("reports its health", async () => {
		const response = await run(new IncomingRequest("https://example.com/health"));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true, service: "vscore-api" });
	});

	it("answers CORS preflight requests", async () => {
		const response = await run(new IncomingRequest("https://example.com/igdb/games", { method: "OPTIONS" }));
		expect(response.status).toBe(204);
		expect(response.headers.get("access-control-allow-origin")).toBe("*");
	});

	it("rejects unknown routes", async () => {
		const response = await run(new IncomingRequest("https://example.com/proxy?url=https://example.org"));
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "Route not found." });
	});

	it("protects IGDB routes with Firebase authentication", async () => {
		const response = await run(new IncomingRequest("https://example.com/igdb/games?redirect=https://example.org"));
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "Authentication required." });
	});

	it("protects Steam routes with Firebase authentication", async () => {
		const response = await run(new IncomingRequest("https://example.com/steam/player?steamId=123"));
		expect(response.status).toBe(401);
	});

	it("protects translation with Firebase authentication", async () => {
		const response = await run(new IncomingRequest("https://example.com/translate", { method: "POST", body: "hello" }));
		expect(response.status).toBe(401);
	});

	it("rejects unsupported query parameters after authentication", async () => {
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
			const url = String(input);
			if (url.includes("googleapis.com/robot/v1/metadata")) {
				return Response.json({ "test-key": TEST_CERTIFICATE }, { headers: { "Cache-Control": "max-age=3600" } });
			}
			throw new Error(`Unexpected upstream request: ${url}`);
		});
		const token = await firebaseToken();
		const response = await run(new IncomingRequest(
			"https://example.com/igdb/games?redirect=https://example.org",
			{ headers: { Authorization: `Bearer ${token}` } },
		), TEST_ENV);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "Unsupported query parameter: redirect" });
	});

	it("rejects non-JSON translation bodies after authentication", async () => {
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
			const url = String(input);
			if (url.includes("googleapis.com/robot/v1/metadata")) {
				return Response.json({ "test-key": TEST_CERTIFICATE }, { headers: { "Cache-Control": "max-age=3600" } });
			}
			throw new Error(`Unexpected upstream request: ${url}`);
		});
		const token = await firebaseToken();
		const response = await run(new IncomingRequest("https://example.com/translate", {
			method: "POST",
			headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
			body: "hello",
		}), TEST_ENV);
		expect(response.status).toBe(415);
		expect(await response.json()).toEqual({ error: "Expected application/json." });
	});

	it("rejects oversized translation bodies before calling DeepL", async () => {
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
			const url = String(input);
			if (url.includes("googleapis.com/robot/v1/metadata")) {
				return Response.json({ "test-key": TEST_CERTIFICATE }, { headers: { "Cache-Control": "max-age=3600" } });
			}
			throw new Error(`Unexpected upstream request: ${url}`);
		});
		const token = await firebaseToken();
		const response = await run(new IncomingRequest("https://example.com/translate", {
			method: "POST",
			headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
			body: JSON.stringify({ text: "x".repeat(5_000) }),
		}), TEST_ENV);
		expect(response.status).toBe(413);
		expect(await response.json()).toEqual({ error: "Translation request body is too large." });
	});

	it("maps a real authenticated IGDB response through the full route", async () => {
		const upstreamBodies: string[] = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const url = String(input);
			if (url.includes("googleapis.com/robot/v1/metadata")) {
				return Response.json({ "test-key": TEST_CERTIFICATE }, { headers: { "Cache-Control": "max-age=3600" } });
			}
			if (url.includes("id.twitch.tv/oauth2/token")) {
				return Response.json({ access_token: "test-access-token", expires_in: 3600 });
			}
			if (url.includes("api.igdb.com/v4/games")) {
				upstreamBodies.push(String(init?.body ?? ""));
				return Response.json([{
					id: 1942,
					name: "The Witcher 3: Wild Hunt",
					slug: "the-witcher-3-wild-hunt",
					first_release_date: 1431993600,
					aggregated_rating: 92.4,
					aggregated_rating_count: 20,
					total_rating_count: 2000,
					cover: { image_id: "test-cover" },
					genres: [{ id: 12, name: "Role-playing (RPG)", slug: "role-playing-rpg" }],
					platforms: [{ id: 6, name: "PC (Microsoft Windows)", slug: "win" }],
				}]);
			}
			throw new Error(`Unexpected upstream request: ${url}`);
		});

		const token = await firebaseToken();
		const response = await run(new IncomingRequest(
			"https://example.com/igdb/games?search=witcher&page_size=5",
			{ headers: { Authorization: `Bearer ${token}` } },
		), TEST_ENV);

		expect(response.status).toBe(200);
		const body = await response.json() as { results: Array<Record<string, unknown>> };
		expect(body.results[0]).toMatchObject({
			id: 1_000_001_942,
			name: "The Witcher 3: Wild Hunt",
			metacritic: 92,
			critic_score: 92,
			_provider: "IGDB",
		});
		expect(upstreamBodies[0]).toContain("version_parent = null");
		expect(response.headers.get("x-vscore-cache")).toBe("MISS");
	});

	it("refreshes the IGDB token and retries once after an upstream 401", async () => {
		let igdbCalls = 0;
		let twitchCalls = 0;
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
			const url = String(input);
			if (url.includes("googleapis.com/robot/v1/metadata")) {
				return Response.json({ "test-key": TEST_CERTIFICATE }, { headers: { "Cache-Control": "max-age=3600" } });
			}
			if (url.includes("id.twitch.tv/oauth2/token")) {
				twitchCalls += 1;
				return Response.json({ access_token: `refreshed-token-${twitchCalls}`, expires_in: 3600 });
			}
			if (url.includes("api.igdb.com/v4/games")) {
				igdbCalls += 1;
				if (igdbCalls === 1) return new Response("", { status: 401 });
				return Response.json([{ id: 42, name: "Retry Test", cover: { image_id: "cover" } }]);
			}
			throw new Error(`Unexpected upstream request: ${url}`);
		});

		const token = await firebaseToken();
		const response = await run(new IncomingRequest(
			"https://example.com/igdb/games?search=retry-test&page_size=1",
			{ headers: { Authorization: `Bearer ${token}` } },
		), TEST_ENV);

		expect(response.status).toBe(200);
		expect(igdbCalls).toBe(2);
		expect(twitchCalls).toBeGreaterThanOrEqual(1);
	});

	it("uses case-insensitive infix matching when resolving legacy names", async () => {
		let upstreamBody = "";
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const url = String(input);
			if (url.includes("googleapis.com/robot/v1/metadata")) {
				return Response.json({ "test-key": TEST_CERTIFICATE }, { headers: { "Cache-Control": "max-age=3600" } });
			}
			if (url.includes("id.twitch.tv/oauth2/token")) {
				return Response.json({ access_token: "test-access-token", expires_in: 3600 });
			}
			if (url.includes("api.igdb.com/v4/games")) {
				upstreamBody = String(init?.body ?? "");
				return Response.json([{ id: 1, name: "Fall Guys", cover: { image_id: "cover" } }]);
			}
			throw new Error(`Unexpected upstream request: ${url}`);
		});
		const token = await firebaseToken();
		const names = encodeURIComponent(JSON.stringify(["Fall Guys: Ultimate Knockout"]));
		const response = await run(new IncomingRequest(
			`https://example.com/igdb/games/resolve?names=${names}`,
			{ headers: { Authorization: `Bearer ${token}` } },
		), TEST_ENV);
		expect(response.status).toBe(200);
		expect(upstreamBody).toContain('name ~ *"fall guys"*');
		const body = await response.json() as { results: Array<{ game: { id: number } | null }> };
		expect(body.results[0].game?.id).toBe(1_000_000_001);
	});

	it("does not resolve an ambiguous legacy title to an arbitrary IGDB game", async () => {
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
			const url = String(input);
			if (url.includes("googleapis.com/robot/v1/metadata")) {
				return Response.json({ "test-key": TEST_CERTIFICATE }, { headers: { "Cache-Control": "max-age=3600" } });
			}
			if (url.includes("id.twitch.tv/oauth2/token")) {
				return Response.json({ access_token: "test-access-token", expires_in: 3600 });
			}
			if (url.includes("api.igdb.com/v4/games")) {
				return Response.json([
					{ id: 10, name: "Doom", cover: { image_id: "classic" } },
					{ id: 20, name: "Doom", cover: { image_id: "remake" } },
				]);
			}
			throw new Error(`Unexpected upstream request: ${url}`);
		});
		const token = await firebaseToken();
		const names = encodeURIComponent(JSON.stringify(["Doom"]));
		const response = await run(new IncomingRequest(
			`https://example.com/igdb/games/resolve?names=${names}`,
			{ headers: { Authorization: `Bearer ${token}` } },
		), TEST_ENV);

		expect(response.status).toBe(200);
		const body = await response.json() as { results: Array<{ game: unknown }> };
		expect(body.results[0].game).toBeNull();
	});

	it("proxies authenticated Steam requests without exposing the API key", async () => {
		let upstreamUrl = "";
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
			const url = String(input);
			if (url.includes("googleapis.com/robot/v1/metadata")) {
				return Response.json({ "test-key": TEST_CERTIFICATE }, { headers: { "Cache-Control": "max-age=3600" } });
			}
			if (url.includes("api.steampowered.com")) {
				upstreamUrl = url;
				return Response.json({ response: { players: [{ personaname: "Geralt" }] } });
			}
			throw new Error(`Unexpected upstream request: ${url}`);
		});
		const token = await firebaseToken();
		const response = await run(new IncomingRequest(
			"https://example.com/steam/player?steamId=76561198000000000",
			{ headers: { Authorization: `Bearer ${token}` } },
		), TEST_ENV);
		expect(response.status).toBe(200);
		expect(upstreamUrl).toContain("key=steam-secret");
		expect(response.headers.get("authorization")).toBeNull();
	});

	it("proxies authenticated DeepL requests with the expected payload", async () => {
		let authorization = "";
		let upstreamBody = "";
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const url = String(input);
			if (url.includes("googleapis.com/robot/v1/metadata")) {
				return Response.json({ "test-key": TEST_CERTIFICATE }, { headers: { "Cache-Control": "max-age=3600" } });
			}
			if (url.includes("api-free.deepl.com")) {
				authorization = new Headers(init?.headers).get("authorization") ?? "";
				upstreamBody = String(init?.body ?? "");
				return Response.json({ translations: [{ text: "Bonjour" }] });
			}
			throw new Error(`Unexpected upstream request: ${url}`);
		});
		const token = await firebaseToken();
		const response = await run(new IncomingRequest("https://example.com/translate", {
			method: "POST",
			headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
			body: JSON.stringify({ text: "Hello" }),
		}), TEST_ENV);
		expect(response.status).toBe(200);
		expect(authorization).toBe("DeepL-Auth-Key deepl-secret");
		expect(JSON.parse(upstreamBody)).toEqual({ text: ["Hello"], source_lang: "EN", target_lang: "FR" });
	});
});
