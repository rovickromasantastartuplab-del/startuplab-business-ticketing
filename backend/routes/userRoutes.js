import express from 'express';
import multer from 'multer';
import {getUser, getAllUsers, getRole, getRoleByEmail, whoAmI, updatePermissions, updateUserName, updateUserAvatar, sendPasswordReset, setUserPassword, removeStaffUser, updateUserEmail} from "../controller/userController.js"
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/user', authMiddleware, getUser);
router.get('/users/all', authMiddleware, getAllUsers);
router.get('/whoAmI', authMiddleware, whoAmI);
router.get('/user/role', authMiddleware, getRole);
router.get('/role-by-email', getRoleByEmail);
// Alias to match frontend path /api/user/role-by-email
router.get('/user/role-by-email', getRoleByEmail);
router.put('/users/:id/permissions', authMiddleware, updatePermissions);
router.patch('/user/name', authMiddleware, updateUserName);
router.patch('/user/email', authMiddleware, updateUserEmail);
router.post('/user/avatar', authMiddleware, upload.single('image'), updateUserAvatar);
router.post('/users/:id/send-password-reset', authMiddleware, sendPasswordReset);
router.post('/users/:id/set-password', authMiddleware, setUserPassword);
router.delete('/users/:id', authMiddleware, removeStaffUser);

export default router;