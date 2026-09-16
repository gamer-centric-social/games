import { createSeededRng } from '../../../utils/rng'
import {
  BAND_COUNT,
  COLORS,
  COURSE_HEIGHT,
  FINISH_RUN_IN,
  START_COLOR,
} from '../constants/bounceConstants'
import { INTENSE, pickRoom, ROOMS } from './segments'

/**
 * The course, built from nothing but a seed.
 *
 * This is why the race can run without the host simulating anyone: every device
 * calls buildCourse with the host's seed and gets a byte-identical climb. Pure,
 * no clock, no randomness of its own -- feed it the same number and it returns
 * the same course forever.
 *
 * It no longer walks upward sprinkling obstacles. It stacks **rooms**: a
 * gauntlet, a sweep, a chamber, a breather, each with its own character and its
 * own height, chosen from a pool that widens as you climb. Three things fall out
 * of that which the old generator had to fake:
 *
 * - checkpoints land on the seams between rooms, so a respawn never drops you
 *   inside a gauntlet or inside a chamber, and the old nudge-it-off-the-line
 *   hack is gone;
 * - pacing is designed -- two demanding rooms in a row are always followed by a
 *   breather, rather than hoping the dice are kind;
 * - the climb has a shape you can remember, which is the whole complaint the
 *   first version answered with "more of the same, slightly faster".
 *
 * Three products come out of one pass. `elements` is what the renderer draws,
 * `crossings` is the flattened, y-sorted list of everything the ball can trip
 * over -- all the engine ever walks -- and `segments` is what the HUD names.
 */

const BAND_HEIGHT = COURSE_HEIGHT / BAND_COUNT

export const bandAt = (y) => Math.min(BAND_COUNT - 1, Math.max(0, Math.floor(y / BAND_HEIGHT)))

/** Checkpoints sort before anything sharing their height: you land, then you climb. */
const rankOf = (crossing) => (crossing.type === 'checkpoint' ? 0 : 1)

/** Which room you are standing in. The HUD names it; nothing in the rules reads it. */
export function roomAt(course, y) {
  const found = course.segments.findLast((s) => s.y <= y)
  return found ? found.name : null
}

export function buildCourse(seed) {
  const rng = createSeededRng(seed)
  const elements = []
  const segments = []
  /** The colour the ball is holding at this height, tracked as the stack grows. */
  let color = START_COLOR
  const colorByY = [{ y: 0, color }]
  /** Seam heights. The start line is always the first. */
  const seams = [0]

  let y = 0
  const ceiling = COURSE_HEIGHT - FINISH_RUN_IN
  let intenseRun = 0
  let previous = null
  let beforeThat = null
  let sinceChamber = Infinity
  let sawChamber = false

  while (y < ceiling) {
    const band = bandAt(y)
    let name
    if (previous === null) name = 'approach'
    // Two demanding rooms in a row is plenty. Pacing is designed, not hoped for.
    else if (intenseRun >= 2) name = 'breather'
    // Every course shows its headline at least once, whatever the dice said.
    else if (band >= 3 && !sawChamber) name = 'chamber'
    else {
      // Nothing twice in a row that is only worth doing once in a while: a second
      // breather is dead shaft, and a second chamber straight after the first
      // turns the course's set piece into its texture.
      const barred = []
      if (previous === 'breather') barred.push('breather')
      if (sinceChamber < 2) barred.push('chamber')
      // And nothing three times running, whatever it is. Two of a room reads as
      // a theme; three reads as the generator having run out of ideas.
      if (previous === beforeThat && previous !== null) barred.push(previous)
      name = pickRoom(rng, band, barred)
    }

    const segment = ROOMS[name](rng, { baseY: y, band })
    // A room that would overhang the finish run-in is not laid at all.
    if (y + segment.height > ceiling) break
    sinceChamber = name === 'chamber' ? 0 : sinceChamber + 1
    if (name === 'chamber') sawChamber = true
    beforeThat = previous
    previous = name

    for (const element of [...segment.elements].sort((a, b) => a.crossY - b.crossY)) {
      // A colour post that hands you the colour you are already holding is a
      // wasted room, and the segment builders cannot know what you are holding.
      if (element.kind === 'swatch') {
        if (element.color === color) {
          element.color = COLORS[(COLORS.indexOf(element.color) + 1) % COLORS.length]
        }
        color = element.color
        colorByY.push({ y: element.crossY, color })
      }
      elements.push(element)
    }

    segments.push({ name: segment.name, y, height: segment.height })
    y += segment.height
    seams.push(y)
    intenseRun = INTENSE.has(name) ? intenseRun + 1 : 0
  }

  const colorAt = (target) => {
    let found = START_COLOR
    for (const mark of colorByY) {
      if (mark.y > target) break
      found = mark.color
    }
    return found
  }

  const checkpoints = seams.map((cy, index) => ({
    index,
    y: cy,
    color: colorAt(cy),
    crossingIndex: 0,
  }))

  const crossings = [
    ...elements.flatMap((element, elementIndex) =>
      // A chamber is the one element you are inside rather than past, so it puts
      // two crossings on the course: the lip you rise through, and the ceiling
      // that is the only way back out.
      element.kind === 'chamber'
        ? [
            { y: element.crossY, type: 'chamber-entry', elementIndex },
            { y: element.exitY, type: 'chamber-exit', elementIndex },
          ]
        : [{ y: element.crossY, type: element.kind, elementIndex }]
    ),
    ...checkpoints.map((cp) => ({ y: cp.y, type: 'checkpoint', elementIndex: cp.index })),
    { y: COURSE_HEIGHT, type: 'finish', elementIndex: -1 },
  ].sort((a, b) => a.y - b.y || rankOf(a) - rankOf(b))

  // Where a respawn resumes reading the course from.
  for (const cp of checkpoints) {
    cp.crossingIndex =
      crossings.findIndex((c) => c.type === 'checkpoint' && c.elementIndex === cp.index) + 1
  }

  return {
    seed,
    height: COURSE_HEIGHT,
    startColor: START_COLOR,
    elements,
    checkpoints,
    crossings,
    segments,
  }
}
