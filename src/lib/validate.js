/**
 * Request Validation Middleware Factory
 * Creates middleware for validating request body against Zod schemas
 *
 * @module middleware/validate
 *
 * Example usage:
 * ```javascript
 * const userSchema = z.object({
 *   email: z.string().email(),
 *   name: z.string().min(2)
 * });
 *
 * router.post('/users', validateRequest(userSchema), (req, res) => {
 *   // Request body is validated here
 * });
 * ```
 */

import { z } from "zod";

/**
 * Creates middleware for request body validation using Zod schemas
 *
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @returns {Function} Express middleware function
 *
 * @throws {400} If validation fails, returns detailed error messages
 *
 * Error Response Format:
 * ```json
 * {
 *   "message": "Validation failed",
 *   "errors": [
 *     {
 *       "field": "email",
 *       "message": "Invalid email format"
 *     }
 *   ]
 * }
 * ```
 */
const validateRequest = (schema) => async (req, res, next) => {
  try {
    // Validate request body against the provided schema
    await schema.parseAsync(req.body);

    // If validation succeeds, continue to next middleware
    next();
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Validation failed",
        errors: error.errors.map((err) => ({
          // Join nested paths with dots (e.g., "user.address.street")
          field: err.path.join("."),
          message: err.message,
        })),
      });
    }

    // Pass other errors to error handling middleware
    next(error);
  }
};

export default validateRequest;
