# From the DAW to the Voice Pipeline

| Familiar concept | DAW meaning | Voice-AI meaning | First experiment |
|---|---|---|---|
| Tracking | Capture the cleanest useful source. | Capture intelligible speech with known device, channels, sample rate, and format. | Compare an original fixture with low gain. |
| Gain staging | Maintain useful level without clipping. | Avoid clipped or extremely quiet speech before recognition. | Compare original with synthetic clipping. |
| Channel strip | Apply EQ, compression, gating, and processing. | Process only with a hypothesis; aggressive processing can remove speech information. | Compare original with telephony approximation. |
| Bus / routing | Move signals between tracks, groups, sends, and outputs. | Trace capture, transport, STT, agent, TTS, and playback ownership. | Inspect the selectable signal-flow stages. |
| Buffer size | Trade latency against stability. | Chunk size and buffering affect responsiveness, overhead, and stream behavior. | Compare long and short conceptual chunk groups. |
| Monitoring | Hear the captured or processed signal. | Playback can reenter the microphone and create echo or false barge-in. | Review the echo loop; monitoring remains off. |
| Bounce / export | Render into a container and codec. | Match the resulting container, encoding, channels, and sample rate to the receiver. | Inspect a WAV and a raw fixture. |
| Mixing | Balance multiple sources. | Determine whether speakers are isolated by channel or mixed and need diarization. | Open the multichannel versus diarization lesson. |
| Mastering | Optimize a final program for delivery. | Do not assume polished audio is better for recognition; test representative audio. | Run a guarded A/B comparison with reference text. |

## Practical rule

Observe before modifying. Preserve the original fixture, change one audio variable, keep the recognition configuration fixed, retain request IDs and sanitized responses, and state the limitation. Preprocessing can help a specific failure and hurt a different one; representative evaluation decides.

## Timing and musical listening

Speech energy, pauses, hesitation, self-correction, resumed speech, endpoint events, and final transcript timing belong on one timeline. A pause is an acoustic event, while the end of a conversational turn is also linguistic and semantic. Browser energy can help inspect the input but does not reproduce Deepgram VAD or turn models.

## Multichannel is not diarization

Multichannel processes separate physical/logical channels independently—for example, channel 0 customer and channel 1 agent. Diarization estimates speaker identity when speakers share an audio channel. A channel can contain multiple speakers, and a speaker can appear across channels; channel identity and speaker identity are not interchangeable.
