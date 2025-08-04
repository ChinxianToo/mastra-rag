# Dynamic RAG Agent with XLSX Document Processing

This is a complete implementation of a dynamic RAG (Retrieval-Augmented Generation) agent built with the Mastra framework that can handle uploaded XLSX documents and other file types.

## Features

- **Dynamic Document Upload**: Upload XLSX, XLS, CSV, TXT, and MD files
- **Intelligent XLSX Processing**: Extracts both raw CSV data and structured interpretations from Excel files
- **Automatic Indexing**: Documents are automatically chunked, embedded, and stored in PostgreSQL vector database
- **Multi-Document Support**: Handle multiple documents simultaneously with document-specific indexes
- **Document Management**: List, search, and delete uploaded documents
- **AI Agent Integration**: Query documents using natural language through the AI agent
- **Memory System**: Maintains conversation context and document history

## Architecture

### Core Components

1. **Document Processor** (`documentProcessor.ts`): Handles XLSX extraction, chunking, and vector storage
2. **Upload Tools** (`documentUploadTool.ts`): Mastra tools for uploading, listing, and managing documents
3. **Dynamic Agent** (`Agent.ts`): AI agent that can work with any uploaded document
4. **Document Management Service** (`documentManagementService.ts`): Tracks document metadata and provides management functions

### How It Works

1. **Upload**: User uploads an XLSX file through the agent
2. **Processing**: File is parsed, text extracted, chunked, and embedded
3. **Indexing**: Chunks are stored in PostgreSQL with vector embeddings
4. **Querying**: Agent can search the document using vector similarity search
5. **Response**: Agent provides answers with citations from the uploaded document

## Setup

### Prerequisites

- Node.js 20+
- PostgreSQL database for vector storage
- Ollama running locally (or update to use your preferred LLM provider)

### Environment Variables

Create a `.env` file with:

```env
MEMORY_DB_URI=postgresql://username:password@localhost:5432/database_name
```

### Installation

```bash
pnpm install
```

## Usage

### Starting the Agent

```bash
pnpm dev
```

This starts the Mastra development server with the playground UI.

### Using the Agent

1. **Upload a Document**:
   ```
   User: "I want to upload an Excel file to analyze"
   Agent: Uses upload-document tool to process the file
   ```

2. **Query the Document**:
   ```
   User: "What are the main categories in the data?"
   Agent: Uses vector_query_tool to search the uploaded document and provides answers
   ```

3. **List Documents**:
   ```
   User: "What documents do I have uploaded?"
   Agent: Uses list-documents tool to show all available documents
   ```

4. **Delete Documents**:
   ```
   User: "Delete the sales data document"
   Agent: Uses delete-document tool to remove the document and its index
   ```

## Code Examples

### Manual Document Processing

```typescript
import { processUploadedDocument, createUploadedDocument } from './src/mastra/tools/documentProcessor';
import { PgVector } from "@mastra/pg";

const pgVector = new PgVector({ connectionString: process.env.MEMORY_DB_URI! });

// Create document metadata
const document = createUploadedDocument('sales_data.xlsx', '/path/to/file.xlsx', 'user123');

// Process the document
const result = await processUploadedDocument(pgVector, document);

console.log(`Processed ${result.chunksCount} chunks for ${result.fileName}`);
```

### Creating a Custom Agent

```typescript
import { createDocumentAgent } from './src/mastra/agents/Agent';

// Create an agent for a specific document index
const agent = createDocumentAgent('doc_specific_upload_id');

// Use the agent
const response = await agent.generate("What insights can you provide from this data?");
```

### Document Management

```typescript
import { documentManagementService } from './src/mastra/tools/documentManagementService';

// Get all active documents
const activeDocuments = documentManagementService.getActiveDocuments();

// Search documents
const searchResults = documentManagementService.searchDocuments('sales', 'user123');

// Get statistics
const stats = documentManagementService.getDocumentStats();
```

## XLSX Processing Details

The system handles XLSX files with sophisticated processing:

1. **Multiple Sheets**: Processes all worksheets in the file
2. **Structure Preservation**: Maintains table structure with headers and rows
3. **Data Interpretation**: Provides both raw CSV and structured data views
4. **Large File Handling**: Limits processing to first 100 rows per sheet for performance
5. **Metadata Tracking**: Stores file type, upload time, and processing statistics

### Example XLSX Processing Output

For a sales data spreadsheet, the processed text includes:

```
=== SHEET: Sales Data ===
Month,Product,Revenue,Units
January,Widget A,10000,100
February,Widget A,12000,120
...

--- Structured Data ---
Headers: Month, Product, Revenue, Units
Row 1: Month: January, Product: Widget A, Revenue: 10000, Units: 100
Row 2: Month: February, Product: Widget A, Revenue: 12000, Units: 120
...
```

## API Reference

### Document Upload Tool

```typescript
documentUploadTool({
  filePath: string,      // Path to the uploaded file
  fileName: string,      // Original filename
  userId?: string        // Optional user ID
})
```

### List Documents Tool

```typescript
listDocumentsTool({
  userId?: string        // Optional user filter
})
```

### Delete Document Tool

```typescript
deleteDocumentTool({
  indexName: string      // Index name to delete
})
```

## Extending the System

### Adding New File Types

To support additional file types, update the `extractTextFromXLSX` function in `documentProcessor.ts`:

```typescript
// Add new file type processing
if (fileExtension === '.pdf') {
  documentText = await extractTextFromPDF(filePath);
} else if (fileExtension === '.docx') {
  documentText = await extractTextFromDocx(filePath);
}
```

### Custom Document Processing

You can create custom processing workflows by extending the document processor:

```typescript
export async function processCustomDocument(
  pgVector: PgVector,
  document: UploadedDocument,
  customOptions: any
): Promise<DocumentProcessingResult> {
  // Custom processing logic
}
```

### Adding Document Metadata

Extend the `StoredDocumentMetadata` interface to track additional information:

```typescript
export interface StoredDocumentMetadata {
  uploadId: string;
  fileName: string;
  indexName: string;
  userId?: string;
  uploadedAt: Date;
  chunksCount: number;
  fileType: string;
  status: 'active' | 'deleted' | 'processing' | 'failed';
  error?: string;
  // Add custom fields
  customField?: string;
  tags?: string[];
}
```

## Troubleshooting

### Common Issues

1. **PostgreSQL Connection**: Ensure your database is running and connection string is correct
2. **Ollama Not Running**: Start Ollama service or update LLM provider configuration
3. **File Upload Errors**: Check file permissions and supported file types
4. **Memory Issues**: Large XLSX files may require increasing Node.js memory limit

### Performance Optimization

- **Chunking Strategy**: Adjust chunk size and overlap in `documentProcessor.ts`
- **Embedding Model**: Switch to faster embedding models for better performance
- **Database Indexing**: Add proper indexes to PostgreSQL for faster vector queries
- **Caching**: Implement caching for frequently accessed documents

## Security Considerations

- **File Validation**: System validates file types and sizes
- **User Isolation**: Documents can be filtered by user ID
- **SQL Injection**: Uses parameterized queries through Mastra abstractions
- **File Storage**: Consider implementing secure file storage for production use

## Production Deployment

For production deployment:

1. **Database**: Use managed PostgreSQL with proper backups
2. **File Storage**: Implement cloud storage (S3, GCS) for uploaded files
3. **Authentication**: Add proper user authentication and authorization
4. **Monitoring**: Add logging and monitoring for document processing
5. **Rate Limiting**: Implement rate limiting for file uploads
6. **Cleanup**: Set up automated cleanup of old/failed documents

This implementation provides a solid foundation for building production-ready RAG applications with dynamic document upload capabilities. 