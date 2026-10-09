export type RoleComponentType = "button" | "dropdown";
export type RoleSelectionMode = "multi" | "single";

export interface RoleOption {
  /** Target Discord role snowflake ID */
  roleId: string;
  /** Display label for button or dropdown item */
  label: string;
  /** Optional Unicode emoji or custom Discord emoji */
  emoji?: string;
  /** Optional secondary description (for select menu options) */
  description?: string;
}

export interface RolePanel {
  /** Unique alphanumeric slug identifier within the guild (e.g. 'notifications') */
  id: string;
  /** Discord Guild snowflake ID */
  guildId: string;
  /** Target Discord channel snowflake ID where the panel was posted */
  channelId?: string;
  /** Target Discord message snowflake ID of the published panel */
  messageId?: string;
  /** Title displayed in the embed */
  title: string;
  /** Explanatory description shown in the embed body */
  description: string;
  /** Component display format */
  type: RoleComponentType;
  /** Selection logic */
  mode: RoleSelectionMode;
  /** List of role options configured for this panel */
  roles: RoleOption[];
  /** Creation timestamp in milliseconds */
  createdAt: number;
  /** Last updated timestamp in milliseconds */
  updatedAt: number;
}

export interface OnboardingConfig {
  /** Discord Guild snowflake ID */
  guildId: string;
  /** Master toggle for onboarding in this server */
  enabled: boolean;
  /** Optional legacy ID of the RolePanel */
  panelId?: string;
  /** Dedicated text channel snowflake ID to post welcome prompts */
  channelId?: string;
  /** Custom welcome greeting template supporting {user}, {server}, and {count} */
  welcomeMessage?: string;
  /** Last updated timestamp in milliseconds */
  updatedAt: number;
}

export interface IRoleStore {
  getPanel(guildId: string, panelId: string): Promise<RolePanel | null>;
  getPanelsByGuild(guildId: string): Promise<RolePanel[]>;
  savePanel(panel: RolePanel): Promise<void>;
  deletePanel(guildId: string, panelId: string): Promise<void>;
  getOnboardingConfig(guildId: string): Promise<OnboardingConfig | null>;
  saveOnboardingConfig(config: OnboardingConfig): Promise<void>;
  clear(guildId?: string): Promise<void>;
}
