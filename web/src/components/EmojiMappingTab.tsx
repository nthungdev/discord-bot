import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle,
  Dices,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import type {
  EmojiAiSuggestScope,
  EmojiAiSuggestion,
  GuildCustomEmoji,
  JoinedGuildDetail,
} from "../types";

interface EmojiMappingTabProps {
  guild: JoinedGuildDetail;
  canManage: boolean;
}

type ViewMode = "custom" | "standard";
type EmojiFilter = "all" | "unmapped" | "mapped" | "ai" | "deleted";
type UnicodeDialogMode = "single" | "bulk" | "newStandard";

interface UnicodeDialogContext {
  mode: UnicodeDialogMode;
  targetNames: string[];
}

interface AiDraft {
  emojis: string[];
  reason: string;
}

interface UnicodeEmojiItem {
  e: string;
  k: string;
  c: UnicodeCategoryId;
}

type UnicodeCategoryId =
  | "smileys"
  | "gestures"
  | "hearts"
  | "celebration"
  | "animals"
  | "objects";

type UnicodeCategoryFilter = "all" | UnicodeCategoryId;

interface SegmenterLike {
  segment(input: string): Iterable<{ segment: string }>;
}

const QUICK_EMOJIS: readonly string[] = [
  "😂",
  "🔥",
  "❤️",
  "❤️‍🔥",
  "💀",
  "👀",
  "🎉",
  "😢",
  "😡",
  "🤡",
  "👍",
];

const DEFAULT_PREVIEW_TEXT =
  "GG everyone! 😂 That clutch was pure 🔥❤️‍🔥 I'm dead 💀👀";

const UNICODE_CATEGORIES: readonly { id: UnicodeCategoryFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "smileys", label: "Smileys" },
  { id: "gestures", label: "Gestures" },
  { id: "hearts", label: "Hearts" },
  { id: "celebration", label: "Hype" },
  { id: "animals", label: "Animals" },
  { id: "objects", label: "Objects" },
];

const UNICODE_EMOJIS: readonly UnicodeEmojiItem[] = [
  // Smileys & reactions
  { e: "😀", k: "grin smile happy", c: "smileys" },
  { e: "😃", k: "smiley happy grin", c: "smileys" },
  { e: "😄", k: "smile happy laugh", c: "smileys" },
  { e: "😁", k: "beam grin teeth happy", c: "smileys" },
  { e: "😆", k: "laugh squint xd haha", c: "smileys" },
  { e: "😅", k: "sweat smile awkward nervous", c: "smileys" },
  { e: "😂", k: "laugh joy tears lol kekw", c: "smileys" },
  { e: "🤣", k: "rofl laugh floor lol", c: "smileys" },
  { e: "😊", k: "blush smile warm wholesome", c: "smileys" },
  { e: "😇", k: "angel innocent halo", c: "smileys" },
  { e: "🙂", k: "slight smile fine ok", c: "smileys" },
  { e: "🙃", k: "upside down sarcasm", c: "smileys" },
  { e: "😉", k: "wink flirt", c: "smileys" },
  { e: "😍", k: "heart eyes love crush", c: "smileys" },
  { e: "🥰", k: "smiling hearts adore cute", c: "smileys" },
  { e: "😘", k: "kiss love", c: "smileys" },
  { e: "😋", k: "yum delicious tongue", c: "smileys" },
  { e: "😜", k: "wink tongue silly playful", c: "smileys" },
  { e: "🤪", k: "zany crazy goofy", c: "smileys" },
  { e: "🤨", k: "raised eyebrow sus skeptical", c: "smileys" },
  { e: "🧐", k: "monocle inspect detective", c: "smileys" },
  { e: "🤓", k: "nerd glasses um actually", c: "smileys" },
  { e: "😎", k: "cool sunglasses vibe", c: "smileys" },
  { e: "🤩", k: "star struck amazed hype", c: "smileys" },
  { e: "🥳", k: "party celebrate birthday", c: "smileys" },
  { e: "😏", k: "smirk smug", c: "smileys" },
  { e: "😒", k: "unamused annoyed side eye", c: "smileys" },
  { e: "😞", k: "disappointed sad", c: "smileys" },
  { e: "😔", k: "pensive sadge down", c: "smileys" },
  { e: "😟", k: "worried concerned", c: "smileys" },
  { e: "😕", k: "confused unsure", c: "smileys" },
  { e: "🥺", k: "pleading puppy eyes sad cute", c: "smileys" },
  { e: "😢", k: "cry sad tear sadge", c: "smileys" },
  { e: "😭", k: "sob cry loud bawling", c: "smileys" },
  { e: "😤", k: "huff steam triumph mad", c: "smileys" },
  { e: "😠", k: "angry mad", c: "smileys" },
  { e: "😡", k: "rage angry red mad", c: "smileys" },
  { e: "🤬", k: "swear curse angry rage", c: "smileys" },
  { e: "🤯", k: "mind blown shock explode", c: "smileys" },
  { e: "😳", k: "flushed blush shock", c: "smileys" },
  { e: "🥵", k: "hot sweat spicy", c: "smileys" },
  { e: "🥶", k: "cold freezing chill", c: "smileys" },
  { e: "😱", k: "scream shock fear", c: "smileys" },
  { e: "😨", k: "fearful scared", c: "smileys" },
  { e: "😰", k: "anxious sweat", c: "smileys" },
  { e: "🤗", k: "hug warm", c: "smileys" },
  { e: "🤔", k: "think hmm wonder", c: "smileys" },
  { e: "🤭", k: "giggle oops", c: "smileys" },
  { e: "🤫", k: "shush quiet secret", c: "smileys" },
  { e: "🤥", k: "lying cap pinocchio", c: "smileys" },
  { e: "😶", k: "speechless blank", c: "smileys" },
  { e: "😐", k: "neutral deadpan bruh", c: "smileys" },
  { e: "😑", k: "expressionless done", c: "smileys" },
  { e: "😬", k: "grimace cringe yikes", c: "smileys" },
  { e: "🙄", k: "eye roll whatever", c: "smileys" },
  { e: "😴", k: "sleep bored zzz", c: "smileys" },
  { e: "🤤", k: "drool hungry", c: "smileys" },
  { e: "🤮", k: "vomit gross sick", c: "smileys" },
  { e: "🤧", k: "sneeze sick", c: "smileys" },
  { e: "😵", k: "dizzy knocked out", c: "smileys" },
  { e: "🫠", k: "melt copium awkward fine", c: "smileys" },
  { e: "🫡", k: "salute respect o7", c: "smileys" },
  { e: "🫣", k: "peek shy nervous", c: "smileys" },
  { e: "🥹", k: "holding back tears touched", c: "smileys" },
  { e: "💀", k: "skull dead bruh", c: "smileys" },
  { e: "☠️", k: "skull crossbones dead", c: "smileys" },
  { e: "🤡", k: "clown fool self own", c: "smileys" },
  { e: "👻", k: "ghost spooky boo", c: "smileys" },
  { e: "👽", k: "alien space", c: "smileys" },
  { e: "🤖", k: "robot bot ai", c: "smileys" },
  { e: "😈", k: "devil mischief evil", c: "smileys" },
  { e: "💩", k: "poop trash", c: "smileys" },

  // Gestures & people
  { e: "👀", k: "eyes sus look watch", c: "gestures" },
  { e: "👁️", k: "eye watch stare", c: "gestures" },
  { e: "👍", k: "thumbs up ok yes approve", c: "gestures" },
  { e: "👍🏽", k: "thumbs up medium skin ok", c: "gestures" },
  { e: "👎", k: "thumbs down no disapprove", c: "gestures" },
  { e: "👏", k: "clap gg applause bravo", c: "gestures" },
  { e: "🙌", k: "raising hands praise yay", c: "gestures" },
  { e: "🤝", k: "handshake deal agree", c: "gestures" },
  { e: "🙏", k: "pray please thanks hope", c: "gestures" },
  { e: "✌️", k: "peace victory", c: "gestures" },
  { e: "🤞", k: "crossed fingers luck", c: "gestures" },
  { e: "👌", k: "ok hand chef kiss", c: "gestures" },
  { e: "🤌", k: "pinched fingers italian chef", c: "gestures" },
  { e: "🤘", k: "rock on metal", c: "gestures" },
  { e: "🤙", k: "call me shaka chill", c: "gestures" },
  { e: "👋", k: "wave hi hello bye", c: "gestures" },
  { e: "💪", k: "muscle strong flex", c: "gestures" },
  { e: "🫶", k: "heart hands love", c: "gestures" },
  { e: "🫵", k: "pointing at you", c: "gestures" },
  { e: "🤦", k: "facepalm fail", c: "gestures" },
  { e: "🤷", k: "shrug idk dunno", c: "gestures" },
  { e: "🕺", k: "dance vibe party", c: "gestures" },
  { e: "💃", k: "dance party vibe", c: "gestures" },

  // Hearts & symbols
  { e: "❤️", k: "heart love red", c: "hearts" },
  { e: "❤️‍🔥", k: "heart on fire passion hype", c: "hearts" },
  { e: "🧡", k: "orange heart", c: "hearts" },
  { e: "💛", k: "yellow heart", c: "hearts" },
  { e: "💚", k: "green heart", c: "hearts" },
  { e: "💙", k: "blue heart", c: "hearts" },
  { e: "💜", k: "purple heart", c: "hearts" },
  { e: "🖤", k: "black heart", c: "hearts" },
  { e: "🤍", k: "white heart", c: "hearts" },
  { e: "💖", k: "sparkling heart love", c: "hearts" },
  { e: "💘", k: "cupid heart arrow", c: "hearts" },
  { e: "💔", k: "broken heart sad", c: "hearts" },
  { e: "💯", k: "100 percent real facts", c: "hearts" },
  { e: "💢", k: "anger comic mad", c: "hearts" },
  { e: "💥", k: "boom explosion bang", c: "hearts" },
  { e: "💫", k: "dizzy star sparkle", c: "hearts" },
  { e: "❓", k: "question mark what", c: "hearts" },
  { e: "❗", k: "exclamation alert", c: "hearts" },
  { e: "✅", k: "check yes done", c: "hearts" },
  { e: "❌", k: "cross no wrong", c: "hearts" },

  // Celebration & hype
  { e: "🔥", k: "fire lit hype flame", c: "celebration" },
  { e: "✨", k: "sparkles magic ai shine", c: "celebration" },
  { e: "🎉", k: "party popper celebrate hype", c: "celebration" },
  { e: "🎊", k: "confetti celebrate", c: "celebration" },
  { e: "🏆", k: "trophy win gg champion", c: "celebration" },
  { e: "🥇", k: "gold medal first win", c: "celebration" },
  { e: "👑", k: "crown king queen goat", c: "celebration" },
  { e: "⚡", k: "zap lightning fast hype", c: "celebration" },
  { e: "🌟", k: "star glow", c: "celebration" },
  { e: "🚀", k: "rocket launch moon", c: "celebration" },
  { e: "🎯", k: "bullseye target accurate", c: "celebration" },
  { e: "💎", k: "gem diamond rare", c: "celebration" },
  { e: "🎵", k: "music note vibe", c: "celebration" },
  { e: "🎶", k: "music notes vibe", c: "celebration" },

  // Animals & nature
  { e: "🐱", k: "cat kitty meow", c: "animals" },
  { e: "🐶", k: "dog doge puppy", c: "animals" },
  { e: "🐸", k: "frog pepe", c: "animals" },
  { e: "🦊", k: "fox", c: "animals" },
  { e: "🐻", k: "bear", c: "animals" },
  { e: "🐼", k: "panda", c: "animals" },
  { e: "🐵", k: "monkey ape", c: "animals" },
  { e: "🐔", k: "chicken", c: "animals" },
  { e: "🦆", k: "duck", c: "animals" },
  { e: "🦉", k: "owl", c: "animals" },
  { e: "🐺", k: "wolf", c: "animals" },
  { e: "🐉", k: "dragon", c: "animals" },
  { e: "🐐", k: "goat greatest", c: "animals" },
  { e: "🌈", k: "rainbow", c: "animals" },
  { e: "☀️", k: "sun sunny", c: "animals" },
  { e: "🌙", k: "moon night", c: "animals" },

  // Objects & food
  { e: "🔨", k: "hammer bonk ban", c: "objects" },
  { e: "⚔️", k: "swords fight battle", c: "objects" },
  { e: "🛡️", k: "shield defend tank", c: "objects" },
  { e: "🎮", k: "controller gaming play", c: "objects" },
  { e: "🎲", k: "dice random rng", c: "objects" },
  { e: "💣", k: "bomb explode", c: "objects" },
  { e: "💡", k: "lightbulb idea smart", c: "objects" },
  { e: "📌", k: "pin note", c: "objects" },
  { e: "🔔", k: "bell ping alert", c: "objects" },
  { e: "📢", k: "megaphone announce", c: "objects" },
  { e: "☕", k: "coffee tea sip", c: "objects" },
  { e: "🍺", k: "beer cheers", c: "objects" },
  { e: "🍕", k: "pizza food", c: "objects" },
  { e: "🍿", k: "popcorn drama watch", c: "objects" },
  { e: "🧂", k: "salt salty", c: "objects" },
  { e: "🧠", k: "brain big brain smart", c: "objects" },
  { e: "💸", k: "money flying broke", c: "objects" },
  { e: "📈", k: "chart up stonks", c: "objects" },
  { e: "📉", k: "chart down crash", c: "objects" },
];

function createGraphemeSegmenter(): SegmenterLike | null {
  const intlWithSegmenter = Intl as unknown as {
    Segmenter?: new (
      locale: string,
      options: { granularity: "grapheme" },
    ) => SegmenterLike;
  };
  if (typeof intlWithSegmenter.Segmenter === "function") {
    return new intlWithSegmenter.Segmenter("en", { granularity: "grapheme" });
  }
  return null;
}

const GRAPHEME_SEGMENTER = createGraphemeSegmenter();

function segmentGraphemes(text: string): string[] {
  if (!text) return [];
  if (GRAPHEME_SEGMENTER) {
    const out: string[] = [];
    for (const { segment } of GRAPHEME_SEGMENTER.segment(text)) {
      out.push(segment);
    }
    return out;
  }
  return Array.from(text);
}

// Top-layer exit fallback detection (animate-to-from-top-layer)
let supportsDisplayTransitionCache: boolean | undefined;

function canTransitionDisplay(): boolean {
  if (supportsDisplayTransitionCache !== undefined) {
    return supportsDisplayTransitionCache;
  }
  if (
    typeof window === "undefined" ||
    !window.CSS?.supports?.("transition-behavior", "allow-discrete") ||
    !document.body
  ) {
    return false;
  }
  const probe = document.createElement("div");
  probe.style.cssText =
    "transition: display 1s allow-discrete !important; display: block;";
  document.body.appendChild(probe);
  getComputedStyle(probe).display;
  probe.style.display = "none";
  supportsDisplayTransitionCache = getComputedStyle(probe).display === "block";
  probe.remove();
  return supportsDisplayTransitionCache;
}

function supportsTopLayerExit(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.CSS?.supports?.("overlay", "auto")) &&
    canTransitionDisplay()
  );
}

async function closeTopLayer(dialogEl: HTMLDialogElement | null): Promise<void> {
  if (!dialogEl || !dialogEl.open) return;
  if (!supportsTopLayerExit()) {
    dialogEl.setAttribute("data-closing", "");
    const animations = dialogEl.getAnimations({ subtree: true });
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((a) => a.finished)),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]);
    }
    if (!dialogEl.hasAttribute("data-closing")) return;
    dialogEl.removeAttribute("data-closing");
  }
  dialogEl.close();
}

function useModernDialog(dialogRef: React.RefObject<HTMLDialogElement>): void {
  useEffect(() => {
    const dialogEl = dialogRef.current;
    if (!dialogEl) return;

    const handleCancel = (event: Event) => {
      event.preventDefault();
      void closeTopLayer(dialogEl);
    };
    dialogEl.addEventListener("cancel", handleCancel);

    const needsLightDismissFallback =
      typeof HTMLDialogElement !== "undefined" &&
      !("closedBy" in HTMLDialogElement.prototype);

    const handleBackdropClick = (event: MouseEvent) => {
      if (event.target !== dialogEl) return;
      const rect = dialogEl.getBoundingClientRect();
      const inside =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (!inside) {
        void closeTopLayer(dialogEl);
      }
    };

    if (needsLightDismissFallback) {
      dialogEl.addEventListener("click", handleBackdropClick);
    }

    return () => {
      dialogEl.removeEventListener("cancel", handleCancel);
      if (needsLightDismissFallback) {
        dialogEl.removeEventListener("click", handleBackdropClick);
      }
    };
  }, [dialogRef]);
}

function getTagsForCustom(
  mapping: Record<string, string[]>,
  customName: string,
): string[] {
  const tags: string[] = [];
  for (const [std, names] of Object.entries(mapping)) {
    if (names.includes(customName)) {
      tags.push(std);
    }
  }
  return tags;
}

function getOrphanNames(
  mapping: Record<string, string[]>,
  emojiByName: Map<string, GuildCustomEmoji>,
): string[] {
  const orphans = new Set<string>();
  for (const names of Object.values(mapping)) {
    for (const name of names) {
      if (!emojiByName.has(name)) {
        orphans.add(name);
      }
    }
  }
  return Array.from(orphans);
}

function addMappingEntries(
  prev: Record<string, string[]>,
  stdEmojis: readonly string[],
  customNames: readonly string[],
): { next: Record<string, string[]>; addedCount: number } {
  const next: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(prev)) {
    next[k] = [...v];
  }
  let addedCount = 0;
  for (const rawStd of stdEmojis) {
    const clean = rawStd.trim();
    if (!clean) continue;
    if (!next[clean]) {
      next[clean] = [];
    }
    for (const customName of customNames) {
      if (!next[clean].includes(customName)) {
        next[clean].push(customName);
        addedCount += 1;
      }
    }
  }
  return { next, addedCount };
}

function removeMappingEntry(
  prev: Record<string, string[]>,
  stdEmoji: string,
  customName: string,
): Record<string, string[]> {
  const list = prev[stdEmoji];
  if (!list) return prev;
  const filtered = list.filter((n) => n !== customName);
  const next: Record<string, string[]> = { ...prev };
  if (filtered.length === 0) {
    delete next[stdEmoji];
  } else {
    next[stdEmoji] = filtered;
  }
  return next;
}

function removeCustomNamesFromAll(
  prev: Record<string, string[]>,
  customNamesToRemove: ReadonlySet<string>,
): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  for (const [std, names] of Object.entries(prev)) {
    const filtered = names.filter((n) => !customNamesToRemove.has(n));
    if (filtered.length > 0) {
      next[std] = filtered;
    }
  }
  return next;
}

export const EmojiMappingTab: React.FC<EmojiMappingTabProps> = ({
  guild,
  canManage,
}) => {
  const unicodeDialogId = useId();
  const customDialogId = useId();
  const previewHeadingId = useId();

  const unicodeDialogRef = useRef<HTMLDialogElement>(null);
  const customDialogRef = useRef<HTMLDialogElement>(null);
  const unicodeSearchRef = useRef<HTMLInputElement>(null);
  const customSearchRef = useRef<HTMLInputElement>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useModernDialog(unicodeDialogRef);
  useModernDialog(customDialogRef);

  // Server data
  const [emojis, setEmojis] = useState<GuildCustomEmoji[]>([]);
  const [mapping, setMapping] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Save & feedback
  const [hasUnsaved, setHasUnsaved] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>("");

  // View & filtering
  const [viewMode, setViewMode] = useState<ViewMode>("custom");
  const [activeFilter, setActiveFilter] = useState<EmojiFilter>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Multi-select
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);

  // AI Auto-Map
  const [aiScope, setAiScope] = useState<EmojiAiSuggestScope>("unmapped");
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiLoadingText, setAiLoadingText] = useState<string>("");
  const [aiDrafts, setAiDrafts] = useState<Record<string, AiDraft>>({});

  // Live preview
  const [previewText, setPreviewText] = useState<string>(DEFAULT_PREVIEW_TEXT);
  const [rerollSeed, setRerollSeed] = useState<number>(0);

  // Unicode picker dialog state
  const [unicodeCtx, setUnicodeCtx] = useState<UnicodeDialogContext | null>(null);
  const [unicodePicked, setUnicodePicked] = useState<Set<string>>(new Set());
  const [unicodeSearch, setUnicodeSearch] = useState<string>("");
  const [unicodeCategory, setUnicodeCategory] =
    useState<UnicodeCategoryFilter>("all");
  const [unicodeDirectInput, setUnicodeDirectInput] = useState<string>("");

  // Custom emoji multi-picker dialog state (for Standard view)
  const [customDialogStd, setCustomDialogStd] = useState<string | null>(null);
  const [customPicked, setCustomPicked] = useState<Set<string>>(new Set());
  const [customSearch, setCustomSearch] = useState<string>("");

  const announce = useCallback((message: string) => {
    const docWithAriaNotify = document as Document & {
      ariaNotify?: (msg: string) => void;
    };
    if (typeof docWithAriaNotify.ariaNotify === "function") {
      docWithAriaNotify.ariaNotify(message);
    } else {
      setLiveAnnouncement("");
      requestAnimationFrame(() => {
        setLiveAnnouncement(message);
      });
    }
  }, []);

  const showStatus = useCallback(
    (msg: string) => {
      setActionError(null);
      setStatusMessage(msg);
      announce(msg);
      if (statusTimerRef.current) {
        clearTimeout(statusTimerRef.current);
      }
      statusTimerRef.current = setTimeout(() => {
        setStatusMessage(null);
      }, 4500);
    },
    [announce],
  );

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) {
        clearTimeout(statusTimerRef.current);
      }
    };
  }, []);

  const fetchGuildEmojis = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setActionError(null);
    setStatusMessage(null);
    setSelectedNames(new Set());
    setLastClickedIndex(null);
    setAiDrafts({});
    setHasUnsaved(false);
    setActiveFilter("all");
    setSearchQuery("");

    try {
      const res = await api.getGuildEmojis(guild.id);
      setEmojis(res.emojis || []);
      setMapping(res.mapping || {});
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to load guild emojis and mappings.";
      setLoadError(msg);
      setEmojis([]);
      setMapping({});
    } finally {
      setLoading(false);
    }
  }, [guild.id]);

  useEffect(() => {
    void fetchGuildEmojis();
  }, [fetchGuildEmojis]);

  const emojiByName = useMemo(
    () => new Map(emojis.map((e) => [e.name, e])),
    [emojis],
  );

  const orphanNames = useMemo(
    () => getOrphanNames(mapping, emojiByName),
    [mapping, emojiByName],
  );

  const stats = useMemo(() => {
    const total = emojis.length;
    const mapped = emojis.filter(
      (e) => getTagsForCustom(mapping, e.name).length > 0,
    ).length;
    const unmapped = total - mapped;
    const pct = total > 0 ? Math.round((mapped / total) * 100) : 0;
    const standardCount = Object.keys(mapping).length;
    return { total, mapped, unmapped, pct, standardCount };
  }, [emojis, mapping]);

  const filterCounts = useMemo(
    () => ({
      all: emojis.length + orphanNames.length,
      unmapped: stats.unmapped,
      mapped: stats.mapped,
      ai: Object.keys(aiDrafts).length,
      deleted: orphanNames.length,
    }),
    [emojis.length, orphanNames.length, stats.unmapped, stats.mapped, aiDrafts],
  );

  const filteredCustomItems = useMemo(() => {
    const orphanItems: Array<GuildCustomEmoji & { deleted?: boolean }> =
      orphanNames.map((name) => ({
        id: "deleted",
        name,
        animated: false,
        url: "",
        deleted: true,
      }));
    const combined: Array<GuildCustomEmoji & { deleted?: boolean }> = [
      ...emojis,
      ...orphanItems,
    ];
    const q = searchQuery.trim().toLowerCase();

    return combined.filter((item) => {
      const tags = getTagsForCustom(mapping, item.name);
      const hasAi = Boolean(aiDrafts[item.name]);
      if (activeFilter === "unmapped" && (item.deleted || tags.length > 0)) {
        return false;
      }
      if (activeFilter === "mapped" && (item.deleted || tags.length === 0)) {
        return false;
      }
      if (activeFilter === "ai" && !hasAi) {
        return false;
      }
      if (activeFilter === "deleted" && !item.deleted) {
        return false;
      }
      if (q) {
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesTag = tags.some((t) => t.includes(q));
        if (!matchesName && !matchesTag) return false;
      }
      return true;
    });
  }, [emojis, orphanNames, mapping, aiDrafts, activeFilter, searchQuery]);

  const visibleSelectableNames = useMemo(
    () => filteredCustomItems.filter((i) => !i.deleted).map((i) => i.name),
    [filteredCustomItems],
  );

  // Reset shift-click range anchor when list ordering/filtering changes
  useEffect(() => {
    setLastClickedIndex(null);
  }, [activeFilter, searchQuery, viewMode]);

  // Prune stale selections when emojis are removed or filtered out
  useEffect(() => {
    const visibleSet = new Set(visibleSelectableNames);
    setSelectedNames((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const name of prev) {
        if (visibleSet.has(name)) {
          next.add(name);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [visibleSelectableNames]);

  // Keyboard shortcuts: Esc clears selection when no dialog is open; Cmd/Ctrl+A selects visible
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (unicodeDialogRef.current?.open || customDialogRef.current?.open) {
        return;
      }
      const target = e.target as HTMLElement | null;
      const inInput = Boolean(
        target?.matches?.("input, textarea, select, [contenteditable='true']"),
      );
      if (inInput) return;

      if (e.key === "Escape" && selectedNames.size > 0) {
        setSelectedNames(new Set());
        setLastClickedIndex(null);
      } else if (
        canManage &&
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "a" &&
        viewMode === "custom"
      ) {
        e.preventDefault();
        setSelectedNames((prev) => {
          const next = new Set(prev);
          for (const name of visibleSelectableNames) next.add(name);
          return next;
        });
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [canManage, selectedNames.size, viewMode, visibleSelectableNames]);

  const toggleCardSelection = (name: string, idx: number, shiftKey: boolean) => {
    if (!canManage) return;
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (
        shiftKey &&
        lastClickedIndex !== null &&
        visibleSelectableNames.length > 0
      ) {
        const start = Math.min(lastClickedIndex, idx);
        const end = Math.max(lastClickedIndex, idx);
        for (let i = start; i <= end; i += 1) {
          const item = visibleSelectableNames[i];
          if (item) next.add(item);
        }
      } else if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
    setLastClickedIndex(idx);
  };

  const handleRemoveTag = (stdEmoji: string, customName: string) => {
    if (!canManage) return;
    setMapping((prev) => removeMappingEntry(prev, stdEmoji, customName));
    setHasUnsaved(true);
  };

  const handleCleanOrphans = () => {
    if (!canManage || orphanNames.length === 0) return;
    const orphanSet = new Set(orphanNames);
    setMapping((prev) => removeCustomNamesFromAll(prev, orphanSet));
    setHasUnsaved(true);
    showStatus(
      `Cleaned up ${orphanNames.length} deleted emoji reference${orphanNames.length > 1 ? "s" : ""}.`,
    );
  };

  const handleQuickTag = (stdEmoji: string) => {
    if (!canManage || selectedNames.size === 0) return;
    const targets = Array.from(selectedNames);
    const { next, addedCount } = addMappingEntries(mapping, [stdEmoji], targets);
    if (addedCount > 0) {
      setMapping(next);
      setHasUnsaved(true);
      showStatus(
        `Tagged ${addedCount} selected emoji${addedCount > 1 ? "s" : ""} with ${stdEmoji}.`,
      );
    } else {
      showStatus(
        `All ${selectedNames.size} selected emojis already replace ${stdEmoji}.`,
      );
    }
  };

  const handleBulkClearTags = () => {
    if (!canManage || selectedNames.size === 0) return;
    const count = selectedNames.size;
    setMapping((prev) => removeCustomNamesFromAll(prev, selectedNames));
    setHasUnsaved(true);
    showStatus(
      `Cleared all standard emoji tags from ${count} selected emoji${count > 1 ? "s" : ""}.`,
    );
  };

  // Dialog openers
  const openUnicodePicker = (ctx: UnicodeDialogContext) => {
    if (!canManage) return;
    setUnicodeCtx(ctx);
    setUnicodePicked(new Set());
    setUnicodeSearch("");
    setUnicodeCategory("all");
    setUnicodeDirectInput("");
    unicodeDialogRef.current?.showModal();
    requestAnimationFrame(() => unicodeSearchRef.current?.focus());
  };

  const openCustomPicker = (stdEmoji: string) => {
    if (!canManage) return;
    setCustomDialogStd(stdEmoji);
    const currentValid = (mapping[stdEmoji] || []).filter((n) =>
      emojiByName.has(n),
    );
    setCustomPicked(new Set(currentValid));
    setCustomSearch("");
    customDialogRef.current?.showModal();
    requestAnimationFrame(() => customSearchRef.current?.focus());
  };

  const handleQueueDirectUnicode = () => {
    const raw = unicodeDirectInput.trim();
    if (!raw) return;
    const stripVs16 = (val: string) => val.replace(/\uFE0F/g, "");
    const existingByBase = new Map<string, string>();
    for (const key of Object.keys(mapping)) {
      const base = stripVs16(key);
      if (!existingByBase.has(base)) existingByBase.set(base, key);
    }
    const pickerByBase = new Map<string, string>();
    for (const item of UNICODE_EMOJIS) {
      const base = stripVs16(item.e);
      if (!pickerByBase.has(base)) pickerByBase.set(base, item.e);
    }

    const segments = segmentGraphemes(raw)
      .map((s) => s.trim())
      .filter((s) => /\p{Extended_Pictographic}/u.test(s))
      .map((s) => {
        const base = stripVs16(s);
        return existingByBase.get(base) ?? pickerByBase.get(base) ?? s;
      });

    if (segments.length === 0) {
      showStatus("Paste or enter a valid Unicode emoji (e.g. 😂, 🔥, ❤️‍🔥).");
      return;
    }
    setUnicodePicked((prev) => {
      const next = new Set(prev);
      for (const seg of segments) next.add(seg);
      return next;
    });
    setUnicodeDirectInput("");
  };

  const handleApplyUnicodePicker = async () => {
    if (!unicodeCtx || unicodePicked.size === 0) return;
    const tags = Array.from(unicodePicked);

    if (unicodeCtx.mode === "newStandard") {
      const firstNew = tags[0];
      setMapping((prev) => {
        const next = { ...prev };
        for (const std of tags) {
          if (!next[std]) next[std] = [];
        }
        return next;
      });
      setHasUnsaved(true);
      await closeTopLayer(unicodeDialogRef.current);
      if (firstNew) {
        openCustomPicker(firstNew);
      }
      return;
    }

    const { next } = addMappingEntries(mapping, tags, unicodeCtx.targetNames);
    setMapping(next);
    setHasUnsaved(true);
    await closeTopLayer(unicodeDialogRef.current);
    showStatus(
      `Mapped ${tags.join(" ")} -> ${unicodeCtx.targetNames.length} server emoji${unicodeCtx.targetNames.length > 1 ? "s" : ""}.`,
    );
  };

  const handleApplyCustomPicker = async () => {
    if (!customDialogStd) return;
    const stdKey = customDialogStd;
    const existingOrphans = (mapping[stdKey] || []).filter(
      (n) => !emojiByName.has(n),
    );
    const combined = [...Array.from(customPicked), ...existingOrphans];

    setMapping((prev) => {
      const next = { ...prev };
      if (combined.length === 0) {
        delete next[stdKey];
      } else {
        next[stdKey] = combined;
      }
      return next;
    });
    setHasUnsaved(true);
    await closeTopLayer(customDialogRef.current);
    showStatus(`Updated server emojis assigned to ${stdKey}.`);
  };

  // AI Auto-Map workflow
  const runAiAutoMap = async (forcedScope?: EmojiAiSuggestScope) => {
    if (!canManage) return;
    const scope = forcedScope || aiScope;
    let requestScope: EmojiAiSuggestScope = scope;
    let targetNames: string[] | undefined;
    let targetCount = 0;

    if (scope === "unmapped") {
      const unmappedNames = emojis
        .filter((e) => getTagsForCustom(mapping, e.name).length === 0)
        .map((e) => e.name);
      targetCount = unmappedNames.length;
      // Send exact unmapped list from local state so unsaved edits match what the server analyzes
      requestScope = "selected";
      targetNames = unmappedNames;
    } else if (scope === "selected") {
      targetNames = visibleSelectableNames.filter((name) =>
        selectedNames.has(name),
      );
      targetCount = targetNames.length;
    } else {
      targetCount = emojis.length;
    }

    if (targetCount === 0) {
      showStatus(
        scope === "selected"
          ? "Select at least one custom emoji card first, or switch scope to Unmapped or All."
          : "All server emojis are already mapped. Switch scope to 'All server emojis' to re-analyze.",
      );
      return;
    }

    setAiLoading(true);
    setActionError(null);
    setAiLoadingText(
      `Analyzing ${targetCount} server emoji${targetCount > 1 ? "s" : ""} with Gemini Vision...`,
    );

    try {
      const res = await api.suggestGuildEmojis(
        guild.id,
        requestScope,
        targetNames,
      );
      const suggestions: EmojiAiSuggestion[] = res.suggestions || [];

      if (suggestions.length === 0) {
        showStatus("AI returned no new suggestions for the selected scope.");
        return;
      }

      setAiDrafts((prev) => {
        const next = { ...prev };
        for (const s of suggestions) {
          if (s.standardEmojis.length > 0) {
            next[s.customEmojiName] = {
              emojis: [...s.standardEmojis],
              reason: s.reason,
            };
          }
        }
        return next;
      });
      setViewMode("custom");
      setActiveFilter("ai");
      showStatus(
        `AI generated suggestions for ${suggestions.length} emoji${suggestions.length > 1 ? "s" : ""}. Review and accept below.`,
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "AI auto-mapping request failed.";
      setActionError(msg);
    } finally {
      setAiLoading(false);
      setAiLoadingText("");
    }
  };

  const handleAcceptAiDraft = (customName: string) => {
    if (!canManage) return;
    const draft = aiDrafts[customName];
    if (!draft) return;
    const { next } = addMappingEntries(mapping, draft.emojis, [customName]);
    setMapping(next);
    setAiDrafts((prev) => {
      const copy = { ...prev };
      delete copy[customName];
      return copy;
    });
    setHasUnsaved(true);
    showStatus(`Applied AI tags to :${customName}:`);
  };

  const handleDismissAiDraft = (customName: string) => {
    setAiDrafts((prev) => {
      const copy = { ...prev };
      delete copy[customName];
      return copy;
    });
  };

  const handleAcceptAllAiDrafts = () => {
    if (!canManage) return;
    const entries = Object.entries(aiDrafts);
    if (entries.length === 0) return;

    let current = mapping;
    for (const [customName, draft] of entries) {
      const res = addMappingEntries(current, draft.emojis, [customName]);
      current = res.next;
    }
    setMapping(current);
    setAiDrafts({});
    setHasUnsaved(true);
    showStatus(`Accepted AI suggestions for ${entries.length} emojis.`);
  };

  const handleSaveMappings = async () => {
    if (!canManage) return;
    setSaving(true);
    setActionError(null);
    setStatusMessage(null);
    try {
      // Strip empty standard keys before persisting
      const cleanedMapping: Record<string, string[]> = {};
      for (const [std, names] of Object.entries(mapping)) {
        if (names.length > 0) {
          cleanedMapping[std] = names;
        }
      }
      const res = await api.updateGuildEmojis(guild.id, cleanedMapping);
      if (res.mapping) {
        setMapping(res.mapping);
      } else {
        setMapping(cleanedMapping);
      }
      setHasUnsaved(false);

      if (res.persistedTo === "directus") {
        showStatus(
          `Emoji mappings for '${guild.name}' persisted to Directus and live-reloaded.`,
        );
      } else {
        const modeLabel =
          res.persistedTo === "remote-config" ? "remote-config" : "local";
        showStatus(
          `Emoji mappings for '${guild.name}' updated in memory (${modeLabel} mode, not persisted to Directus).`,
        );
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to save emoji mappings.";
      setActionError(msg);
    } finally {
      setSaving(false);
    }
  };

  const filteredUnicodeEmojis = useMemo(() => {
    const q = unicodeSearch.trim().toLowerCase();
    return UNICODE_EMOJIS.filter((item) => {
      if (unicodeCategory !== "all" && item.c !== unicodeCategory) {
        return false;
      }
      if (!q) return true;
      return item.k.includes(q) || item.e.includes(q);
    });
  }, [unicodeSearch, unicodeCategory]);

  const filteredCustomPickerEmojis = useMemo(() => {
    const q = customSearch.trim().toLowerCase();
    return emojis.filter((e) => !q || e.name.toLowerCase().includes(q));
  }, [emojis, customSearch]);

  const previewNodes = useMemo(() => {
    const stripVs16 = (val: string) => val.replace(/\uFE0F/g, "");
    const normalizedMapping = new Map<string, string[]>();
    for (const [key, names] of Object.entries(mapping)) {
      const base = stripVs16(key);
      if (!normalizedMapping.has(base)) {
        normalizedMapping.set(base, names);
      }
    }

    const segments = segmentGraphemes(previewText);
    let replaceIdx = 0;
    return segments.map((segment, i) => {
      const rawCandidates =
        mapping[segment] ?? normalizedMapping.get(stripVs16(segment)) ?? [];
      const candidates = rawCandidates.filter((n) => emojiByName.has(n));
      if (candidates.length > 0) {
        const pickName =
          candidates[(rerollSeed + replaceIdx) % candidates.length];
        const info = emojiByName.get(pickName);
        replaceIdx += 1;
        if (info) {
          const formatStr = info.animated
            ? `<a:${info.name}:${info.id}>`
            : `<:${info.name}:${info.id}>`;
          return (
            <span
              key={`emoji-${i}-${info.id}`}
              className="inline-flex items-center align-middle mx-0.5"
              title={`Replaced ${segment} -> ${formatStr}`}
            >
              <img
                src={info.url}
                alt={`:${info.name}:`}
                width={24}
                height={24}
                className="w-6 h-6 object-contain inline-block align-middle"
              />
            </span>
          );
        }
      }
      return <React.Fragment key={`seg-${i}`}>{segment}</React.Fragment>;
    });
  }, [previewText, mapping, emojiByName, rerollSeed]);

  const aiDraftCount = Object.keys(aiDrafts).length;
  const standardEntries = useMemo(() => Object.entries(mapping), [mapping]);

  if (loading) {
    return (
      <div className="py-12 flex flex-col items-center justify-center gap-3 text-discord-muted">
        <Loader2 className="w-6 h-6 animate-spin text-discord-blurple" />
        <p className="text-xs">Loading server emojis for {guild.name}...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        role="alert"
        className="p-4 rounded-xl bg-discord-red/10 border border-discord-red/30 text-xs text-discord-red flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{loadError}</span>
        </div>
        <button
          type="button"
          onClick={() => void fetchGuildEmojis()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-discord-dark hover:bg-discord-light border border-white/10 text-white text-xs font-semibold transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-16">
      {/* Screen reader live region */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>

      {/* Header bar with Save & Dirty State */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">
            Server Custom Emoji Mapping
          </h4>
          <p className="text-[11px] text-discord-muted">
            Standard Unicode emojis in AI replies are replaced with mapped custom server emojis.
            {!canManage && " (Read-only mode)"}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {hasUnsaved && (
            <span className="text-[11px] font-bold text-discord-yellow">
              ● Unsaved changes
            </span>
          )}
          <button
            type="button"
            onClick={() => void fetchGuildEmojis()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-discord-dark hover:bg-discord-light border border-white/10 text-discord-text text-xs font-semibold transition-colors disabled:opacity-45"
            title="Reload emojis from server"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          {canManage && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSaveMappings()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-discord-green text-black text-xs font-bold hover:brightness-95 transition-all disabled:opacity-45 shadow-md shadow-discord-green/20"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {saving ? "Saving..." : "Save Emoji Mappings"}
            </button>
          )}
        </div>
      </div>

      {/* Coverage Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3.5 items-center p-3.5 rounded-xl bg-discord-darkest/65 border border-white/[0.06]">
        <div>
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-discord-text">
              Mapping Coverage ({stats.mapped} of {stats.total} server emojis mapped)
            </span>
            <span className="text-discord-green">{stats.pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden mt-1.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-discord-blurple to-discord-green transition-[width] duration-200 ease-out"
              style={{ width: `${stats.pct}%` }}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
          <span className="px-2.5 py-1 rounded-lg bg-discord-dark border border-white/[0.07] text-discord-text">
            {stats.standardCount} standard emoji{stats.standardCount === 1 ? "" : "s"}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-discord-dark border border-white/[0.07] text-discord-text">
            {stats.unmapped} unmapped
          </span>
        </div>
      </div>

      {/* Status, Error, Orphan, AI Draft & Progress Banners */}
      {statusMessage && (
        <div
          role="status"
          className="p-3 rounded-xl bg-discord-green/10 border border-discord-green/35 text-xs text-discord-green flex items-center gap-2"
        >
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-discord-red/10 border border-discord-red/35 text-xs text-discord-red flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {orphanNames.length > 0 && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-discord-yellow/10 border border-discord-yellow/35 text-xs text-discord-yellow flex flex-wrap items-center justify-between gap-2.5"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              <strong>
                {orphanNames.length} deleted Discord emoji
                {orphanNames.length > 1 ? "s" : ""}
              </strong>{" "}
              still referenced in mappings (
              <code className="font-mono text-[11px]">{orphanNames.join(", ")}</code>
              ). At runtime these will be skipped safely.
            </span>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={handleCleanOrphans}
              className="px-2.5 py-1 rounded-lg bg-discord-red/15 hover:bg-discord-red/25 border border-discord-red/40 text-red-200 text-[11px] font-semibold transition-colors shrink-0"
            >
              Clean Up Orphaned
            </button>
          )}
        </div>
      )}

      {aiDraftCount > 0 && (
        <div className="p-3 rounded-xl bg-purple-500/15 border border-purple-500/40 text-xs text-purple-100 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-300 shrink-0" />
            <span>
              <strong>
                AI suggested mappings for {aiDraftCount} emoji
                {aiDraftCount > 1 ? "s" : ""}.
              </strong>{" "}
              Review the draft boxes below, or apply all at once.
            </span>
          </div>
          {canManage && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAcceptAllAiDrafts}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-discord-green text-black text-[11px] font-bold hover:brightness-95 transition-all"
              >
                <Check className="w-3.5 h-3.5" />
                Accept All ({aiDraftCount})
              </button>
              <button
                type="button"
                onClick={() => setAiDrafts({})}
                className="px-2.5 py-1 rounded-lg bg-discord-dark hover:bg-discord-light border border-white/10 text-white text-[11px] font-semibold transition-colors"
              >
                Dismiss All
              </button>
            </div>
          )}
        </div>
      )}

      {aiLoading && (
        <div
          role="status"
          aria-live="polite"
          className="p-3.5 rounded-xl bg-discord-darkest/90 border border-discord-blurple/50 space-y-2"
        >
          <div className="flex items-center justify-between text-xs font-bold text-white">
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
              {aiLoadingText || "Running Gemini Vision analysis..."}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
            <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-discord-blurple via-discord-fuchsia to-discord-green animate-pulse" />
          </div>
        </div>
      )}

      {/* Toolbar: Dual View Toggle + AI Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Emoji mapping view mode"
          className="inline-flex bg-discord-darkest p-1 rounded-xl border border-white/[0.08]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "custom"}
            onClick={() => setViewMode("custom")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              viewMode === "custom"
                ? "bg-discord-blurple text-white"
                : "text-discord-muted hover:text-white"
            }`}
          >
            By Custom Emoji
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "standard"}
            onClick={() => setViewMode("standard")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              viewMode === "standard"
                ? "bg-discord-blurple text-white"
                : "text-discord-muted hover:text-white"
            }`}
          >
            By Standard Emoji
          </button>
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="ai-scope-select" className="sr-only">
              AI Auto-Map scope
            </label>
            <select
              id="ai-scope-select"
              value={aiScope}
              onChange={(e) => setAiScope(e.target.value as EmojiAiSuggestScope)}
              className="bg-discord-darkest border border-white/15 hover:border-white/25 text-white rounded-lg px-2.5 py-1.5 text-xs"
            >
              <option value="unmapped">Scope: Unmapped only</option>
              <option value="selected">
                Scope: Selected ({selectedNames.size})
              </option>
              <option value="all">Scope: All server emojis</option>
            </select>
            <button
              type="button"
              disabled={aiLoading || emojis.length === 0}
              onClick={() => void runAiAutoMap()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-br from-discord-blurple to-purple-600 border border-white/20 text-white text-xs font-bold shadow-md shadow-purple-600/30 hover:brightness-110 transition-all disabled:opacity-45"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Auto-Map with AI
            </button>
          </div>
        )}
      </div>

      {/* View 1: By Custom Emoji */}
      {viewMode === "custom" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <div
                className="flex flex-wrap gap-1.5"
                role="group"
                aria-label="Filter emojis"
              >
                {(
                  [
                    { id: "all", label: "All" },
                    { id: "unmapped", label: "Unmapped" },
                    { id: "mapped", label: "Mapped" },
                    { id: "ai", label: "AI Suggested" },
                    { id: "deleted", label: "Deleted" },
                  ] as const
                ).map((f) => {
                  const isActive = activeFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setActiveFilter(f.id)}
                      className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-colors ${
                        isActive
                          ? "bg-discord-blurple/25 border-discord-blurple text-white"
                          : "bg-discord-darkest border-white/10 text-discord-muted hover:text-white hover:border-white/25"
                      }`}
                    >
                      {f.label}
                      <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-white/10 text-[10px]">
                        {filterCounts[f.id]}
                      </span>
                    </button>
                  );
                })}
              </div>

              {canManage && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedNames((prev) => {
                        const next = new Set(prev);
                        for (const n of visibleSelectableNames) next.add(n);
                        return next;
                      });
                      announce(
                        `Selected ${visibleSelectableNames.length} visible emojis.`,
                      );
                    }}
                    className="px-2 py-1 rounded-lg text-[11px] font-semibold text-discord-muted hover:text-white hover:bg-white/[0.06] transition-colors"
                  >
                    Select Visible
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const unmapped = emojis
                        .filter((e) => getTagsForCustom(mapping, e.name).length === 0)
                        .map((e) => e.name);
                      setSelectedNames(new Set(unmapped));
                      announce(`Selected ${unmapped.length} unmapped emojis.`);
                    }}
                    className="px-2 py-1 rounded-lg text-[11px] font-semibold text-discord-muted hover:text-white hover:bg-white/[0.06] transition-colors"
                  >
                    Select Unmapped
                  </button>
                </div>
              )}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-discord-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <label htmlFor="custom-emoji-search" className="sr-only">
                Search custom emojis
              </label>
              <input
                id="custom-emoji-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search custom emoji or tag..."
                className="w-56 bg-discord-darkest border border-white/15 hover:border-white/25 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-discord-muted"
              />
            </div>
          </div>

          {emojis.length === 0 && orphanNames.length === 0 ? (
            <div className="p-8 rounded-xl bg-discord-darkest/50 border border-white/[0.06] text-center text-xs text-discord-muted">
              This Discord server does not have any custom emojis yet.
            </div>
          ) : filteredCustomItems.length === 0 ? (
            <div className="p-8 rounded-xl bg-discord-darkest/50 border border-white/[0.06] text-center text-xs text-discord-muted">
              No emojis match the current filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredCustomItems.map((item) => {
                const tags = getTagsForCustom(mapping, item.name);
                const draft = aiDrafts[item.name];
                const isSelected = selectedNames.has(item.name);
                const selIdx = visibleSelectableNames.indexOf(item.name);

                let cardBorderClass = "border-white/[0.07] bg-discord-darkest/75";
                if (item.deleted) {
                  cardBorderClass = "border-discord-red/50 bg-discord-red/[0.08]";
                } else if (isSelected) {
                  cardBorderClass =
                    "border-discord-blurple bg-discord-blurple/[0.13] ring-1 ring-discord-blurple/45 shadow-lg shadow-discord-blurple/15";
                } else if (draft) {
                  cardBorderClass = "border-purple-500/65 bg-discord-darkest/75";
                }

                return (
                  <article
                    key={item.deleted ? `orphan-${item.name}` : item.id}
                    className={`rounded-xl border-[1.5px] p-3 flex flex-col gap-2.5 transition-colors hover:border-white/20 ${cardBorderClass}`}
                  >
                    <div
                      onClick={(e) => {
                        if (item.deleted || !canManage) return;
                        if ((e.target as HTMLElement).matches("input[type=checkbox]")) {
                          return;
                        }
                        toggleCardSelection(item.name, selIdx, e.shiftKey);
                      }}
                      className={`flex items-center gap-2.5 select-none ${
                        item.deleted || !canManage ? "cursor-default" : "cursor-pointer"
                      }`}
                    >
                      {!item.deleted && canManage && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          aria-label={`Select ${item.name}`}
                          onChange={() => {}}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCardSelection(item.name, selIdx, e.shiftKey);
                          }}
                          className="w-4 h-4 accent-discord-blurple cursor-pointer shrink-0"
                        />
                      )}

                      <div className="w-11 h-11 rounded-xl bg-discord-dark grid place-items-center shrink-0 relative overflow-hidden">
                        {item.deleted ? (
                          <span className="text-lg font-black text-red-300">?</span>
                        ) : (
                          <img
                            src={item.url}
                            alt={item.name}
                            width={36}
                            height={36}
                            loading="lazy"
                            className="w-9 h-9 object-contain"
                          />
                        )}
                        {item.animated && (
                          <span className="absolute bottom-0.5 right-0.5 text-[8px] font-extrabold px-1 py-px rounded bg-discord-blurple/90 text-white tracking-wider">
                            GIF
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-xs font-bold text-white break-all">
                          :{item.name}:
                        </div>
                        {item.deleted ? (
                          <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-px rounded bg-discord-red/20 text-red-200 border border-discord-red/40">
                            Deleted on Discord
                          </span>
                        ) : (
                          <div className="text-[10px] text-discord-muted">
                            {item.animated ? "Animated" : "Static"} · #{item.id}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Explicit direction: Replaces: [standard emoji chips] */}
                    <div className="flex flex-wrap items-center gap-1.5 min-h-[28px]">
                      <span className="text-[10px] text-discord-muted font-semibold mr-0.5">
                        Replaces:
                      </span>
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-discord-dark border border-white/10 text-sm"
                        >
                          <span>{tag}</span>
                          {canManage && (
                            <button
                              type="button"
                              onClick={() => handleRemoveTag(tag, item.name)}
                              aria-label={`Remove ${tag} from ${item.name}`}
                              className="text-discord-muted hover:text-red-300 hover:bg-discord-red/15 rounded px-0.5 text-xs leading-none"
                            >
                              ×
                            </button>
                          )}
                        </span>
                      ))}
                      {!item.deleted && canManage && (
                        <button
                          type="button"
                          onClick={() =>
                            openUnicodePicker({
                              mode: "single",
                              targetNames: [item.name],
                            })
                          }
                          className="px-2 py-0.5 rounded-lg border border-dashed border-white/25 text-discord-muted hover:text-white hover:border-discord-blurple hover:bg-discord-blurple/15 text-[11px] font-semibold transition-colors"
                        >
                          + Standard
                        </button>
                      )}
                    </div>

                    {/* Pending AI Draft Box */}
                    {draft && (
                      <div className="rounded-lg bg-purple-500/15 border border-dashed border-purple-500/55 p-2 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-[10px] font-bold text-purple-200 uppercase tracking-wider">
                          <span className="inline-flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            AI Suggestion
                          </span>
                          <span className="text-sm normal-case tracking-normal">
                            {draft.emojis.join(" ")}
                          </span>
                        </div>
                        <p className="text-[11px] text-purple-100/90 leading-snug">
                          {draft.reason}
                        </p>
                        {canManage && (
                          <div className="flex items-center gap-1.5 pt-0.5">
                            <button
                              type="button"
                              onClick={() => handleAcceptAiDraft(item.name)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-discord-green text-black text-[11px] font-bold hover:brightness-95 transition-all"
                            >
                              <Check className="w-3 h-3" />
                              Accept
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDismissAiDraft(item.name)}
                              className="px-2 py-1 rounded-md bg-discord-dark hover:bg-discord-light border border-white/10 text-white text-[11px] font-semibold transition-colors"
                            >
                              Dismiss
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* View 2: By Standard Emoji */}
      {viewMode === "standard" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <p className="text-xs text-discord-muted">
              When the bot outputs a standard Unicode emoji, it randomly picks one of the mapped custom server emojis.
            </p>
            {canManage && (
              <button
                type="button"
                onClick={() =>
                  openUnicodePicker({ mode: "newStandard", targetNames: [] })
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-discord-blurple hover:bg-discord-blurple-hover text-white text-xs font-semibold transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Standard Emoji
              </button>
            )}
          </div>

          {standardEntries.length === 0 ? (
            <div className="p-8 rounded-xl bg-discord-darkest/50 border border-white/[0.06] text-center text-xs text-discord-muted">
              No standard emojis mapped yet. Click &quot;+ Add Standard Emoji&quot; or run Auto-Map with AI.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {standardEntries.map(([std, customNames]) => (
                <div
                  key={std}
                  className="flex flex-wrap items-center gap-3.5 p-3 rounded-xl bg-discord-darkest/75 border border-white/[0.08]"
                >
                  <div
                    className="w-11 h-11 rounded-xl bg-discord-dark grid place-items-center text-2xl shrink-0"
                    aria-label={`Standard emoji ${std}`}
                  >
                    {std}
                  </div>
                  <span
                    aria-hidden="true"
                    className="text-discord-muted font-bold text-sm"
                  >
                    →
                  </span>
                  <div className="flex-1 flex flex-wrap items-center gap-2 min-w-[200px]">
                    {customNames.map((name) => {
                      const info = emojiByName.get(name);
                      if (!info) {
                        return (
                          <span
                            key={name}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-discord-red/15 border border-discord-red/50 text-red-200 text-xs font-mono"
                          >
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>:{name}: (deleted)</span>
                            {canManage && (
                              <button
                                type="button"
                                onClick={() => handleRemoveTag(std, name)}
                                aria-label={`Remove deleted ${name}`}
                                className="text-red-200 hover:text-white ml-0.5"
                              >
                                ×
                              </button>
                            )}
                          </span>
                        );
                      }

                      return (
                        <span
                          key={name}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-discord-dark border border-white/10 text-discord-text text-xs font-mono"
                        >
                          <img
                            src={info.url}
                            alt={name}
                            width={20}
                            height={20}
                            className="w-5 h-5 object-contain"
                          />
                          <span>:{name}:</span>
                          {info.animated && (
                            <span className="text-[10px] font-bold text-discord-blurple">
                              GIF
                            </span>
                          )}
                          {canManage && (
                            <button
                              type="button"
                              onClick={() => handleRemoveTag(std, name)}
                              aria-label={`Remove ${name} from ${std}`}
                              className="text-discord-muted hover:text-red-300 ml-0.5"
                            >
                              ×
                            </button>
                          )}
                        </span>
                      );
                    })}

                    {canManage && (
                      <button
                        type="button"
                        onClick={() => openCustomPicker(std)}
                        className="px-2.5 py-1 rounded-lg border border-dashed border-white/25 text-discord-muted hover:text-white hover:border-discord-blurple hover:bg-discord-blurple/15 text-[11px] font-semibold transition-colors"
                      >
                        + Assign Server Emojis
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Live Bot Message Preview */}
      <section
        aria-labelledby={previewHeadingId}
        className="rounded-xl bg-discord-darkest/80 border border-white/[0.08] p-4 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3
            id={previewHeadingId}
            className="text-xs font-bold uppercase tracking-wider text-discord-muted"
          >
            Live Bot Message Preview
          </h3>
          <button
            type="button"
            onClick={() => setRerollSeed((s) => s + 1)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-discord-dark hover:bg-discord-light border border-white/10 text-white text-[11px] font-semibold transition-colors"
          >
            <Dices className="w-3.5 h-3.5" />
            Re-roll Random
          </button>
        </div>

        <label htmlFor="emoji-preview-input" className="sr-only">
          Sample message to test emoji replacement
        </label>
        <input
          id="emoji-preview-input"
          type="text"
          value={previewText}
          onChange={(e) => setPreviewText(e.target.value)}
          placeholder="Type a message with standard emojis to test replacement..."
          className="w-full bg-discord-darkest border border-white/15 hover:border-white/25 rounded-lg px-3 py-2 text-xs text-white placeholder:text-discord-muted"
        />

        <div className="p-3 rounded-xl bg-discord-dark flex items-start gap-3">
          <div
            aria-hidden="true"
            className="w-9 h-9 rounded-full bg-discord-blurple grid place-items-center font-extrabold text-xs text-white shrink-0"
          >
            AI
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs font-bold text-white">ChatBot</span>
              <span className="text-[9px] font-extrabold px-1.5 py-px rounded bg-discord-blurple text-white">
                APP
              </span>
              <span className="text-[11px] text-discord-muted">Today</span>
            </div>
            <div className="text-sm text-discord-text leading-relaxed break-words">
              {previewText ? (
                previewNodes
              ) : (
                <span className="text-discord-muted text-xs">
                  Type above to preview...
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Sticky Floating Bulk Action Bar */}
      {canManage && viewMode === "custom" && selectedNames.size > 0 && (
        <div
          role="region"
          aria-label="Bulk emoji mapping actions"
          className="fixed left-1/2 bottom-5 -translate-x-1/2 z-40 w-[min(940px,calc(100vw-32px))] px-3.5 py-2.5 rounded-2xl bg-discord-darkest/95 backdrop-blur-md border border-discord-blurple/55 shadow-2xl flex flex-wrap items-center justify-between gap-2.5"
        >
          <div className="flex items-center gap-2.5">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-white">
              <span className="px-2 py-0.5 rounded-full bg-discord-blurple text-white text-[11px] font-extrabold">
                {selectedNames.size}
              </span>
              <span>selected</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedNames(new Set());
                setLastClickedIndex(null);
              }}
              className="px-2 py-1 rounded-lg text-[11px] font-semibold text-discord-muted hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              Clear
            </button>
          </div>

          <div className="flex items-center gap-1.5 min-w-0 max-w-full overflow-hidden">
            <span className="text-[11px] text-discord-muted whitespace-nowrap">
              Replaces:
            </span>
            <div
              className="flex items-center gap-1 overflow-x-auto scroller py-0.5"
              aria-label="One-click map standard emoji to selected server emojis"
            >
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleQuickTag(emoji)}
                  title={`Tag all selected with ${emoji}`}
                  aria-label={`Tag all selected emojis with ${emoji}`}
                  className="px-1.5 py-1 rounded-lg bg-discord-dark hover:bg-discord-light border border-white/10 hover:border-discord-blurple text-base leading-none shrink-0 transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                openUnicodePicker({
                  mode: "bulk",
                  targetNames: Array.from(selectedNames),
                })
              }
              className="px-2.5 py-1.5 rounded-lg bg-discord-blurple hover:bg-discord-blurple-hover text-white text-[11px] font-semibold transition-colors"
            >
              + Pick Emojis...
            </button>
            <button
              type="button"
              disabled={aiLoading}
              onClick={() => void runAiAutoMap("selected")}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gradient-to-br from-discord-blurple to-purple-600 text-white text-[11px] font-bold hover:brightness-110 transition-all disabled:opacity-45"
            >
              <Sparkles className="w-3 h-3" />
              AI Map
            </button>
            <button
              type="button"
              onClick={handleBulkClearTags}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-discord-red/15 hover:bg-discord-red/25 border border-discord-red/40 text-red-200 text-[11px] font-semibold transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Clear Tags
            </button>
          </div>
        </div>
      )}

      {/* Native <dialog> for Multi-Select Unicode Emoji Picker */}
      <dialog
        ref={unicodeDialogRef}
        className="emoji-dialog"
        aria-labelledby={unicodeDialogId}
        {...({ closedby: "any" } as React.HTMLAttributes<HTMLDialogElement>)}
      >
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2.5">
            <div>
              <h2 id={unicodeDialogId} className="text-sm font-bold text-white">
                {unicodeCtx?.mode === "bulk"
                  ? `Bulk Tag ${unicodeCtx.targetNames.length} Selected Emojis`
                  : unicodeCtx?.mode === "single"
                    ? `Tag :${unicodeCtx.targetNames[0]}:`
                    : "Add Standard Emoji Group"}
              </h2>
              <p className="text-[11px] text-discord-muted mt-0.5">
                {unicodeCtx?.mode === "bulk"
                  ? "Select one or more standard Unicode emojis to tag onto all selected server emojis."
                  : unicodeCtx?.mode === "single"
                    ? "Click one or more standard emojis below to add them at once."
                    : "Pick one or more standard Unicode emojis to add to your mapping list."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void closeTopLayer(unicodeDialogRef.current)}
              aria-label="Close dialog"
              className="p-1.5 rounded-lg bg-discord-dark hover:bg-discord-light border border-white/10 text-discord-muted hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Multi-select tag queue bar */}
          <div className="flex flex-wrap items-center gap-1.5 min-h-[34px] p-2 rounded-xl bg-discord-blurple/10 border border-discord-blurple/30 text-xs">
            {unicodePicked.size === 0 ? (
              <span className="text-[11px] text-discord-muted">
                Click emojis below or paste one to queue multiple tags...
              </span>
            ) : (
              Array.from(unicodePicked).map((e) => (
                <span
                  key={e}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-discord-dark border border-white/10 text-sm"
                >
                  <span>{e}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${e}`}
                    onClick={() =>
                      setUnicodePicked((prev) => {
                        const next = new Set(prev);
                        next.delete(e);
                        return next;
                      })
                    }
                    className="text-discord-muted hover:text-red-300 text-xs leading-none"
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>

          {/* Search & category tabs */}
          <div className="space-y-2">
            <label htmlFor="unicode-picker-search" className="sr-only">
              Search standard emojis
            </label>
            <input
              ref={unicodeSearchRef}
              id="unicode-picker-search"
              type="search"
              value={unicodeSearch}
              onChange={(e) => setUnicodeSearch(e.target.value)}
              placeholder="Search (e.g. laugh, fire, heart, skull, sus)..."
              className="w-full bg-discord-darkest border border-white/15 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-discord-muted"
            />
            <div className="flex flex-wrap gap-1">
              {UNICODE_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setUnicodeCategory(cat.id)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors ${
                    unicodeCategory === cat.id
                      ? "bg-discord-blurple text-white"
                      : "bg-discord-darkest text-discord-muted hover:text-white"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Unicode emoji grid */}
          <div
            role="group"
            aria-label="Unicode emoji choices"
            className="grid grid-cols-8 gap-1 max-h-56 overflow-y-auto scroller p-1.5 bg-discord-darkest rounded-xl border border-white/[0.06]"
          >
            {filteredUnicodeEmojis.map((item) => {
              const picked = unicodePicked.has(item.e);
              return (
                <button
                  key={item.e}
                  type="button"
                  title={item.k}
                  aria-pressed={picked}
                  onClick={() =>
                    setUnicodePicked((prev) => {
                      const next = new Set(prev);
                      if (next.has(item.e)) next.delete(item.e);
                      else next.add(item.e);
                      return next;
                    })
                  }
                  className={`text-xl p-1.5 rounded-lg border-[1.5px] transition-colors ${
                    picked
                      ? "bg-discord-blurple/30 border-discord-blurple"
                      : "border-transparent hover:bg-discord-light"
                  }`}
                >
                  {item.e}
                </button>
              );
            })}
            {filteredUnicodeEmojis.length === 0 && (
              <div className="col-span-8 py-6 text-center text-xs text-discord-muted">
                No matching emojis. Paste any Unicode emoji below.
              </div>
            )}
          </div>

          {/* Direct paste/type input */}
          <div className="flex items-center gap-2">
            <label htmlFor="unicode-direct-input" className="sr-only">
              Paste or type any Unicode emoji
            </label>
            <input
              id="unicode-direct-input"
              type="text"
              value={unicodeDirectInput}
              onChange={(e) => setUnicodeDirectInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleQueueDirectUnicode();
                }
              }}
              placeholder="Or paste/type any Unicode emoji (e.g. ❤️‍🔥)"
              className="flex-1 bg-discord-darkest border border-white/15 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-discord-muted"
            />
            <button
              type="button"
              onClick={handleQueueDirectUnicode}
              className="px-2.5 py-1.5 rounded-lg bg-discord-dark hover:bg-discord-light border border-white/10 text-white text-xs font-semibold transition-colors"
            >
              + Queue
            </button>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.07]">
            <button
              type="button"
              onClick={() => void closeTopLayer(unicodeDialogRef.current)}
              className="px-3 py-1.5 rounded-lg bg-discord-dark hover:bg-discord-light border border-white/10 text-white text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={unicodePicked.size === 0}
              onClick={() => void handleApplyUnicodePicker()}
              className="px-3 py-1.5 rounded-lg bg-discord-blurple hover:bg-discord-blurple-hover text-white text-xs font-semibold transition-colors disabled:opacity-45"
            >
              {unicodeCtx?.mode === "bulk"
                ? `Apply to ${unicodeCtx.targetNames.length} Emojis`
                : unicodeCtx?.mode === "newStandard"
                  ? "Add Selected"
                  : "Apply Tags"}
            </button>
          </div>
        </div>
      </dialog>

      {/* Native <dialog> for Multi-Select Custom Server Emojis (Standard View) */}
      <dialog
        ref={customDialogRef}
        className="emoji-dialog"
        aria-labelledby={customDialogId}
        {...({ closedby: "any" } as React.HTMLAttributes<HTMLDialogElement>)}
      >
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2.5">
            <div>
              <h2 id={customDialogId} className="text-sm font-bold text-white">
                Assign Server Emojis{customDialogStd ? ` for ${customDialogStd}` : ""}
              </h2>
              <p className="text-[11px] text-discord-muted mt-0.5">
                Click multiple server emojis to toggle them in this mapping pool.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void closeTopLayer(customDialogRef.current)}
              aria-label="Close dialog"
              className="p-1.5 rounded-lg bg-discord-dark hover:bg-discord-light border border-white/10 text-discord-muted hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <label htmlFor="custom-picker-search" className="sr-only">
            Filter server emojis
          </label>
          <input
            ref={customSearchRef}
            id="custom-picker-search"
            type="search"
            value={customSearch}
            onChange={(e) => setCustomSearch(e.target.value)}
            placeholder="Filter server emojis by name..."
            className="w-full bg-discord-darkest border border-white/15 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-discord-muted"
          />

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto scroller p-1.5 bg-discord-darkest rounded-xl border border-white/[0.06]">
            {filteredCustomPickerEmojis.map((e) => {
              const picked = customPicked.has(e.name);
              return (
                <button
                  key={e.id}
                  type="button"
                  aria-pressed={picked}
                  onClick={() =>
                    setCustomPicked((prev) => {
                      const next = new Set(prev);
                      if (next.has(e.name)) next.delete(e.name);
                      else next.add(e.name);
                      return next;
                    })
                  }
                  className={`flex items-center gap-2 p-2 rounded-lg border-[1.5px] text-left font-mono text-[11px] transition-colors ${
                    picked
                      ? "border-discord-blurple bg-discord-blurple/25 text-white"
                      : "border-white/[0.08] bg-discord-dark text-discord-text hover:border-white/25"
                  }`}
                >
                  <img
                    src={e.url}
                    alt={e.name}
                    width={24}
                    height={24}
                    className="w-6 h-6 object-contain shrink-0"
                  />
                  <span className="truncate">:{e.name}:</span>
                </button>
              );
            })}
            {filteredCustomPickerEmojis.length === 0 && (
              <div className="col-span-full py-6 text-center text-xs text-discord-muted">
                No server emojis match your search.
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.07]">
            <button
              type="button"
              onClick={() => void closeTopLayer(customDialogRef.current)}
              className="px-3 py-1.5 rounded-lg bg-discord-dark hover:bg-discord-light border border-white/10 text-white text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleApplyCustomPicker()}
              className="px-3 py-1.5 rounded-lg bg-discord-blurple hover:bg-discord-blurple-hover text-white text-xs font-semibold transition-colors"
            >
              Save Assignments
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
};
