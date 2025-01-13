/**
 * Events Router
 * Handles all event-related operations including CRUD operations,
 * attendee management, and real-time updates via Socket.IO
 */

import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.js";
import { z } from "zod";
import validateRequest from "../lib/validate.js";

const router = express.Router();

/**
 * Query parameters validation schema
 * @typedef {Object} QuerySchema
 * @property {number} page - Page number for pagination (min: 1)
 * @property {number} limit - Number of items per page (min: 1, max: 100)
 * @property {string} [category] - Optional category filter
 * @property {string} [startDate] - Optional start date filter (ISO datetime)
 * @property {string} [endDate] - Optional end date filter (ISO datetime)
 * @property {string} [search] - Optional search term for title and description
 * @property {('date'|'title'|'attendeeCount')} [sortBy] - Field to sort by
 * @property {('asc'|'desc')} [sortOrder] - Sort direction
 */
const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  category: z.string().trim().min(1).toLowerCase().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  search: z.string().trim().min(1).optional(),
  sortBy: z.enum(["date", "title", "attendeeCount"]).default("date"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

/**
 * Event data validation schema
 * @typedef {Object} EventSchema
 * @property {string} title - Event title (1-200 chars)
 * @property {string} description - Event description (1-2000 chars)
 * @property {string} date - Event date (ISO datetime)
 * @property {string} location - Event location (1-200 chars)
 * @property {string} category - Event category (1-50 chars)
 * @property {string[]} [imagesUrl] - Optional array of image URLs
 * @property {string} coverUrl - Required cover image URL
 */
const eventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  date: z.string().datetime(),
  location: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(50),
  imagesUrl: z.array(z.string().url()).default([]).optional(),
  coverUrl: z.string().url(),
});

/**
 * GET /api/events
 * Lists events with pagination, filtering, and sorting
 * @param {QuerySchema} req.query - Query parameters for filtering and pagination
 * @returns {Object} Paginated events with metadata
 */
router.get("/", async (req, res, next) => {
  try {
    // Validate and parse query parameters
    const query = querySchema.parse(req.query);
    const {
      page,
      limit,
      category,
      startDate,
      endDate,
      search,
      sortBy,
      sortOrder,
    } = query;

    // Validate date range if both dates are provided
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      return res
        .status(400)
        .json({ message: "startDate must be before endDate" });
    }

    // Construct the where clause for filtering
    const where = {
      AND: [
        category ? { category } : {},
        startDate ? { date: { gte: new Date(startDate) } } : {},
        endDate ? { date: { lte: new Date(endDate) } } : {},
        search
          ? {
              OR: [
                { title: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    };

    // Execute queries in a transaction for consistency
    const [total, events] = await prisma.$transaction([
      prisma.event.count({ where }),
      prisma.event.findMany({
        where,
        include: {
          creator: { 
            select: { id: true, name: true, email: true },
          },
          attendees: { 
            select: { id: true, name: true },
         },
          _count: { 
            select: { attendees: true },
           },
        },
        orderBy:
          sortBy === "attendeeCount"
            ? { attendees: { _count: sortOrder } }
            : { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);

    res.json({
      events,
      pagination: {
        currentPage: page,
        totalPages,
        totalEvents: total,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        limit,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Invalid query parameters",
        errors: error.errors,
      });
    }
    next(error);
  }
});

/**
 * GET /api/events/:id
 * Retrieves a single event by ID with creator and attendee details
 * @param {string} req.params.id - Event ID
 */
router.get("/:id", async (req, res, next) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: {
        creator: { 
          select: { name: true, email: true },
       },
        attendees: { 
          select: { id: true, name: true, email: true },
         },
      },
    });

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    res.json(event);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/events
 * Creates a new event
 * Requires authentication
 * Emits 'newEvent' socket event
 * @param {EventSchema} req.body - Event data
 */
router.post(
  "/",
  verifyToken,
  validateRequest(eventSchema),
  async (req, res, next) => {
    try {
      // Create event with authenticated user as creator
      const event = await prisma.event.create({
        data: {
          ...req.body,
          date: new Date(req.body.date),
          creator: { connect: { id: req.userId } },
        },
        include: {
          creator: { 
            select: { name: true, email: true },
          },
        },
      });

      // Emit socket event for real-time updates
      req.app.get("io").emit("newEvent", event);
      res.status(201).json(event);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/events/:id
 * Updates an existing event
 * Requires authentication and creator ownership
 * Emits 'eventUpdated' socket event
 * @param {string} req.params.id - Event ID
 * @param {Partial<EventSchema>} req.body - Updated event data
 */
router.put(
  "/:id",
  verifyToken,
  validateRequest(eventSchema.partial()),
  async (req, res, next) => {
    try {
      // Verify event exists and user is the creator
      const event = await prisma.event.findUnique({
        where: { id: req.params.id },
        select: { creatorId: true },
      });

      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      if (event.creatorId !== req.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      // Update event
      const updatedEvent = await prisma.event.update({
        where: { id: req.params.id },
        data: {
          ...req.body,
          date: req.body.date ? new Date(req.body.date) : undefined,
        },
        include: {
          creator: { 
            select: { name: true, email: true },
           },
          attendees: { 
            select: { id: true, name: true, email: true },
           },
        },
      });

      // Emit socket event for real-time updates
      req.app
        .get("io")
        .to(`event:${req.params.id}`)
        .emit("eventUpdated", updatedEvent);
      res.json(updatedEvent);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/events/:id
 * Deletes an event
 * Requires authentication and creator ownership
 * Emits 'eventDeleted' socket event
 * @param {string} req.params.id - Event ID
 */
router.delete("/:id", verifyToken, async (req, res, next) => {
  try {
    // Verify event exists and user is the creator
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      select: { creatorId: true },
    });

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (event.creatorId !== req.userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    await prisma.event.delete({ 
      where: { id: req.params.id },
     });

    // Emit socket event for real-time updates
    req.app.get("io").emit("eventDeleted", req.params.id);
    res.json({ message: "Event removed" });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/events/:id/join
 * Adds the authenticated user to event attendees
 * Emits 'eventUpdated' socket event
 * @param {string} req.params.id - Event ID
 */
router.post("/:id/join", verifyToken, async (req, res, next) => {
  try {
    // Check if event exists and user hasn't already joined
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: { attendees: { select: { id: true } } },
    });

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (event.attendees.some((attendee) => attendee.id === req.userId)) {
      return res.status(400).json({ message: "Already joined" });
    }

    // Add user to attendees
    const updatedEvent = await prisma.event.update({
      where: { id: req.params.id },
      data: { 
        attendees: { 
          connect: { id: req.userId },
        },
       },
      include: {
        creator: { 
          select: { name: true, email: true },
         },
        attendees: { 
          select: { id: true, name: true, email: true },
         },
      },
    });

    // Emit socket event for real-time updates
    req.app
      .get("io")
      .to(`event:${req.params.id}`)
      .emit("eventUpdated", updatedEvent);
    res.json(updatedEvent);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/events/:id/leave
 * Removes the authenticated user from event attendees
 * Emits 'eventUpdated' socket event
 * @param {string} req.params.id - Event ID
 */
router.post("/:id/leave", verifyToken, async (req, res, next) => {
  try {
    const updatedEvent = await prisma.event.update({
      where: { id: req.params.id },
      data: { 
        attendees: { 
          disconnect: { id: req.userId },
         },
         },
      include: {
        creator: { 
          select: { name: true, email: true },
       },
        attendees: { 
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Emit socket event for real-time updates
    req.app
      .get("io")
      .to(`event:${req.params.id}`)
      .emit("eventUpdated", updatedEvent);
    res.json(updatedEvent);
  } catch (error) {
    next(error);
  }
});

export default router;
