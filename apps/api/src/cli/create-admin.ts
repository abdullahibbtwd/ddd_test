import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createId, Role } from "@ddcrm/shared";
import { runWithActorContextAsync } from "../audit/actor-context";
import { loadEnvFiles } from "../config/load-env";
import { parseEnv } from "../config/env.schema";
import { createAppPrisma } from "../prisma/create-prisma";
import { assertPasswordRules, hashPassword } from "../auth/password";

function usage(): never {
  console.error(
    "Usage: create-admin --email <email> --name <name>\n" +
      "  Password is read interactively (hidden), or from CREATE_ADMIN_PASSWORD.",
  );
  process.exit(1);
}

function parseArgs(argv: string[]): { email: string; name: string } {
  let email: string | undefined;
  let name: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--email") {
      email = argv[++i];
    } else if (arg === "--name") {
      name = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      usage();
    }
  }
  if (!email || !name) {
    usage();
  }
  return { email: email.trim().toLowerCase(), name: name.trim() };
}

async function readHidden(prompt: string): Promise<string> {
  // Prefer stdin mute via readline + raw mode when TTY is available.
  if (!input.isTTY || !output.isTTY) {
    const rl = createInterface({ input, output, terminal: false });
    output.write(prompt);
    const line = await rl.question("");
    rl.close();
    return line;
  }

  return new Promise((resolve, reject) => {
    const stdin = input;
    const wasRaw = stdin.isRaw;
    output.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";

    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\n" || char === "\r" || char === "\u0004") {
          cleanup();
          output.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u0003") {
          cleanup();
          reject(new Error("Interrupted"));
          return;
        }
        if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
    };

    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(wasRaw ?? false);
      stdin.pause();
    };

    stdin.on("data", onData);
  });
}

async function main(): Promise<void> {
  loadEnvFiles();
  parseEnv();

  const { email, name } = parseArgs(process.argv.slice(2));

  let password = process.env.CREATE_ADMIN_PASSWORD;
  if (!password) {
    const first = await readHidden("Password: ");
    const second = await readHidden("Confirm password: ");
    if (first !== second) {
      console.error("Passwords do not match.");
      process.exit(1);
    }
    password = first;
  }

  try {
    assertPasswordRules(password, email);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid password");
    process.exit(1);
  }

  const env = parseEnv();
  const prisma = createAppPrisma(env.DATABASE_URL);

  try {
    await runWithActorContextAsync(
      {
        source: "cli",
        actorUserId: null,
        actorLabel: "cli:create-admin",
        requestId: null,
        ip: null,
      },
      async () => {
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
          console.error(`User with email ${email} already exists.`);
          process.exit(1);
        }

        const passwordHash = await hashPassword(password!);
        const now = new Date();
        const user = await prisma.user.create({
          data: {
            id: createId(),
            email,
            name,
            role: Role.ADMIN,
            passwordHash,
            mustChangePassword: false,
            passwordChangedAt: now,
          },
        });

        console.log(`Created ADMIN user ${user.email} (${user.id})`);
      },
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
