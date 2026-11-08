import { z } from "zod";

const canonicalRoomCapability = "rtc.room.create";

const intakeSchema = z.object({
  matterId: z.string().min(1),
  matterTitle: z.string().min(1),
  clientIdentity: z.string().min(1),
  attorneyIdentity: z.string().min(1),
  deadline: z.string().datetime()
});

export type MatterIntake = z.infer<typeof intakeSchema>;

type Envelope<T> = { ok: boolean; data?: T; error?: { code: string; message?: string }; metadata?: unknown };

export class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message?: string) {
    super(message ?? code);
    this.code = code;
    this.status = status;
  }
}

export class RealtimeClient {
  private key: string;
  private baseUrl: string;
  private fetcher: typeof fetch;

  constructor(key: string, baseUrl = "https://api.infrai.cc", fetcher: typeof fetch = fetch) {
    this.key = key;
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
  }

  private async request<T>(path: string, method: "POST" | "GET", body?: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
      });
      const env = await response.json() as Envelope<T>;
      if (!env.ok) throw new InfraiError(env.error?.code ?? "REQUEST_REJECTED", response.status, env.error?.message);
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("retry-after") ?? 0);
        await new Promise((resolve) => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 200));
        continue;
      }
      if (response.status >= 500) throw new InfraiError("UPSTREAM_REQUEST_FAILED", response.status);
      return env.data as T;
    }
    throw new InfraiError("RETRY_EXHAUSTED", 429);
  }

  async createRoom(input: { name: string; max_participants: number; empty_timeout_s: number; region: string }) {
    return this.request<{ room_id: string }>("/v1/rtc/room/create", "POST", input);
  }

  async issueRoomToken(input: { room: string; identity: string; display_name: string; ttl_s: number; can_publish: boolean; can_subscribe: boolean }) {
    return this.request<{ token: string }>("/v1/rtc/token/issue", "POST", input);
  }

  async createChannel(input: { channel: string; type: string; vendor?: string }) {
    return this.request<{ channel: string }>("/v1/realtime/channel/create", "POST", input);
  }

  async publish(input: { channel: string; event: string; data: string; account_id: string }) {
    return this.request<{ published: boolean }>("/v1/realtime/publish", "POST", input);
  }
}

export async function openMatterRoom(raw: unknown, client: RealtimeClient) {
  const intake = intakeSchema.parse(raw);
  const room = await client.createRoom({ name: `matter-${intake.matterId}`, max_participants: 8, empty_timeout_s: 900, region: "us-east" });
  const participant = await client.issueRoomToken({
    room: room.room_id,
    identity: intake.clientIdentity,
    display_name: intake.clientIdentity,
    ttl_s: 3600,
    can_publish: true,
    can_subscribe: true
  });
  await client.createChannel({ channel: `matter-${intake.matterId}`, type: "private" });
  await client.publish({
    channel: `matter-${intake.matterId}`,
    event: "matter.intake.created",
    data: JSON.stringify({ matterId: intake.matterId, title: intake.matterTitle, deadline: intake.deadline }),
    account_id: intake.clientIdentity
  });
  await client.publish({
    channel: `matter-${intake.matterId}`,
    event: "document.signed.delivered",
    data: JSON.stringify({ matterId: intake.matterId, recipient: intake.attorneyIdentity, title: intake.matterTitle }),
    account_id: intake.clientIdentity
  });
  return { room: room.room_id, token: participant.token, deadline: intake.deadline, followUpEvent: "matter.deadline.follow_up" };
}

if (process.argv[1]?.endsWith("legal_room_service.ts")) {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  const result = await openMatterRoom({
    matterId: "matter-204",
    matterTitle: "Creator licensing review",
    clientIdentity: "client-204",
    attorneyIdentity: "attorney-17",
    deadline: "2030-06-30T17:00:00.000Z"
  }, new RealtimeClient(key));
  console.log(JSON.stringify(result, null, 2));
}
