import express from 'express';
import {
  listAdminFooterLinks,
  createFooterLink,
  updateFooterLink,
  deleteFooterLink,
  reorderFooterLinks,
} from '../controller/footerController.js';

const router = express.Router();

// GET /api/admin/footer-links
router.get('/', listAdminFooterLinks);

// POST /api/admin/footer-links
router.post('/', createFooterLink);

// PUT /api/admin/footer-links/reorder
router.put('/reorder', reorderFooterLinks);

// PUT /api/admin/footer-links/:id
router.put('/:id', updateFooterLink);

// DELETE /api/admin/footer-links/:id
router.delete('/:id', deleteFooterLink);

export default router;
