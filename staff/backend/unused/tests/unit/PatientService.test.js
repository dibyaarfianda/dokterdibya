/**
 * Unit tests for PatientService
 */

const PatientService = require('../../services/PatientService');
const db = require('../../utils/database');
const cache = require('../../utils/cache');
const { AppError } = require('../../middleware/errorHandler');

// Mock dependencies
jest.mock('../../utils/database');
jest.mock('../../utils/cache');
jest.mock('../../utils/logger');

describe('PatientService', () => {
    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
    });

    describe('getAllPatients', () => {
        it('should return all patients from cache if available', async () => {
            const mockPatients = [
                { id: 'P001', full_name: 'John Doe', age: 30 },
                { id: 'P002', full_name: 'Jane Smith', age: 25 }
            ];

            cache.getOrSet.mockResolvedValue(mockPatients);

            const result = await PatientService.getAllPatients();

            expect(result).toEqual(mockPatients);
            expect(cache.getOrSet).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(Function),
                'short'
            );
        });

        it('should fetch from database when cache misses', async () => {
            const mockPatients = [{ id: 'P001', full_name: 'John Doe' }];
            
            cache.getOrSet.mockImplementation(async (key, fn) => fn());
            db.query.mockResolvedValue(mockPatients);

            const result = await PatientService.getAllPatients();

            expect(db.query).toHaveBeenCalled();
            expect(result).toEqual(mockPatients);
        });

        it('should apply search filter when provided', async () => {
            cache.getOrSet.mockImplementation(async (key, fn) => fn());
            db.query.mockResolvedValue([]);

            await PatientService.getAllPatients('John');

            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('LIKE'),
                expect.arrayContaining(['%John%'])
            );
        });

        it('should apply limit when provided', async () => {
            cache.getOrSet.mockImplementation(async (key, fn) => fn());
            db.query.mockResolvedValue([]);

            await PatientService.getAllPatients(null, 10);

            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('LIMIT'),
                expect.arrayContaining([10])
            );
        });
    });

    describe('getPatientById', () => {
        it('should return patient by ID', async () => {
            const mockPatient = { id: 'P001', full_name: 'John Doe' };
            
            cache.getOrSet.mockResolvedValue(mockPatient);

            const result = await PatientService.getPatientById('P001');

            expect(result).toEqual(mockPatient);
        });

        it('should throw AppError when patient not found', async () => {
            cache.getOrSet.mockImplementation(async (key, fn) => fn());
            db.findById.mockResolvedValue(null);

            await expect(PatientService.getPatientById('INVALID'))
                .rejects
                .toThrow(AppError);
        });
    });

    describe('createPatient', () => {
        it('should create patient successfully', async () => {
            const patientData = {
                id: 'P001',
                full_name: 'John Doe',
                birth_date: '1990-01-01'
            };

            db.exists.mockResolvedValue(false);
            db.insert.mockResolvedValue({ insertId: 1 });
            cache.delPattern.mockReturnValue(0);

            const result = await PatientService.createPatient(patientData);

            expect(result).toHaveProperty('id', 'P001');
            expect(result).toHaveProperty('age');
            expect(db.insert).toHaveBeenCalledWith('patients', expect.any(Object));
            expect(cache.delPattern).toHaveBeenCalledWith('patients:');
        });

        it('should throw error when required fields missing', async () => {
            await expect(PatientService.createPatient({}))
                .rejects
                .toThrow(AppError);
        });

        it('should throw error when patient ID already exists', async () => {
            const patientData = { id: 'P001', full_name: 'John Doe' };
            db.exists.mockResolvedValue(true);

            await expect(PatientService.createPatient(patientData))
                .rejects
                .toThrow('Patient ID already exists');
        });

        it('should calculate age from birth_date', async () => {
            const patientData = {
                id: 'P001',
                full_name: 'John Doe',
                birth_date: '2000-01-01'
            };

            db.exists.mockResolvedValue(false);
            db.insert.mockResolvedValue({ insertId: 1 });
            cache.delPattern.mockReturnValue(0);

            const result = await PatientService.createPatient(patientData);

            expect(result.age).toBeGreaterThan(20);
            expect(result.age).toBeLessThan(30);
        });
    });

    describe('updatePatient', () => {
        it('should update patient successfully', async () => {
            const patientData = {
                full_name: 'John Updated',
                birth_date: '1990-01-01'
            };

            db.updateById.mockResolvedValue(1);
            cache.delPattern.mockReturnValue(0);

            const result = await PatientService.updatePatient('P001', patientData);

            expect(result).toHaveProperty('age');
            expect(db.updateById).toHaveBeenCalledWith('patients', 'P001', expect.any(Object));
            expect(cache.delPattern).toHaveBeenCalledWith('patients:');
        });

        it('should throw error when patient not found', async () => {
            db.updateById.mockResolvedValue(0);

            await expect(PatientService.updatePatient('INVALID', {}))
                .rejects
                .toThrow('Patient not found');
        });
    });

    describe('deletePatient', () => {
        it('should delete patient successfully', async () => {
            db.deleteById.mockResolvedValue(1);
            cache.delPattern.mockReturnValue(0);

            await PatientService.deletePatient('P001');

            expect(db.deleteById).toHaveBeenCalledWith('patients', 'P001');
            expect(cache.delPattern).toHaveBeenCalledWith('patients:');
        });

        it('should throw error when patient not found', async () => {
            db.deleteById.mockResolvedValue(0);

            await expect(PatientService.deletePatient('INVALID'))
                .rejects
                .toThrow('Patient not found');
        });
    });

    describe('_calculateAge', () => {
        it('should calculate age correctly', () => {
            const birthDate = '2000-01-01';
            const age = PatientService._calculateAge(birthDate);

            expect(age).toBeGreaterThan(20);
            expect(age).toBeLessThan(30);
        });

        it('should handle leap year birthdays', () => {
            const birthDate = '2000-02-29';
            const age = PatientService._calculateAge(birthDate);

            expect(typeof age).toBe('number');
            expect(age).toBeGreaterThan(0);
        });
    });
});
