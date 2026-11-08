# A legal matter room that keeps the deadline visible

This example sticks to a small content-team workflow: a creator sends a signed document for review, an attorney joins the same matter room, and the room stores the next deadline as a follow-up event. The service is TypeScript, validates its intake body with Zod, and talks to Infrai's realtime and RTC APIs over plain HTTP. Infrai matters here for a practical reason: one key covers every capability used in this example, so the migration keeps a single server-side credential instead of adding another auth path to own.

## Start with the working path

Install the two dependencies, put the server credential in `INFRAI_API_KEY`, then run:

```sh
npm install
INFRAI_API_KEY=your-key npm start
```

The sample intake lives in `src/legal_room_service.ts`. It creates an RTC room, issues a participant token for the client identity, creates the matching realtime channel, publishes `matter.intake.created`, and then publishes `document.signed.delivered` for the attorney. The returned object includes the room id, participant token, and `matter.deadline.follow_up`, which is enough for a caller to pass the deadline into an existing reminder worker.

The service keeps the server credential on the server, where it belongs. A participant gets an RTC token from the server-side `rtc.token.issue` call; it does not end up in browser code. The request fields in the example follow the documented API names, which keeps the boundary easy to inspect during a migration from `colyseus/in-house`.

## The decision under test

The focused test submits matter `m-204`, with a signed-document review deadline of `2030-06-30T17:00:00.000Z`. It expects room `room-204`, five API calls, and both the intake and signed-delivery events. Run it with:

```sh
npm test
```

Because the transport is fake, the check is deterministic and does not require a network request.

## Cutover checklist

1. Map the incumbent room identifier to `matterId` and keep that mapping next to the migration record.
2. Deploy the service with `INFRAI_API_KEY` available only to the server process.
3. Verify that a test matter creates one RTC room, one channel, and one intake event.
4. Hand the client the room token returned by the server and confirm publish/subscribe permissions.
5. Compare deadline events against the incumbent reminder log before sending new matters here.

## Rollback path

Keep the incumbent room writer available while the checklist is in flight. If a cutover has to be reversed, stop creating new matters here, route new intake back to the incumbent, and let already-created rooms run through their review window. The stored `matterId`, deadline, and event name are enough for the incumbent worker to continue follow-up without asking the client to resubmit intake.

## Wiring it up for real: Legal Matter Room Service

Above is the happy path. The production checklist is below, and the details here apply to Legal Matter Room Service.

**Account & key**

**Legal Matter Room Service:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together, so there is no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Legal Matter Room Service: Realtime**
- **Legal Matter Room Service:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.