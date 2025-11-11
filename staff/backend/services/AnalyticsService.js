/**
 * Analytics Service
 * Business analytics and reporting
 */

const db = require('../utils/database');
const cache = require('../utils/cache');
const logger = require('../utils/logger');

class AnalyticsService {
    /**
     * Get revenue analytics
     */
    async getRevenueAnalytics(startDate, endDate) {
        const cacheKey = `analytics:revenue:${startDate}:${endDate}`;
        
        return cache.getOrSet(cacheKey, async () => {
            // Daily revenue
            const dailyRevenue = await db.query(`
                SELECT 
                    DATE(visit_date) as date,
                    COUNT(*) as visit_count,
                    SUM(total_amount) as total_revenue
                FROM visits
                WHERE visit_date BETWEEN ? AND ?
                AND status = 'finalized'
                GROUP BY DATE(visit_date)
                ORDER BY date ASC
            `, [startDate, endDate]);
            
            // Total summary
            const [summary] = await db.query(`
                SELECT 
                    COUNT(*) as total_visits,
                    SUM(total_amount) as total_revenue,
                    AVG(total_amount) as avg_revenue_per_visit
                FROM visits
                WHERE visit_date BETWEEN ? AND ?
                AND status = 'finalized'
            `, [startDate, endDate]);
            
            logger.info('Revenue analytics generated', { startDate, endDate });
            
            return {
                dailyRevenue,
                summary: summary || { total_visits: 0, total_revenue: 0, avg_revenue_per_visit: 0 }
            };
        }, 'medium');
    }
    
    /**
     * Get patient demographics
     */
    async getPatientDemographics() {
        const cacheKey = 'analytics:demographics';
        
        return cache.getOrSet(cacheKey, async () => {
            // Age distribution
            const ageDistribution = await db.query(`
                SELECT 
                    CASE
                        WHEN age < 18 THEN 'Anak (0-17)'
                        WHEN age BETWEEN 18 AND 30 THEN 'Dewasa Muda (18-30)'
                        WHEN age BETWEEN 31 AND 50 THEN 'Dewasa (31-50)'
                        WHEN age BETWEEN 51 AND 65 THEN 'Lansia (51-65)'
                        WHEN age > 65 THEN 'Lansia Lanjut (65+)'
                        ELSE 'Tidak Diketahui'
                    END as age_group,
                    COUNT(*) as count
                FROM patients
                WHERE age IS NOT NULL
                GROUP BY age_group
                ORDER BY 
                    CASE age_group
                        WHEN 'Anak (0-17)' THEN 1
                        WHEN 'Dewasa Muda (18-30)' THEN 2
                        WHEN 'Dewasa (31-50)' THEN 3
                        WHEN 'Lansia (51-65)' THEN 4
                        WHEN 'Lansia Lanjut (65+)' THEN 5
                        ELSE 6
                    END
            `);
            
            // Total patients
            const [totals] = await db.query(`
                SELECT 
                    COUNT(*) as total_patients,
                    COUNT(CASE WHEN age IS NOT NULL THEN 1 END) as patients_with_age,
                    COUNT(CASE WHEN allergy IS NOT NULL AND allergy != '' THEN 1 END) as patients_with_allergies
                FROM patients
            `);
            
            logger.info('Patient demographics generated');
            
            return {
                ageDistribution,
                totals: totals || { total_patients: 0, patients_with_age: 0, patients_with_allergies: 0 }
            };
        }, 'long');
    }
    
    /**
     * Get medication analytics
     */
    async getMedicationAnalytics(startDate, endDate) {
        const cacheKey = `analytics:medications:${startDate}:${endDate}`;
        
        return cache.getOrSet(cacheKey, async () => {
            // Top medications by usage
            const topMedications = await db.query(`
                SELECT 
                    o.name,
                    o.category,
                    COUNT(*) as usage_count,
                    SUM(vi.quantity) as total_quantity
                FROM visit_items vi
                JOIN obat o ON vi.item_id = o.id
                JOIN visits v ON vi.visit_id = v.id
                WHERE v.visit_date BETWEEN ? AND ?
                AND vi.item_type = 'obat'
                GROUP BY o.id, o.name, o.category
                ORDER BY usage_count DESC
                LIMIT 10
            `, [startDate, endDate]);
            
            // Category distribution
            const categoryDistribution = await db.query(`
                SELECT 
                    o.category,
                    COUNT(DISTINCT vi.visit_id) as visit_count,
                    SUM(vi.quantity) as total_quantity
                FROM visit_items vi
                JOIN obat o ON vi.item_id = o.id
                JOIN visits v ON vi.visit_id = v.id
                WHERE v.visit_date BETWEEN ? AND ?
                AND vi.item_type = 'obat'
                GROUP BY o.category
                ORDER BY visit_count DESC
            `, [startDate, endDate]);
            
            // Low stock items
            const lowStockItems = await db.query(`
                SELECT 
                    name,
                    category,
                    stock,
                    min_stock,
                    (min_stock - stock) as shortage
                FROM obat
                WHERE stock <= min_stock
                AND is_active = 1
                ORDER BY shortage DESC
            `);
            
            logger.info('Medication analytics generated', { startDate, endDate });
            
            return {
                topMedications,
                categoryDistribution,
                lowStockItems
            };
        }, 'medium');
    }
    
    /**
     * Get visit trends
     */
    async getVisitTrends(startDate, endDate) {
        const cacheKey = `analytics:visits:${startDate}:${endDate}`;
        
        return cache.getOrSet(cacheKey, async () => {
            // Daily visit count
            const dailyVisits = await db.query(`
                SELECT 
                    DATE(visit_date) as date,
                    COUNT(*) as visit_count,
                    COUNT(DISTINCT patient_id) as unique_patients
                FROM visits
                WHERE visit_date BETWEEN ? AND ?
                GROUP BY DATE(visit_date)
                ORDER BY date ASC
            `, [startDate, endDate]);
            
            // Day of week distribution
            const dayOfWeekDistribution = await db.query(`
                SELECT 
                    DAYNAME(visit_date) as day_name,
                    DAYOFWEEK(visit_date) as day_number,
                    COUNT(*) as visit_count
                FROM visits
                WHERE visit_date BETWEEN ? AND ?
                GROUP BY day_name, day_number
                ORDER BY day_number
            `, [startDate, endDate]);
            
            // Hour distribution
            const hourDistribution = await db.query(`
                SELECT 
                    HOUR(visit_date) as hour,
                    COUNT(*) as visit_count
                FROM visits
                WHERE visit_date BETWEEN ? AND ?
                GROUP BY hour
                ORDER BY hour
            `, [startDate, endDate]);
            
            logger.info('Visit trends generated', { startDate, endDate });
            
            return {
                dailyVisits,
                dayOfWeekDistribution,
                hourDistribution
            };
        }, 'medium');
    }
    
    /**
     * Get doctor performance metrics
     */
    async getDoctorPerformance(startDate, endDate) {
        const cacheKey = `analytics:doctors:${startDate}:${endDate}`;
        
        return cache.getOrSet(cacheKey, async () => {
            const performance = await db.query(`
                SELECT 
                    doctor_name,
                    COUNT(*) as total_visits,
                    COUNT(DISTINCT patient_id) as unique_patients,
                    AVG(total_amount) as avg_revenue_per_visit,
                    SUM(total_amount) as total_revenue
                FROM visits
                WHERE visit_date BETWEEN ? AND ?
                AND status = 'finalized'
                GROUP BY doctor_name
                ORDER BY total_visits DESC
            `, [startDate, endDate]);
            
            logger.info('Doctor performance generated', { startDate, endDate });
            
            return performance;
        }, 'medium');
    }
    
    /**
     * Get comprehensive dashboard stats
     */
    async getDashboardStats() {
        const cacheKey = 'analytics:dashboard';
        
        return cache.getOrSet(cacheKey, async () => {
            const today = new Date().toISOString().split('T')[0];
            const thisMonth = new Date().toISOString().slice(0, 7);
            
            // Today's stats
            const [todayStats] = await db.query(`
                SELECT 
                    COUNT(*) as visits_today,
                    COUNT(DISTINCT patient_id) as unique_patients_today,
                    SUM(CASE WHEN status = 'finalized' THEN total_amount ELSE 0 END) as revenue_today
                FROM visits
                WHERE DATE(visit_date) = ?
            `, [today]);
            
            // This month's stats
            const [monthStats] = await db.query(`
                SELECT 
                    COUNT(*) as visits_this_month,
                    COUNT(DISTINCT patient_id) as unique_patients_this_month,
                    SUM(CASE WHEN status = 'finalized' THEN total_amount ELSE 0 END) as revenue_this_month
                FROM visits
                WHERE DATE_FORMAT(visit_date, '%Y-%m') = ?
            `, [thisMonth]);
            
            // Total patients
            const [patientStats] = await db.query(`
                SELECT COUNT(*) as total_patients FROM patients
            `);
            
            // Pending appointments
            const [appointmentStats] = await db.query(`
                SELECT COUNT(*) as pending_appointments
                FROM appointments
                WHERE status = 'scheduled'
                AND appointment_date >= ?
            `, [today]);
            
            // Low stock count
            const [stockStats] = await db.query(`
                SELECT COUNT(*) as low_stock_count
                FROM obat
                WHERE stock <= min_stock
                AND is_active = 1
            `);
            
            logger.info('Dashboard stats generated');
            
            return {
                today: todayStats || {},
                thisMonth: monthStats || {},
                patients: patientStats || {},
                appointments: appointmentStats || {},
                stock: stockStats || {}
            };
        }, 'short');
    }
}

module.exports = new AnalyticsService();
