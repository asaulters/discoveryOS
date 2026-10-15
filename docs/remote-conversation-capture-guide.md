# Remote Conversation Capture Guide (Sprint 32)

## 1. Purpose

This guide helps you run DiscoveryOS during a **remote** discovery
conversation - a call where you and the stakeholder are not in the same
room. The browser microphone Live Capture uses (Sprint 11/13) hears
whatever's physically near your laptop's mic. On an in-person call
that's the whole conversation. On a remote call, the stakeholder's voice
usually comes out of your speakers or headphones, not your mic - so
Live Capture may hear you clearly and miss them almost entirely unless
you deliberately route or capture that audio.

This guide is practical setup help, not a promise. It compares your real
options, gives you a pre-call test to run, and gives you a way to record
how capture actually went so you (and future field tests) learn from it.

## 2. Capture setup options

### A. BlackHole / virtual audio routing

- Best for cleaner remote-participant capture.
- More setup complexity than the other options.
- Good for a same-Mac remote call (you're on the call and running
  DiscoveryOS on the same machine).
- May capture remote audio more clearly than pointing a mic at a
  speaker.
- May **not** capture your own voice unless you also set up an
  aggregate/mixer device.
- Requires a pre-call test - don't try this for the first time during a
  real conversation.

### B. Two laptops + external mic near the meeting speaker

- Best simple fallback.
- The meeting itself runs on Laptop A; DiscoveryOS runs on Laptop B.
- Plug an external mic into the DiscoveryOS laptop (Laptop B) and place
  it near Laptop A's speaker.
- Keeps the HUD visible on Laptop B while the mic is aimed at the
  remote audio coming out of Laptop A.
- Less clean than audio routing, but much easier to understand and set
  up under time pressure.

### C. Two laptops + built-in mic

- Usable, but less reliable than an external mic.
- Position the DiscoveryOS laptop's built-in mic closer to the meeting
  laptop's speaker than to your own mouth.

### D. Same laptop + speakers + browser mic

- Usable, but can sound echoey and pick up your own voice more loudly
  than the remote participant's.
- Avoid wearing headphones in this setup - if the remote audio never
  leaves your headphones, the mic never hears it either.

### E. Same laptop + headphones + browser mic only

- **Not recommended.** With headphones on, remote audio goes straight to
  your ears and DiscoveryOS's mic likely won't hear the other person at
  all. Use one of the options above instead, or fall back to manual
  notes.

## 3. Recommended setup for next week

- Try BlackHole first if there's time to test it beforehand (option A).
- Have the external-mic fallback (option B) ready regardless - it's the
  one most likely to just work under time pressure.
- Use **mixed capture mode** (live capture running in the background,
  manual notes for anything critical) rather than betting everything on
  one channel.
- Add only tiny manual notes for genuinely critical claims - not a
  running transcript of your own. See Part F's Quick anchor note.

## 4. Pre-call audio test checklist

Run this **before** the real call, not during it:

1. Start your meeting/audio source (or a recording of remote-style
   speech).
2. Start DiscoveryOS Live Capture.
3. Play remote-style audio for 30-60 seconds.
4. Speak one facilitator sentence yourself.
5. Check whether the transcript captured the remote voice.
6. Check whether your own voice dominates the transcript instead.
7. Check whether the transcription is actually usable (not garbled,
   not silent).
8. Check whether Suggested directions update in response to what was
   said.
9. Decide your capture mode for the real call based on what you saw.

If any step fails, that's exactly what this test is for - fix it now,
not mid-conversation.

## 5. BlackHole quick setup notes

Kept practical, not exhaustive - see BlackHole's own documentation for
full detail:

1. Install BlackHole 2ch.
2. In Audio MIDI Setup, create a Multi-Output Device combining your
   normal output device and BlackHole.
3. Set your system output to that Multi-Output Device.
4. Set the browser/DiscoveryOS microphone input to BlackHole.
5. Keep your actual meeting app's mic as your normal mic/headset (so the
   other participant still hears you normally).
6. Test whether DiscoveryOS actually hears the remote audio (see Part 4).
7. If you also need your **own** voice captured in the same transcript,
   that typically requires an Aggregate Device or more advanced routing -
   document that as a known limitation rather than assuming it works.

**This is not guaranteed to work identically across every meeting app,
OS version, or browser.** Test it yourself before relying on it.

## 6. External mic fallback setup

1. Plug the external mic into the DiscoveryOS laptop.
2. Place the mic close to the meeting laptop's speaker.
3. Keep the HUD screen facing you, the facilitator.
4. Keep the remote speaker's volume clear but not distorted/clipping.
5. Avoid typing near the mic - keyboard noise competes with speech.
6. Avoid overlapping speech where possible - it's harder for
   transcription to separate than in-person cross-talk often is.

## 7. During-call operating rules

- The stakeholder relationship comes first - always.
- Let Live Capture run in the background; don't narrate to it.
- Use Quiet mode or Focus-only (Sprint 30) if the HUD gets visually
  noisy.
- Add only short manual anchor notes for genuinely critical claims (see
  Part F below) - not a parallel transcript.
- Don't chase every Suggested direction; they're prompts, not
  instructions.
- If capture quality drops mid-call, keep talking - fix or note it
  afterward, not live in front of the stakeholder.

## 8. Capture-quality scoring

After the call, rate it in the Field Test Debrief's "Capture quality
(remote calls)" section:

- **Remote audio clarity**, 1-5.
- **User voice dominance/balance**, 1-5 - 1 means you dominated the
  recording badly, 5 means balanced or the remote participant was
  clearly captured.
- **Transcript usefulness**, 1-5.
- **Manual notes needed** - low / medium / high.
- **HUD distraction** - low / medium / high.
- **Capture setup used** - which of the options above you actually ran.

This is internal-only scoring - never shown in Share/export.

## 9. Known limitations

- Browser mic capture is not the same thing as system-audio capture -
  they hear fundamentally different things.
- Remote meeting apps vary in how they handle audio output, and this
  guide can't cover every combination.
- BlackHole/virtual-audio setup can be fiddly and OS-version-dependent.
- DiscoveryOS can only analyze the audio/text it actually receives -
  it has no way to know what it missed.
- Manual anchor notes may still be necessary even with a good setup -
  don't treat any capture method as "install once, trust forever."
- Consent/disclosure still matters and is not solved by this guide - see
  Pilot Readiness for that, and never present anything here as legal
  compliance.
