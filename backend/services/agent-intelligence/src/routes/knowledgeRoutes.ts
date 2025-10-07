/**
 * Knowledge Routes for Agent Intelligence Service
 * Handles AI-powered knowledge processing and analysis
 * Focuses on advanced features: chat ingestion, ontology, workflows, expertise analysis
 */

import express, { Request, Response, Router , RouterType } from '@uaip/shared-services';
import { authMiddleware } from '@uaip/middleware';
import { logger } from '@uaip/utils';
import multer from 'multer';
import {
  importChatFiles,
  getChatJobStatus,
  generateQAPairs,
  extractWorkflows,
  getExpertiseProfile,
  getLearningInsights
} from '../controllers/chatIngestionController.js';

const router: RouterType = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 20
  }
});

// Apply authentication middleware to all routes
router.use(authMiddleware);

// ========================================
// AI-POWERED KNOWLEDGE PROCESSING ENDPOINTS
// Note: Basic CRUD operations are handled by Security Gateway (/v1/knowledge)
// Agent Intelligence focuses on advanced AI processing and analysis
// ========================================

/**
 * POST /api/v1/knowledge/chat-import
 * Import chat files (Claude, GPT, WhatsApp, generic)
 */
router.post('/chat-import', 
  authMiddleware,
  upload.array('file', 20),
  importChatFiles
);

/**
 * GET /api/v1/knowledge/chat-jobs/:jobId
 * Get batch processing job status
 */
router.get('/chat-jobs/:jobId', authMiddleware, getChatJobStatus);

/**
 * POST /api/v1/knowledge/generate-qa
 * Generate Q&A pairs from knowledge items
 */
router.post('/generate-qa', authMiddleware, generateQAPairs);

/**
 * POST /api/v1/knowledge/extract-workflows
 * Extract actionable workflows from conversations
 */
router.post('/extract-workflows', authMiddleware, extractWorkflows);

/**
 * GET /api/v1/knowledge/expertise/:participant
 * Get expertise profile for a participant
 */
router.get('/expertise/:participant', authMiddleware, getExpertiseProfile);

/**
 * GET /api/v1/knowledge/learning-insights
 * Get learning analytics and insights
 */
router.get('/learning-insights', authMiddleware, getLearningInsights);

export default router;