FROM node:22-slim
WORKDIR /aegis
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY dispatcher ./dispatcher
RUN corepack enable && corepack prepare pnpm@10 --activate && pnpm install --frozen-lockfile && pnpm build
EXPOSE 8178
CMD ["node", "/aegis/packages/core/dist/cli.js", "status"]
