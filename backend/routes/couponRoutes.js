import express from 'express';
import { validateCoupon } from '../controller/couponController.js';

const router = express.Router();

// POST /api/coupons/validate
router.post('/validate', validateCoupon);

export default router;
