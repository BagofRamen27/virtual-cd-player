import type { AmpDevice, AmpState, Device, OutputDevice, OutputProfile, SourceDevice } from './types';

/*
 * HardwareCatalog — Phase 1.
 *
 * Every device here is an original, fictional design "inspired by" a product category.
 * None of the sound profiles are measurements of a real product: they are illustrative
 * ("creative") approximations of category traits, and are labelled as such in the UI.
 */

export const SOURCES: SourceDevice[] = [
  {
    id: 'dd1',
    slot: 'source',
    era: 'modern',
    tier: 'midrange',
    category: 'portable',
    visualModel: 'dd1',
    displayName: 'DiscDeck DD-1',
    manufacturerInspiration: 'Modern square portable CD players with a transparent lid',
    description: 'The portable you already know. Fixed-level 3.5 mm line out for a hi-fi, plus a volume-controlled headphone jack.',
    ports: [
      { id: 'line-out', label: 'Line out', connector: 'trs35', direction: 'out', level: 'line', channels: 'stereo' },
      { id: 'phones', label: 'Phones', connector: 'trs35', direction: 'out', level: 'headphone', channels: 'stereo' },
    ],
    phonesMuteBuiltIns: true,
    hasVolumeKnob: true,
  },
  {
    id: 'boombox-2003',
    slot: 'source',
    era: '2000s',
    tier: 'entry',
    category: 'boombox',
    visualModel: 'boombox',
    displayName: 'Sundown CD Boombox',
    manufacturerInspiration: 'Early-2000s top-loading CD boomboxes',
    description: 'Top-loading CD boombox with two built-in 3" drivers and a headphone jack that mutes the speakers.',
    ports: [{ id: 'phones', label: 'Phones', connector: 'trs35', direction: 'out', level: 'headphone', channels: 'stereo' }],
    builtInSpeakerProfileId: 'boombox-builtin',
    phonesMuteBuiltIns: true,
    hasVolumeKnob: true,
  },
];

export const AMPS: AmpDevice[] = [
  {
    id: 'amp-1986',
    slot: 'amp',
    era: '1980s',
    tier: 'midrange',
    category: 'integrated',
    displayName: 'Ashford A-60 Integrated',
    manufacturerInspiration: 'Mid-1980s silver-faced Japanese integrated amplifiers',
    description: 'Silver faceplate, big volume knob, bass/treble/balance, loudness, CD and AUX inputs, speaker A switch and a 6.35 mm headphone jack that mutes the speakers.',
    ports: [
      { id: 'in-cd', label: 'CD in', connector: 'rca', direction: 'in', level: 'line', channels: 'stereo', inputName: 'CD' },
      { id: 'in-aux', label: 'AUX in', connector: 'rca', direction: 'in', level: 'line', channels: 'stereo', inputName: 'AUX' },
      { id: 'spk-a', label: 'Speakers A', connector: 'speaker', direction: 'out', level: 'speaker', channels: 'stereo' },
      { id: 'phones', label: 'Phones', connector: 'trs635', direction: 'out', level: 'headphone', channels: 'stereo' },
    ],
    inputs: ['CD', 'AUX'],
    phonesMuteSpeakers: true,
    bassHz: 120,
    trebleHz: 7000,
  },
];

export const SPEAKERS: OutputDevice[] = [
  {
    id: 'bookshelf-premium',
    slot: 'speakers',
    era: '2010s',
    tier: 'premium',
    displayName: 'Walnut Monitor B2',
    manufacturerInspiration: 'Premium two-way bookshelf speakers',
    description: 'Two-way bookshelf pair, 6.5" woofer and soft-dome tweeter in a walnut cabinet.',
    ports: [{ id: 'terminals', label: 'Terminals', connector: 'speaker', direction: 'in', level: 'speaker', channels: 'stereo' }],
    profileId: 'bookshelf-premium',
  },
  {
    id: 'mini-cheap',
    slot: 'speakers',
    era: '2000s',
    tier: 'entry',
    displayName: 'Budget Mini Speakers',
    manufacturerInspiration: 'Small speakers bundled with cheap mini systems',
    description: 'Small plastic-cabinet pair with a single full-range driver each.',
    ports: [{ id: 'terminals', label: 'Terminals', connector: 'speaker', direction: 'in', level: 'speaker', channels: 'stereo' }],
    profileId: 'mini-cheap',
  },
];

export const HEADPHONES: OutputDevice[] = [
  {
    id: 'studio-closed',
    slot: 'headphones',
    era: '1990s',
    tier: 'midrange',
    displayName: 'Studio Monitor Headphones',
    manufacturerInspiration: 'Closed-back studio monitoring headphones',
    description: 'Closed-back, fairly neutral monitoring headphones with a 3.5 mm plug and screw-on 6.35 mm adapter.',
    ports: [{ id: 'plug', label: 'Plug', connector: 'trs35', direction: 'in', level: 'headphone', channels: 'stereo' }],
    profileId: 'studio-closed',
  },
  {
    id: 'earbuds-cheap',
    slot: 'headphones',
    era: '2000s',
    tier: 'entry',
    displayName: 'Bundled Earbuds',
    manufacturerInspiration: 'Cheap earbuds that came in the box',
    description: 'Thin, bright, bass-light earbuds — loud for their size and a little uneven between sides.',
    ports: [{ id: 'plug', label: 'Plug', connector: 'trs35', direction: 'in', level: 'headphone', channels: 'stereo' }],
    profileId: 'earbuds-cheap',
  },
];

const CREATIVE = (notes: string) => ({ grade: 'creative' as const, notes });

export const PROFILES: Record<string, OutputProfile> = {
  'bookshelf-premium': {
    id: 'bookshelf-premium',
    kind: 'speaker',
    displayName: 'Premium bookshelf',
    filters: [
      { type: 'highpass', freq: 45, q: 0.71 },
      { type: 'peaking', freq: 90, q: 1.1, gain: 1.5 },
      { type: 'peaking', freq: 2800, q: 1.4, gain: -1 },
      { type: 'highshelf', freq: 12000, gain: -0.5 },
    ],
    distortion: 0.03,
    stereoWidth: 1,
    channelMismatchDb: 0.1,
    sensitivityDb: 0,
    isolation: 'Best on stands, away from the back wall.',
    traits: ['Extended, tidy bass down to ~45 Hz', 'Very slight presence dip', 'Clean at high levels'],
    evidence: CREATIVE('Illustrative profile for a well-designed two-way bookshelf speaker. Not measured.'),
  },
  'mini-cheap': {
    id: 'mini-cheap',
    kind: 'speaker',
    displayName: 'Budget mini speakers',
    filters: [
      { type: 'highpass', freq: 120, q: 1.1 },
      { type: 'peaking', freq: 190, q: 1.4, gain: 4 },
      { type: 'peaking', freq: 3200, q: 2, gain: 3 },
      { type: 'lowpass', freq: 9500, q: 0.8 },
    ],
    distortion: 0.25,
    stereoWidth: 0.85,
    channelMismatchDb: 0.6,
    sensitivityDb: 1,
    isolation: 'Small cabinets: little real bass, boxy upper bass.',
    traits: ['Bass rolls off below ~120 Hz', 'Boxy hump around 190 Hz', 'Honky upper mids', 'Dull top end', 'Compresses when pushed'],
    evidence: CREATIVE('Illustrative category traits of small full-range plastic speakers. Not measured.'),
  },
  'boombox-builtin': {
    id: 'boombox-builtin',
    kind: 'builtin',
    displayName: 'Boombox built-in speakers',
    filters: [
      { type: 'highpass', freq: 150, q: 1.2 },
      { type: 'peaking', freq: 230, q: 1.5, gain: 5 },
      { type: 'peaking', freq: 1600, q: 1.2, gain: 2 },
      { type: 'lowpass', freq: 7500, q: 0.9 },
    ],
    distortion: 0.6,
    stereoWidth: 0.45,
    channelMismatchDb: 0.3,
    sensitivityDb: 0,
    isolation: 'Drivers sit inches apart: narrow stereo image.',
    traits: ['Enclosure resonance around 230 Hz', 'No deep bass', 'Narrow stereo', 'Squashes and distorts at high volume'],
    evidence: CREATIVE('Illustrative boombox enclosure behaviour. Not measured.'),
  },
  'studio-closed': {
    id: 'studio-closed',
    kind: 'headphone',
    displayName: 'Studio monitor headphones',
    filters: [
      { type: 'highpass', freq: 18, q: 0.71 },
      { type: 'peaking', freq: 120, q: 0.9, gain: 1 },
      { type: 'peaking', freq: 6500, q: 3, gain: 2.5 },
    ],
    distortion: 0.02,
    stereoWidth: 1,
    channelMismatchDb: 0.1,
    sensitivityDb: 0,
    isolation: 'Closed-back: good isolation, little leakage.',
    traits: ['Close to neutral', 'Small treble peak around 6.5 kHz', 'Full bass extension'],
    evidence: CREATIVE('Illustrative closed-back monitoring headphone. Not measured.'),
  },
  'earbuds-cheap': {
    id: 'earbuds-cheap',
    kind: 'headphone',
    displayName: 'Bundled earbuds',
    filters: [
      { type: 'highpass', freq: 170, q: 0.9 },
      { type: 'peaking', freq: 2600, q: 1.2, gain: 5 },
      { type: 'highshelf', freq: 8000, gain: -6 },
      { type: 'lowpass', freq: 13000, q: 0.7 },
    ],
    distortion: 0.12,
    stereoWidth: 1,
    channelMismatchDb: 1.2,
    sensitivityDb: 4,
    isolation: 'Open earbuds: almost no isolation, leak to people nearby.',
    traits: ['Thin bass without a seal', 'Shouty 2–3 kHz', 'Rolled-off air', 'Right side ~1 dB quieter'],
    evidence: CREATIVE('Illustrative cheap-earbud traits. Not measured.'),
  },
};

export const ALL_DEVICES: Device[] = [...SOURCES, ...AMPS, ...SPEAKERS, ...HEADPHONES];

export function deviceById(id: string | null | undefined): Device | undefined {
  return id ? ALL_DEVICES.find((d) => d.id === id) : undefined;
}

export function defaultAmpState(amp: AmpDevice): AmpState {
  return { power: false, volume: 0.4, bass: 0, treble: 0, balance: 0, loudness: false, input: amp.inputs[0], speakersA: true };
}
