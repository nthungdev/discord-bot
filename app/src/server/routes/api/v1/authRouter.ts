import axios from "axios";
import { Router } from "express";
import {
  canManageDiscordGuild,
  type DiscordUserProfile,
  type GuildPermissionSummary,
  resolveUserRole,
} from "../../../../shared";
import auth, { signSessionToken } from "../../../middlewares/auth";

const authRouter = Router();

const DISCORD_API_BASE = "https://discord.com/api/v10";

authRouter.get("/discord/login", (req, res) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri =
    process.env.DISCORD_REDIRECT_URI ||
    `${req.protocol}://${req.get("host")}/api/v1/auth/discord/callback`;

  if (!clientId) {
    res.status(500).json({
      ok: false,
      message: "DISCORD_CLIENT_ID environment variable is not configured",
    });
    return;
  }

  const state = Math.random().toString(36).substring(2, 15);
  const authUrl = `${DISCORD_API_BASE}/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri,
  )}&response_type=code&scope=identify%20guilds&state=${state}`;

  res.json({ ok: true, authUrl });
});

authRouter.get("/discord/callback", async (req, res, next) => {
  const { code } = req.query;
  if (!code || typeof code !== "string") {
    res.status(400).json({ ok: false, message: "Missing authorization code" });
    return;
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri =
    process.env.DISCORD_REDIRECT_URI ||
    `${req.protocol}://${req.get("host")}/api/v1/auth/discord/callback`;

  if (!(clientId && clientSecret)) {
    res.status(500).json({
      ok: false,
      message:
        "Discord OAuth credentials (DISCORD_CLIENT_ID & DISCORD_CLIENT_SECRET) not configured on server",
    });
    return;
  }

  try {
    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("client_secret", clientSecret);
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", redirectUri);

    const tokenRes = await axios.post(
      `${DISCORD_API_BASE}/oauth2/token`,
      params.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );

    const { access_token } = tokenRes.data;

    // Fetch user profile
    const userRes = await axios.get<DiscordUserProfile>(
      `${DISCORD_API_BASE}/users/@me`,
      { headers: { Authorization: `Bearer ${access_token}` } },
    );
    const user = userRes.data;

    // Fetch user guilds
    const guildsRes = await axios.get<
      Array<{
        id: string;
        name: string;
        icon?: string | null;
        owner: boolean;
        permissions: string;
      }>
    >(`${DISCORD_API_BASE}/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const guilds: GuildPermissionSummary[] = guildsRes.data.map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
      owner: g.owner,
      permissions: g.permissions,
      canManage: g.owner || canManageDiscordGuild(g.permissions),
    }));

    const adminIds = (process.env.ADMIN_DISCORD_USER_IDS || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    const role = resolveUserRole(user.id, adminIds, guilds);
    const sessionToken = signSessionToken({ user, role, guilds });

    res.cookie("session_token", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // If request accepts HTML/browser redirect
    if (req.headers.accept?.includes("text/html")) {
      res.redirect("/dashboard");
      return;
    }

    res.json({ ok: true, sessionToken, user, role, guilds });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", auth, (req, res) => {
  res.json({ ok: true, session: req.user });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie("session_token");
  res.json({ ok: true, message: "Logged out" });
});

export default authRouter;
