import { createOpenAI } from "@ai-sdk/openai";
import { MDocument } from "@mastra/rag";
import { embedMany } from "ai";
import { PgVector } from "@mastra/pg";
import * as fs from "fs";
import * as path from "path";
import mammoth from "mammoth";
import { parse as csvParse } from "csv-parse/sync";

// Define PostgreSQL connection string
const DOCS_DIR = "./src/documents";
const INDEX_NAME = "helpdesk_troubleshooting_documents";

// Function to extract text from docx
async function extractTextFromDocx(docxPath: string): Promise<string> {
  const { value } = await mammoth.extractRawText({ path: docxPath });
  return value;
}

// Function to extract text from CSV
function extractTextFromCsv(csvPath: string): string {
  const fileContent = fs.readFileSync(csvPath, "utf-8");
  const records = csvParse(fileContent, {
    columns: true,
    skip_empty_lines: true,
  });

  // Convert CSV records to text format
  let textContent = "";
  for (const record of records as Record<string, string>[]) {
    // Join all values in the record and add as a paragraph
    const recordText = Object.entries(record)
      .map(([key, value]) => `${key}: ${value}`)
      .join(", ");
    textContent += recordText + "\n\n";
  }

  return textContent;
}

async function extractTextFromPDF(pdfPath: string): Promise<string> {
  // Read the PDF file
  const dataBuffer = fs.readFileSync(pdfPath);

  const pdf = require("pdf-parse");

  // Parse the PDF content
  const data = await pdf(dataBuffer);

  // Return the text content
  return data.text;
}

// Function to clear specific index if it exists
async function clearIndex(
  pgVector: PgVector,
  indexName: string
): Promise<void> {
  console.log(`Checking if index '${indexName}' exists...`);

  try {
    const indexes = await pgVector.listIndexes();

    if (indexes.includes(indexName)) {
      console.log(`Deleting existing index: ${indexName}`);
      await pgVector.deleteIndex({ indexName: indexName });
      console.log(`Index '${indexName}' deleted successfully`);
    } else {
      console.log(`Index '${indexName}' does not exist, no need to delete`);
    }
  } catch (error) {
    console.log(`Error while checking/clearing index '${indexName}':`, error);
    // Continue execution even if we encounter an error here
  }
}

async function main() {
  const pgVector = new PgVector({ connectionString: process.env.DB_URI! });

  try {
    // First check if the index exists and clear it
    await clearIndex(pgVector, INDEX_NAME);

    // Create the index after ensuring it doesn't exist
    console.log(`Creating index '${INDEX_NAME}'...`);
    await pgVector.createIndex({
      indexName: INDEX_NAME,
      dimension: 768, // nomic-embed-text produces 768-dimensional vectors
    });
    console.log(`Index '${INDEX_NAME}' created successfully`);
  } catch (error) {
    // If index already exists, try to delete it and recreate
    console.log(`Error creating index, attempting to delete existing index...`);
    await clearIndex(pgVector, INDEX_NAME);

    // Now try to create the index again
    await pgVector.createIndex({
      indexName: INDEX_NAME,
      dimension: 768, // nomic-embed-text produces 768-dimensional vectors
    });
  }

  // List all document files in the docs directory
  const files = fs
    .readdirSync(DOCS_DIR)
    .filter((f) => f.endsWith(".docx") || f.endsWith(".csv"));

  for (const file of files) {
    const filePath = path.join(DOCS_DIR, file);
    console.log(`Processing: ${filePath}`);

    // Extract text based on file type
    let text: string;
    if (file.endsWith(".docx")) {
      text = await extractTextFromDocx(filePath);
    } else if (file.endsWith(".csv")) {
      text = extractTextFromCsv(filePath);
    } else if (file.endsWith(".pdf")) {
      text = await extractTextFromPDF(filePath);
    } else {
      console.log(`Skipping unsupported file type: ${file}`);
      continue;
    }

    // Chunk the document
    const doc = MDocument.fromText(text);
    const chunks = await doc.chunk({
      strategy: "recursive",
      size: 1000,
      overlap: 250,
      separator: "\n\n",
    });

    console.log(`Number of chunks for ${file}:`, chunks.length);

    const openai = createOpenAI({
      baseURL: "http://localhost:11434/v1",
      apiKey: "ollama",
      compatibility: "compatible",
    });

    // Generate embeddings
    const { embeddings } = await embedMany({
      model: openai.embedding("nomic-embed-text:latest"),
      values: chunks.map((chunk) => chunk.text),
    });

    // Store embeddings
    await pgVector.upsert({
      indexName: INDEX_NAME,
      vectors: embeddings,
      metadata: chunks.map((chunk: { text: string }) => ({
        text: chunk.text,
        source: file,
      })),
    });

    console.log(`Stored embeddings for ${file}`);
  }
}

main().catch((error) => {
  console.error("Error in main function:", error);
  process.exit(1);
});
