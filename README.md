# PBMCpedia-MCP

This subrepository contains an MCP server based on the [Typescript MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk), an Open Source project.
The structure of this server was derived from the [now-replaced tutorial](https://github.com/modelcontextprotocol/typescript-sdk/blob/9203091219db5e90e5f66a3e1492706a15feab39/README.md) for the SDK, licensed [MIT](https://github.com/modelcontextprotocol/typescript-sdk/blob/9203091219db5e90e5f66a3e1492706a15feab39/LICENSE)
by Anthropic.

It contains a single Typescript file representing an MCP interface for the respective webserver as well as a `package.json` containing dependencies. [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) is required for dependency management.

Dependencies for the server can be installed globally for the using user by running 
```
npm install
```
in the server directory, or locally per directory by running

```
npm install -D
```
The server can then be run using
```
npm tsx server.ts
```
or 
```
npm start
```
in the server directory. This runs the local server in [tsx](https://tsx.is/), a wrapper for [NodeJS](https://github.com/nodejs/node) which supports TypeScript. By default, the server binds to a default port, but this can be adjusted by setting the 
`PORT` environment variable to a desired port number. If you use a `mcp.json` file to configure your MCP servers, you should be able to add this server by adding
```
{
  "mcpServers": {
...
    "SERVER_NAME": {
      "url": "http://localhost:PORT/mcp"
    }
  }
}
```
, where `SERVER_NAME` is replaced by the identifier you want to use for the server (e.g. `PBMCpedia`) and `PORT` is replaced either by the default port number for the server or by the custom port, if you set it.

This server uses publicy available API and requires no API keys. Standard rate limits imposed by the webserver will apply and may cause tool invocation to fail if called too frequently.

## PBMCpedia information:
- URL: https://web.ccb.uni-saarland.de/pbmcpedia/
- Publication DOI: https://doi.org/10.1093/nar/gkaf1245
