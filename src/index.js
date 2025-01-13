/**
 * Event Management Platform Server
 * Express server with Socket.IO integration for real-time features
 *
 * @module server
 *
 * Features:
 * - REST API endpoints for authentication, events, and image uploads
 * - Real-time event updates via Socket.IO
 * - CORS configuration for secure client-server communication
 * - JSON request parsing
 */

import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import authRoutes from "./routes/auth.js";
import eventRoutes from "./routes/events.js";
import imageRoutes from "./routes/image.js";

/**
 * Express application instance
 * Handles HTTP requests and middleware configuration
 */
const app = express();

/**
 * HTTP server instance
 * Required for Socket.IO integration with Express
 */
const httpServer = createServer(app);

/**
 * Socket.IO server instance
 * Configured with CORS settings matching Express
 *
 * @requires FRONTEND_URL - URL of the frontend application
 */
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL, // Allow connections only from frontend
    credentials: true, // Enable credentials (cookies, auth headers)
  },
});

/**
 * Middleware Configuration
 *
 * 1. CORS setup for secure cross-origin requests
 * 2. JSON body parsing for request payloads
 */
app.use(
  cors({
    origin: process.env.FRONTEND_URL, // Match Socket.IO CORS configuration
    credentials: true,
  })
);
app.use(express.json());

/**
 * API Routes
 *
 * /api/auth   - Authentication endpoints (login, register, me)
 * /api/events - Event management endpoints (CRUD, join/leave)
 * /api/images - Image upload endpoint
 */
app.use("/api/auth", authRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/images", imageRoutes);

/**
 * Socket.IO Event Handlers
 *
 * Events:
 * - connection: New client connected
 * - joinEvent: Client joins an event room for real-time updates
 *
 * Room Format: `event:${eventId}`
 */
io.on("connection", (socket) => {
  // Handle client joining specific event room
  socket.on("joinEvent", (eventId) => {
    socket.join(`event:${eventId}`);
  });
});

/**
 * Make Socket.IO instance available to routes
 * Allows emitting events from route handlers
 *
 * Usage in routes:
 * ```javascript
 * req.app.get("io").emit("eventUpdated", data);
 * ```
 */
app.set("io", io);

/**
 * Server Initialization
 *
 * @requires PORT - Port number from environment variables or default 5000
 */
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
