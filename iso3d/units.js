// Base stats for classic FFT-style jobs
const JOB_STATS = {
  Squire: {
    hp: 40,
    maxHp: 40,
    mp: 10,
    maxMp: 10,
    moveRange: 4,
    jumpHeight: 1,
    atk: 12,
    def: 8,
    mag: 5,
    res: 5,
    speed: 6
  },
  Knight: {
    hp: 60,
    maxHp: 60,
    mp: 5,
    maxMp: 5,
    moveRange: 3,
    jumpHeight: 1,
    atk: 18,
    def: 15,
    mag: 3,
    res: 7,
    speed: 5
  },
  Archer: {
    hp: 30,
    maxHp: 30,
    mp: 15,
    maxMp: 15,
    moveRange: 4,
    jumpHeight: 1,
    atk: 15,
    def: 5,
    mag: 8,
    res: 6,
    speed: 7
  },
  BlackMage: {
    hp: 25,
    maxHp: 25,
    mp: 40,
    maxMp: 40,
    moveRange: 3,
    jumpHeight: 1,
    atk: 8,
    def: 4,
    mag: 25,
    res: 8,
    speed: 4
  },
  WhiteMage: {
    hp: 28,
    maxHp: 28,
    mp: 35,
    maxMp: 35,
    moveRange: 3,
    jumpHeight: 1,
    atk: 6,
    def: 5,
    mag: 20,
    res: 12,
    speed: 5
  }
};

/**
 * Create a new unit with the specified job, team, and position
 * @param {string} job - The job class of the unit
 * @param {string} team - The team ('player' or 'enemy')
 * @param {number} x - X grid position
 * @param {number} z - Z grid position
 * @returns {Object} A new unit object
 */
export function createUnit(job, team, x, z) {
  if (!JOB_STATS[job]) {
    throw new Error(`Unknown job: ${job}`);
  }
  
  const baseStats = JOB_STATS[job];
  
  return {
    name: `${job} Unit`,
    job: job,
    hp: baseStats.hp,
    maxHp: baseStats.maxHp,
    mp: baseStats.mp,
    maxMp: baseStats.maxMp,
    moveRange: baseStats.moveRange,
    jumpHeight: baseStats.jumpHeight,
    atk: baseStats.atk,
    def: baseStats.def,
    mag: baseStats.mag,
    res: baseStats.res,
    speed: baseStats.speed,
    team: team,
    x: x,
    z: z,
    alive: true
  };
}
