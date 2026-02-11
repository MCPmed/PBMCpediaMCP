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

async function fetch_pbmcpedia_per_celltype(
	endpoint: string,
	parameters: string,
	celltypes: Array<string>,
	results_array: Array<{ [key: string]: any }>,
	desired_properties: Array<string>,
) {
	for (let celltype of celltypes) {
		try {
			let response = await fetch(
				"https://web.ccb.uni-saarland.de/pbmcpedia/api/v1/" +
					endpoint +
					"?cell_type=" +
					celltype +
					parameters,
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
				[key: string]: any;
			}> = (await response.json())["results"];
			console.log(response_parsed);
			let result_arr = response_parsed.map((item) => {
				let properties = {};
				for (let property of desired_properties) {
					if (property != "pathway_description") {
						properties[property] = item[property];
					} else {
						properties[property] = item.pathway_decription;
					}
				}
				return properties;
			});
			let result_obj = { cell_type: celltype };
			result_obj[endpoint] = result_arr;
			results_array.push(result_obj);
		} catch (err) {
			return {
				content: [{ type: "text", text: "Network or server error" }],
				isError: true,
			};
		}
	}
}
//INFO: reused parameter specifications

const ageGroupParam = z
	.enum(["all", "adult", "elderly", "unknown", "young"])
	.default("all")
	.describe("Filter results by age group");
const sexParam = z
	.enum(["all", "female", "male", "unknown"])
	.default("all")
	.describe("Filter results by sex");
const diseaseParam = z
	.enum(DISEASES)
	.describe(
		"Condition for which to query. The following conditions are not self-explanatory: `ad` is Alzheimer's disease, `pd` is Parkinson's, `hnscc` is Head and Neck Squamous Carcinoma, `rrms` is relapsing remitting Multiple Sclerosis, `mis-c` is multisystem inflammatory syndrome in children and `tb` is Tuberculosis.",
	);
const cellTypeFineParam = z
	.array(z.enum(TYPES_FINE))
	.describe(
		"List of cell types for which to query. This argument allows for querying by fine-grained cell types",
	)
	.default([]);
const cellTypeBroadParam = z
	.array(z.enum(TYPES_BROAD))
	.describe(
		"List of cell types for which to query DEGs. This argument allows for querying by broad cell types.",
	)
	.default([]);
const limitParam = z
	.number()
	.gt(0)
	.default(100)
	.describe(
		"Fetch at most this many results per cell type (after applying other query filters except for 'offset').",
	);
const offsetParam = z
	.number()
	.gte(0)
	.default(0)
	.describe(
		"How many elements to skip in the beginning of the result list for every cell type (after applying other query filters and before applying the limit).",
	);
server.registerTool(
	"getPathways",
	{
		title: "Pathway querying Tool",
		description:
			"Queries the PBMCPedia webserver for pathways using the provided parameters. Returns a list containing the pathways. Pathway activity was measured between 'afflicted with disease/condition' and 'not afflicted with disease/condition'",
		inputSchema: {
			ageGroup: ageGroupParam,
			sex: sexParam,
			disease: diseaseParam,
			limit: limitParam,
			offset: offsetParam,
			celltype_fine: cellTypeFineParam,
			celltype_broad: cellTypeBroadParam,
			ordering: z
				.enum(["p_value", "-p_value", "score", "-score"])
				.default("p_value")
				.describe(
					"By what metric to order the results. '-' indicates descending order",
				),
		},
		outputSchema: {
			fine: z
				.array(
					z.object({
						cell_type: z
							.enum(TYPES_FINE)
							.describe("the cell type of the pathways in this object"),
						pathways: z.array(
							z
								.object({
									pathway_description: z
										.string()
										.describe("description of the pathway"),
									pathway_id: z
										.string()
										.describe("Gene Ontology ID of the pathway"),
									score: z.number(),
									p_value: z.number(),
									cell_type: z.enum(TYPES_FINE),
								})
								.describe("describes a pathway"),
						),
					}),
				)
				.describe(
					"queried pathways for fine-grained cell types, split by cell type",
				),
			broad: z
				.array(
					z.object({
						cell_type: z
							.enum(TYPES_BROAD)
							.describe("the cell type of the pathways in this object"),
						pathways: z.array(
							z
								.object({
									pathway_description: z
										.string()
										.describe("description of the pathway"),
									pathway_id: z
										.string()
										.describe("Gene Ontology ID of the pathway"),
									score: z.number(),
									p_value: z.number(),
									cell_type: z.enum(TYPES_BROAD),
								})
								.describe("describes a pathway"),
						),
					}),
				)
				.describe("queried pathways for broad cell types, split by cell type"),
		},
	},
	async ({
		ageGroup,
		disease,
		sex,
		celltype_fine,
		celltype_broad,
		limit,
		offset,
		ordering,
	}) => {
		let result: {
			fine: Array<{
				cell_type: string;
				pathways: Array<{
					pathway_description: string;
					pathway_id: string;
					score: number;
					p_value: number;
					cell_type: string;
				}>;
			}>;
			broad: Array<{
				cell_type: string;
				pathways: Array<{
					pathway_description: string;
					pathway_id: string;
					score: number;
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
		let res = await fetch_pbmcpedia_per_celltype(
			"pathways",
			`&age=${ageGroup}&sex=${sex}&limit=${limit}&offset=${offset}&disease=${disease}&resolution=fine&ordering=${ordering}`,
			celltype_fine,
			result.fine,
			["pathway_description", "pathway_id", "score", "p_value", "cell_type"],
		);
		if (res) {
			return res;
		}
		res = await fetch_pbmcpedia_per_celltype(
			"pathways",
			`&age=${ageGroup}&sex=${sex}&limit=${limit}&offset=${offset}&disease=${disease}&resolution=broad&ordering=${ordering}`,
			celltype_broad,
			result.broad,
			["pathway_description", "pathway_id", "score", "p_value", "cell_type"],
		);
		if (res) {
			return res;
		}
		return {
			content: [{ type: "text", text: JSON.stringify(result) }],
			structuredContent: result,
		};
	},
);
server.registerTool(
	"getDEGs",
	{
		title: "DEG querying Tool",
		description:
			"Queries the PBMCPedia webserver for DEGs using the provided parameters. Returns a list containing the DEGs. DEGs were measured between 'afflicted with disease/condition' and 'not afflicted with disease/condition'",
		inputSchema: {
			ageGroup: ageGroupParam,
			sex: sexParam,
			disease: diseaseParam,
			celltype_fine: cellTypeFineParam,
			celltype_broad: cellTypeBroadParam,
			limit: limitParam,
			offset: offsetParam,
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
		let res = await fetch_pbmcpedia_per_celltype(
			"degs",
			`&age=${ageGroup}&sex=${sex}&limit=${limit}&offset=${offset}&resolution=fine&disease=${disease}&ordering=${ordering}`,
			celltype_fine,
			result.fine,
			["gene", "log2_fold_change", "p_value", "cell_type"],
		);
		if (res) {
			return res;
		}
		res = await fetch_pbmcpedia_per_celltype(
			"degs",
			`&age=${ageGroup}&sex=${sex}&limit=${limit}&offset=${offset}&resolution=broad&disease=${disease}&ordering=${ordering}`,
			celltype_broad,
			result.broad,
			["gene", "log2_fold_change", "p_value", "cell_type"],
		);
		if (res) {
			return res;
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
