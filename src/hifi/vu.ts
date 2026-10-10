/** Display-only auto ranging and needle ballistics. Never changes audio gain. */
export class VuDisplay {
  private envelopeDb = -48;
  private levels = [-60, -60];

  update(leftRms: number, rightRms: number, elapsed: number) {
    const dt = Math.max(0, Math.min(0.1, elapsed));
    const db = (rms: number) => 20 * Math.log10(Math.max(1e-9, rms));
    const loudest = Math.max(db(leftRms), db(rightRms));
    // A slow common reference preserves stereo differences and musical transients.
    if (loudest > -90) {
      this.envelopeDb += (loudest - this.envelopeDb) * (1 - Math.exp(-dt / (loudest > this.envelopeDb ? 0.6 : 4)));
    }
    const referenceDb = Math.max(-54, Math.min(-18, this.envelopeDb + 6));
    [leftRms, rightRms].forEach((rms, i) => {
      const target = rms > 1e-6 ? Math.max(-60, db(rms) - referenceDb) : -60;
      this.levels[i] += (target - this.levels[i]) * (1 - Math.exp(-dt / (target > this.levels[i] ? 0.08 : 0.22)));
    });
    return { vuL: this.levels[0], vuR: this.levels[1], vuReferenceDb: referenceDb };
  }
}
