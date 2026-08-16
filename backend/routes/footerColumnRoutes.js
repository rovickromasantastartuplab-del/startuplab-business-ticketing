import express from 'express';
import { listFooterColumns } from '../controller/footerController.js';

const router = express.Router();

// GET /api/footer-columns
router.get('/', listFooterColumns);

export default router;
