import assert from "node:assert/strict";
import { openMatterRoom, RealtimeClient } from "./legal_room_service.ts";

const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
const fakeFetch: typeof fetch = async (input, init) => {
  calls.push({ path: String(input), body: JSON.parse(String(init?.body ?? "{}")) });
  const path = String(input);
  const data = path.includes("room/create") ? { room_id: "room-204" } : path.includes("token/issue") ? { token: "participant-token" } : path.includes("channel/create") ? { channel: "matter-m-204" } : { published: true };
  return new Response(JSON.stringify({ ok: true, data, error: null, metadata: {} }), { status: 200, headers: { "content-type": "application/json" } });
};

const result = await openMatterRoom({
  matterId: "m-204",
  matterTitle: "License signature",
  clientIdentity: "client-204",
  attorneyIdentity: "attorney-17",
  deadline: "2030-06-30T17:00:00.000Z"
}, new RealtimeClient("test-key", "https://example.test", fakeFetch));

assert.equal(result.room, "room-204");
assert.equal(result.token, "participant-token");
assert.equal(calls[1].path, "https://example.test/v1/rtc/token/issue");
assert.equal(calls[1].body.room, "room-204");
assert.equal(calls[1].body.identity, "client-204");
assert.equal(calls[1].body.can_publish, true);
assert.equal(calls[1].body.can_subscribe, true);
assert.equal(calls[2].body.type, "private");
assert.equal(calls[2].body.vendor, undefined);
assert.equal(result.followUpEvent, "matter.deadline.follow_up");
assert.equal(calls.length, 5);
assert.equal(calls[3].body.event, "matter.intake.created");
assert.equal(calls[4].body.event, "document.signed.delivered");
console.log("legal matter room decision: intake opens a room and schedules deadline follow-up");
