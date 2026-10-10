import type { AmpDevice, OutputDevice, OutputProfile, SourceDevice } from './types';

const yamaha70 = 'https://hub.yamaha.com/audio/a-history/cult-classics-part-1-vintage-yamaha-gear-of-the-1970s/';
const yamaha80 = 'https://hub.yamaha.com/audio/a-history/part-2-vintage-yamaha-gear-of-the-1980s/';
const lineOut = [{ id: 'line-out', label: 'RCA line out', connector: 'rca', direction: 'out', level: 'line', channels: 'stereo' }] as const;

export const VINTAGE_SOURCES: SourceDevice[] = [
  { id: 'sony-cdp101', slot: 'source', era: '1980s', tier: 'premium', category: 'deck', visualModel: 'deck', displayName: 'Sony CDP-101 · 1982', manufacturerInspiration: 'Sony CDP-101', description: 'Early front-loading CD deck with a black faceplate and green display. Simplified interactive recreation.', referenceUrl: 'https://www.sony.com/ja/pressroom/pict_data/h_audio/1982.html', ports: [...lineOut], phonesMuteBuiltIns: false, hasVolumeKnob: false },
  { id: 'philips-cd100', slot: 'source', era: '1980s', tier: 'premium', category: 'deck', visualModel: 'deck', displayName: 'Philips CD100 · 1983', manufacturerInspiration: 'Philips CD100', description: 'Compact silver top-loading CD deck from the first European CD generation. Simplified interactive recreation.', referenceUrl: 'https://www.philips.com/a-w/about/news/media-library/20190101-Philips-Compact-Disc-player-1982-1983.html', ports: [...lineOut], phonesMuteBuiltIns: false, hasVolumeKnob: false },
  { id: 'yamaha-cd1', slot: 'source', era: '1980s', tier: 'premium', category: 'deck', visualModel: 'deck', displayName: 'Yamaha CD-1 · 1982', manufacturerInspiration: 'Yamaha CD-1', description: 'Substantial first-generation CD deck, with a sliding transport and pickup-position display. Simplified interactive recreation.', referenceUrl: yamaha80, ports: [...lineOut], phonesMuteBuiltIns: false, hasVolumeKnob: false },
];

function amp(id: string, name: string, era: AmpDevice['era'], category: AmpDevice['category'], description: string, referenceUrl: string): AmpDevice {
  return { id, slot: 'amp', displayName: name, era, category, tier: 'premium', manufacturerInspiration: name, description: `${description} Simplified line-input, tone and speaker controls; tuner and phono playback are not simulated.`, referenceUrl,
    ports: [
      { id: 'in-cd', label: 'AUX in', connector: 'rca', direction: 'in', level: 'line', channels: 'stereo', inputName: 'AUX' },
      { id: 'in-aux', label: 'Tape in', connector: 'rca', direction: 'in', level: 'line', channels: 'stereo', inputName: 'TAPE' },
      { id: 'spk-a', label: 'Speakers A', connector: 'speaker', direction: 'out', level: 'speaker', channels: 'stereo' },
      { id: 'phones', label: 'Phones', connector: 'trs635', direction: 'out', level: 'headphone', channels: 'stereo' },
    ], inputs: ['AUX', 'TAPE'], phonesMuteSpeakers: true, bassHz: 100, trebleHz: 10000 };
}
export const VINTAGE_AMPS: AmpDevice[] = [
  amp('marantz-2270', 'Marantz 2270', '1970s', 'receiver', 'Champagne face, blue tuning dial and walnut case from the 22-series receiver era.', 'https://www.marantz.com/world-of-marantz/timeline.html'),
  amp('yamaha-ca1000', 'Yamaha CA-1000 · 1973', '1970s', 'integrated', 'Silver integrated amplifier with a restrained layout and wood case.', yamaha70),
  amp('yamaha-cr2020', 'Yamaha CR-2020 · 1977', '1970s', 'receiver', 'Large silver receiver with an analog tuning scale and meters.', yamaha70),
  amp('yamaha-r9', 'Yamaha R-9 · 1986', '1980s', 'receiver', 'Black digital-era receiver with an illuminated frequency display.', yamaha80),
];

const speaker = (id: string, name: string, era: OutputDevice['era'], description: string, referenceUrl: string): OutputDevice => ({ id, slot: 'speakers', era, tier: 'premium', displayName: name, manufacturerInspiration: name, description, referenceUrl, ports: [{ id: 'terminals', label: 'Terminals', connector: 'speaker', direction: 'in', level: 'speaker', channels: 'stereo' }], profileId: id });
export const VINTAGE_SPEAKERS: OutputDevice[] = [
  speaker('jbl-l100', 'JBL L100 · 1970', '1970s', 'Walnut three-way cabinet with the recognizable orange grille. Illustrative sound profile.', 'https://www.jbl.com/news-and-reviews/jbl-introduces-l82-classic-bookshelf-loudspeakers-at-ces-2020.html'),
  speaker('yamaha-ns1000m', 'Yamaha NS-1000M · 1974', '1970s', 'Black three-way monitor with separate midrange and tweeter. Illustrative sound profile.', 'https://www.yamaha.com/en/about/experience/innovation-road/collection/detail/7004/'),
  speaker('yamaha-ns10m', 'Yamaha NS-10M Studio · 1987', '1980s', 'Compact black monitor with a white woofer. Illustrative sound profile.', 'https://usa.yamaha.com/products/contents/proaudio/hs_series_story/index.html'),
];
const evidence = { grade: 'creative' as const, notes: 'Illustrative listening character for comparison, not measured response or an exact sonic reproduction of the real model.' };
export const VINTAGE_PROFILES: Record<string, OutputProfile> = {
  'jbl-l100': { id: 'jbl-l100', kind: 'speaker', displayName: 'JBL L100 simulation', filters: [{ type: 'highpass', freq: 45, q: 0 }, { type: 'lowshelf', freq: 160, gain: 4 }, { type: 'peaking', freq: 1800, q: 0.8, gain: 3 }, { type: 'highshelf', freq: 7500, gain: -2 }], distortion: 0.08, stereoWidth: 0.95, channelMismatchDb: 0, sensitivityDb: 0, traits: ['Full bass', 'Forward midrange', 'Softened upper treble'], evidence },
  'yamaha-ns1000m': { id: 'yamaha-ns1000m', kind: 'speaker', displayName: 'Yamaha NS-1000M simulation', filters: [{ type: 'highpass', freq: 40, q: 0 }, { type: 'peaking', freq: 250, q: 0.8, gain: -1 }, { type: 'highshelf', freq: 4000, gain: 2 }], distortion: 0.02, stereoWidth: 1, channelMismatchDb: 0, sensitivityDb: 0, traits: ['Extended bass', 'Clear mids', 'Open treble'], evidence },
  'yamaha-ns10m': { id: 'yamaha-ns10m', kind: 'speaker', displayName: 'Yamaha NS-10M simulation', filters: [{ type: 'highpass', freq: 80, q: 0 }, { type: 'peaking', freq: 1800, q: 0.7, gain: 5 }, { type: 'highshelf', freq: 8500, gain: -2 }], distortion: 0.04, stereoWidth: 0.95, channelMismatchDb: 0, sensitivityDb: 0, traits: ['Limited deep bass', 'Prominent mids', 'Compact monitor character'], evidence },
};
