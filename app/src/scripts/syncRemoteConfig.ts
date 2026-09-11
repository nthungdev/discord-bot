import fs from "fs";
import path from "path";
import * as admin from "firebase-admin";
import { getRemoteConfig } from "firebase-admin/remote-config";

export interface SyncOptions {
  configFile?: string;
  serviceAccountFile?: string;
  target?: "server" | "client" | "both";
  clearClient?: boolean;
  clearServer?: boolean;
  dryRun?: boolean;
}

export type RemoteConfigValueType = "STRING" | "BOOLEAN" | "NUMBER" | "JSON";

export function determineValueType(val: unknown): RemoteConfigValueType {
  if (typeof val === "number") return "NUMBER";
  if (typeof val === "boolean") return "BOOLEAN";
  if (typeof val === "object" && val !== null) return "JSON";
  return "STRING";
}

export function resolveDefaultConfigFile(): string {
  const candidates = [
    path.resolve(process.cwd(), "config.production.json"),
    path.resolve(process.cwd(), "app/config.production.json"),
    path.resolve(__dirname, "../../config.production.json"),
    path.resolve(process.cwd(), "config.json"),
    path.resolve(process.cwd(), "app/config.json"),
    path.resolve(__dirname, "../../config.json"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "No configuration file found. Please provide a path using --file <path>"
  );
}

export function resolveServiceAccountFile(customPath?: string): string {
  const candidates = [
    customPath,
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    path.resolve(process.cwd(), "service-account.json"),
    path.resolve(process.cwd(), "app/service-account.json"),
    path.resolve(__dirname, "../../service-account.json"),
  ].filter((p): p is string => Boolean(p));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "Service account file not found. Please provide a path using --service-account <path>"
  );
}

export function prepareParameters(configData: Record<string, unknown>) {
  const parameters: Record<
    string,
    { defaultValue: { value: string }; valueType: RemoteConfigValueType }
  > = {};

  for (const [key, value] of Object.entries(configData)) {
    const stringValue =
      typeof value === "object" && value !== null
        ? JSON.stringify(value)
        : String(value ?? "");
    const valueType = determineValueType(value);

    parameters[key] = {
      defaultValue: {
        value: stringValue,
      },
      valueType,
    };
  }

  return parameters;
}

export async function syncRemoteConfig(options: SyncOptions = {}) {
  const {
    configFile = resolveDefaultConfigFile(),
    serviceAccountFile = resolveServiceAccountFile(options.serviceAccountFile),
    target = "server",
    clearClient = false,
    clearServer = false,
    dryRun = false,
  } = options;

  console.log(`[RemoteConfig Sync] Configuration:`);
  console.log(`  Config File:     ${configFile}`);
  console.log(`  Service Account: ${serviceAccountFile}`);
  console.log(`  Target:          ${target}`);
  console.log(`  Dry Run:         ${dryRun}`);
  if (clearClient) console.log(`  Clear Client:    true`);
  if (clearServer) console.log(`  Clear Server:    true`);

  // Initialize Firebase Admin if not already initialized
  if (!admin.apps.length) {
    const serviceAccount = JSON.parse(
      fs.readFileSync(serviceAccountFile, "utf-8")
    );
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  const rc = getRemoteConfig();
  const apiClient = Object.values(rc).find(
    (v: unknown) =>
      typeof v === "object" &&
      v !== null &&
      "httpClient" in v &&
      "getUrl" in v
  ) as {
    httpClient: {
      send: (req: {
        method: string;
        url: string;
        headers?: Record<string, string>;
        data?: unknown;
      }) => Promise<{ status: number; headers: Record<string, string>; data?: unknown }>;
    };
    getUrl: () => Promise<string>;
  };

  if (!apiClient) {
    throw new Error("Unable to obtain RemoteConfigApiClient from Firebase Admin.");
  }

  const rawConfig = fs.readFileSync(configFile, "utf-8");
  const parsedConfig = JSON.parse(rawConfig) as Record<string, unknown>;
  const parameters = prepareParameters(parsedConfig);

  console.log(`\nFound ${Object.keys(parameters).length} parameter(s) to process:`);
  for (const [key, param] of Object.entries(parameters)) {
    console.log(`  - ${key} [${param.valueType}]`);
  }

  if (dryRun) {
    console.log("\n[Dry Run] Validation succeeded. No changes were published.");
    return;
  }

  const url = await apiClient.getUrl();

  // 1. Sync Server Remote Config (firebase-server namespace)
  if (target === "server" || target === "both") {
    console.log("\n[Server Remote Config] Updating 'firebase-server' namespace...");
    const serverPayload = clearServer ? {} : parameters;
    const resp = await apiClient.httpClient.send({
      method: "PUT",
      url: `${url}/namespaces/firebase-server/remoteConfig`,
      headers: {
        "Accept-Encoding": "gzip",
        "If-Match": "*",
      },
      data: {
        parameters: serverPayload,
      },
    });
    console.log(`[Server Remote Config] Updated! ETag: ${resp.headers["etag"]}`);
  }

  // 2. Sync / Clear Client Remote Config (default namespace)
  if (target === "client" || target === "both" || clearClient) {
    console.log("\n[Client Remote Config] Updating default namespace...");
    const clientTemplate = await rc.getTemplate();
    clientTemplate.parameters = clearClient ? {} : parameters;
    const validated = await rc.validateTemplate(clientTemplate);
    const published = await rc.publishTemplate(validated, { force: true });
    console.log(
      `[Client Remote Config] Updated! Version: ${published.version?.versionNumber}`
    );
  }

  console.log("\n[RemoteConfig Sync] Successfully finished!");
}

function parseCliArgs(args: string[]): SyncOptions {
  const options: SyncOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: pnpm run sync-config [options]

Options:
  -f, --file <path>             Path to local JSON config file (default: config.production.json / config.json)
  -s, --service-account <path>  Path to Firebase service-account.json
  -t, --target <target>         Target namespace to sync: 'server' (default), 'client', or 'both'
  --clear-client                Clear all parameters in the client (default) namespace
  --clear-server                Clear all parameters in the server (firebase-server) namespace
  --dry-run                     Validate parameters without uploading
  -h, --help                    Show this help message
`);
      process.exit(0);
    } else if (arg === "--file" || arg === "-f") {
      options.configFile = args[++i];
    } else if (arg === "--service-account" || arg === "-s") {
      options.serviceAccountFile = args[++i];
    } else if (arg === "--target" || arg === "-t") {
      const targetVal = args[++i];
      if (targetVal === "server" || targetVal === "client" || targetVal === "both") {
        options.target = targetVal;
      } else {
        console.error(`Invalid target: ${targetVal}. Allowed values: server, client, both.`);
        process.exit(1);
      }
    } else if (arg === "--clear-client") {
      options.clearClient = true;
    } else if (arg === "--clear-server") {
      options.clearServer = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    }
  }

  return options;
}

// Run CLI directly if executed from command line
if (require.main === module || process.argv[1]?.endsWith("syncRemoteConfig.ts")) {
  const options = parseCliArgs(process.argv.slice(2));
  syncRemoteConfig(options).catch((err) => {
    console.error("\n[Error] Sync failed:", err);
    process.exit(1);
  });
}
