export type ChapterId = 0 | 1 | 2 | 3 | 4 | 5;
export type MaterialId = 'copper' | 'iron' | 'salt';
export type DefectType = 'vacancy' | 'interstitial';

export const chapters = [
  {
    id: 0, name: 'Atomic lattices', short: 'The architecture of matter', figure: 'THE CRYSTAL LATTICE',
    heading: 'Order at', accent: 'every scale.',
    description: 'A crystal is a quiet choreography of atoms. Discover the patterns that shape our world.',
    action: 'Explore the lattice', caption: 'A repeating pattern. Extraordinary possibilities.',
    theme: '#b0d9bf',
    insight: 'A crystal is a lattice plus a basis. Translation by a lattice vector leaves the ideal structure unchanged — not every atom has to be the same.',
    equation: 'r = r₀ + n₁a₁ + n₂a₂ + n₃a₃',
    explanation: 'The conventional cubic cell is a convenient description, not the smallest repeating volume. A face-centered cubic (FCC) cell contains four lattice points; a body-centered cubic (BCC) cell contains two. Sodium chloride has an FCC Bravais lattice with a two-ion basis, so its conventional cell contains four lattice points, four NaCl formula units, and eight ions. The surrounding atoms continue the pattern.',
    model: 'Atoms are shown as spheres and nearest-neighbor connections as bonds. Sphere sizes and bond lines are visual guides, not literal electron-density surfaces or a claim that every connection is a covalent bond.',
    references: [
      ['OpenStax · Bonding in crystalline solids', 'https://openstax.org/books/university-physics-volume-3/pages/9-3-bonding-in-crystalline-solids'],
      ['Lattice constant · Copper · Wikipedia', 'https://en.wikipedia.org/wiki/Copper'],
      ['Lattice constant · Iron · Wikipedia', 'https://en.wikipedia.org/wiki/Iron'],
      ['Lattice constant · Sodium chloride · Wikipedia', 'https://en.wikipedia.org/wiki/Sodium_chloride'],
    ],
  },
  {
    id: 1, name: 'Band structures', short: 'The energy of an electron', figure: 'AN ELECTRON IN A PERIODIC POTENTIAL',
    heading: 'Energy,', accent: 'reimagined.',
    description: 'In a crystal, isolated energy levels become bands. The space between them changes everything.',
    action: 'Explore the bands', caption: 'Not every energy is available. Not every gap is a limit.',
    theme: '#beb7e0',
    insight: 'An electron in a periodic potential has a wavevector k. Its allowed energies form bands; the occupation of these states determines much of a solid’s behavior.',
    equation: 'E(k) = ε₀ − 2t cos(ka)',
    explanation: 'This is a one-dimensional, nearest-neighbor tight-binding band with one orbital and two spin states per site. For a spin-degenerate band, the occupancy n runs from 0 to 2 electrons per site. The Fermi wavevector is kF = πn / (2a). A partially occupied band can conduct.',
    model: 'The plot is an exact dispersion for this simplified 1D model, at zero temperature. The 3D wave overlay is a schematic of the Bloch phase. It is not a computed wavefunction or a realistic band structure for copper.',
    references: [['Tight-binding model · Wikipedia', 'https://en.wikipedia.org/wiki/Tight_binding']],
  },
  {
    id: 2, name: 'Conductivity', short: 'The art of moving charge', figure: 'CHARGE IN MOTION',
    heading: 'A current', accent: 'of possibility.',
    description: 'Electrons are always in motion. A small electric field gives that restless dance a direction.',
    action: 'Make a connection', caption: 'Random motion is not current. Drift makes the difference.',
    theme: '#d9c796',
    insight: 'Without a field, electrons move in many directions and the net current is zero. An electric field gives their average velocity a small drift — in the opposite direction to the field.',
    equation: 'J = ne²τE / mₑ  ·  vᵈ = −eτE / mₑ',
    explanation: 'The Drude model treats electrons as a classical gas interrupted by scattering. For the illustrative copper values used here, n ≈ 8.47 × 10²⁸ m⁻³ and τ = 25 fs at 300 K. It gives an order-of-magnitude conductivity, not a measured result. Real transport requires a quantum treatment and a material-specific scattering rate.',
    model: 'At a fixed field, the model assumes a constant scattering time. Particle motion is dramatically enlarged in time and space so drift is visible. Thermal motion is schematic. Current and drift values are calculated, not measurements; electron densities and scattering times are assumed.',
    references: [['Drude model · HyperPhysics', 'http://hyperphysics.phy-astr.gsu.edu/hbase/electric/ohmmic.html'], ['NIST · Fundamental physical constants', 'https://physics.nist.gov/cuu/Constants/']],
  },
  {
    id: 3, name: 'Magnetism', short: 'When moments align', figure: 'COLLECTIVE MAGNETIC ORDER',
    heading: 'Many moments.', accent: 'One direction.',
    description: 'A magnet is a collective decision. Beneath its surface, countless tiny moments learn to agree.',
    action: 'Follow the alignment', caption: 'Order is a conversation. Temperature interrupts it.',
    theme: '#d7b4a0',
    insight: 'Ferromagnetic order emerges from interactions between atomic magnetic moments. Above the Curie temperature, thermal disorder overwhelms the long-range order — not the individual moments.',
    equation: 'm = tanh(mT꜀ / T)  ·  T꜀ ≈ 1043 K (Fe)',
    explanation: 'The mean-field equation describes a spin-½ ferromagnet. Below its Curie point, a nonzero spontaneous magnetization is possible. We use a mean-field solution for illustrative iron, with the experimental Curie temperature supplied as an input. Iron is a real itinerant-electron magnet, so this model does not capture its microscopic details. The temperature control stays within the BCC α-Fe region, below the structural transition near 1185 K.',
    model: 'The arrows are representative magnetic moments, not classical needles inside iron atoms. Their arrangement illustrates mean-field order and thermal disorder; the displayed moment orientations are not a Monte Carlo simulation. The average magnetization is calculated from the mean-field equation.',
    references: [['Curie temperature · Britannica', 'https://www.britannica.com/science/Curie-point'], ['Magnetism · OpenStax', 'https://openstax.org/books/university-physics-volume-2/pages/11-1-magnetism-and-its-historical-discoveries']],
  },
  {
    id: 4, name: 'Crystal defects', short: 'The beauty of imperfection', figure: 'THE EXCEPTION TO THE PATTERN',
    heading: 'Perfectly', accent: 'imperfect.',
    description: 'An empty place. An unexpected visitor. The smallest imperfections can change a material completely.',
    action: 'Find the imperfection', caption: 'Nothing in nature is perfect. That is where it gets interesting.',
    theme: '#c6d3a6',
    insight: 'Defects are part of equilibrium matter, not simply mistakes. Vacancies and interstitial atoms influence diffusion, strength, conductivity, and many other properties.',
    equation: 'cᵥ ∝ exp(−Eᶠ / kᵦT)',
    explanation: 'A vacancy is an unoccupied lattice site; a self-interstitial is an extra atom in a space between ordinary sites. At thermal equilibrium, the vacancy concentration depends on formation energy and temperature. The exponential expression is an idealized dilute-limit estimate.',
    model: 'The defects you place are fixed visual examples. Neighboring atoms are shown slightly relaxed for clarity, but no interatomic forces or formation energies are calculated. The count is not an equilibrium concentration and does not model diffusion.',
    references: [['Crystallographic defect · Wikipedia', 'https://en.wikipedia.org/wiki/Crystallographic_defect']],
  },
  {
    id: 5, name: 'Superconductivity', short: 'Beyond resistance', figure: 'THE MEISSNER STATE',
    heading: 'Zero resistance.', accent: 'More possibility.',
    description: 'Cool a material far enough and something extraordinary happens. Resistance vanishes. Magnetic fields retreat.',
    action: 'Cross the threshold', caption: 'A macroscopic quantum state. A different kind of order.',
    theme: '#a7d7da',
    insight: 'In a conventional superconductor, electrons form Cooper pairs and a coherent quantum state opens an energy gap. An ideal Type-I superconductor expels magnetic flux below its critical field.',
    equation: 'B꜀(T) ≈ B꜀(0)[1 − (T/T꜀)²]',
    explanation: 'Lead is a Type-I conventional superconductor with Tc ≈ 7.19 K and Bc(0) ≈ 80 mT. Below the temperature-dependent critical field, the bulk Meissner state expels flux, apart from a thin surface layer. At zero applied field, simply cooling below Tc produces superconductivity — not automatic flux expulsion from an initially zero field.',
    model: 'The phase boundary is a two-parameter thermodynamic approximation. The magnetic-field lines and paired-particle trails are illustrative. This is not a microscopic BCS or London-equation solver. The model does not include intermediate or mixed states, and it assumes an ideal equilibrium sample.',
    references: [['BCS theory · Nobel Prize', 'https://www.nobelprize.org/prizes/physics/1972/summary/'], ['Superconductivity · OpenStax', 'https://openstax.org/books/university-physics-volume-3/pages/9-8-superconductivity']],
  },
] as const;

export const materials = {
  copper: { symbol: 'Cu', name: 'Copper', number: 29, structure: 'Face-centered cubic', abbreviation: 'FCC', spacing: 361.5, color: '#b2cdb4' },
  iron: { symbol: 'Fe', name: 'Iron', number: 26, structure: 'Body-centered cubic', abbreviation: 'BCC', spacing: 286.65, color: '#acbfc8' },
  salt: { symbol: 'NaCl', name: 'Sodium chloride', number: 11, structure: 'Rock-salt structure', abbreviation: 'ROCKSALT', spacing: 564.0, color: '#d0cbb5' },
} as const;

export function magnetization(temperature: number) {
  if (temperature >= 1043) return 0;
  if (temperature <= 0) return 1;
  const ratio = 1043 / temperature;
  let low = 0, high = 1;
  for (let i = 0; i < 40; i++) {
    const middle = (low + high) / 2;
    if (Math.tanh(middle * ratio) < middle) high = middle;
    else low = middle;
  }
  return (low + high) / 2;
}

export const PHYSICS = { e: 1.602176634e-19, mass: 9.1093837139e-31, copperDensity: 8.47e28 };
export function drude(field: number, tau: number) {
  const { e, mass, copperDensity } = PHYSICS;
  const conductivity = copperDensity * e * e * (tau * 1e-15) / mass;
  return { conductivity, resistivity: 1 / conductivity, current: conductivity * field, drift: e * (tau * 1e-15) * field / mass };
}
export function criticalField(temperature: number) {
  return Math.max(0, 0.08 * (1 - Math.pow(Math.min(temperature / 7.19, 1), 2)));
}
export function pairedGap(temperature: number) {
  if (temperature >= 7.19) return 0;
  return Math.tanh(1.74 * Math.sqrt(7.19 / Math.max(temperature, 0.001) - 1));
}
export function formatLatticeParameter(value: number) {
  return value.toFixed(Number.isInteger(value * 10) ? 1 : 2);
}

export function formatScientific(value: number, digits = 2) {
  if (value === 0) return '0';
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  const superscripts: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  return `${(value / Math.pow(10, exponent)).toFixed(digits)} × 10${String(exponent).split('').map(n => superscripts[n] || n).join('')}`;
}
