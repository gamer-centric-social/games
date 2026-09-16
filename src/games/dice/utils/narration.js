/**
 * The table in words, and in sound.
 *
 * Whose turn it is and which dice count are shown with light and lifted dice,
 * and none of that reaches a screen reader. So everything that matters is also
 * said here, once: the status line renders it and its aria-live region reads it.
 *
 * A client never sees the host's engine events, only snapshots, so the moments
 * worth a sound are also recovered here from two consecutive views.
 */

const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six',
  'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
]

export const quantityWord = (n) => NUMBER_WORDS[n] ?? String(n)

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)

export function bidWords({ quantity, face }) {
  return `${quantityWord(quantity)} ${face}${quantity === 1 ? '' : 's'}`
}

export function nameOf(view, seatId) {
  if (seatId === view.yourId) return 'You'
  return view.seats.find((s) => s.id === seatId)?.name ?? 'Someone'
}

export function ruleLine(view) {
  const dice = `${view.diceInPlay} ${view.diceInPlay === 1 ? 'die' : 'dice'} on the table`
  if (!view.palifico) return `1s are wild · ${dice}`
  const lock = view.palifico.face ? `${view.palifico.face}s locked` : 'the opening bid locks the face'
  return `Palifico: 1s aren't wild, ${lock} · ${dice}`
}

/** Second person for you, third person for everyone else: "You lose", "Ana loses". */
const verb = (view, seatId, you, them) => (seatId === view.yourId ? you : them)

function describeReveal(view) {
  const r = view.reveal
  const caller = nameOf(view, r.callerId)
  const call = `${caller} called ${r.kind === 'liar' ? 'Liar' : 'Exact'} on ${bidWords(r.bid)}.`
  const there = `There ${r.count === 1 ? 'was' : 'were'} ${quantityWord(r.count)}.`

  let outcome
  if (r.loserId !== null) {
    outcome = `${nameOf(view, r.loserId)} ${verb(view, r.loserId, 'lose', 'loses')} a die.`
  } else if (r.gainerId !== null) {
    outcome = `${caller} ${verb(view, r.callerId, 'get', 'gets')} a die back.`
  } else {
    outcome = 'Spot on.'
  }

  return { text: `${call} ${there} ${outcome}`, tone: r.loserId === view.yourId ? 'bad' : 'quiet' }
}

export function describeTable(view) {
  if (!view || view.phase === 'lobby') return { text: '', tone: 'quiet' }

  if (view.phase === 'over') {
    const mine = view.winnerId === view.yourId
    return {
      text: mine ? 'You win the table.' : `${nameOf(view, view.winnerId)} wins the table.`,
      tone: mine ? 'good' : 'quiet',
    }
  }

  if (view.phase === 'reveal') return describeReveal(view)

  const me = view.seats.find((s) => s.id === view.yourId)
  if (me?.out) {
    return { text: `You're out. ${capitalize(quantityWord(view.playersIn))} still in.`, tone: 'quiet' }
  }

  // The host's forfeit timer is running; the red dots on the seats must not be the only sign of it.
  const othersIn = view.seats.filter((s) => s.id !== view.yourId && !s.out)
  if (othersIn.length > 0 && othersIn.every((s) => !s.connected)) {
    return { text: 'Everyone else dropped out. The table is yours if nobody returns.', tone: 'turn' }
  }

  if (view.turnSeat === view.yourId) {
    if (!view.currentBid) {
      const text =
        view.palifico?.seatId === view.yourId
          ? 'Palifico: you open, on any face, even 1s.'
          : 'Your turn. Open the bidding.'
      return { text, tone: 'turn' }
    }
    return {
      text: `${nameOf(view, view.currentBid.seatId)} bid ${bidWords(view.currentBid)}. Raise it, or call it.`,
      tone: 'turn',
    }
  }

  const up = view.seats.find((s) => s.id === view.turnSeat)
  if (up && !up.connected) {
    return { text: `${up.name} dropped out. Their turn plays itself shortly.`, tone: 'quiet' }
  }
  return { text: `${nameOf(view, view.turnSeat)} is deciding…`, tone: 'quiet' }
}

/** The sound-worthy moments between two views, in the engine's event vocabulary. */
export function eventsBetween(prev, next) {
  if (!next) return []
  const events = []

  if (next.phase === 'bidding') {
    if (prev?.phase !== 'bidding' || prev.round !== next.round) {
      events.push({ type: 'ROLLED' })
    } else if (next.bidHistory.length > prev.bidHistory.length) {
      events.push({ type: 'BID' })
    }
  }

  if (next.phase === 'reveal' && prev?.phase !== 'reveal') {
    events.push({ type: 'REVEAL' })
    if (next.reveal?.loserId != null) events.push({ type: 'DIE_LOST', seatId: next.reveal.loserId })
  }

  if (next.phase === 'over' && prev?.phase !== 'over') events.push({ type: 'GAME_OVER' })

  return events
}
