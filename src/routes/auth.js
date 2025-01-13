/**
 * Authentication Router
 * Handles user registration, login, and session management
 * Implements security features including:
 * - Password hashing
 * - JWT token generation
 * - Rate limiting
 * - Input validation
 */

import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.js";
import rateLimit from "express-rate-limit";
import validateRequest from "../lib/validate.js";

const router = express.Router();

/**
 * User registration schema validation
 * @typedef {Object} UserSchema
 * @property {string} email - User's email address
 * @property {string} password - Password with specific requirements
 * @property {string} name - User's display name
 */
const userSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(
      /[^A-Za-z0-9]/,
      "Password must contain at least one special character"
    ),
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name too long"),
});

/**
 * Login request schema validation
 * @typedef {Object} LoginSchema
 * @property {string} email - User's email address
 * @property {string} password - User's password
 */
const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

/**
 * Rate limiter configuration for authentication endpoints
 * Prevents brute force attacks by limiting login attempts
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 15, // Limit each IP to 15 requests per window
  message: { message: "Too many login attempts. Please try again later." },
});

/**
 * POST /api/auth/register
 * Registers a new user
 * @param {UserSchema} req.body - Registration details
 * @returns {Object} User data and JWT token
 * @throws {409} If email is already registered
 * @throws {400} If validation fails
 */
router.post("/register", validateRequest(userSchema), async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Check for existing user
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      return res.status(409).json({ message: "Email already registered" });
    }

    // Hash password and create user
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    // Generate JWT token
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: "24h",
      algorithm: "HS256",
    });

    res.status(201).json({ token, user });
  } catch (error) {
    console.error("[Register Error]:", error);
    res.status(500).json({ message: "Failed to create account" });
  }
});

/**
 * POST /api/auth/login
 * Authenticates a user and returns a JWT token
 * Implements rate limiting to prevent brute force attacks
 * @param {LoginSchema} req.body - Login credentials
 * @returns {Object} User data and JWT token
 * @throws {401} If credentials are invalid
 * @throws {429} If rate limit is exceeded
 */
router.post(
  "/login",
  authLimiter,
  validateRequest(loginSchema),
  async (req, res) => {
    try {
      const { email, password } = req.body;

      // Find user and include password for verification
      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          name: true,
          password: true,
        },
      });

      // Generic error message for security
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Generate JWT token
      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
        expiresIn: "24h",
        algorithm: "HS256",
      });

      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;
      res.json({ token, user: userWithoutPassword });
    } catch (error) {
      console.error("[Login Error]:", error);
      res.status(500).json({ message: "Authentication failed" });
    }
  }
);

/**
 * GET /api/auth/me
 * Retrieves the current authenticated user's data
 * Requires valid JWT token in Authorization header
 * @param {string} req.userId - User ID from JWT token (added by verifyToken middleware)
 * @returns {Object} Current user data
 * @throws {404} If user is not found
 */
router.get("/me", verifyToken, async (req, res) => {
  try {
    // Fetch user data excluding password
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ ...user, token: req.token });
  } catch (error) {
    console.error("[Me Error]:", error);
    res.status(500).json({ message: "Failed to fetch user data" });
  }
});

export default router;
