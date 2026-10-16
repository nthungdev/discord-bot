# Architectural Design Document: Voice Companion Capability

## 1. Summary, goals, and non-goals

The Voice Companion capability introduces a full-duplex, real-time conversational voice agent to the Discord bot platform. The bot joins a Discord voice channel, receives multi-speaker Opus audio streams, decodes and downsamples audio with local Voice Activity Detection (VAD), routes speech through a bidirectional streaming session with the Google Gemini Multimodal Live API, and streams synthesized low-latency audio back into Discord with sub-650ms round-trip responsiveness. The architecture natively supports multi-user speaker attribution, client-side and server-side barge-in (interruption), dynamic tool execution mid-conversation, and strict privacy safeguards.

### Goals
- **Full-duplex conversation**: Continuous audio streaming with human-like turn-taking and sub-650ms end-to-end latency (from speech termination to initial bot audio playback).
- **Responsive barge-in**: Instant audio cutoff (<50ms local audio player purge) when a participant interrupts the companion while it is speaking.
- **Accurate speaker attribution**: Demuxing per-speaker RTP streams from Discord's voice transport to attribute "who said what" before sending turns to the model.
- **Configurable participation policies**: Support addressed-only (wake name / hotword), ambient participant, and slash command push-to-talk modes.
- **Mid-conversation tool dispatch**: Reusing the existing repository tool registry in [`app/src/tools/`](file:///Users/hung/.gemini/antigravity/worktrees/discord-bot/design_voice_companion_capability/app/src/tools/registry.ts) for real-time actions (channel queries, matchmaking status, web searches).
- **Discord End-to-End Encryption (DAVE) compliance**: Full support for Discord's voice transport encryption using `@snazzah/davey` and `@discordjs/voice`.
- **Zero raw audio persistence**: Ephemeral in-memory ring-buffer processing with complete discard after inference.
- **Architectural parity**: Strict alignment with [`IBot
<truncated 38992 bytes>
ilt-in capabilities in pipeline priority order
const enablePoliceCapability = process.env.ENABLE_POLICE_CAPABILITY === "true";
if (enablePoliceCapability) {
  this.registerCapability(new ModerationCapability());
}

this.registerCapability(new RoleCapability());
this.registerCapability(new ChatCapability());
this.registerCapability(new VoiceBouncerCapability());
this.registerCapability(new MatchmakingCapability());
this.registerCapability(new VoiceCompanionCapability());
```

### Slash command registration in `deployCommands.ts`
Add `DiscordCommand.Voice = "voice"` to [`app/src/discord/constants.ts`](file:///Users/hung/.gemini/antigravity/worktrees/discord-bot/design_voice_companion_capability/app/src/discord/constants.ts). Create [`app/src/discord/commands/voice/companion.ts`](file:///Users/hung/.gemini/antigravity/worktrees/discord-bot/design_voice_companion_capability/app/src/discord/commands/voice/companion.ts) with subcommands:
- `join [channel]`: Connects companion to the caller's current voice channel.
- `leave`: Disconnects companion from voice channel.
- `pause`: Temporarily pauses listening and responding.
- `resume`: Resumes listening and active participation.
- `status`: Displays current session stats, latency, and participation mode.
- `opt-out`: Excludes user from voice processing.

### Voice state pipeline dispatch
In [`VoiceCompanionCapability.handleVoiceStateUpdate`](file:///Users/hung/.gemini/antigravity/worktrees/discord-bot/design_voice_companion_capability/app/src/capabilities/voice-companion-capability.ts):
- Monitor channel member counts: When the last human participant leaves an active companion channel, start a 60-second grace timer. If no human returns, gracefully disconnect and release all session resources.
- If the bot is forcibly disconnected or moved by a server administrator, update session state and clean up audio resources immediately.