// Test setup file
// Runs before all tests

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';
process.env.DB_NAME = 'dibyaklinik_test';
process.env.PORT = '3001';

// Mock mysql2/promise so db.js does not exit the process during tests
const mockConnection = {
    release: jest.fn(),
    on: jest.fn()
};

const mockPool = {
    getConnection: jest.fn(async () => mockConnection),
    on: jest.fn(),
    end: jest.fn().mockResolvedValue()
};

jest.mock('mysql2/promise', () => ({
    createPool: jest.fn(() => mockPool)
}));

// Increase timeout for integration tests
jest.setTimeout(10000);

// Mock console methods to reduce noise
global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};
