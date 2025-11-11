/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check
 *     description: Check API and database health status
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: System is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 database:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: connected
 *                     latencyMs:
 *                       type: integer
 *                       example: 5
 *                 system:
 *                   type: object
 *                   properties:
 *                     hostname:
 *                       type: string
 *                     platform:
 *                       type: string
 *                     cpus:
 *                       type: integer
 *                     memoryUsage:
 *                       type: integer
 *                       description: Memory usage percentage
 *                 uptime:
 *                   type: integer
 *                   description: Server uptime in seconds
 *       500:
 *         description: System is unhealthy
 *
 * /api/metrics:
 *   get:
 *     summary: Get performance metrics
 *     description: Retrieve API performance and system metrics
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: Metrics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 requests:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       description: Total requests processed
 *                     byMethod:
 *                       type: object
 *                       description: Requests grouped by HTTP method
 *                     byStatus:
 *                       type: object
 *                       description: Requests grouped by status code
 *                     topEndpoints:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           endpoint:
 *                             type: string
 *                           count:
 *                             type: integer
 *                 performance:
 *                   type: object
 *                   properties:
 *                     avgResponseTimeMs:
 *                       type: integer
 *                       description: Average response time in milliseconds
 *                     endpoints:
 *                       type: object
 *                       description: Per-endpoint performance metrics
 *                 errors:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     errorRate:
 *                       type: number
 *                       description: Error rate percentage
 *                     byType:
 *                       type: object
 *                 system:
 *                   type: object
 *                   properties:
 *                     cpus:
 *                       type: integer
 *                     totalMemory:
 *                       type: integer
 *                       description: Total memory in MB
 *                     freeMemory:
 *                       type: integer
 *                       description: Free memory in MB
 *                     memoryUsage:
 *                       type: integer
 *                       description: Memory usage percentage
 *                     uptime:
 *                       type: integer
 *                       description: Uptime in seconds
 *
 * /api/metrics/reset:
 *   post:
 *     summary: Reset metrics
 *     description: Reset all performance metrics (admin only)
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Metrics reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
