import type { BotGuildConfig } from "../../config/types";
import { RoastIntensity, type SupportedRoastLocale } from "./types";

/**
 * Resolves the appropriate roast locale according to the priority cascade in PRD 3.6:
 * 1. User client locale (`interaction.locale`)
 * 2. Guild locale (`interaction.guildLocale`)
 * 3. Guild Config Override (`guildConfig.roast?.defaultLocale`)
 * 4. Default fallback: "vi"
 */
export function resolveRoastLocale(
  interaction?: { locale?: string | null; guildLocale?: string | null },
  guildConfig?: BotGuildConfig,
): SupportedRoastLocale {
  const userLocale = interaction?.locale?.toLowerCase();
  if (userLocale) {
    if (userLocale.startsWith("vi")) {
      return "vi";
    }
    if (userLocale.startsWith("en")) {
      return "en-US";
    }
  }

  const guildLocale = interaction?.guildLocale?.toLowerCase();
  if (guildLocale) {
    if (guildLocale.startsWith("en")) {
      return "en-US";
    }
    if (guildLocale.startsWith("vi")) {
      return "vi";
    }
  }

  const configDefault = guildConfig?.roast?.defaultLocale;
  if (configDefault === "en-US" || configDefault === "vi") {
    return configDefault;
  }

  return "vi";
}

/**
 * Formats seconds into human-readable duration according to locale.
 */
export function formatDuration(
  seconds: number,
  locale: SupportedRoastLocale,
): string {
  const rounded = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainingSecs = rounded % 60;

  if (locale === "vi") {
    if (minutes > 0) {
      return remainingSecs > 0
        ? `${minutes}p ${remainingSecs}s`
        : `${minutes}p`;
    }
    return `${remainingSecs}s`;
  }

  if (minutes > 0) {
    return remainingSecs > 0 ? `${minutes}m ${remainingSecs}s` : `${minutes}m`;
  }
  return `${remainingSecs}s`;
}

export const VIETNAMESE_SYSTEM_INSTRUCTION = `Bạn là Slavegon, trợ lý Discord bot thông minh, sắc sảo và hay cà khịa của máy chủ này.
Nhiệm vụ của bạn là viết một câu "chan" (roast/châm chọc hài hước) nhắm vào một thành viên cụ thể trong server.

Nguyên tắc cốt lõi:
1. Ngôn ngữ & Văn phong: Sử dụng tiếng Việt tự nhiên, kết hợp khéo léo tiếng lóng ("chan", "cà khịa", "bóc mẽ", "chém gió", văn phong Gen Z / gaming dí dỏm).
2. Độ dài & Súc tích: Chỉ viết từ 1 đến 3 câu ngắn gọn, đắt giá (tối đa 60 từ). Tuyệt đối không viết đoạn văn dài dòng.
3. Độ xác thực (Grounding): Tận dụng thông tin ngữ cảnh được cung cấp (tin nhắn gần đây, vai trò, hoạt động chơi game, chủ đề yêu cầu) để câu chan mang tính cá nhân hóa cao.
4. Định dạng đầu ra: Chỉ trả về nội dung câu chan. Không thêm lời dẫn (ví dụ: 'Đây là câu chan dành cho bạn:'), không để trong dấu ngoặc kép, không xin lỗi.
5. Ranh giới an toàn: Tuyệt đối tuân thủ không chửi thề thô tục, không xúc phạm danh dự cá nhân, không phân biệt vùng miền, không body shaming.`;

export const ENGLISH_SYSTEM_INSTRUCTION = `You are Slavegon, the witty and sarcastic Discord bot assistant of this server.
Your task is to write a comedy roast targeting a specific server member.

Core Guidelines:
1. Comedic Style: Think roast comedy, stand-up bantering, and clever wordplay. Be punchy, observant, and genuinely funny.
2. Directness: Deliver 1 to 3 punchy sentences (maximum 60 words). Never write long essays or rambling paragraphs.
3. Grounding: Incorporate the provided ammunition (recent messages, activity, roles, or topic) naturally so the roast feels tailored.
4. Output Format: Return only the roast text. Do not add conversational intros (like 'Here is your roast:'), quotes, or apologies.
5. Safety Boundaries: Strictly adhere to non-harassment rules: no hate speech, no vulgar slurs, no body shaming.`;

export const INTENSITY_INSTRUCTIONS: Record<
  SupportedRoastLocale,
  Record<RoastIntensity, string>
> = {
  vi: {
    [RoastIntensity.Mild]:
      "Mức độ: Nhẹ nhàng. Trêu đùa nhẹ nhàng, thân thiện, vô hại.",
    [RoastIntensity.Medium]:
      "Mức độ: Vừa phải. Cà khịa phong cách stand-up comedy, mỉa mai dí dỏm vào thói quen chơi game, coding.",
    [RoastIntensity.Savage]:
      'Mức độ: Cực gắt. "Chan" cực gắt, đâm trúng tim đen nhưng văn minh và chuẩn mực an toàn, không vi phạm nguyên tắc cấm.',
  },
  "en-US": {
    [RoastIntensity.Mild]:
      "Intensity: Mild. Gentle ribbing, wholesome teasing, friendly banter.",
    [RoastIntensity.Medium]:
      "Intensity: Medium. Classic stand-up roast style, sarcastic, witty burns targeting habits, gameplay, or coding quirks.",
    [RoastIntensity.Savage]:
      "Intensity: Savage. Sharp, devastating comedy club burns. High bite, maximum comedic effect, while respecting safety guardrails.",
  },
};

export const INTENSITY_LABELS: Record<
  SupportedRoastLocale,
  Record<RoastIntensity, string>
> = {
  vi: {
    [RoastIntensity.Mild]: "Nhẹ nhàng",
    [RoastIntensity.Medium]: "Vừa phải",
    [RoastIntensity.Savage]: "Cực gắt",
  },
  "en-US": {
    [RoastIntensity.Mild]: "Mild",
    [RoastIntensity.Medium]: "Medium",
    [RoastIntensity.Savage]: "Savage",
  },
};

export const ROAST_MESSAGES = {
  vi: {
    header: (targetId: string) => `🔥 **Slavegon chan <@${targetId}>**`,
    footer: (callerId: string, intensity: string, topic?: string | null) => {
      const topicPart = topic ? ` · Chủ đề: ${topic}` : "";
      return `*(Yêu cầu bởi <@${callerId}> · Mức độ: ${intensity}${topicPart})*`;
    },
    buttonBurn: (count: number) => `🔥 Cay!${count > 0 ? ` (${count})` : ""}`,
    buttonLaugh: (count: number) =>
      `💀 Chết cười${count > 0 ? ` (${count})` : ""}`,
    buttonCounter: () => "🔄 Chan lại",
    targetOptedOut: (targetId: string) =>
      `<@${targetId}> đã từ chối tham gia bị chan. Hãy tôn trọng sự riêng tư của họ!`,
    targetShielded: (targetId: string, time: string) =>
      `<@${targetId}> vừa mới bị chan và đang được bật khiên bảo vệ (hết hạn sau ${time}). Tha cho người ta thở chút đi!`,
    callerCooldown: (time: string) =>
      `Bạn đang gọi lệnh quá nhanh! Vui lòng chờ ${time} trước khi tiếp tục chan người khác.`,
    channelDisabled: () =>
      "Tính năng chan không được phép dùng trong kênh này.",
    featureDisabled: () => "Tính năng chan đang bị tắt trên máy chủ này.",
    counterOnlyTarget: (targetId: string) =>
      `Chỉ <@${targetId}> mới có quyền chan lại!`,
    counterChainLimit: () => "Đã đạt giới hạn chan lại cho lượt này!",
    selfRoastFallback: (callerId: string) =>
      `Định chan <@${callerId}> một bài, nhưng nhìn chuỗi thua rank gần đây của bạn thì cuộc đời đã chan bạn trước khi chúng tôi kịp làm rồi. Cố gắng lên nhé.`,
    botRoastFallback: (callerId: string) =>
      `Tính chan bot hả <@${callerId}>? Bạn đang cố khịa một AI có năng lực tính toán vô tận trong khi chính bạn còn quên cả mật khẩu Discord của mình đấy. Ngồi xuống uống miếng nước đi.`,
    optOutSuccess: () =>
      "Bạn đã từ chối tham gia bị chan thành công. Từ giờ không ai có thể dùng bot để chan bạn nữa!",
    optInSuccess: () =>
      "Bạn đã bật lại khả năng tham gia bị chan. Sẵn sàng nhận đòn rồi chứ?",
    statusDisplay: (optStatus: string, shieldStatus: string) =>
      `Trạng thái tham gia: **${optStatus}** | Khiên bảo vệ: **${shieldStatus}**`,
    statusOptedIn: "Đang tham gia",
    statusOptedOut: "Đã từ chối",
    statusShieldActive: (time: string) => `Đang bật (hết hạn sau ${time})`,
    statusShieldInactive: "Không kích hoạt",
    errorGeneric: () =>
      "Đã có lỗi xảy ra trong quá trình tạo câu chan. Vui lòng thử lại sau!",
  },
  "en-US": {
    header: (targetId: string) => `🔥 **Slavegon's Roast on <@${targetId}>**`,
    footer: (callerId: string, intensity: string, topic?: string | null) => {
      const topicPart = topic ? ` · Topic: ${topic}` : "";
      return `*(Requested by <@${callerId}> · Intensity: ${intensity}${topicPart})*`;
    },
    buttonBurn: (count: number) => `🔥 Oof!${count > 0 ? ` (${count})` : ""}`,
    buttonLaugh: (count: number) => `💀 Dead${count > 0 ? ` (${count})` : ""}`,
    buttonCounter: () => "🔄 Counter-Roast",
    targetOptedOut: (targetId: string) =>
      `<@${targetId}> has opted out of roasts. Respect their preference!`,
    targetShielded: (targetId: string, time: string) =>
      `<@${targetId}> was recently roasted and is currently shielded (cooldown expires in ${time}). Give them a breather!`,
    callerCooldown: (time: string) =>
      `You are invoking commands too quickly! Please wait ${time} before roasting someone again.`,
    channelDisabled: () => "Roast feature is not allowed in this channel.",
    featureDisabled: () => "Roast feature is disabled on this server.",
    counterOnlyTarget: (targetId: string) =>
      `Only <@${targetId}> can counter-roast!`,
    counterChainLimit: () =>
      "Maximum counter-roast limit reached for this thread!",
    selfRoastFallback: (callerId: string) =>
      `We were going to roast you, <@${callerId}>, but looking at your recent match record, it seems life already beat us to it. Stay strong.`,
    botRoastFallback: (callerId: string) =>
      `Nice try, <@${callerId}>. You're trying to out-roast an AI with infinite compute while you struggle to remember your own Discord password. Sit down.`,
    optOutSuccess: () =>
      "You have opted out of roasts. No one can target you with the roast bot anymore!",
    optInSuccess: () =>
      "You have opted back into roasts. Ready for some banter?",
    statusDisplay: (optStatus: string, shieldStatus: string) =>
      `Roast participation: **${optStatus}** | Harassment shield: **${shieldStatus}**`,
    statusOptedIn: "Opted in",
    statusOptedOut: "Opted out",
    statusShieldActive: (time: string) => `Active (expires in ${time})`,
    statusShieldInactive: "Inactive",
    errorGeneric: () =>
      "An error occurred while generating the roast. Please try again later!",
  },
};
