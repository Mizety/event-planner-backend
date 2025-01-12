import express from "express";
import prisma from "../lib/prisma.js";
import { verifyToken } from "../middleware/auth.js";
import { z } from "zod";
import validateRequest from "../lib/validate.js";

const router = express.Router();

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

const eventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  date: z.string().datetime(),
  location: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(50),
  imagesUrl: z.array(z.string().url()).default([]).optional(),
  coverUrl: z.string().url(),
});

router.get("/", async (req, res, next) => {
  try {
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

    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      return res
        .status(400)
        .json({ message: "startDate must be before endDate" });
    }

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

router.post(
  "/",
  verifyToken,
  validateRequest(eventSchema),
  async (req, res, next) => {
    try {
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

      req.app.get("io").emit("newEvent", event);
      res.status(201).json(event);
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  "/:id",
  verifyToken,
  validateRequest(eventSchema.partial()),
  async (req, res, next) => {
    try {
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

      req.app
        .get("io")
        .to(`event:${req.params.id}`)
        .emit("eventUpdated", updatedEvent);
      res.json(updatedEvent);
    } catch (error) {
      console.log(error);
      next(error);
    }
  }
);

router.delete("/:id", verifyToken, async (req, res, next) => {
  try {
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

    req.app.get("io").emit("eventDeleted", req.params.id);
    res.json({ message: "Event removed" });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/join", verifyToken, async (req, res, next) => {
  try {
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
    next(error);
  }
});

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
