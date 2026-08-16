import express from 'express';
import { listAdminCoupons, createCoupon, bulkCreateCoupons, updateCoupon } from '../controller/couponController.js';

const router = express.Router();

// GET /api/admin/coupons
router.get('/', listAdminCoupons);

// POST /api/admin/coupons
router.post('/', createCoupon);

// POST /api/admin/coupons/bulk
router.post('/bulk', bulkCreateCoupons);

// PATCH /api/admin/coupons/:id
router.patch('/:id', updateCoupon);

export default router;
