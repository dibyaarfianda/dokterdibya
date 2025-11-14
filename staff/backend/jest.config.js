module.exports = {
    testEnvironment: 'node',
    coverageDirectory: 'coverage',
    collectCoverageFrom: [
        'routes/v1/patients.js',
        'services/PatientService.js',
        'middleware/**/*.js',
        'utils/**/*.js',
        '!utils/logger.js',
        '!utils/pdf.js',
        '!utils/notification.js',
        '!**/node_modules/**',
        '!**/tests/**'
    ],
    testMatch: [
        '**/tests/**/*.test.js'
    ],
    coverageThreshold: {
        global: {
            branches: 70,
            functions: 70,
            lines: 70,
            statements: 70
        }
    },
    verbose: true,
    testTimeout: 10000,
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
};
