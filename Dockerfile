# Waypath MCP server container.
# Used by Glama for introspection checks and by any MCP client that wants
# to run waypath in an isolated runtime.

FROM node:22-slim

# Install the published waypath CLI globally. Node 22.5+ in this base
# image provides native node:sqlite, so the better-sqlite3 optional
# dependency is skipped to keep the image small and build-tool free.
RUN npm install -g --omit=optional waypath@0.1.1

# waypath-mcp-server speaks JSON-RPC over stdio. No ports to expose.
ENTRYPOINT ["waypath-mcp-server"]
