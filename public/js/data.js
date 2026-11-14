// SATIT Orbital — game data (missions, parts, orbits, launchers, ground networks, events).
// Code written with assistance from Claude (Anthropic), a Super Intelligence (SI) tool. See README.md.
// Numbers are game-balance values, not engineering data. Relationships are meant to be realistic.

export const ROLES = {
  cmd: { id: 'cmd', name: 'Commander', npc: 'You', color: '#FFC23D', owns: 'Budget, schedule and final calls' },
  eng: { id: 'eng', name: 'Engineer', npc: 'Rio', color: '#3DF5FF', owns: 'Structure, power, battery, computer' },
  sci: { id: 'sci', name: 'Scientist', npc: 'Maya', color: '#B69CFF', owns: 'Instruments and pointing' },
  ops: { id: 'ops', name: 'Ops & Comms', npc: 'Sam', color: '#5DF2B0', owns: 'Radio, propulsion, orbit, ground' }
};
export const ROLE_ORDER = ['cmd', 'eng', 'sci', 'ops'];

// Difficulty levels, named after NASA Mission Design Lab study levels.
export const LEVELS = {
  cadet: { id: 'cadet', name: 'Cadet', mdl: 'Office Hours', budgetMult: 1.3, events: 3, note: 'Like a Mission Design Lab "Office Hours" session: quick brainstorming, hints on, generous budget.' },
  eng: { id: 'eng', name: 'Engineer', mdl: 'Trade Study', budgetMult: 1.0, events: 4, note: 'Like an MDL "Trade Study": compare designs, more surprises, normal budget.' },
  fd: { id: 'fd', name: 'Flight Director', mdl: 'Point Design', budgetMult: 0.85, events: 6, note: 'Like an MDL "Point Design": tight budget and frequent emergencies.' }
};

// JPL Concept Maturity Levels used as the player's rank.
export const CML = [
  { lvl: 1, name: 'Cocktail Napkin', note: 'The first idea' },
  { lvl: 2, name: 'Initial Feasibility', note: 'Could it work at all?' },
  { lvl: 3, name: 'Trade Space', note: 'Compare many designs' },
  { lvl: 4, name: 'Point Design', note: 'One detailed design' }
];

// Which role owns which part category.
export const SLOT_OWNER = { bus: 'eng', solar: 'eng', battery: 'eng', cpu: 'eng', adcs: 'sci', inst: 'sci', comms: 'ops', prop: 'ops' };

export const SLOT_INFO = {
  bus: { name: 'Structure', icon: 'bus', hint: 'The frame everything bolts to. Bigger frames last longer and store more data, but weigh more.' },
  solar: { name: 'Solar array', icon: 'solar', hint: 'Turns sunlight into power. Farther from the Sun, panels make less.' },
  battery: { name: 'Battery', icon: 'battery', hint: 'Runs everything while you are in shadow.' },
  comms: { name: 'Radio', icon: 'comms', hint: 'Beams data home. The farther away you are, the weaker the signal.' },
  cpu: { name: 'Computer', icon: 'cpu', hint: 'The spacecraft’s brain. Space radiation can scramble ordinary chips.' },
  adcs: { name: 'Pointing', icon: 'adcs', hint: 'Aims the spacecraft. Sharp pictures need a rock-steady aim.' },
  prop: { name: 'Propulsion', icon: 'prop', hint: 'Engines and fuel for changing orbit. Measured in Δv (change in velocity).' },
  inst: { name: 'Instruments', icon: 'inst', hint: 'Your science payload. Every instrument adds mass, power, cost and data.' }
};

// tier: 0 basic, 1 advanced, 2 elite
export const CATALOG = {
  std: {
    slots: ['bus', 'solar', 'battery', 'comms', 'cpu', 'adcs', 'prop'],
    bus: [
      { id: 's', code: 'S', tier: 0, name: 'Small bus', note: 'Light and cheap. Built for 3 years.', mass: 60, cost: 8, life: 3, storage: 100 },
      { id: 'm', code: 'M', tier: 1, name: 'Medium bus', note: 'The all-rounder. Built for 5 years.', mass: 120, cost: 15, life: 5, storage: 300 },
      { id: 'l', code: 'L', tier: 2, name: 'Large bus', note: 'Tough and roomy. Built for 8 years.', mass: 200, cost: 24, life: 8, storage: 600 }
    ],
    solar: [
      { id: 'body', code: 'BP', tier: 0, name: 'Body panels', note: 'Cells glued to the sides. Simple.', mass: 8, cost: 2, gen: 150 },
      { id: 'wing', code: '2W', tier: 1, name: 'Twin wings', note: 'Fold out after launch.', mass: 25, cost: 6, gen: 450 },
      { id: 'big', code: 'XL', tier: 2, name: 'Mega wings', note: 'Huge power, huge price.', mass: 45, cost: 12, gen: 900 },
      { id: 'giant', code: 'XXL', tier: 2, name: 'Giant wings', note: 'For deep space or electric engines.', mass: 80, cost: 20, gen: 1800 }
    ],
    battery: [
      { id: 'b20', code: '20', tier: 0, name: '20 Ah pack', note: 'Carries up to 250 W in shadow.', mass: 6, cost: 1, cap: 250 },
      { id: 'b60', code: '60', tier: 1, name: '60 Ah pack', note: 'Carries up to 700 W in shadow.', mass: 15, cost: 3, cap: 700 },
      { id: 'b120', code: '120', tier: 2, name: '120 Ah pack', note: 'Carries up to 1,400 W in shadow.', mass: 28, cost: 6, cap: 1400 }
    ],
    comms: [
      { id: 'uhf', code: 'UHF', tier: 0, name: 'UHF whip', note: 'Tiny and cheap. A trickle of data.', mass: 3, power: 10, cost: 0.5, down: 2 },
      { id: 's', code: 'S', tier: 1, name: 'S-band dish', note: 'Good for small missions near Earth.', mass: 6, power: 25, cost: 2, down: 20 },
      { id: 'x', code: 'X', tier: 2, name: 'X-band dish', note: 'A fire hose of data near Earth.', mass: 12, power: 60, cost: 5, down: 200 },
      { id: 'ka', code: 'Ka', tier: 2, name: 'Ka-band high-gain', note: 'Big dish for the Moon and beyond.', mass: 30, power: 120, cost: 14, down: 1200 }
    ],
    cpu: [
      { id: 'basic', code: 'CPU', tier: 0, name: 'Commercial', note: 'Cheap, but may reboot in a solar storm.', mass: 2, power: 8, cost: 1, rad: false },
      { id: 'rad', code: 'RAD', tier: 2, name: 'Radiation-hardened', note: 'Shrugs off solar storms.', mass: 5, power: 15, cost: 4, rad: true }
    ],
    adcs: [
      { id: 'mag', code: 'MQ', tier: 0, name: 'Magnetorquers', note: 'Pushes on a magnetic field. Wobbly, and useless far from Earth.', mass: 3, power: 5, cost: 1, fine: false },
      { id: 'rw', code: 'RW', tier: 1, name: 'Reaction wheels', note: 'Spinning wheels for precise aim.', mass: 15, power: 30, cost: 5, fine: true }
    ],
    prop: [
      { id: 'none', code: '—', tier: 0, name: 'No engine', note: 'Lighter and cheaper. You cannot change orbit or dodge debris.', mass: 0, cost: 0, dv: 0 },
      { id: 'cold', code: 'CG', tier: 0, name: 'Cold-gas thrusters', note: 'Puffs of gas for small nudges.', mass: 10, cost: 2, dv: 60 },
      { id: 'mono', code: 'MP', tier: 1, name: 'Monopropellant', note: 'Simple rocket engine for orbit changes.', mass: 60, cost: 8, dv: 450 },
      { id: 'bi', code: 'BP', tier: 2, name: 'Bipropellant', note: 'Powerful engine for big maneuvers.', mass: 180, cost: 20, dv: 1600, cruiseMonths: 7 },
      { id: 'ion', code: 'ION', tier: 2, name: 'Electric ion drive', note: 'Super fuel-efficient, but power hungry and slow.', mass: 70, power: 600, cost: 25, dv: 3500, cruiseMonths: 14 }
    ]
  },
  cube: {
    slots: ['bus', 'solar', 'battery', 'comms', 'cpu', 'adcs'],
    bus: [
      { id: 'u1', code: '1U', tier: 0, name: '1U CubeSat', note: '10 cm cube. Max 1.33 kg total.', mass: 0.2, cost: 0.02, life: 1, storage: 2, maxMass: 1.33, rideCost: 0.05 },
      { id: 'u3', code: '3U', tier: 1, name: '3U CubeSat', note: 'Three cubes long. Max 4 kg total.', mass: 0.5, cost: 0.05, life: 2, storage: 8, maxMass: 4, rideCost: 0.15 },
      { id: 'u6', code: '6U', tier: 2, name: '6U CubeSat', note: 'Shoebox size. Max 12 kg total.', mass: 1.0, cost: 0.1, life: 3, storage: 16, maxMass: 12, rideCost: 0.3 }
    ],
    solar: [
      { id: 'cbody', code: 'BP', tier: 0, name: 'Body cells', note: 'Cells on the outside walls.', mass: 0.15, cost: 0.02, gen: 4 },
      { id: 'cdep', code: 'DP', tier: 1, name: 'Deployable panels', note: 'Flip out like wings.', mass: 0.35, cost: 0.06, gen: 14 },
      { id: 'cbig', code: 'XL', tier: 2, name: 'Double deployables', note: 'Two sets of fold-out wings.', mass: 0.7, cost: 0.12, gen: 30 }
    ],
    battery: [
      { id: 'c10', code: '10', tier: 0, name: '10 Wh pack', note: 'Carries up to 5 W in shadow.', mass: 0.1, cost: 0.01, cap: 5 },
      { id: 'c40', code: '40', tier: 1, name: '40 Wh pack', note: 'Carries up to 20 W in shadow.', mass: 0.35, cost: 0.03, cap: 20 }
    ],
    comms: [
      { id: 'cuhf', code: 'UHF', tier: 0, name: 'UHF radio', note: 'Classic CubeSat radio. Very slow.', mass: 0.1, power: 2, cost: 0.01, down: 0.01 },
      { id: 'cs', code: 'S', tier: 1, name: 'S-band radio', note: 'Fast enough for pictures.', mass: 0.25, power: 6, cost: 0.05, down: 0.5 }
    ],
    cpu: [
      { id: 'chob', code: 'CPU', tier: 0, name: 'Hobby board', note: 'Cheap, but may reboot in a solar storm.', mass: 0.05, power: 0.5, cost: 0.002, rad: false },
      { id: 'cfl', code: 'FLT', tier: 1, name: 'Flight computer', note: 'Tested for space radiation.', mass: 0.1, power: 1, cost: 0.02, rad: true }
    ],
    adcs: [
      { id: 'cmag', code: 'MQ', tier: 0, name: 'Magnet rods', note: 'Slowly lines up with Earth’s field.', mass: 0.1, power: 0.5, cost: 0.01, fine: false },
      { id: 'crw', code: 'RW', tier: 1, name: 'Mini reaction wheels', note: 'Precise aim for sharp photos.', mass: 0.4, power: 2, cost: 0.08, fine: true }
    ]
  }
};

export const INSTRUMENTS = {
  tir: { code: 'TIR', tier: 1, color: '#FF8A3D', name: 'Thermal imager', note: 'Sees heat. Spots fires day and night.', mass: 35, power: 80, cost: 18, data: 60, sci: 30, fine: true, tags: ['thermal'] },
  msi: { code: 'MSI', tier: 1, color: '#3DF5FF', name: 'Multispectral camera', note: 'Maps burn scars and healthy plants.', mass: 25, power: 45, cost: 12, data: 120, sci: 25 },
  hsi: { code: 'HSI', tier: 2, color: '#B69CFF', name: 'Hyperspectral imager', note: 'Hundreds of colors. Tells what is burning.', mass: 60, power: 140, cost: 30, data: 400, sci: 40, fine: true },
  lidar: { code: 'LDR', tier: 2, color: '#5DF2B0', name: 'Smoke lidar', note: 'A laser that measures smoke height.', mass: 80, power: 220, cost: 40, data: 15, sci: 35 },

  uhfprox: { code: 'UPX', tier: 0, color: '#5DF2B0', name: 'UHF relay radio', note: 'Talks to rovers at 8 Mb/s.', mass: 6, power: 20, cost: 4, data: 60, sci: 15, rate: 8, tags: ['relay'] },
  sprox: { code: 'SPX', tier: 1, color: '#3DF5FF', name: 'S-band relay radio', note: 'Talks to rovers at 30 Mb/s.', mass: 15, power: 60, cost: 12, data: 200, sci: 30, rate: 30, tags: ['relay'] },
  kaprox: { code: 'KPX', tier: 2, color: '#FFC23D', name: 'Ka-band relay radio', note: 'Talks to rovers at 100 Mb/s.', mass: 35, power: 150, cost: 30, data: 600, sci: 50, rate: 100, tags: ['relay'] },
  lunacam: { code: 'CAM', tier: 1, color: '#B69CFF', name: 'Lunar mapping camera', note: 'Bonus science between relay passes.', mass: 20, power: 30, cost: 10, data: 80, sci: 20, fine: true },

  navcam: { code: 'NAC', tier: 1, color: '#3DF5FF', name: 'Narrow-angle camera', note: 'Zoom lens for close-up surface images.', mass: 20, power: 20, cost: 12, data: 20, sci: 30, fine: true, tags: ['imager'] },
  irspec: { code: 'IRS', tier: 1, color: '#FF8A3D', name: 'Infrared spectrometer', note: 'Reads what minerals the surface is made of.', mass: 30, power: 25, cost: 18, data: 15, sci: 30 },
  lalt: { code: 'LA', tier: 1, color: '#5DF2B0', name: 'Laser altimeter', note: 'Bounces lasers to measure the exact shape.', mass: 15, power: 40, cost: 10, data: 3, sci: 25 },
  xrs: { code: 'XRS', tier: 2, color: '#B69CFF', name: 'X-ray spectrometer', note: 'Finds chemical elements from X-ray glow.', mass: 25, power: 20, cost: 15, data: 2, sci: 20 },

  wxcam: { code: 'WX', tier: 1, color: '#FFC23D', name: 'Wide-angle weather camera', note: 'Photographs the whole planet’s clouds and dust each day.', mass: 10, power: 15, cost: 8, data: 5, sci: 30, tags: ['globalmap'] },
  sounder: { code: 'IRS', tier: 1, color: '#FF8A3D', name: 'Atmospheric sounder', note: 'Measures temperature at every height.', mass: 40, power: 35, cost: 25, data: 2, sci: 35 },
  hires: { code: 'HR', tier: 2, color: '#3DF5FF', name: 'High-resolution camera', note: 'Sees things the size of a car. Huge data.', mass: 65, power: 60, cost: 40, data: 300, sci: 30, fine: true },
  radar: { code: 'RAD', tier: 2, color: '#5DF2B0', name: 'Subsurface radar', note: 'Looks for buried ice.', mass: 50, power: 80, cost: 30, data: 40, sci: 25 },

  cam: { code: 'CAM', tier: 0, color: '#3DF5FF', name: 'CubeSat camera', note: 'Snaps photos of your region.', mass: 0.2, power: 2, cost: 0.02, data: 0.05, sci: 20, tags: ['photo'] },
  hdcam: { code: 'HD', tier: 1, color: '#B69CFF', name: 'HD camera', note: 'Sharper photos. Needs steady pointing.', mass: 0.5, power: 4, cost: 0.08, data: 0.4, sci: 35, fine: true, tags: ['photo'] },
  radsens: { code: 'RS', tier: 0, color: '#5DF2B0', name: 'Radiation sensor', note: 'Counts space radiation hitting your satellite.', mass: 0.15, power: 1, cost: 0.01, data: 0.002, sci: 15 }
};

// Orbits follow the families GMAT can model: LEO, geostationary, lunar, libration-point, interplanetary.
export const ORBITS = {
  sso: { name: 'Sun-synchronous orbit', family: 'Low Earth orbit', alt: '550 km', dest: 'leo', revisitH: 12, lifeCap: 10, dv: 60, link: 1, sciMult: 1, sharp: true, explain: 'Passes over every place at the same local time each day, so lighting stays consistent. Covers the whole globe.' },
  iss: { name: 'ISS-like orbit', family: 'Low Earth orbit', alt: '420 km · 51.6° tilt', dest: 'leo', revisitH: 24, lifeCap: 2, dv: 40, link: 1, sciMult: 0.8, sharp: true, explain: 'Low and easy to reach, but air drag drags you down within a couple of years, and you never fly over the far north or south.' },
  geo: { name: 'Geostationary orbit', family: 'Geostationary', alt: '35,786 km', dest: 'gto', revisitH: 0.25, lifeCap: 15, dv: 1500, link: 0.5, sciMult: 0.7, sharp: false, explain: 'Hovers over one spot and watches half the planet nonstop, but it is so far away that small fires are invisible.' },

  nrho: { name: 'Near-rectilinear halo orbit', family: 'Libration-point (halo)', alt: '3,000–70,000 km', dest: 'tli', coverage: 0.92, lifeCap: 20, dv: 450, link: 0.5, sciMult: 1, explain: 'A stretched loop over the Moon’s pole. Sees the south pole and far side most of the time and always sees Earth.' },
  llo: { name: 'Low lunar orbit', family: 'Lunar orbit', alt: '100 km', dest: 'tli', coverage: 0.3, lifeCap: 3, dv: 900, link: 0.5, sciMult: 1.2, explain: 'Close to the surface, great for cameras, but the landing zone is only in view for short passes, and lumpy lunar gravity shortens the orbit’s life.' },
  l2: { name: 'Earth–Moon L2 halo', family: 'Libration-point (halo)', alt: '~60,000 km beyond the Moon', dest: 'tli', coverage: 1.0, lifeCap: 15, dv: 350, link: 0.4, sciMult: 0.8, explain: 'Loops around a balance point behind the Moon. Sees the whole far side all the time, but it is farther from Earth, so the link is weaker.' },

  flyby: { name: 'Flyby trajectory', family: 'Interplanetary', alt: 'Closest pass 500 km', dest: 'deep', lifeCap: 10, dv: 200, link: 0.15, sciMult: 0.5, closestKm: 500, resM: 3, explain: 'Zoom past the asteroid once. Cheap on fuel, but you only get a few hours of close-up views.' },
  rdv: { name: 'Rendezvous & orbit', family: 'Interplanetary', alt: 'Orbit at 5 km', dest: 'deep', lifeCap: 10, dv: 1400, link: 0.15, sciMult: 1.5, closestKm: 5, resM: 0.5, explain: 'Match the asteroid’s path and orbit it for months. Needs lots of fuel, but you can map every rock.' },

  mlow: { name: 'Low Mars orbit', family: 'Interplanetary → Mars orbit', alt: '300 km · polar', dest: 'mars', lifeCap: 15, dv: 1500, link: 0.1, sciMult: 1.0, globalMap: true, explain: 'Low polar orbit that sees the whole planet every day at the same local time, the classic weather-satellite orbit.' },
  mell: { name: 'High elliptical Mars orbit', family: 'Interplanetary → Mars orbit', alt: '300–33,000 km', dest: 'mars', lifeCap: 15, dv: 900, link: 0.1, sciMult: 0.75, globalMap: true, explain: 'Swings far out for whole-disk views. Easier to reach, but pictures are less sharp.' },

  issd: { name: 'Deployed from the ISS', family: 'Low Earth orbit', alt: '~410 km', dest: 'leo', revisitH: 24, lifeCap: 1, dv: 0, link: 1, sciMult: 0.9, explain: 'Astronauts push your CubeSat out from the space station. Easy, but air drag brings it down in about a year.' },
  cubesso: { name: 'Rideshare to sun-synchronous orbit', family: 'Low Earth orbit', alt: '550 km', dest: 'leo', revisitH: 24, lifeCap: 5, dv: 0, link: 1, sciMult: 1, explain: 'Ride along with a bigger satellite to a higher orbit that lasts for years.' }
};

export const LAUNCHERS = {
  ride: { cls: 'std', name: 'Rideshare slot', code: 'RS', cost: 6, cap: { leo: 300 }, orbits: ['sso'], note: 'Share a rocket with other satellites. Cheap, but you go where the main customer goes.' },
  small: { cls: 'std', name: 'Small launcher', code: 'SL', cost: 12, cap: { leo: 500 }, note: 'A dedicated small rocket. Your orbit, your schedule.' },
  medium: { cls: 'std', name: 'Medium launcher', code: 'ML', cost: 60, cap: { leo: 10000, gto: 4500, tli: 3000, deep: 2500, mars: 2000 }, note: 'Workhorse rocket. Can reach the Moon and the planets.' },
  heavy: { cls: 'std', name: 'Heavy launcher', code: 'HL', cost: 110, cap: { leo: 30000, gto: 12000, tli: 10000, deep: 8000, mars: 7000 }, note: 'Huge capacity, huge price.' },
  csli: { cls: 'cube', name: 'NASA CubeSat Launch Initiative', code: 'CSLI', cost: 0, cubeRide: false, delayMonths: 15, orbits: ['issd'], note: 'NASA can launch selected educational CubeSats at no cost, but you join a queue.' },
  cuberide: { cls: 'cube', name: 'Commercial CubeSat rideshare', code: 'CR', cost: 0, cubeRide: true, delayMonths: 6, note: 'Buy a ride. Price depends on CubeSat size.' }
};

export const GROUNDS = {
  uni: { cls: 'std', name: 'University ground station', code: 'UNI', mult: { leo: 0.35 }, costYr: 0.3, note: 'One antenna, a few passes a day. Cheap.' },
  com: { cls: 'std', name: 'Commercial ground network', code: 'COM', mult: { leo: 1.0, gto: 1.0, tli: 0.6 }, costYr: 1.5, note: 'Antennas around the world rent you time on every pass.' },
  dsn: { cls: 'std', name: 'Deep Space Network', code: 'DSN', mult: { gto: 1.0, tli: 1.0, deep: 1.0, mars: 1.0 }, costYr: 3, note: 'NASA’s giant dishes in California, Spain and Australia. The only way to hear spacecraft far from Earth.' },
  school: { cls: 'cube', name: 'School ground station', code: 'SCH', mult: { leo: 0.5 }, costYr: 0, note: 'An antenna on your school roof. Free, but only hears you a few times a day.' },
  vol: { cls: 'cube', name: 'Volunteer radio network', code: 'VOL', mult: { leo: 0.9 }, costYr: 0, note: 'Radio amateurs around the world share their stations. Free.' },
  ccom: { cls: 'cube', name: 'Commercial ground network', code: 'COM', mult: { leo: 1.4 }, costYr: 0.05, note: 'Paid antennas worldwide.' }
};

export const MISSIONS = [
  {
    id: 'cube', code: 'CS', name: 'CubeSat Classroom', kind: 'STUDENT CUBESAT', level: 'BEGINNER', pips: 1, color: '#5DF2B0', cls: 'cube',
    target: 'earth', where: 'Low Earth orbit', budget: 0.5, years: 0.5, sun: 1,
    goal: 'Build a 3U-style CubeSat that photographs your region and radios the pictures to your school.',
    instruments: ['cam', 'hdcam', 'radsens'], orbits: ['issd', 'cubesso'], launchers: ['csli', 'cuberide'], grounds: ['school', 'vol', 'ccom'],
    defaults: { sel: { bus: 'u3', solar: 'cdep', battery: 'c10', comms: 'cuhf', cpu: 'chob', adcs: 'cmag' }, inst: { cam: true }, orbit: 'issd', launcher: 'csli', ground: 'school' },
    reqs: [
      { kind: 'formFactor', text: 'Fit your CubeSat’s size limit' },
      { kind: 'dailyPhoto', text: 'Photograph your region at least once a day' },
      { kind: 'data80', text: 'Get at least 80% of pictures to the ground' },
      { kind: 'life', text: 'Operate for at least 6 months' },
      { kind: 'launchTime', text: 'Be in orbit within 12 months', months: 12 },
      { kind: 'budget', text: 'Stay within budget' }
    ],
    sciRef: 40,
    twin: 'NASA’s CubeSat Launch Initiative (CSLI) launches CubeSats built by students and universities, the path described in NASA’s CubeSat 101 guide.'
  },
  {
    id: 'fire', code: 'WW', name: 'Wildfire Watch', kind: 'EARTH OBSERVATION', level: 'CADET', pips: 2, color: '#FF8A3D', cls: 'std',
    target: 'earth', where: 'Low Earth orbit', budget: 120, years: 3, sun: 1,
    goal: 'Spot new wildfires within hours and map burn scars after the fires are out.',
    instruments: ['tir', 'msi', 'hsi', 'lidar'], orbits: ['sso', 'iss', 'geo'], launchers: ['ride', 'small', 'medium', 'heavy'], grounds: ['uni', 'com'],
    defaults: { sel: { bus: 'm', solar: 'wing', battery: 'b60', comms: 's', cpu: 'basic', adcs: 'rw', prop: 'cold' }, inst: { tir: true, msi: true }, orbit: 'sso', launcher: 'small', ground: 'com' },
    reqs: [
      { kind: 'revisit', text: 'Revisit fire zones at least every 12 hours', hours: 12 },
      { kind: 'fire50', text: 'Detect fires as small as 50 m, day and night' },
      { kind: 'data80', text: 'Deliver at least 80% of collected data' },
      { kind: 'life', text: 'Operate for at least 3 years' },
      { kind: 'budget', text: 'Stay within budget' }
    ],
    sciRef: 55,
    twin: 'Landsat 8 and 9 pair a multispectral imager with a thermal sensor. MODIS on Terra and Aqua maps active fires worldwide every day. GOES weather satellites in geostationary orbit also watch for fires.'
  },
  {
    id: 'relay', code: 'LR', name: 'Lunar Relay', kind: 'COMMUNICATIONS', level: 'ENGINEER', pips: 3, color: '#C3CCE6', cls: 'std',
    target: 'moon', where: 'Orbit around the Moon', budget: 200, years: 5, sun: 1,
    goal: 'Relay radio signals from rovers on the far side of the Moon back to Earth.',
    instruments: ['uhfprox', 'sprox', 'kaprox', 'lunacam'], orbits: ['nrho', 'llo', 'l2'], launchers: ['medium', 'heavy'], grounds: ['com', 'dsn'],
    defaults: { sel: { bus: 'm', solar: 'wing', battery: 'b60', comms: 'x', cpu: 'rad', adcs: 'rw', prop: 'mono' }, inst: { sprox: true }, orbit: 'nrho', launcher: 'medium', ground: 'dsn' },
    reqs: [
      { kind: 'coverage', text: 'See the far-side landing zone 90% of each day', min: 0.9 },
      { kind: 'relayRate', text: 'Relay at least 50 Mb/s from the surface', min: 50 },
      { kind: 'data80', text: 'Forward at least 80% of rover data to Earth' },
      { kind: 'life', text: 'Operate for at least 5 years' },
      { kind: 'budget', text: 'Stay within budget' }
    ],
    sciRef: 60,
    twin: 'CAPSTONE (2022) was the first spacecraft to fly the near-rectilinear halo orbit planned for the lunar Gateway.'
  },
  {
    id: 'rock', code: 'AS', name: 'Asteroid Scout', kind: 'SMALL BODIES', level: 'ENGINEER', pips: 3, color: '#D9B98A', cls: 'std',
    target: 'asteroid', where: 'Deep space', budget: 220, years: 2, sun: 0.8,
    goal: 'Visit a near-Earth asteroid and measure its shape and what it is made of.',
    instruments: ['navcam', 'irspec', 'lalt', 'xrs'], orbits: ['flyby', 'rdv'], launchers: ['medium', 'heavy'], grounds: ['dsn'],
    defaults: { sel: { bus: 'm', solar: 'big', battery: 'b60', comms: 'x', cpu: 'rad', adcs: 'rw', prop: 'mono' }, inst: { navcam: true, irspec: true }, orbit: 'flyby', launcher: 'medium', ground: 'dsn' },
    reqs: [
      { kind: 'closeApproach', text: 'Get within 1,000 km of the asteroid', km: 1000 },
      { kind: 'imageRes', text: 'Image the surface at 2 m per pixel or sharper', m: 2 },
      { kind: 'composition', text: 'Measure what the surface is made of' },
      { kind: 'data80', text: 'Send home at least 80% of the data' },
      { kind: 'budget', text: 'Stay within budget' }
    ],
    sciRef: 100,
    twin: 'NEAR Shoemaker orbited and landed on asteroid Eros. OSIRIS-REx mapped asteroid Bennu and returned a sample to Earth.'
  },
  {
    id: 'mars', code: 'RP', name: 'Red Planet Weather', kind: 'PLANETARY SCIENCE', level: 'FLIGHT DIR.', pips: 4, color: '#FF6B3D', cls: 'std',
    target: 'mars', where: 'Mars orbit', budget: 260, years: 4, sun: 0.43,
    goal: 'Map Martian dust storms every day from orbit.',
    instruments: ['wxcam', 'sounder', 'hires', 'radar'], orbits: ['mlow', 'mell'], launchers: ['medium', 'heavy'], grounds: ['dsn'],
    defaults: { sel: { bus: 'l', solar: 'big', battery: 'b60', comms: 'x', cpu: 'rad', adcs: 'rw', prop: 'bi' }, inst: { wxcam: true, hires: true }, orbit: 'mlow', launcher: 'medium', ground: 'dsn' },
    reqs: [
      { kind: 'globalMap', text: 'Make one global weather map every day' },
      { kind: 'arrival', text: 'Arrive within 9 months of launch', months: 9 },
      { kind: 'data80', text: 'Send home at least 80% of the data' },
      { kind: 'life', text: 'Operate for at least 4 years' },
      { kind: 'budget', text: 'Stay within budget' }
    ],
    sciRef: 60,
    twin: 'Mars Reconnaissance Orbiter’s MARCI camera builds a daily global weather map of Mars.'
  }
];

export const MISSION_BY_ID = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));

// Ops-phase events. Each option lists how much each crew role likes it (AI votes) and whether it is the wise call.
export const EVENTS = {
  storm: {
    title: 'Solar storm incoming', owner: 'eng',
    text: 'A blast of charged particles from the Sun will hit in six hours.',
    lesson: 'Radiation-hardened computers are built to survive storms like this. Ordinary chips can flip bits and crash.',
    options: [
      { id: 'safe', label: 'Switch to safe mode', effect: 'Pause science for 3 days. No risk.', pref: { eng: 3, ops: 2, cmd: 2, sci: 0 } },
      { id: 'push', label: 'Keep observing', effect: 'Keep collecting. Commercial computers may crash.', pref: { sci: 3, cmd: 1, eng: 0, ops: 1 } }
    ]
  },
  mmod: {
    title: 'Micrometeoroid strike', owner: 'eng',
    text: 'A grain of space dust punched through a solar panel. Power output is down 20% for good.',
    lesson: 'Spacecraft carry spare power because panels age and get damaged. Margins save missions.',
    options: [
      { id: 'trim', label: 'Run instruments at 80%', effect: 'Less science, but the battery stays healthy.', pref: { eng: 3, ops: 2, cmd: 2, sci: 0 } },
      { id: 'push', label: 'Run everything at full power', effect: 'Full science, but the battery takes a beating.', pref: { sci: 3, cmd: 1, eng: 0, ops: 0 } }
    ]
  },
  outage: {
    title: 'Ground station outage', owner: 'ops',
    text: 'A storm knocked out your main ground antenna for five days.',
    lesson: 'Onboard storage holds data until someone on the ground can listen. Too little storage or too few stations means lost science.',
    options: [
      { id: 'buy', label: 'Rent backup antennas', effect: 'Costs money, no data lost.', pref: { sci: 3, ops: 2, cmd: 1, eng: 1 } },
      { id: 'wait', label: 'Wait it out', effect: 'Free, but data piles up onboard.', pref: { cmd: 2, eng: 2, ops: 1, sci: 0 } }
    ]
  },
  wheel: {
    title: 'Reaction wheel failure', owner: 'eng',
    text: 'One of your reaction wheels has stopped spinning. Pointing is getting wobbly.',
    lesson: 'The Kepler space telescope lost two reaction wheels. Engineers invented a clever new way to point it using sunlight pressure, and it kept discovering planets as the K2 mission.',
    needs: 'fine',
    options: [
      { id: 'patch', label: 'Write a software fix', effect: 'Costs money; pointing recovers in 10 days.', pref: { eng: 3, sci: 3, cmd: 1, ops: 1 } },
      { id: 'limp', label: 'Live with it', effect: 'Free, but sharp-image instruments lose half their science.', pref: { cmd: 2, ops: 2, eng: 0, sci: 0 } }
    ]
  },
  debris: {
    title: 'Debris on a collision course', owner: 'ops',
    text: 'Tracking says a piece of old rocket will pass very close in 30 hours.',
    lesson: 'Space debris is a real hazard. The International Space Station and many satellites regularly fire thrusters to dodge it.',
    dest: ['leo'],
    options: [
      { id: 'dodge', label: 'Fire thrusters to dodge', effect: 'Uses a little fuel. Needs an engine.', pref: { eng: 3, ops: 3, cmd: 2, sci: 1 }, needsProp: true },
      { id: 'hope', label: 'Hope it misses', effect: 'Small chance of losing the spacecraft.', pref: { sci: 1, cmd: 0, eng: 0, ops: 0 } }
    ]
  },
  opportunity: {
    title: 'Science opportunity', owner: 'sci',
    text: 'Something exciting is happening right now.',
    lesson: 'Flexible missions can chase surprises, if they have spare power, storage and downlink.',
    options: [
      { id: 'extra', label: 'Go for extra observations', effect: '20 days of 50% more data and science.', pref: { sci: 3, cmd: 2, ops: 1, eng: 1 } },
      { id: 'normal', label: 'Stick to the plan', effect: 'No change.', pref: { eng: 2, ops: 2, cmd: 1, sci: 0 } }
    ]
  },
  budget: {
    title: 'Budget cut', owner: 'cmd',
    text: 'The funding agency cut your operations budget.',
    lesson: 'Real missions face budget changes after launch. Reserves protect them.',
    options: [
      { id: 'absorb', label: 'Pay from reserves', effect: 'Spend 8% of the total budget.', pref: { sci: 3, eng: 1, cmd: 1, ops: 1 } },
      { id: 'cutground', label: 'Book fewer ground passes', effect: 'Free, but 40% less downlink for the rest of the mission.', pref: { cmd: 3, ops: 1, eng: 1, sci: 0 } }
    ]
  }
};

export const OPPORTUNITY_TEXT = {
  cube: 'A huge aurora is lighting up the sky over your region tonight!',
  fire: 'A record fire season has started. Firefighters are asking for more images.',
  relay: 'A rover just found signs of ice and wants to send home lots of data.',
  rock: 'You spotted a tiny moon orbiting the asteroid!',
  mars: 'A planet-wide dust storm is starting. Great weather science, but the skies are darkening and your panels will make less power.'
};

// Generated callsigns keep the leaderboard free of personal information.
export const CALLSIGN_WORDS = {
  a: ['Swift', 'Bright', 'Silent', 'Bold', 'Lunar', 'Solar', 'Cosmic', 'Polar', 'Rapid', 'Stellar', 'Nova', 'Orbital'],
  b: ['Falcon', 'Comet', 'Kestrel', 'Pulsar', 'Quasar', 'Nebula', 'Orbiter', 'Rover', 'Beacon', 'Vector', 'Photon', 'Meteor']
};
