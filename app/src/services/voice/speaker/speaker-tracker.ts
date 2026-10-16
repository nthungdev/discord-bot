/**
 * Multi-speaker attribution, SSRC mapping, and privacy opt-out tracking.
 */

import type { GuildMember } from "discord.js";
import type { SpeakerProfile } from "../types";

export class SpeakerTracker {
  private speakers = new Map<string, SpeakerProfile>();
  private ssrcToUserId = new Map<number, string>();
  private optedOutUserIds = new Set<string>();

  /**
   * Registers or updates a guild member in the tracker.
   */
  public registerMember(member: GuildMember): SpeakerProfile {
    const existing = this.speakers.get(member.id);
    const profile: SpeakerProfile = {
      userId: member.id,
      username: member.user.username,
      displayName: member.displayName || member.user.username,
      ssrc: existing?.ssrc,
      isOptedOut: this.optedOutUserIds.has(member.id),
      isSpeaking: existing?.isSpeaking ?? false,
      lastSpokeAt: existing?.lastSpokeAt ?? 0,
    };

    this.speakers.set(member.id, profile);
    return profile;
  }

  /**
   * Associates an RTP SSRC identifier with a Discord user ID.
   */
  public mapSsrc(ssrc: number, userId: string): void {
    this.ssrcToUserId.set(ssrc, userId);
    const speaker = this.speakers.get(userId);
    if (speaker) {
      speaker.ssrc = ssrc;
    }
  }

  /**
   * Finds speaker profile by Discord user ID.
   */
  public getSpeakerByUserId(userId: string): SpeakerProfile | undefined {
    return this.speakers.get(userId);
  }

  /**
   * Finds speaker profile by RTP SSRC.
   */
  public getSpeakerBySsrc(ssrc: number): SpeakerProfile | undefined {
    const userId = this.ssrcToUserId.get(ssrc);
    if (!userId) return undefined;
    return this.speakers.get(userId);
  }

  /**
   * Updates speaking status and timestamp for a user.
   */
  public setSpeaking(userId: string, isSpeaking: boolean): void {
    const speaker = this.speakers.get(userId);
    if (speaker) {
      speaker.isSpeaking = isSpeaking;
      if (isSpeaking) {
        speaker.lastSpokeAt = Date.now();
      }
    }
  }

  /**
   * Sets user opt-out status for voice processing.
   * Opted-out users have their voice streams suppressed immediately.
   */
  public setOptOut(userId: string, optedOut: boolean): void {
    if (optedOut) {
      this.optedOutUserIds.add(userId);
    } else {
      this.optedOutUserIds.delete(userId);
    }

    const speaker = this.speakers.get(userId);
    if (speaker) {
      speaker.isOptedOut = optedOut;
    }
  }

  /**
   * Checks whether a user is opted out.
   */
  public isUserOptedOut(userId: string): boolean {
    return this.optedOutUserIds.has(userId);
  }

  /**
   * Returns formatted speaker attribution header for Gemini Live clientContent.
   */
  public formatSpeakerTag(userId: string): string {
    const speaker = this.speakers.get(userId);
    if (!speaker) {
      return `[Speaker: <@${userId}>]`;
    }
    return `[Speaker: @${speaker.username} (${speaker.displayName})]`;
  }

  /**
   * Returns list of all active speaker profiles currently tracked in the channel.
   */
  public getAllSpeakers(): readonly SpeakerProfile[] {
    return Array.from(this.speakers.values());
  }

  /**
   * Clears state for a disconnected session.
   */
  public clear(): void {
    this.speakers.clear();
    this.ssrcToUserId.clear();
    this.optedOutUserIds.clear();
  }
}
