# PBMCpedia-MCP

This subrepository contains an MCP server based on the [Typescript MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk), an Open Source project.
The structure of this server was derived from the [now-replaced tutorial](https://github.com/modelcontextprotocol/typescript-sdk/blob/9203091219db5e90e5f66a3e1492706a15feab39/README.md) for the SDK, licensed [MIT](https://github.com/modelcontextprotocol/typescript-sdk/blob/9203091219db5e90e5f66a3e1492706a15feab39/LICENSE)
by Anthropic.

It contains a single Typescript file representing an MCP interface for the respective webserver as well as a `package.json` containing dependencies. [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) is required for dependency management.

## Dependencies
Dependencies for the server can be installed globally for the user by running 
```
npm install
```
in the server directory, or only for the server directory by running

```
npm install -D
```
in the same directory.

## Running
The server can then be run using
```
npm tsx server.ts
```
or 
```
npm start
```
in the server directory. This runs the local server in [tsx](https://tsx.is/), a wrapper for [NodeJS](https://github.com/nodejs/node) which supports TypeScript. By default, the server binds to a default port, but this can be adjusted by setting the 
`PORT` environment variable to a desired port number. The server can also be run in stdIO mode by passing `--transport stdio`.
## Adding the MCP Server
The following instructions assume that the server should appear as "SERVER_NAME", runs on port "PORT" (for HTTP transport) and the full file path of the cloned repository is "SERVER_PATH" (for stdIO transport). Replace these placeholders with your actual values (e.g. "PBMCpedia" and "3002").

Configuring the server with stdIO transport is recommended if you just want the server to always be available in your client. If you want more control over the server running, HTTP transport is the better option. This requires to start the server externally via the command when you want to use it.

This approach applies to clients providing a JSON configuration file to configure your MCP servers, including Gemini CLI ("settings.json") and LM Studio ("mcp.json").
You should be able to add this server by appending
```
"SERVER_NAME": {
    "command": "npm",
    "args": ["start", "--", "--transport", "stdio"],
    "cwd": "SERVER_PATH"
}
```
(for stdIO transport) or
```

    "SERVER_NAME": {
      "url": "http://localhost:PORT/mcp"
    }
```
(for HTTP transport) to your list of MCP server configurations, which is likely under 
```
{
   "mcpServers":  {
    HERE
  }
}
```

For Claude Desktop and stdIO transport, the above instructions for stdIO transport apply as well. To access the JSON configuration file,
you can follow these instructions:
https://modelcontextprotocol.io/docs/develop/connect-local-servers


For Claude Desktop and HTTP transport, you can follow these instructions:
https://modelcontextprotocol.io/docs/develop/connect-remote-servers
Set the name as "SERVER_NAME" and the connector address as "http://localhost:PORT/mcp"

For Claude Code, run the command

```
claude mcp add --transport stdio SERVER_NAME -- npm start -- --transport stdio
```
and edit the JSON entry for the added server to contain `"cwd": "SERVER_PATH"` (see [this documentation](https://code.claude.com/docs/en/mcp#local-scope) for reference)
(stdIO transport)

or simply run
```
claude mcp add --transport http SERVER_NAME http://localhost:PORT/mcp
```
(HTTP transport)

## Note
This server uses publicy available API and requires no API keys. Standard rate limits imposed by the webserver will apply and may cause tool invocation to fail if called too frequently.

## PBMCpedia information:
- URL: https://web.ccb.uni-saarland.de/pbmcpedia/
- Publication DOI: https://doi.org/10.1093/nar/gkaf1245
