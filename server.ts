import {
	McpServer,
	ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import * as cheerio from "cheerio";

import { unknown, z } from "zod";
import { toLowerCase } from "zod/v4";

const PBMC_API_URL = "https://web.ccb.uni-saarland.de/pbmcpedia/api/v1/";
const PBMC_API_URL_DOCS = "https://web.ccb.uni-saarland.de/pbmcpedia/api-docs/";
const SEX_FOR_METADATA = ["male", "female", "unknown", "none"] as const;
const DISEASES_FOR_METADATA = [
	"Multisystem inflammatory syndrome in children (MIS-C)",
	"Inflammation",
	"COVID-19",
	"Parkinson's Disease (PD)",
	"Healthy Control",
	"Unknown",
	"Tuberculosis (TB)",
	"End-Stage Renal Disease (ESRD)",
	"Relapsing Remitting Multiple Sclerosis (RRMS)",
	"Head and neck squamous cell carcinoma (HNSCC)",
	"Alzheimer's disease (AD)",
	"Respiratory system disorder",
	"Influenza",
	"SARS-CoV-2 vaccine",
	"Sepsis (survived)",
	"Sepsis (non-survived)",
	"Premature Ovarian Insufficiency (POI)",
	"none",
] as const;
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
	"B cell",
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

function server_error(status: number) {
	return {
		content: [
			{
				type: "text",
				text: `Server returned error code ${status}`,
			},
		],
		isError: true,
	};
}
async function fetch_pbmcpedia_per_celltype(
	endpoint: string,
	parameters: string,
	celltypes: Array<string>,
	results_array: Array<{ [key: string]: any }>,
	desired_properties: Array<string>,
	result_name: string,
) {
	if (celltypes.length == 0) {
		celltypes.push("");
	}
	for (let celltype of celltypes) {
		try {
			let response = await fetch(
				PBMC_API_URL + endpoint + "?cell_type=" + celltype + parameters,
			);
			if (!response.ok) {
				return server_error(response.status);
			}
			let response_parsed: Array<{
				cell_type: string;
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
				let new_properties: { cell_type: string;[key: string]: any } =
					properties;
				return new_properties;
			});
			if (celltype == "") {
				let result_map: Map<
					string,
					[
						{
							cell_type: string;
							[key: string]: string | [{ [key: string]: any }];
						},
					]
				> = new Map();
				result_arr.forEach((item) => {
					if (!result_map.has(item.cell_type)) {
						let cool_array: Array<{ cell_type: string;[key: string]: any }> =
							new Array();
						result_map.set(item.cell_type, cool_array);
					}
					result_map.get(item.cell_type)?.push(item);
				});
				for (let type_obj of result_map.entries()) {
					let result_obj = { cell_type: type_obj[0] };
					result_obj[result_name] = type_obj[1];
					results_array.push(result_obj);
				}
			} else {
				let result_obj = { cell_type: celltype };
				result_obj[result_name] = result_arr;
				results_array.push(result_obj);
			}
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
		"List of cell types for which to query. This argument allows for querying by fine-grained cell types. The empty default does not perform restriction by cell type.",
	);
const cellTypeBroadParam = z
	.array(z.enum(TYPES_BROAD))
	.describe(
		"List of cell types for which to query DEGs. This argument allows for querying by broad cell types. The empty default does not perform restriction by cell type.",
	);
const limitParam = z
	.number()
	.gt(0)
	.default(100)
	.describe(
		"Fetch at most this many results (after applying other query filters except for 'offset'). If cell types are explicitly specified, fetch at most this many results per cell type.",
	);
const offsetParam = z
	.number()
	.gte(0)
	.default(0)
	.describe(
		"How many elements to skip in the beginning of the result list (after applying other query filters and before applying the limit).",
	);

server.registerTool(
	"getMetaData",
	{
		title: "get or summarize metadata filtered by sex and/or disease",
		description:
			"Queries the PBMCpedia webserver (atlas for peripheral blood mononuclear cell experiments) for the samples fitting the provided filters and either returns a summary or full information on the first 30 results",
		inputSchema: {
			sex: z
				.enum(SEX_FOR_METADATA)
				.default("none")
				.describe("Passing 'none' (the default) disables this filter"),
			disease: z
				.enum(DISEASES_FOR_METADATA)
				.default("none")
				.describe("Passing 'none' (the default) disables this filter"),
			summarize: z
				.boolean()
				.default(true)
				.describe(
					"Whether to return a summary of the metadata instead of the first 30 results",
				),
		},
		outputSchema: {
			result: z.union([
				z
					.array(
						z.object({
							sex: z.enum(SEX_FOR_METADATA),
							disease: z.enum(DISEASES_FOR_METADATA),
							sample_id: z.string(),
							study_id: z.string(),
							age: z
								.string()
								.describe(
									"string containing both the age group and the exact age of the sample.",
								),
						}),
					)
					.describe("array containing the first 30 metadata entries"),
				z.object({
					sex_summary: z.object({
						female: z
							.number()
							.describe("number of female samples matched")
							.int()
							.gte(0),
						male: z
							.number()
							.describe("number of male samples matched")
							.int()
							.gte(0),
						unknown: z
							.number()
							.describe("number of unknown sex samples matched")
							.int()
							.gte(0),
					}),
					disease_summary: z.array(
						z.object({
							disease: z.enum(DISEASES_FOR_METADATA),
							count: z
								.number()
								.describe("Number of samples matched with this disease.")
								.int()
								.gt(0),
						}),
					),
					age_summary: z
						.object({
							elderly: z.number().gte(0).int(),
							young: z.number().gte(0).int(),
							adult: z.number().gte(0).int(),
							unknown: z.number().gte(0).int(),
						})
						.describe("Number of samples matched for every age group"),
				}),
			]),
		},
	},
	async ({ disease, summarize, sex }) => {
		let result = {};
		if (sex == "none") {
			sex = "";
		}
		if (disease == "none") {
			disease = "";
		}
		if (summarize) {
			let local_result: {
				result: {
					disease_summary: Array<{ disease: string; count: number }>;
					[key: string]: any;
				};
			} = {
				result: {
					sex_summary: {
						male: 0,
						female: 0,
						unknown: 0,
					},
					disease_summary: [],
					age_summary: {
						elderly: 0,
						young: 0,
						adult: 0,
						unknown: 0,
					},
				},
			};

			let disease_mapping: Map<string, number> = new Map();

			try {
				let response = await fetch(
					PBMC_API_URL_DOCS +
					"v1/metadata" +
					`?sex=${sex}&disease=${disease}&limit=10000`,
				);
				if (!response.ok) {
					return server_error(response.status);
				}
				let response_parsed: Array<{
					age_display: string;
					sex: string;
					disease: string;
				}> = (await response.json())["results"];

				response_parsed.forEach((item) => {
					if (!disease_mapping.has(item.disease)) {
						disease_mapping.set(item.disease, 1);
					} else {
						disease_mapping.set(
							item.disease,
							disease_mapping.get(item.disease) + 1,
						);
					}
					local_result.result.age_summary[item.age_display.split(" ")[0]] += 1;
					local_result.result.sex_summary[item.sex] += 1;
				});
				for (let entry of disease_mapping.entries()) {
					local_result.result.disease_summary.push({
						disease: entry[0],
						count: entry[1],
					});
				}
				result = local_result;
			} catch (err) {
				return {
					content: [{ text: "Network or Server Error", type: "text" }],
					isError: true,
				};
			}
		} else {
			try {
				let response = await fetch(
					PBMC_API_URL_DOCS +
					"v1/metadata" +
					`?sex=${sex}&disease=${disease}&limit=30`,
				);
				if (!response.ok) {
					return server_error(response.status);
				}
				let tmp: Array<{
					sample_id: string;
					study: string;
					age_display: number;
					sex: string;
					disease: string;
				}> = (await response.json())["results"];

				result.result = tmp.map((item) => {
					return {
						sample_id: item.sample_id,
						study_id: item.study,
						age: item.age_display,
						sex: item.sex,
						disease: item.disease,
					};
				});
			} catch (err) {
				return {
					content: [{ text: `Network or Server Error: ${err}`, type: "text" }],
					isError: true,
				};
			}
		}
		return {
			content: [{ text: JSON.stringify(result), type: "text" }],
			structuredContent: result,
		};
	},
);
server.registerTool(
	"getAntibodyChains",
	{
		title: "Antibody Chains by Clone",
		description:
			"Queries the PBMCpedia webserver (atlas for peripheral blood mononuclear cell experiments) for the antibody chains matched to the given clonotype",
		inputSchema: {
			clone: z.number().describe("ID of the clone").gte(0).int(),
		},
		outputSchema: {
			result: z
				.array(
					z.object({
						cell_id: z
							.string()
							.describe(
								"ID of the cell within the dataset that matched this clonotype",
							),
						locus: z.string(),
						v_call: z
							.string()
							.describe(
								"Name of the matched V (variable) gene or 'nan' if none was matched",
							),
						d_call: z
							.string()
							.describe(
								"Name of the matched D (diverse) gene or 'nan' if none was matched",
							),
						j_call: z
							.string()
							.describe(
								"Name of the matched J (join) gene or 'nan' if none was matched",
							),
						c_call: z
							.string()
							.describe(
								"Name of the matched C (constant) gene or 'nan' if none was matched",
							),
						junction_aa: z
							.string()
							.describe(
								"One-letter coded amino acid sequence matched at the junction or 'nan' if none was matched",
							),
						cdr3: z
							.string()
							.describe(
								"DNA sequence of the matched CDR3 (antigen-binding) part of the receptor or 'nan' if none was matched",
							),
						cdr3_aa: z
							.string()
							.describe(
								"One-letter coded amino acid sequence matched in the CDR3 part or 'nan' if none was matched",
							),
						productive: z
							.boolean()
							.describe(
								"whether the matched chain is a functional (productive) receptor",
							),
					}),
				)
				.describe("List containing all matches of the queried clonotype"),
		},
	},
	async ({ clone }) => {
		try {
			let response = await fetch(
				PBMC_API_URL_DOCS + "chains-by-clone?clone_id=" + clone,
			);
			if (!response.ok) {
				return server_error(response.status);
			}
			let response_parsed = (await response.json())["rows"];
			let result = { result: response_parsed };
			return {
				content: [{ type: "text", text: JSON.stringify(result) }],
				structuredContent: result,
			};
		} catch (err) {
			return {
				content: [{ type: "text", text: "Network or Server error" }],
				isError: true,
			};
		}
	},
);
server.registerTool(
	"getDEperCellType",
	{
		title: "Differential Expression per Cell Type",
		description:
			"Queries the PBMCpedia webserver for the differential expression of the given genes with respect to the provided cell type.",
		inputSchema: {
			genes: z
				.array(z.string())

				.describe(
					"Names of the genes for which to query differential expression.",
				),
			celltype: z
				.union([z.enum(TYPES_BROAD), z.enum(TYPES_FINE)])
				.describe("Cell type to fetch differential expression for."),
		},
		outputSchema: {
			result: z.array(
				z.object({
					gene: z.string().describe("name of the gene"),
					log2_fold_change: z.number().describe(
						"fold change for this gene and cell type", //between queried cell type and other cell types",
					),
					p_value: z
						.number()
						.describe("adjusted p_value for differential expression"),
				}),
			),
		},
	},
	async ({ celltype, genes }) => {
		let result: {
			result: Array<{
				gene: string;
				log2_fold_change: number;
				p_value: number;
			}>;
		} = { result: new Array() };
		genes = genes.map((item) => {
			return encodeURIComponent(item);
		});
		for (let gene of genes) {
			try {
				let response = await fetch(
					PBMC_API_URL_DOCS +
					"marker-table-ds" +
					"?cell_type=" +
					celltype +
					"&genes=" +
					gene,
					// genes.reduce((prevItem, nowItem) => {
					// 	return prevItem + "," + nowItem;
					// }
					//	),
				);
				if (!response.ok) {
					return server_error(response.status);
				}
				let response_parsed: Array<{
					gene: string;
					celltype: string;
					log2_fold_change: number;
					adj_p_val: number;
				}> = (await response.json())["data"];
				result.result.push(
					...response_parsed.map((item) => {
						return {
							gene: item.gene,
							log2_fold_change: item.log2_fold_change,
							p_value: item.adj_p_val,
						};
					}),
				);
			} catch (err) {
				return {
					content: [{ type: "text", text: "Network or Server error" }],
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
server.registerTool(
	"getExpressionPerGene",
	{
		title: "Gene Expression querying Tool",
		description:
			"Queries the PBMCpedia webserver (atlas for peripheral blood mononuclear cell experiments) for gene expression using the provided parameters. Returns a list containing the gene expression per gene and celltype.",
		inputSchema: {
			limit: limitParam,
			offset: offsetParam,
			genes: z
				.array(z.string())
				.describe("Names of the genes for which to query gene expression.")
				.max(1024),
			fine: z
				.boolean()
				.describe(
					"Whether to return gene expression split by fine-grained cell type distinction",
				),
			broad: z
				.boolean()
				.describe(
					"Whether to return gene expression split by broad cell type distinction",
				),
		},
		outputSchema: {
			result:
				// z.union([
				// z.object({
				// 	fine: z.array(
				// 		z.object({
				// 			gene: z.string().describe("gene name"),
				// 			expression: z.array(
				// 				z.object({
				// 					celltype: z
				// 						.string()
				// 						.describe("Cell type of the expression data"),
				// 					mean_expression: z
				// 						.number()
				// 						.describe("Mean expression of this cell type"),
				// 				}),
				// 			),
				// 		}),
				// 	),
				// }),
				z.object({
					fine: z
						.array(
							z.object({
								gene: z.string().describe("gene name"),
								expression: z.array(
									z.object({
										celltype: z
											.string()
											.describe("Cell type of the expression data"),
										mean_expression: z
											.number()
											.describe("Mean expression of this cell type"),
									}),
								),
							}),
						)
						.describe(
							"Mean expression per cell type and gene for a fine-grained distinction of cell types",
						),
					broad: z
						.array(
							z.object({
								gene: z.string().describe("gene name"),
								expression: z.array(
									z.object({
										celltype: z
											.string()
											.describe("Cell type of the expression data"),
										mean_expression: z
											.number()
											.describe("Mean expression of this cell type and gene"),
									}),
								),
							}),
						)
						.describe(
							"Mean expression per cell type and gene for a broad distinction of cell types",
						),
				}),
			// 	z.object({
			// 		broad: z
			// 			.array(
			// 				z.object({
			// 					gene: z.string().describe("gene name"),
			// 					expression: z.array(
			// 						z.object({
			// 							celltype: z
			// 								.string()
			// 								.describe("Cell type of the expression data"),
			// 							mean_expression: z
			// 								.number()
			// 								.describe("Mean expression of this cell type and gene"),
			// 						}),
			// 					),
			// 				}),
			// 			)
			// 			.describe(
			// 				"Mean expression per cell type and gene for a broad distinction of cell types",
			// 			),
			// 	}),
			// ]),
		},
	},
	async ({ limit, offset, genes, fine, broad }) => {
		let result: { result: { [key: string]: any } } = { result: {} };
		let genes_url = genes.map((item) => {
			return `&genes=${encodeURIComponent(item)}`;
		});
		let request_url =
			PBMC_API_URL + `gene_expr_celltype?limit=${limit}&offset=${offset}`;
		for (let gene of genes_url) {
			request_url += gene;
		}
		if (request_url.length >= 4078) {
			return {
				content: [
					{
						text: "Too many genes requested. Please try again with less",
						type: "text",
					},
				],
				isError: true,
			};
		}
		result.result.fine = [];

		if (fine) {
			try {
				let response = await fetch(request_url + "&resolution=fine");
				if (!response.ok) {
					return server_error(response.status);
				}
				let response_parsed: Array<{
					gene: string;
					celltype: string;
					mean_expression: number;
					resolution: "fine";
				}> = (await response.json())["results"];
				let response_split: Map<
					string,
					Array<{ celltype: string; mean_expression: number }>
				> = new Map();
				response_parsed.forEach((item) => {
					if (response_split.has(item.gene)) {
						response_split.get(item.gene).push({
							celltype: item.celltype,
							mean_expression: item.mean_expression,
						});
					} else {
						response_split.set(item.gene, [
							{
								celltype: item.celltype,
								mean_expression: item.mean_expression,
							},
						]);
					}
				});

				for (let entry of response_split.entries()) {
					result.result.fine.push({ gene: entry[0], expression: entry[1] });
				}
			} catch (err) {
				return {
					content: [{ text: "Network or response format error", type: "text" }],
					isError: true,
				};
			}
		}
		result.result.broad = [];

		if (broad) {
			try {
				let response = await fetch(request_url + "&resolution=broad");
				if (!response.ok) {
					return server_error(response.status);
				}
				let response_parsed: Array<{
					gene: string;
					celltype: string;
					mean_expression: number;
					resolution: "fine";
				}> = (await response.json())["results"];
				let response_split: Map<
					string,
					Array<{ celltype: string; mean_expression: number }>
				> = new Map();
				response_parsed.forEach((item) => {
					if (response_split.has(item.gene)) {
						response_split.get(item.gene).push({
							celltype: item.celltype,
							mean_expression: item.mean_expression,
						});
					} else {
						response_split.set(item.gene, [
							{
								celltype: item.celltype,
								mean_expression: item.mean_expression,
							},
						]);
					}
				});

				for (let entry of response_split.entries()) {
					result.result.broad.push({ gene: entry[0], expression: entry[1] });
				}
			} catch (err) {
				return {
					content: [{ text: "Network or response format error", type: "text" }],
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
server.registerTool(
	"getPathways",
	{
		title: "Pathway querying Tool",
		description:
			"Queries the PBMCpedia webserver for pathways using the provided parameters. Returns a list containing the pathways. Pathway activity was measured between 'afflicted with disease/condition' and 'not afflicted with disease/condition'",
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
			"pathways",
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
			"pathways",
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
			"Queries the PBMCPedia webserver (atlas for peripheral blood mononuclear cell experiments) for DEGs using the provided parameters. Returns a list containing the DEGs. DEGs were measured between 'afflicted with disease/condition' and 'not afflicted with disease/condition'",
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
			"degs",
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
			"degs",
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

server.registerResource(
	"description",
	new ResourceTemplate("description", { list: undefined }),
	{
		title: "Service description", // Display name for UI
	},
	async (uri, { }) => ({
		contents: [
			{
				uri: uri.href,
				text: `This MCP server offers tools to interact with the PBMCpedia webserver, an atlas of Peripheral Blood Mononuclear Cell experiments/studies`,
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
		console.log(`MCP Server running on http://localhost:${port}/mcp`);
	})
	.on("error", (error) => {
		console.error("Server error:", error);
		process.exit(1);
	});
