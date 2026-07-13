import { definePlugin } from "@xinit/core";

/**
 * Docker support — a pure file plugin (no npm, no exec, no network).
 *
 * Writes a Node `Dockerfile` and `.dockerignore`, and — when the `compose`
 * prompt is confirmed — a `docker-compose.yml` templated with the chosen port.
 * The port is interpolated with plain string computation (free in the sandbox);
 * only the file writes are recorded into the Plan.
 */
export default definePlugin({
  name: "docker",
  displayName: "Docker",
  version: "1.0.0",
  languages: ["ts", "js"],
  dependsOn: [],
  conflicts: [],
  capabilities: { install: false, exec: false, network: false },
  detect: { file: "Dockerfile" },
  prompts: [
    {
      id: "port",
      type: "text",
      message: "Which port does the app listen on?",
      default: "3000",
    },
    {
      id: "compose",
      type: "confirm",
      message: "Also generate a docker-compose.yml?",
      default: false,
    },
  ],
  setup: async (ctx, answers) => {
    const port =
      typeof answers.port === "string" && answers.port.trim() !== ""
        ? answers.port.trim()
        : "3000";
    const compose = answers.compose === true;

    ctx.addFile(
      "Dockerfile",
      `# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies (leverages layer caching on lockfile changes).
COPY package*.json ./
RUN npm install

# Copy source and build if a build script is present.
COPY . .

ENV NODE_ENV=production
EXPOSE ${port}

CMD ["npm", "start"]
`,
    );

    ctx.copy("files/.dockerignore", ".dockerignore");

    if (compose) {
      ctx.addFile(
        "docker-compose.yml",
        `services:
  app:
    build: .
    ports:
      - "${port}:${port}"
    environment:
      - NODE_ENV=production
    restart: unless-stopped
`,
      );
    }
  },
});
