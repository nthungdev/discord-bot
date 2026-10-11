import { BufferedDirectusRoastLogRepository } from "./directus/buffered-roast-log.repo";
import { DirectusGuildConfigRepository } from "./directus/directus-guild-config.repo";
import { DirectusRoastPresetRepository } from "./directus/directus-roast-preset.repo";
import { DirectusUserProfileRepository } from "./directus/directus-user-profile.repo";

export const guildConfigRepository = new DirectusGuildConfigRepository();
export const roastPresetRepository = new DirectusRoastPresetRepository();
export const userProfileRepository = new DirectusUserProfileRepository();
export const roastLogRepository = new BufferedDirectusRoastLogRepository();
