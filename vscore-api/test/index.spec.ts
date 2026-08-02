import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

async function run(request: Request): Promise<Response> {
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, env as Env & {
		RAWG_API_KEY: string;
		STEAM_API_KEY: string;
		DEEPL_API_KEY: string;
		FIREBASE_PROJECT_ID: string;
	}, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

describe("VScore API worker", () => {
	it("reports its health", async () => {
		const response = await run(new IncomingRequest("https://example.com/health"));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true, service: "vscore-api" });
	});

	it("answers CORS preflight requests", async () => {
		const response = await run(new IncomingRequest("https://example.com/rawg/games", { method: "OPTIONS" }));
		expect(response.status).toBe(204);
		expect(response.headers.get("access-control-allow-origin")).toBe("*");
	});

	it("rejects unknown routes", async () => {
		const response = await run(new IncomingRequest("https://example.com/proxy?url=https://example.org"));
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "Route not found." });
	});

	it("protects RAWG routes with Firebase authentication", async () => {
		const response = await run(new IncomingRequest("https://example.com/rawg/games?redirect=https://example.org"));
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
});
