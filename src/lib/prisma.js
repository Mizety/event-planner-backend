/**
 * Prisma Client Instance
 *
 * @module lib/prisma
 *
 * Usage:
 * ```javascript
 * import prisma from '../lib/prisma';
 *
 * // Query examples
 * const user = await prisma.user.findUnique({ where: { id: userId } });
 * const events = await prisma.event.findMany({ include: { creator: true } });
 * ```
 *
 * Important notes:
 * - Requires DATABASE_URL in environment variables
 * - Automatically handles connection pooling
 * - Should be imported and reused across the application
 */

import { PrismaClient } from "@prisma/client";

/**
 * Initialize PrismaClient instance
 * Uses default configuration from schema.prisma
 *
 * Environment variables:
 * @requires DATABASE_URL - PostgreSQL connection string
 *
 * Configuration options can be added here, such as:
 * - log: ['query', 'info', 'warn', 'error']
 * - errorFormat: 'minimal' | 'colorless' | 'pretty'
 * - connectionTimeout: number
 */
const prisma = new PrismaClient();

// Export
export default prisma;
