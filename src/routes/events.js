// src/routes/events.js
import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.js";
import { z } from "zod";
const router = express.Router();

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  category: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  search: z.string().optional(),
  sortBy: z.enum(["date", "title", "attendeeCount"]).default("date"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

router.get("/", async (req, res) => {
  try {
    // Validate and parse query parameters
    const {
      page,
      limit,
      category,
      startDate,
      endDate,
      search,
      sortBy,
      sortOrder,
    } = querySchema.parse(req.query);

    // Build where clause
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

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get total count for pagination
    const total = await prisma.event.count({ where });

    // Get events with pagination
    const events = await prisma.event.findMany({
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
      skip,
      take: limit,
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.json({
      events,
      pagination: {
        currentPage: page,
        totalPages,
        totalEvents: total,
        hasNextPage,
        hasPrevPage,
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

    console.error("Events fetch error:", error);
    res.status(500).json({
      message: "Failed to fetch events",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

router.get("/:id", async (req, res) => {
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
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/", verifyToken, async (req, res) => {
  try {
    console.log(req.body);
    const { title, description, date, location, category, imageUrl } = req.body;

    const event = await prisma.event.create({
      data: {
        title,
        description,
        date: new Date(date),
        location,
        category,
        imageUrl,
        creator: { connect: { id: req.userId } },
      },
      include: {
        creator: {
          select: { name: true, email: true },
        },
      },
    });
    console.log(event);
    req.app.get("io").emit("newEvent", event);
    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/:id", verifyToken, async (req, res) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
    });

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (event.creatorId !== req.userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const updatedEvent = await prisma.event.update({
      where: { id: req.params.id },
      data: req.body,
      include: {
        creator: {
          select: { name: true, email: true },
        },
      },
    });

    req.app
      .get("io")
      .to(`event:${req.params.id}`)
      .emit("eventUpdated", updatedEvent);
    res.json(updatedEvent);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
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

    req.app.get("io").emit("eventDeleted", req.params.id);
    res.json({ message: "Event removed" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/:id/join", verifyToken, async (req, res) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: { attendees: true },
    });

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (event.attendees.some((attendee) => attendee.id === req.userId)) {
      return res.status(400).json({ message: "Already joined" });
    }

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

    req.app
      .get("io")
      .to(`event:${req.params.id}`)
      .emit("eventUpdated", updatedEvent);
    res.json(updatedEvent);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/:id/leave", verifyToken, async (req, res) => {
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

    req.app
      .get("io")
      .to(`event:${req.params.id}`)
      .emit("eventUpdated", updatedEvent);
    res.json(updatedEvent);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
