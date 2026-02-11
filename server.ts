import {
	McpServer,
	ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import * as cheerio from "cheerio";

import { z } from "zod";

const DISEASES = [
	"Inflammation",
	"Respiratory system disorder",
	"ad",
	"covid-19",
	"hnscc",
	"influenza",
	"mis-c",
	"pd",
	"rrms",
	"sars-cov-2 vaccine",
	"tb",
] as const;
const TYPES_BROAD = [
	"T cell",
	"NK cell",
	"ILC",
	"Progenitor cell",
	"Erythrocyte",
	"Monocyte",
	"DC",
] as const;
const TYPES_FINE = [
	"Plasma cell",
	"Intermediate monocyte",
	"Naive CD4 T cell",
	"CD14 monocyte",
	"ASDC",
	"ILC",
	"CD8aa",
	"cDC2",
	"Naive CD8 T cell",
	"pDC",
	"Memory CD8 T cell",
	"Naive B cell",
	"Effector B cell",
	"cDC1",
	"gdT",
	"Erythrocyte",
	"CD56dim NK cell",
	"CD16 monocyte",
	"Memory B cell",
	"Progenitor cell",
	"Treg",
	"Memory CD4 T cell",
	"DN T cell",
	"MAIT",
	"Proliferating T cell",
] as const;
// Create an MCP server
const server = new McpServer({
	name: "pbmcpedia-connect",
	version: "1.0.0",
});

server.registerTool(
	"getDEGs",
	{
		title: "DEG querying Tool",
		description:
			"Queries the PBMCPedia webserver for DEGs using the provided parameters. Returns a list containing the DEGs.",
		inputSchema: {
			ageGroup: z
				.enum(["all", "adult", "elderly", "unknown", "young"])
				.default("all")
				.describe("Filter DEGs by age group"),
			sex: z
				.enum(["all", "female", "male", "unknown"])
				.default("all")
				.describe("Filter DEGs by sex"),
			disease: z
				.enum(DISEASES)
				.describe(
					"Condition for which to query DEGs. The following conditions are not self-explanatory: `ad` is Alzh eimer's disease, `pd` is Parkinson's, `hnscc` is Head and Neck Squamous Carcinoma, `rrms` is relapsing remitting Multiple Sclerosis, `mis-c` is multisystem inflammatory syndrome in children and `tb` is Tuberculosis.",
				),
			celltype_fine: z
				.array(z.enum(TYPES_FINE))
				.describe(
					"List of cell types for which to query DEGs. This argument allows for querying by fine-grained cell types",
				)
				.default([]),
			celltype_broad: z
				.array(z.enum(TYPES_BROAD))
				.describe(
					"List of cell types for which to query DEGs. This argument allows for querying by broad cell types.",
				)
				.default([]),
			limit: z
				.number()
				.gt(0)
				.default(100)
				.describe("Fetch at most this many DEGs"),
			offset: z
				.number()
				.gte(0)
				.default(0)
				.describe("How many elements to skip in the beginning"),
			ordering: z
				.enum([
					"p_value",
					"-p_value",
					"log2_fold_change",
					"-log2_fold_change",
					"gene",
					"-gene",
				])
				.default("p_value")
				.describe(
					"By what metric to order the results. `-` indicates descending order",
				),
		},
		outputSchema: {
			fine: z
				.array(
					z.object({
						cell_type: z
							.enum(TYPES_FINE)
							.describe("the cell type of the degs in this object"),
						degs: z.array(
							z
								.object({
									gene: z.string().describe("gene name"),
									log2_fold_change: z.number(),
									p_value: z.number(),
									cell_type: z.enum(TYPES_FINE),
								})
								.describe("describes a DEG"),
						),
					}),
				)
				.describe(
					"queried DEGs for fine-grained cell types, split by cell type",
				),
			broad: z
				.array(
					z.object({
						cell_type: z
							.enum(TYPES_BROAD)
							.describe("the cell type of the degs in this object"),
						degs: z.array(
							z
								.object({
									gene: z.string().describe("gene name"),
									log2_fold_change: z.number(),
									p_value: z.number(),
									cell_type: z.enum(TYPES_BROAD),
								})
								.describe("describes a DEG"),
						),
					}),
				)
				.describe("queried DEGs for broad cell types, split by cell type"),
		},
	},
	async ({
		ageGroup,
		sex,
		disease,
		celltype_fine,
		celltype_broad,
		limit,
		offset,
		ordering,
	}) => {
		let result: {
			fine: Array<{
				cell_type: string;
				degs: Array<{
					gene: string;
					log2_fold_change: number;
					p_value: number;
					cell_type: string;
				}>;
			}>;
			broad: Array<{
				cell_type: string;
				degs: Array<{
					gene: string;
					log2_fold_change: number;
					p_value: number;
					cell_type: string;
				}>;
			}>;
		} = {
			fine: [],
			broad: [],
		};
		celltype_fine = Array(...new Set(celltype_fine));
		celltype_broad = Array(...new Set(celltype_broad));
		for (let celltype of celltype_fine) {
			try {
				let response = await fetch(
					"https://web.ccb.uni-saarland.de/pbmcpedia/api/v1/degs?age=" +
						ageGroup +
						"&sex=" +
						sex +
						"&cell_type=" +
						celltype +
						"&limit=" +
						limit +
						"&offset=" +
						offset +
						"&resolution=fine&disease=" +
						disease +
						"&ordering=" +
						ordering,
				);
				if (!response.ok) {
					return {
						content: [
							{
								type: "text",
								text: `Server returned error code ${response.status}`,
							},
						],
						isError: true,
					};
				}
				let response_parsed: Array<{
					gene: string;
					log2_fold_change: number;
					p_value: number;
					cell_type: string;
				}> = (await response.json())["results"];
				result.fine.push({
					cell_type: celltype,
					degs: response_parsed.map((item) => {
						return {
							gene: item.gene,
							log2_fold_change: item.log2_fold_change,
							p_value: item.p_value,
							cell_type: item.cell_type,
						};
					}),
				});
			} catch (err) {
				return {
					content: [{ type: "text", text: "Network or server error" }],
					isError: true,
				};
			}
		}
		for (let celltype of celltype_broad) {
			try {
				let response = await fetch(
					"https://web.ccb.uni-saarland.de/pbmcpedia/api/v1/degs?age=" +
						ageGroup +
						"&sex=" +
						sex +
						"&cell_type=" +
						celltype +
						"&limit=" +
						limit +
						"&offset=" +
						offset +
						"&resolution=broad&disease=" +
						disease +
						"&ordering=" +
						ordering,
				);
				if (!response.ok) {
					return {
						content: [
							{
								type: "text",
								text: `Server returned error code ${response.status}`,
							},
						],
						isError: true,
					};
				}
				let response_parsed: Array<{
					gene: string;
					log2_fold_change: number;
					p_value: number;
					cell_type: string;
				}> = (await response.json())["results"];
				result.broad.push({
					cell_type: celltype,
					degs: response_parsed.map((item) => {
						return {
							gene: item.gene,
							log2_fold_change: item.log2_fold_change,
							p_value: item.p_value,
							cell_type: item.cell_type,
						};
					}),
				});
			} catch (err) {
				return {
					content: [{ type: "text", text: "Network or server error" }],
					isError: true,
				};
			}
		}
		return {
			content: [{ type: "text", text: JSON.stringify(result) }],
			structuredContent: result,
		};
	},
);
// Add an addition tool
server.registerTool(
	"add",
	{
		title: "Addition Tool",
		description: "Add two numbers",
		inputSchema: { a: z.number(), b: z.number() },
		outputSchema: { result: z.number() },
	},
	async ({ a, b }) => {
		const output = { result: a + b };
		return {
			content: [{ type: "text", text: JSON.stringify(output) }],
			structuredContent: output,
		};
	},
);
server.registerTool(
	"blastn",
	{
		title: "ABC-HuMi BLASTn",
		description:
			"Perform BLASTn alignment on the ABC-HuMi database using the input sequence",
		inputSchema: { sequence: z.string() },
		outputSchema: { result: z.string() },
	},
	async ({ sequence }) => {
		const query = cheerio.load(
			await (
				await fetch("https://ccb-web.cs.uni-saarland.de/abc_humi/query")
			).text(),
		);
		let form = query('form[action="/abc_humi/submit_blast_search"]');
		form.find("#option-blast-1").prop("checked", true);
		form.find("#sequence").val(sequence);
		return {
			content: [
				{ type: "text", text: JSON.stringify({ result: form.toString() }) },
			],
			structuredContent: { result: form.toString() },
		};
	},
);

// Add a dynamic greeting resource
server.registerResource(
	"greeting",
	new ResourceTemplate("greeting://{name}", { list: undefined }),
	{
		title: "Greeting Resource", // Display name for UI
		description: "Dynamic greeting generator",
	},
	async (uri, { name }) => ({
		contents: [
			{
				uri: uri.href,
				text: `Hello, ${name}!`,
			},
		],
	}),
);

// Set up Express and HTTP transport
const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
	// Create a new transport for each request to prevent request ID collisions
	const transport = new StreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
	});

	res.on("close", () => {
		transport.close();
	});

	await server.connect(transport);
	await transport.handleRequest(req, res, req.body);
});

const port = parseInt(process.env.PORT || "3002");
app
	.listen(port, () => {
		console.log(`Demo MCP Server running on http://localhost:${port}/mcp`);
	})
	.on("error", (error) => {
		console.error("Server error:", error);
		process.exit(1);
	});
