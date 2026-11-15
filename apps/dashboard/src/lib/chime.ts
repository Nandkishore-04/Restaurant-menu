let ctx: AudioContext | null = null;

/** Must first be called from a user gesture (browsers block autoplay audio). */
export function unlockAudio() {
  ctx ??= new AudioContext();
  void ctx.resume();
}

/** Short two-tone "new order" chime. */
export function playChime() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const [i, freq] of [880, 1320].entries()) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t + i * 0.18);
    gain.gain.exponentialRampToValueAtTime(0.3, t + i * 0.18 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t + i * 0.18);
    osc.stop(t + i * 0.18 + 0.4);
  }
}
