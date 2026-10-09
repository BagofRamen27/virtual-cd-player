import { usePlayer } from '../../state/store';
import { Button, Icon } from '../../components/ui';
import { currentAmpState, currentRoute, rackOf, useHifi } from '../store';

/** First-system wiring guide. Steps tick off from real state, not from button presses. */
export function Tutorial() {
  const h = useHifi();
  const disc = usePlayer((s) => !!s.insertedAlbumId);
  const playing = usePlayer((s) => s.state === 'PLAYING');
  if (h.tutorialDone) return null;
  const rack = rackOf(h.rackIds);
  const amp = currentAmpState(h);
  const route = currentRoute(h);
  const boombox = !!rack.source?.builtInSpeakerProfileId;
  const toAmp = h.connections.find((c) => c.from.slot === 'source' && c.to.slot === 'amp');
  const ampOut = h.connections.some((c) => c.from.slot === 'amp');
  const inputMatches = !!toAmp && rack.amp?.ports.find((p) => p.id === toAmp.to.port)?.inputName === amp?.input;

  const steps = boombox
    ? [
        { done: disc, text: 'Insert a disc (shelf in the Player view, or the disc menu below)' },
        { done: playing, text: 'Press play on the boombox — it uses its own speakers' },
      ]
    : [
        { done: disc, text: 'Insert a disc' },
        { done: !!toAmp, text: 'Cable: CD player Line out → amp CD or AUX input' },
        { done: ampOut, text: 'Speaker wire: amp Speakers A → speakers (or headphones → Phones)' },
        { done: !!amp?.power, text: 'Press the amplifier’s power button' },
        { done: inputMatches, text: 'Turn the input selector to the input you used' },
        { done: playing && route.output.kind !== 'silent', text: 'Press play and turn the volume knob' },
      ];

  return (
    <section aria-labelledby="tut-h" className="rounded-2xl border border-accent/25 bg-gradient-to-b from-accent/10 to-surface/70 p-4 shadow-[0_12px_28px_-24px_rgba(183,123,86,0.8)]">
      <div className="flex items-start justify-between gap-3">
        <h3 id="tut-h" className="font-display text-base">
          Wire your first system
        </h3>
        <button type="button" onClick={() => h.setLab({ tutorialDone: true })} className="text-[11px] text-muted hover:text-ink">
          Hide
        </button>
      </div>
      <ol className="mt-2 space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className={`flex items-start gap-2 text-xs ${s.done ? 'text-muted line-through' : 'text-ink-soft'}`}>
            <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] ${s.done ? 'bg-accent text-ivory' : 'border border-line'}`}>
              {s.done ? '✓' : i + 1}
            </span>
            {s.text}
          </li>
        ))}
      </ol>
      {!boombox && (
        <Button size="sm" className="mt-3" onClick={h.autoConnect}>
          <Icon name="sparkle" size={14} /> Auto-connect for me
        </Button>
      )}
    </section>
  );
}
