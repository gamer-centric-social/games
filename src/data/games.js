/**
 * Hub card metadata. Pure data -- the Tailwind class strings that used to live
 * here (gradient, borderGlow, accentColor, bgAccent, and a verbatim copy of
 * UNO's button) belong to the design system, not to a data file.
 *
 * `ink` names one of the three game inks in src/index.css. It is the only
 * saturated colour each game is allowed in the shell.
 */
export const GAMES = [
  {
    id: 'imposter',
    title: 'Imposter',
    badge: 'Social deduction',
    tagline: 'Find the spy before they find the word.',
    description:
      'A party word game of subtle clues, deception, and bluffing. One or more imposters try to blend in without knowing the secret word.',
    playerCount: '3–20 players',
    duration: '5–10 min',
    emoji: '🕵️',
    ink: 'imposter',
    tags: ['Pass & play', 'Party word game', 'Zero setup'],
  },
  {
    id: 'uno',
    title: 'UNO',
    badge: 'Card classic',
    tagline: 'Match colours, stack cards, call UNO.',
    description:
      'The world’s favorite card game. Play solo against smart AI bots or online with up to 10 friends. Full standard deck rules: Skips, Reverses, Draw Twos, and Wild +4s.',
    playerCount: '2–10 players',
    duration: '5–15 min',
    emoji: '🃏',
    ink: 'uno',
    tags: ['Solo vs AI bots', 'Online multiplayer', 'Full 108 cards'],
  },
  {
    id: 'tank',
    title: 'Tank Arena',
    badge: 'Tactical action',
    tagline: 'Top-down duels and 2v2 squad battles.',
    description:
      'An open-grid battlefield with stealth bushes, steel bunkers, destructible walls, explosive barrels, and crate air drops across devices.',
    playerCount: '2 or 4 players',
    duration: '3–8 min',
    emoji: '🚜',
    ink: 'tank',
    tags: ['1v1 duel', '2v2 squad', 'Networked P2P'],
  },
  {
    id: 'dice',
    title: "Liar's Dice",
    badge: 'Bluffing',
    tagline: 'Bid on dice you cannot see. Call the liar.',
    description:
      'Everyone rolls five dice in secret and bids on what is under all the cups. Raise, call Liar, or call it Exact. Perudo rules, with wild 1s and palifico.',
    playerCount: '2–6 players',
    duration: '10–20 min',
    emoji: '🎲',
    ink: 'dice',
    tags: ['Solo vs bots', 'Online multiplayer', 'Perudo rules'],
  },
]

/** Used by the Navbar, which used to keep its own hardcoded copy of these. */
export const getGame = (id) => GAMES.find((game) => game.id === id)
