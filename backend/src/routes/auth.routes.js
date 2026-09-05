import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { validateBody } from '../middleware/validate.js';
import { loginRateLimiter, passwordResetRateLimiter } from '../middleware/rateLimiters.js';
import {
  loginSchema,
  changePasswordSchema,
  requestPasswordResetSchema,
  confirmPasswordResetSchema,
  forgotPasswordSchema,
} from '../validators/auth.validator.js';
import * as authController from '../controllers/auth.controller.js';

const router = Router();

router.post('/login', loginRateLimiter, validateBody(loginSchema), asyncHandler(authController.login));
router.post('/logout', authenticate, asyncHandler(authController.logout));
router.get('/me', authenticate, asyncHandler(authController.me));
router.post(
  '/change-password',
  authenticate,
  validateBody(changePasswordSchema),
  asyncHandler(authController.changePassword)
);
router.post(
  '/password-reset/request',
  passwordResetRateLimiter,
  validateBody(requestPasswordResetSchema),
  asyncHandler(authController.requestPasswordReset)
);
router.post(
  '/password-reset/confirm',
  passwordResetRateLimiter,
  validateBody(confirmPasswordResetSchema),
  asyncHandler(authController.confirmPasswordReset)
);
router.post(
  '/forgot-password',
  passwordResetRateLimiter,
  validateBody(forgotPasswordSchema),
  asyncHandler(authController.forgotPassword)
);

export default router;
