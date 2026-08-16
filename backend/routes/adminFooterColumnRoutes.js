import express from 'express';
import {
  listAdminFooterColumns,
  createFooterColumn,
  updateFooterColumn,
  deleteFooterColumn,
} from '../controller/footerController.js';

const router = express.Router();

// GET /api/admin/footer-columns
router.get('/', listAdminFooterColumns);

// POST /api/admin/footer-columns
router.post('/', createFooterColumn);

// PUT /api/admin/footer-columns/:id
router.put('/:id', updateFooterColumn);

// DELETE /api/admin/footer-columns/:id
router.delete('/:id', deleteFooterColumn);

export default router;
