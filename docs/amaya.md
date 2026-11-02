# Amaya — Voice HUD

Amaya is a voice assistant with a holographic HUD, available at **`/amaya`** (requires sign-in, like the rest of the dashboard).
You talk to it by voice ("Amaya…") or text. It researches, builds visual reports, and drives its interface through commands.

> **Current state:** the full interface works with a built-in **local, demo brain**. The reports it generates contain **illustrative data** and are labelled `DEMO`.
> To plug in Amaya's real brain, see [Connecting the platform brain](#connecting-the-platform-brain).

---

## How to use

1. Open `/amaya` and press **INITIALIZE · تشغيل** (the browser asks for microphone permission; the click is also required before audio can play).
2. Say **"أمايا"** or **"Amaya"**. The rings lock together and it starts listening. You can include the command in the same sentence:
   - «أمايا، اعملي تقرير عن الطاقة الشمسية»
   - "Amaya, do a VR report for me"
3. When the report is ready it asks whether to show it. Answer **"نعم" / "yes"** with no wake word (a listening window opens automatically after any question).

| Command (examples) | What happens |
|---|---|
| ابحثي عن … / اعملي تقرير عن … / research … / do a … report | Starts the research agent, then shows the progress card |
| اعرضي التقرير / present / yes | Wakes the screen, then the blocks appear one by one |
| امسحي الشاشة / clear | Closes everything with a close animation |
| افتحي الكاميرا / سكري الكاميرا / camera | Live camera window |
| السجل / history · المصادر / sources | History and sources windows |
| كم الساعة · من أنتِ · مساعدة · نامي | General commands |

**Shortcuts:** `Space` listen (or click the orb) · `T` text · `H` history · `C` clear · `M` mute · `Esc` close.

> Speech recognition uses the browser's Web Speech API (best supported in Chrome and Edge). In other browsers, use the text window.
> The voice uses the system's speech synthesis voices. The brain can supply better audio (see `audioUrl` below).

---

## Architecture

```
Browser (HUD)                                  Server
─────────────                                  ──────
Mic ─► Web Speech STT ─► wake word "Amaya"
                           │
                           ▼
                  POST /api/amaya/brain  ──►  route.ts (auth: Supabase)
                           ▲                    │
                           │ NDJSON stream      ├─ AMAYA_BRAIN_URL set?  ──► Amaya platform brain
                           │                    └─ otherwise             ──► local-brain.ts (demo)
                           │
          event queue: say → TTS · action → HUD · block → report …
```

| File | Role |
|---|---|
| `src/lib/amaya/types.ts` | **The protocol**: request, events, block types |
| `src/app/api/amaya/brain/route.ts` | Endpoint: auth, request validation, proxy or local brain |
| `src/lib/amaya/local-brain.ts` · `intents.ts` · `demo-report.ts` | The local demo brain |
| `src/lib/amaya/sfx.ts` | Sound engine: all effects are synthesised with Web Audio (no audio files) |
| `src/lib/amaya/voice.ts` | Speech recognition, speech output, mic meter |
| `src/components/amaya/*` | The interface: orb, windows, report, bars |

---

## Connecting the platform brain

In `.env.local`:

```bash
AMAYA_BRAIN_URL=https://brain.amaya.example/v1/turn
AMAYA_BRAIN_KEY=your-secret        # sent as Authorization: Bearer …
```

The top bar then shows `BRAIN: AMAYA PLATFORM`, and every request is forwarded as-is to the platform brain. The brain's reply is streamed straight back to the browser.

### Request (POST JSON → brain)

```jsonc
{
  "text": "اعملي تقرير عن الطاقة الشمسية",
  "lang": "ar",                         // "ar" | "en"
  "userId": "uuid-from-supabase",       // added by the server
  "history": [{ "role": "user" | "amaya", "text": "…", "at": 1730000000000 }],
  "context": {
    "pendingReport": { "id": "r_1", "topic": "VR", "blocks": 12, "sources": 42 } | null,
    "presenting": false,
    "screenAwake": true,
    "researching": false
  }
}
```

### Response: `application/x-ndjson`, one event per line

```jsonc
{"type":"say","text":"حاضر يا بوس…","expectReply":false,"audioUrl":"https://…/tts.mp3"}
{"type":"action","action":"wake_screen"}
{"type":"research_start","id":"r_1","topic":"VR"}
{"type":"research_progress","id":"r_1","progress":0.4,"blocks":3,"sources":12,"status":"Reading pages"}
{"type":"source","reportId":"r_1","source":{"id":"s1","title":"…","url":"https://…"}}
{"type":"block","reportId":"r_1","block":{ /* see below */ }}
{"type":"note","reportId":"r_1","note":"…"}
{"type":"research_done","id":"r_1","demo":false}
{"type":"error","message":"…"}
{"type":"done"}
```

- `say` is spoken in order, and the HUD waits for speech to finish before running the next event. That is what makes sequences like "wake the screen… then the report goes up" play in order.
- `expectReply: true` opens a listening window so the user can answer without the wake word.
- `audioUrl` (optional): the brain's own voice (e.g. ElevenLabs). The orb reacts to the real waveform.
- `action` ∈ `wake_screen · sleep_screen · present_report · clear_view · open_history · open_text · open_camera · close_camera · open_sources · mute_mic · listen`

### Block types

```jsonc
{"id":"b1","kind":"text","title":"…","body":"…","tag":"OVERVIEW // 01"}
{"id":"b2","kind":"stat","value":"≈20m","label":"…","caption":"…"}
{"id":"b3","kind":"chart","chart":"bar"|"line","title":"…","series":[{"label":"2024","value":42}],"unit":"%"}
{"id":"b4","kind":"list","title":"…","items":["…","…"]}
{"id":"b5","kind":"image","src":"https://…","title":"…"}
{"id":"b6","kind":"video","src":"https://….mp4","poster":"…","title":"…"}
{"id":"b7","kind":"visual","visual":"globe"|"terrain"|"radar"|"network","title":"…"}
```

Every block accepts `span: { cols: 1|2|3, rows: 1|2 }` and `sourceIds: string[]`.
The grid is 4 columns × 4 rows; leave the bottom-right cell empty because the orb docks there.

---

## Sound effects

All sounds are generated live in `sfx.ts`:

| Event | Sound |
|---|---|
| System start | Deep swell, data chatter, then a closing chime |
| Wake word / listening | Rising arpeggio, two up-blips (two down-blips when it stops) |
| Opening / closing a window | Rising whoosh with a confirm blip / falling whoosh |
| Each block appearing | Two digital blips, pitch rising with the block's position |
| Research running | Modulated ambient hum, soft pings, ticks per source and step |
| Research complete | Bright major chord |
| Screen wake | Sub-bass impact, rising sweep, arrival ping |
| Orb moving | Whoosh: pitch falls when it docks in the corner, rises when it returns |
| Text typing / buttons | Light key clicks / short click and hover tick |
| Error · camera · mute | Low buzz · shutter sound · toggle tone |

They can be turned off from the top bar (`SFX ON/OFF`). The choice is saved in the browser.
