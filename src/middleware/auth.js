/**
 * JWT Authentication Middleware
 * Verifies JWT tokens from the Authorization header and extracts user information
 *
 * @module middleware/auth
 *
 * Usage:
 * ```javascript
 * router.get('/protected-route', verifyToken, (req, res) => {
 *   // Access req.userId and req.token here
 * });
 * ```
 */

import jwt from "jsonwebtoken";

/**
 * Middleware to verify JWT tokens and attach user data to request
 * Expects token in Authorization header with format: "Bearer <token>"
 *
 * @param {Object} req - Express request object
 * @param {Object} req.headers - Request headers
 * @param {string} [req.headers.authorization] - Authorization header containing JWT
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 *
 * @throws {401} If no token is provided
 * @throws {401} If token is invalid or expired
 *
 * @modifies {req}
 * @property {string} req.userId - Decoded user ID from token
 * @property {string} req.token - Original JWT token
 */
export const verifyToken = (req, res, next) => {
  // Extract token from Authorization header
  // Format: "Bearer <token>"
  const token = req.headers.authorization?.split(" ")[1];

  // Check if token exists
  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    // Verify and decode the token
    // Throws error if token is invalid or expired
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user data to request object
    req.userId = decoded.userId; // Used for user identification in routes
    req.token = token; // Original token, might be needed for refresh logic

    // Continue to next middleware/route handler
    next();
  } catch (error) {
    // Handle various JWT verification errors
    res.status(401).json({ message: "Invalid token" });
  }
};
