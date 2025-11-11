/**
 * Database utility functions
 * Transaction helpers and query utilities
 */

const pool = require('../db');
const logger = require('./logger');
const { AppError } = require('../middleware/errorHandler');
const { HTTP_STATUS } = require('../config/constants');

/**
 * Execute query with automatic error handling
 */
const query = async (sql, params = []) => {
    try {
        const [results] = await pool.query(sql, params);
        return results;
    } catch (error) {
        logger.error('Database query error:', { sql, error: error.message });
        throw error;
    }
};

/**
 * Execute query and return single row
 */
const queryOne = async (sql, params = []) => {
    const results = await query(sql, params);
    return results.length > 0 ? results[0] : null;
};

/**
 * Execute transaction with automatic rollback on error
 */
const transaction = async (callback) => {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        logger.debug('Transaction started');
        
        const result = await callback(connection);
        
        await connection.commit();
        logger.debug('Transaction committed');
        
        return result;
    } catch (error) {
        await connection.rollback();
        logger.error('Transaction rolled back:', error);
        throw error;
    } finally {
        connection.release();
    }
};

/**
 * Check if record exists
 */
const exists = async (table, field, value) => {
    const sql = `SELECT 1 FROM ?? WHERE ?? = ? LIMIT 1`;
    const results = await query(sql, [table, field, value]);
    return results.length > 0;
};

/**
 * Get record by ID
 */
const findById = async (table, id) => {
    const sql = `SELECT * FROM ?? WHERE id = ?`;
    return await queryOne(sql, [table, id]);
};

/**
 * Insert record and return inserted ID
 */
const insert = async (table, data) => {
    const fields = Object.keys(data);
    const values = Object.values(data);
    const placeholders = fields.map(() => '?').join(', ');
    
    const sql = `INSERT INTO ?? (${fields.join(', ')}) VALUES (${placeholders})`;
    const result = await query(sql, [table, ...values]);
    
    return result.insertId;
};

/**
 * Update record by ID
 */
const updateById = async (table, id, data) => {
    const fields = Object.keys(data);
    const values = Object.values(data);
    const setClause = fields.map(field => `${field} = ?`).join(', ');
    
    const sql = `UPDATE ?? SET ${setClause} WHERE id = ?`;
    const result = await query(sql, [table, ...values, id]);
    
    return result.affectedRows;
};

/**
 * Delete record by ID
 */
const deleteById = async (table, id) => {
    const sql = `DELETE FROM ?? WHERE id = ?`;
    const result = await query(sql, [table, id]);
    
    return result.affectedRows;
};

/**
 * Paginate query results
 */
const paginate = async (sql, params, page = 1, limit = 50) => {
    const offset = (page - 1) * limit;
    
    // Get total count
    const countSql = `SELECT COUNT(*) as total FROM (${sql}) as count_query`;
    const countResult = await queryOne(countSql, params);
    const total = countResult.total;
    
    // Get paginated results
    const paginatedSql = `${sql} LIMIT ? OFFSET ?`;
    const results = await query(paginatedSql, [...params, limit, offset]);
    
    return {
        data: results,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
};

/**
 * Check database health
 */
const healthCheck = async () => {
    try {
        await query('SELECT 1');
        return { healthy: true, message: 'Database connection is healthy' };
    } catch (error) {
        logger.error('Database health check failed:', error);
        return { healthy: false, message: error.message };
    }
};

module.exports = {
    query,
    queryOne,
    transaction,
    exists,
    findById,
    insert,
    updateById,
    deleteById,
    paginate,
    healthCheck
};
