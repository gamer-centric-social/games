# CLAUDE.md

Party Arcade — a mobile-first React SPA hosting four party games: **Imposter**
(pass-and-play), **UNO** (solo-vs-AI and P2P multiplayer), **Tank Arena**
(real-time P2P), and **Liar's Dice** (Perudo, solo-vs-bots and P2P multiplayer).
Everything runs in the browser; multiplayer is peer-to-peer over WebRTC with no game
server.

## Commands

```bash
npm run dev          # Vite dev server, host: true so phones on the same Wi-Fi can connect
npm run build        # production build
npm run lint         # oxlint  (NOT eslint — see below)
npm test             # vitest, single run
npm run test:watch   # vitest, watch mode
```

To test multiplayer you need two devices: `npm run dev`, then open
`http://<your-lan-ip>:5173` on a phone on the same network.

## Stack

React 19 · Vite 8 · Tailwind CSS v4 · PeerJS · oxlint · Vitest · deployed on Vercel.

Tailwind v4 is configured **CSS-first** in `src/index.css` via `@tailwindcss/vite`.
There is no `tailwind.config.js` — do not create one.

Linting is **oxlint**, not ESLint. `eslint-disable` comments are honoured, but there is
no ESLint config and no `eslint` dependency. Rules live in `.oxlintrc.json`.

**Do not disable `no-undef`.** `vite build` happily compiles a reference to an
identifier that resolves to nothing — it only fails at runtime, in the browser, on the
screen that uses it. `no-undef` is the only check in the toolchain that catches it, and
it caught two such crashes during the last refactor. `env` is set to browser + node so
DOM and `process` globals resolve.

## Layout

```
src/
  App.jsx                 state-based router (no react-router); ?game= / ?room= deep links
  components/             hub UI (Navbar, GameHub). Nothing game-specific.
  components/ui/          the design system: Button, Modal, Screen, Pill, inputs, roster
  services/               cross-game infrastructure (peerConfig.js: ICE/TURN + room codes + share links)
  services/room/          shared P2P rooms: roomNetwork (PeerJS host/client), roomHandshake
                          (admission + seat reclaim), roomChat (the host-stamped chat relay)
  services/chat/          room chat: ChatService, transport, chatRelay
  components/room/        shared lobby screens (JoinCreate, RoomWaiting), coloured by `tone`
  hooks/                  HUB-ONLY shared React hooks (useCopyFeedback, useChat, useRoomChat)
  utils/sound.js          Web Audio synth shared by all four games
  data/games.js           hub card metadata
  games/<game>/
    <Game>.jsx            composition + screen routing only
    components/           that game's UI
    engine/               PURE game logic, no React, no side effects — this is what tests target
    hooks/                stateful React glue between engine and UI
    services/             that game's networking
    utils/ constants/ data/
api/turn.js               Vercel serverless: hands out TURN credentials
```

Rules of thumb:

- A game's code lives under `src/games/<game>/`. If it is only used by one game, it does
  not belong in `src/components/`, `src/data/` or `src/utils/`.
- `components/ui/` is the exception, and the only one: it holds cross-game *presentation*
  primitives that know nothing about any game. Per-game colour reaches them as a `tone`
  prop (`imposter` / `uno` / `tank` / `dice`), never as a literal class string. Build a screen out
  of these rather than writing a new class string — the app previously had 856 `className`
  attributes spelling out 576 distinct strings, which is how eight different modal panels
  and three incompatible primary buttons happened.
- `engine/` must stay free of React and of side effects. Engine functions mutate or
  return state and report what happened as an `events` array; the caller turns those
  into sound, broadcasts, modals and timers. That is what keeps them unit-testable.
  - UNO: `(game, ...args) => { ok, reason?, events }`, mutating `game` in place.
  - Tank: `stepWorld(world, inputs) => { world, events }`, returning a new world.
  - Liar's Dice: the UNO shape, `(game, ...args) => { ok, reason?, events }`, with
    randomness injected (`rng`) so tests roll fixed dice.
- When a file passes ~400 lines, that is the signal to split it, not a target to beat.

## Design system

The visual language is **"Table"**: a game night table under a single lamp. Every token
lives in the `@theme` block of `src/index.css` — there is no `tailwind.config.js` and one
must not be created.

The rule that makes it hold together is that **there is exactly one light source, at the
top of the viewport, and every surface obeys it**:

- one background, `bg-table`. Never black, never a neutral grey, never a second value.
- raised things use `shadow-lift-1` / `-2` / `-3`; each carries a warm inset highlight on
  its top edge. Pressed-in things (inputs, code cells, the emoji discs) use `shadow-sink`.
- pressing an object pushes it into the table: `active:scale-[0.98] active:shadow-lift-0`.
- the lamp itself is `.table-lamp` on the app root. It does not move and does not animate.

The shell is deliberately almost colourless. **The only saturated colour in the app comes
from the four game inks** (`imposter` / `uno` / `tank` / `dice`) plus the semantic `ok` / `danger`
/ `turn`. No gradients — the red-to-amber-to-emerald and cyan-to-blue buttons the three
games each had were the most generic thing in the repo.

Three typefaces, three jobs: `font-display` (Bricolage Grotesque, **one weight**) for
headings and game names, `font-sans` (Hanken Grotesk) for everything else, `font-mono`
(DM Mono) for room codes, timers, counts, HP and scores. `font-black` and `font-extrabold`
are not used. Radii are `rounded-well` / `-object` / `-slab`, and nothing else.

UNO extends the lamp rule by exactly one step, and it is the only game that extends it:
**the light over the board burns the colour of the card in play** (`.uno-table-light`,
`--live` set from `COLOR_CONFIG[...].hex`). That is why UNO's four card colours are real
tokens — `--color-card-red` / `-yellow` / `-green` / `-blue` / `-face`. They are the one
place saturated colour belongs to a game's *material* rather than its ink. Keep the hex in
`COLOR_CONFIG` in step with the token: a custom property cannot be read back as a class.

The light is never the only signal. Red/green is UNO's classic accessibility failure and
an ambient colour makes it worse, so the live colour is always also named in words beside
the discard, and every card keeps its numeral plus two corner indices.

Whose turn it is is also said only in light and geometry, three times over: `.uno-seat-spot`
puts the lamp on the active seat (there are two seat states, lit or in shadow -- a third
"next" tone is what made the first two hard to separate), `.uno-hand-live` lights the rule
above your hand, and **your hand opens around what you can play**. That last one is
`handLayout.js`: a card's slot is decided by whether it is playable, so an even shingle of
unreadable 33px slivers becomes wide slots for the cards you are choosing between and ribs
for the rest. Do not flatten it back to a uniform step -- it is what makes a twelve-card
hand legible, and it is why every tappable card is big enough to tap. An out-of-play card
is darkened with an overlay, never faded: opacity makes a shingled card translucent and
you see the card underneath it. None of this reaches a screen reader, which is what the
`aria-live` region in `UnoStatusLine` is for.

The sub-14px range is `text-nano` (10px) / `text-micro` (11px) / `text-mini` (12px). 10px
is the floor. Do not reach for an arbitrary `text-[9px]`; there used to be 118 of those.

**Nothing in the toolchain catches an undefined Tailwind class** — `no-undef` covers JS
identifiers, not class strings, and three undefined utilities shipped that way before.
After touching styles, check the diff's new utilities against the `@theme` block by hand.

## The rule that matters most: host authority

Both networked games are **host-authoritative**. The host owns the only real game state;
clients send *intent* and render whatever the host broadcasts.

```
Client  --- intent (ACTION_* / FIRE / PLAYER_INPUT) --->  Host
Client  <-- full state snapshot (SYNC_GAME_STATE / WORLD_STATE) --- Host
```

Never let a client mutate game state locally and assume it sticks. Optimistic lobby
updates are fine — the host's next broadcast is the truth. Never trust a value a client
sent as game-affecting input without re-deriving or validating it host-side.

Room chat obeys the same rule. The host rebuilds every client `CHAT_MESSAGE` with
`stampChatPacket` (`services/chat/chatRelay.js`), taking the sender from the seat the
connection holds, and relays only what its own `ChatService` accepted. Whether a message is
yours is `msg.isOwn`, set where it was typed -- never `senderId`, because lobby seat ids
are renumbered when someone leaves.

Who a client is comes only from its connection. Each of these was once an exploit:

- the acting seat is the one whose `peerId` is the connection -- never a `playerId` in
  the packet, and a connection with no seat can do nothing;
- a connection holds at most one seat (`admitPlayer` refuses a second JOIN under another
  name);
- rosters sent to clients carry no `peerId` or `sessionId` -- a session id walks straight
  back into its seat, skipping the liveness probe;
- anything the room says goes through `broadcastToSeats` (`services/room/roomChat.js`),
  not the network's `broadcast`, which also reaches connections that never joined.

The host is also a player: `playerId` 0 in UNO and Liar's Dice, slot `p1` (blue) in Tank.

**Liar's Dice is the reference for new networked games.** It is built on
`services/room/` rather than its own copy of the PeerJS plumbing (UNO and Tank still
have theirs; UNO migrates later, as its own two-device-tested change). Its shape:

- one pure engine, driven by one controller, `games/dice/services/diceTable.js`, which
  owns every timer (bot turns, the reveal hold, covering a dropped player, the forfeit).
  Solo runs it locally; the online host runs the same one. It is plain JS, so it is
  tested with fake timers -- the gap UNO has in `useUnoAiGame.js` does not exist here.
- the only thing a client ever receives is `snapshotFor(game, theirSeatId)`: their own
  dice, everyone else as counts, every cup only during the reveal. Lobby and match
  alike, so a client has one code path.
- `JOIN` carries a protocol version the host checks, so a stale client is refused with
  a message instead of desyncing.

Host state deliberately lives in a `useRef`, not `useState`, so it is immune to stale
closures inside network callbacks and timers. Keep it that way.

## Before claiming a change works

Run `npm test` (466 tests) and `npm run lint`. The engine tests exist because the UNO
rules and the Tank collision maths are easy to break silently.

Where the coverage is:

| Module | Tests |
|---|---|
| `uno/utils/deck.js` | 43 |
| `uno/engine/hostEngine.js` | 73 |
| `uno/services/unoHandshake.js` | 24 |
| `uno/utils/unoAi.js` | 23 |
| `uno/utils/turnOrder.js` | 16 |
| `uno/utils/drawFlightGeometry.js` | 13 |
| `uno/utils/handLayout.js` | 17 |
| `tank/engine/tankSimulation.js` | 53 |
| `tank/utils/tankPhysics.js` | 33 |
| `tank/utils/arenaGeometry.js` | 14 |
| `tank/utils/joystickMath.js` | 12 |
| `tank/utils/tankHud.js` | 3 |
| `services/chat/ChatService.js` + `chatTypes.js` | 14 |
| `services/chat/chatRelay.js` | 11 |
| `services/room/roomHandshake.js` | 24 |
| `services/room/roomChat.js` | 8 |
| `dice/engine/bidRules.js` | 22 |
| `dice/engine/diceEngine.js` | 32 |
| `dice/services/diceTable.js` | 11 |
| `dice/utils/narration.js` | 12 |
| `dice/utils/diceAi.js` | 5 |
| `dice/utils/rng.js` | 3 |

The notable gap is `uno/hooks/useUnoAiGame.js` — solo-vs-AI holds its state in React,
so it cannot be tested without a renderer. Treat changes there as unverified and play a
solo game through.

For rules changes, the invariant to check by hand is that a UNO deck stays whole:
`sum(all hands) + drawPile + discardPile === 108` (216 with 6+ players, which uses two
decks).

For Liar's Dice the invariant is that a resolved challenge moves the total dice by exactly
-1, or +1 (a successful Exact below five dice), or 0 (a successful Exact at five), and
every seat stays within 0..5. `diceEngine.test.js` plays seeded games to the end against it.

For anything touching networking or controls, test on two real devices. A dev-server
tab talking to another tab on the same machine does not exercise ICE, NAT or touch
input.

## Environment

Copy `.env.example` to `.env`. Multiplayer works on most home Wi-Fi with public STUN
alone; TURN credentials (`METERED_USERNAME` / `METERED_CREDENTIAL`) are only needed for
strict NAT and mobile data. Use the non-`VITE_` names so the values stay server-side —
`VITE_`-prefixed vars are baked into the client bundle.

## Notes

`docs/` holds longer working notes (architecture, per-engine deep dives, the bug ledger,
deferred work). It is **git-ignored** and local to this machine — read it if present,
but do not assume a collaborator has it.
