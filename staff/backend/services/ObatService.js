/**
 * Obat (Medication) Service
 * Business logic layer for medication operations
 */

const db = require('../utils/database');
const cache = require('../utils/cache');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

class ObatService {
    /**
     * Get all medications with filters
     */
    async getAllObat(category = null, active = null) {
        const cacheKey = `obat:list:${category || 'all'}:${active || 'all'}`;
        
        return cache.getOrSet(cacheKey, async () => {
            let query = 'SELECT * FROM obat WHERE 1=1';
            const params = [];
            
            if (category) {
                query += ' AND category = ?';
                params.push(category);
            }
            
            if (active !== null) {
                query += ' AND is_active = ?';
                params.push(active ? 1 : 0);
            }
            
            query += ' ORDER BY category, name';
            
            const rows = await db.query(query, params);
            logger.info(`Fetched ${rows.length} obat`, { category, active });
            
            return rows;
        }, 'medium');
    }
    
    /**
     * Get medication by ID
     */
    async getObatById(id) {
        const cacheKey = cache.keys.obat(id);
        
        return cache.getOrSet(cacheKey, async () => {
            const obat = await db.findById('obat', id);
            
            if (!obat) {
                throw new AppError('Obat not found', 404);
            }
            
            return obat;
        }, 'medium');
    }
    
    /**
     * Get medication by code
     */
    async getObatByCode(code) {
        const obat = await db.queryOne(
            'SELECT * FROM obat WHERE code = ?',
            [code]
        );
        
        if (!obat) {
            throw new AppError('Obat not found', 404);
        }
        
        return obat;
    }
    
    /**
     * Create new medication
     */
    async createObat(obatData) {
        const { code, name, category, price, stock, unit, min_stock } = obatData;
        
        // Validate required fields
        if (!code || !name || !category || price === undefined) {
            throw new AppError('Missing required fields: code, name, category, price', 400);
        }
        
        // Check if code already exists
        const exists = await db.exists('obat', 'code', code);
        if (exists) {
            throw new AppError('Kode obat sudah digunakan', 400);
        }
        
        // Insert obat
        const insertData = {
            code,
            name,
            category,
            price,
            stock: stock || 0,
            unit: unit || 'tablet',
            min_stock: min_stock || 10,
            is_active: 1
        };
        
        const result = await db.insert('obat', insertData);
        
        // Invalidate cache
        cache.delPattern('obat:');
        
        logger.info('Obat created', { obatId: result.insertId, code, name });
        
        return { id: result.insertId };
    }
    
    /**
     * Update medication
     */
    async updateObat(id, obatData) {
        const { name, category, price, stock, unit, min_stock, is_active } = obatData;
        
        const updateData = {
            name,
            category,
            price,
            stock,
            unit,
            min_stock,
            is_active
        };
        
        const affectedRows = await db.updateById('obat', id, updateData);
        
        if (affectedRows === 0) {
            throw new AppError('Obat not found', 404);
        }
        
        // Invalidate cache
        cache.delPattern('obat:');
        
        logger.info('Obat updated', { obatId: id });
    }
    
    /**
     * Update stock
     */
    async updateStock(id, quantity) {
        const obat = await this.getObatById(id);
        
        const newStock = obat.stock + quantity;
        
        if (newStock < 0) {
            throw new AppError('Insufficient stock', 400);
        }
        
        await db.updateById('obat', id, { stock: newStock });
        
        // Invalidate cache
        cache.delPattern('obat:');
        
        logger.info('Stock updated', { obatId: id, quantity, newStock });
        
        return { newStock };
    }
    
    /**
     * Deduct stock (for sales)
     */
    async deductStock(id, quantity) {
        if (quantity <= 0) {
            throw new AppError('Quantity must be positive', 400);
        }
        
        return this.updateStock(id, -quantity);
    }
    
    /**
     * Add stock (for purchases)
     */
    async addStock(id, quantity) {
        if (quantity <= 0) {
            throw new AppError('Quantity must be positive', 400);
        }
        
        return this.updateStock(id, quantity);
    }
    
    /**
     * Get low stock items
     */
    async getLowStockItems() {
        const rows = await db.query(
            'SELECT * FROM obat WHERE stock <= min_stock AND is_active = 1 ORDER BY stock ASC'
        );
        
        logger.info(`Found ${rows.length} low stock items`);
        
        return rows;
    }
    
    /**
     * Delete medication
     */
    async deleteObat(id) {
        const affectedRows = await db.deleteById('obat', id);
        
        if (affectedRows === 0) {
            throw new AppError('Obat not found', 404);
        }
        
        // Invalidate cache
        cache.delPattern('obat:');
        
        logger.info('Obat deleted', { obatId: id });
    }
}

module.exports = new ObatService();
