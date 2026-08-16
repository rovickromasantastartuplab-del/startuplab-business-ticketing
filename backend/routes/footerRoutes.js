import express from 'express';
import { listFooterLinks } from '../controller/footerController.js';

const router = express.Router();

// GET /api/footer-links
router.get('/', listFooterLinks);

export default router;
