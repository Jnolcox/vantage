# MCP setup

Use Vantage from Claude and Codex: tools, links, and the live globe inside
the conversation. Agents: follow these steps in order and check each one
before going on.

## 1. Run the app

```sh
npm install
npm run build:panel   # the in-conversation globe; rerun after app changes
npm run dev           # http://127.0.0.1:4173, keep it running
```

The MCP server reads from this app. The panel build is keyless: it shows the
keyless globe unless you set `VANTAGE_PANEL_GOOGLE_MAPS_API_KEY` or
`VANTAGE_PANEL_CESIUM_ION_TOKEN` for `npm run build:panel` (see
[SECURITY.md](../SECURITY.md#mcp-server) before you do).

## 2. Add the server to a client

The server is `server/mcp/stdio.js` in this checkout, registered under the
name `vantage`. It talks to the client over stdin and stdout and opens no
port. Use absolute paths (clients do not load your shell profile), with each
argument as its own entry. It reads `http://127.0.0.1:4173` unless you add
`--api-base` with another address.

| Client                    | How                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Claude Code               | `claude mcp add vantage -- node /abs/path/vantage/server/mcp/stdio.js`                                      |
| Codex CLI                 | `codex mcp add vantage -- node /abs/path/vantage/server/mcp/stdio.js`                                       |
| Codex and ChatGPT desktop | Same `~/.codex/config.toml` as the CLI (block below), or Settings → MCP servers → Add server (STDIO).       |
| Claude Desktop            | Settings → Developer → Edit Config, then add the JSON below.                                                |

```toml
[mcp_servers.vantage]
command = "node"
args = ["/abs/path/vantage/server/mcp/stdio.js"]
```

```json
{
  "mcpServers": {
    "vantage": {
      "command": "node",
      "args": ["/abs/path/vantage/server/mcp/stdio.js"]
    }
  }
}
```

**Windows with the checkout in WSL:** use `"command": "wsl.exe"` and put
`"-e"` and the absolute Linux path to `node` first in `args`, for example
`["-e", "/home/you/.local/share/mise/installs/node/24/bin/node", "/home/you/vantage/server/mcp/stdio.js"]`.

**Clients that connect by URL** can use `http://127.0.0.1:4173/mcp` instead,
but only after you set `VANTAGE_MCP_HTTP=1` in `.env` and restart the app;
without it `/mcp` answers `404`. The route carries no token, so while it is
on any program on this machine can run the tools. Prefer stdio.

```sh
claude mcp add --transport http vantage http://127.0.0.1:4173/mcp
```

## 3. Restart and try it

Fully quit the client (on Windows, from the tray icon) and reopen it, then
start a new chat; clients keep the server they started with. Ask: _"Show San
Diego in Vantage with military flights on."_

- Claude Desktop (a chat, not the Code tab), Codex and ChatGPT desktop show
  the live globe; the first load takes 10–20 seconds.
- Claude Code and the Codex CLI answer with data and a link.

## Troubleshooting

- **The panel says it could not load:** `npm run build:panel` was not run,
  `npm run build` has since replaced `dist/` (it removes `dist/panel`; run
  `npm run build:panel` after it), or the dev server is down.
- **Logs:** the server writes each call, and why one failed, to stderr. Claude
  Desktop keeps it in its logs folder as `mcp-server-vantage.log`; in Codex,
  right-click the panel → DevTools for the panel's console.

See [tools and the MCP server](TOOLS.md) for what the tools do.
