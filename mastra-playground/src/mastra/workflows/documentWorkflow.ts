import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { processUploadedDocument, createUploadedDocument } from '../tools/documentProcessor';
import { PgVector } from "@mastra/pg";
import * as fs from 'fs';
import * as path from 'path';

// Initialize PgVector instance
const pgVector = new PgVector({ connectionString: process.env.MEMORY_DB_URI! });

// Schema for workflow input
const DocumentUploadInput = z.object({
  filePath: z.string(),
  fileName: z.string(),
  userId: z.string().optional(),
});

// Final output schema
const DocumentProcessingOutput = z.object({
  success: z.boolean(),
  uploadId: z.string(),
  indexName: z.string(),
  fileName: z.string(),
  chunksCount: z.number(),
  message: z.string(),
  error: z.string().optional(),
});

// Single processing step that includes validation
const processDocumentStep = createStep({
  id: 'process-document',
  description: 'Validate and process the uploaded document',
  inputSchema: DocumentUploadInput,
  outputSchema: DocumentProcessingOutput,
  execute: async ({ inputData }: { inputData: z.infer<typeof DocumentUploadInput> }) => {
    const { filePath, fileName, userId } = inputData;
    
    try {
      // Validation first
      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          uploadId: '',
          indexName: '',
          fileName,
          chunksCount: 0,
          message: 'File not found',
          error: 'The specified file does not exist',
        };
      }

      const fileExtension = path.extname(fileName).toLowerCase();
      const supportedTypes = ['.xlsx', '.xls', '.txt', '.md', '.csv'];
      
      if (!supportedTypes.includes(fileExtension)) {
        return {
          success: false,
          uploadId: '',
          indexName: '',
          fileName,
          chunksCount: 0,
          message: 'Unsupported file type',
          error: `File type ${fileExtension} is not supported. Supported types: ${supportedTypes.join(', ')}`,
        };
      }

      // Process the document if validation passes
      const document = createUploadedDocument(fileName, filePath, userId);
      const result = await processUploadedDocument(pgVector, document);
      
      if (result.success) {
        return {
          success: true,
          uploadId: result.uploadId,
          indexName: result.indexName,
          fileName: result.fileName,
          chunksCount: result.chunksCount,
          message: `Successfully processed ${fileName} into ${result.chunksCount} chunks`,
        };
      } else {
        return {
          success: false,
          uploadId: result.uploadId,
          indexName: result.indexName,
          fileName: result.fileName,
          chunksCount: 0,
          message: 'Failed to process document',
          error: result.error,
        };
      }
    } catch (error) {
      return {
        success: false,
        uploadId: '',
        indexName: '',
        fileName,
        chunksCount: 0,
        message: 'Error during document processing',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

// Document upload workflow
export const documentUploadWorkflow = createWorkflow({
  id: 'document-upload-workflow',
  inputSchema: DocumentUploadInput,
  outputSchema: DocumentProcessingOutput,
})
  .then(processDocumentStep)
  .commit();

// Batch processing schemas
const BatchInput = z.object({
  files: z.array(z.object({
    filePath: z.string(),
    fileName: z.string(),
  })),
  userId: z.string().optional(),
});

const BatchOutput = z.object({
  results: z.array(z.object({
    success: z.boolean(),
    fileName: z.string(),
    uploadId: z.string(),
    indexName: z.string(),
    chunksCount: z.number(),
    error: z.string().optional(),
  })),
  totalProcessed: z.number(),
  totalSuccessful: z.number(),
});

// Batch processing step
const processBatchStep = createStep({
  id: 'process-batch',
  description: 'Process all documents in the batch',
  inputSchema: BatchInput,
  outputSchema: BatchOutput,
  execute: async ({ inputData }: { inputData: z.infer<typeof BatchInput> }) => {
    const { files, userId } = inputData;
    const results = [];
    let successful = 0;
    
    for (const file of files) {
      try {
        // Validation for each file
        if (!fs.existsSync(file.filePath)) {
          results.push({
            success: false,
            fileName: file.fileName,
            uploadId: '',
            indexName: '',
            chunksCount: 0,
            error: 'File not found',
          });
          continue;
        }

        const fileExtension = path.extname(file.fileName).toLowerCase();
        const supportedTypes = ['.xlsx', '.xls', '.txt', '.md', '.csv'];
        
        if (!supportedTypes.includes(fileExtension)) {
          results.push({
            success: false,
            fileName: file.fileName,
            uploadId: '',
            indexName: '',
            chunksCount: 0,
            error: `Unsupported file type: ${fileExtension}`,
          });
          continue;
        }

        // Process the document
        const document = createUploadedDocument(file.fileName, file.filePath, userId);
        const result = await processUploadedDocument(pgVector, document);
        
        results.push({
          success: result.success,
          fileName: file.fileName,
          uploadId: result.uploadId,
          indexName: result.indexName,
          chunksCount: result.chunksCount,
          error: result.error,
        });
        
        if (result.success) {
          successful++;
        }
      } catch (error) {
        results.push({
          success: false,
          fileName: file.fileName,
          uploadId: '',
          indexName: '',
          chunksCount: 0,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    return {
      results,
      totalProcessed: files.length,
      totalSuccessful: successful,
    };
  },
});

// Batch document upload workflow
export const batchDocumentUploadWorkflow = createWorkflow({
  id: 'batch-document-upload-workflow',
  inputSchema: BatchInput,
  outputSchema: BatchOutput,
})
  .then(processBatchStep)
  .commit(); 