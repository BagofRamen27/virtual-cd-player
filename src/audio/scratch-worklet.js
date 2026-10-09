/* global sampleRate, registerProcessor, AudioWorkletProcessor */
/**
 * DiscDeck scratch processor.
 *
 * Plays a decoded track from memory and applies scheduled damage events
 * (clicks, dropouts, stutters, repeats, skips). Every discontinuity goes through a short
 * gain ramp so glitches never produce hard clicks or loud transients.
 *
 * Messages in:  load {channels}, events {events:[{type,start,len,count}] in frames},
 *               play, pause, seek {frame}, unload
 * Messages out: pos {frame}, ended, glitch {kind}
 */
class ScratchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.channels = [];
    this.length = 0;
    this.pos = 0;
    this.running = false; // advancing the playhead
    this.wantPlay = false;
    this.env = 0; // transport envelope (pause/resume/jumps)
    this.glitch = 1; // damage envelope
    this.events = [];
    this.next = 0;
    this.pendingJump = null;
    this.muteUntil = -1;
    this.muteKind = null;
    this.loopStart = 0;
    this.loopEnd = 0;
    this.loopsLeft = 0;
    this.reportEvery = Math.round(sampleRate * 0.05);
    this.sinceReport = 0;
    this.envStep = 1 / (sampleRate * 0.004);
    this.fastStep = 1 / (sampleRate * 0.003);
    this.recoverStep = 1 / (sampleRate * 0.045);
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  onMessage(msg) {
    switch (msg.type) {
      case 'load':
        this.channels = msg.channels;
        this.length = msg.channels.length ? msg.channels[0].length : 0;
        this.pos = 0;
        this.env = 0;
        this.running = false;
        this.wantPlay = false;
        this.pendingJump = null;
        this.loopsLeft = 0;
        this.muteUntil = -1;
        this.next = this.lowerBound(0);
        break;
      case 'events':
        this.events = msg.events;
        this.next = this.lowerBound(this.pos);
        break;
      case 'play':
        if (!this.length) return;
        if (this.pos >= this.length) this.pos = 0;
        this.wantPlay = true;
        this.running = true;
        break;
      case 'pause':
        this.wantPlay = false;
        break;
      case 'seek': {
        const frame = Math.max(0, Math.min(this.length - 1, Math.floor(msg.frame)));
        this.loopsLeft = 0;
        this.muteUntil = -1;
        if (this.running && this.env > 0) {
          this.pendingJump = { frame, reset: true };
        } else {
          this.pos = frame;
          this.next = this.lowerBound(frame);
        }
        this.port.postMessage({ type: 'pos', frame: frame });
        break;
      }
      case 'unload':
        this.channels = [];
        this.length = 0;
        this.running = false;
        this.wantPlay = false;
        this.events = [];
        break;
    }
  }

  lowerBound(frame) {
    let lo = 0;
    let hi = this.events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.events[mid].start < frame) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  trigger(ev) {
    switch (ev.type) {
      case 'click':
      case 'dropout':
        this.muteUntil = this.pos + ev.len;
        this.muteKind = ev.type;
        break;
      case 'stutter':
      case 'repeat':
        this.loopStart = this.pos;
        this.loopEnd = this.pos + ev.len;
        this.loopsLeft = ev.count;
        break;
      case 'skip':
        this.pendingJump = { frame: Math.min(this.length - 1, this.pos + ev.len), reset: true };
        break;
    }
    this.port.postMessage({ type: 'glitch', kind: ev.type });
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const frames = out[0].length;
    const nOut = out.length;
    const nIn = this.channels.length;

    for (let k = 0; k < frames; k++) {
      if (!this.running || !nIn) {
        for (let c = 0; c < nOut; c++) out[c][k] = 0;
        continue;
      }

      // Transport envelope: fade out for pauses and jumps, fade in otherwise.
      const envTarget = this.wantPlay && this.pendingJump === null ? 1 : 0;
      if (this.env < envTarget) this.env = Math.min(envTarget, this.env + this.envStep);
      else if (this.env > envTarget) this.env = Math.max(envTarget, this.env - this.envStep);

      if (this.env <= 0) {
        if (this.pendingJump !== null) {
          this.pos = this.pendingJump.frame;
          if (this.pendingJump.reset) this.next = this.lowerBound(this.pos);
          this.pendingJump = null;
        } else if (!this.wantPlay) {
          this.running = false;
          this.port.postMessage({ type: 'pos', frame: this.pos });
          for (let c = 0; c < nOut; c++) out[c][k] = 0;
          continue;
        }
      }

      while (this.next < this.events.length && this.events[this.next].start <= this.pos) {
        this.trigger(this.events[this.next]);
        this.next++;
      }

      if (this.loopsLeft > 0 && this.pos >= this.loopEnd && this.pendingJump === null) {
        this.loopsLeft--;
        this.pendingJump = { frame: this.loopStart, reset: false };
      }

      // Damage envelope: fast dips for clicks, slow "tracking recovery" after dropouts.
      if (this.pos < this.muteUntil) {
        this.glitch = Math.max(0, this.glitch - this.fastStep);
      } else if (this.glitch < 1) {
        this.glitch = Math.min(1, this.glitch + (this.muteKind === 'dropout' ? this.recoverStep : this.fastStep));
      }

      const i = this.pos | 0;
      if (i >= this.length) {
        this.running = false;
        this.wantPlay = false;
        this.env = 0;
        this.port.postMessage({ type: 'ended' });
        for (let c = 0; c < nOut; c++) out[c][k] = 0;
        continue;
      }

      const g = this.env * this.glitch;
      for (let c = 0; c < nOut; c++) out[c][k] = this.channels[c % nIn][i] * g;
      this.pos++;
    }

    this.sinceReport += frames;
    if (this.sinceReport >= this.reportEvery && this.running) {
      this.sinceReport = 0;
      this.port.postMessage({ type: 'pos', frame: this.pos });
    }
    return true;
  }
}

registerProcessor('discdeck-scratch', ScratchProcessor);
