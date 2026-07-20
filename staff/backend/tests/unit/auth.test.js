/**
 * Unit tests for Auth middleware
 */

jest.mock('../../db', () => ({
    query: jest.fn()
}));

const jwt = require('jsonwebtoken');
const db = require('../../db');
const {
    verifyToken,
    requireRole,
    requireDoctorRole,
    optionalAuth,
    recordFailedAttempt,
    isAccountLocked,
    clearFailedAttempts,
    requirePermission
} = require('../../middleware/auth');
const { ROLE_IDS, ROLE_NAMES } = require('../../constants/roles');

describe('Auth Middleware', () => {
    describe('verifyToken', () => {
        let req, res, next;

        beforeEach(() => {
            req = {
                headers: {}
            };
            res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };
            next = jest.fn();
        });

        it('should verify valid token and set req.user', () => {
            const token = jwt.sign(
                { id: 1, username: 'testuser', role: 'admin' },
                process.env.JWT_SECRET
            );

            req.headers.authorization = `Bearer ${token}`;

            verifyToken(req, res, next);

            expect(req.user).toBeDefined();
            expect(req.user.id).toBe(1);
            expect(req.user.username).toBe('testuser');
            expect(next).toHaveBeenCalled();
        });

        it('should reject request without authorization header', () => {
            verifyToken(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.any(String)
                })
            );
            expect(next).not.toHaveBeenCalled();
        });

        it('should reject request with invalid token format', () => {
            req.headers.authorization = 'InvalidFormat token123';

            verifyToken(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
        });

        it('should reject request with expired token', () => {
            const token = jwt.sign(
                { id: 1, username: 'testuser' },
                process.env.JWT_SECRET,
                { expiresIn: '-1s' }
            );

            req.headers.authorization = `Bearer ${token}`;

            verifyToken(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
        });

        it('should reject request with invalid signature', () => {
            const token = jwt.sign(
                { id: 1, username: 'testuser' },
                'wrong-secret'
            );

            req.headers.authorization = `Bearer ${token}`;

            verifyToken(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('requireRole', () => {
        let req, res, next;

        beforeEach(() => {
            req = {
                user: {
                    id: 1,
                    username: 'testuser',
                    role: ROLE_NAMES.ADMIN,
                    role_id: ROLE_IDS.ADMIN
                }
            };
            res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };
            next = jest.fn();
        });

        it('should allow access when user has required role', () => {
            const middleware = requireRole(ROLE_IDS.ADMIN, ROLE_IDS.MANAGERIAL);
            middleware(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });

        it('should deny access when user lacks required elevated role', () => {
            req.user.role = ROLE_NAMES.ADMIN;
            req.user.role_id = ROLE_IDS.ADMIN;
            const middleware = requireRole(ROLE_IDS.DOKTER);

            middleware(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(next).not.toHaveBeenCalled();
        });

        it('should deny access when user does not have required role', () => {
            req.user.role = ROLE_NAMES.BIDAN;
            req.user.role_id = ROLE_IDS.BIDAN;
            const middleware = requireRole(ROLE_IDS.ADMIN, ROLE_IDS.MANAGERIAL);

            middleware(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringContaining('Insufficient permissions')
                })
            );
            expect(next).not.toHaveBeenCalled();
        });

        it('should deny access when user role_id is not set', () => {
            delete req.user.role_id;
            const middleware = requireRole(ROLE_IDS.ADMIN);

            middleware(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('requireDoctorRole', () => {
        const createResponse = () => ({
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        });

        it('allows only the canonical doctor role id', () => {
            const next = jest.fn();
            requireDoctorRole({
                user: { id: 1, role_id: ROLE_IDS.DOKTER, role: ROLE_NAMES.DOKTER }
            }, createResponse(), next);
            expect(next).toHaveBeenCalledTimes(1);
        });

        it('rejects an unauthenticated request', () => {
            const res = createResponse();
            const next = jest.fn();
            requireDoctorRole({}, res, next);
            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
        });

        it('rejects non-doctors even when is_superadmin is true', () => {
            for (const role of [ROLE_NAMES.MANAGERIAL, ROLE_NAMES.ADMIN, ROLE_NAMES.FRONT_OFFICE, ROLE_NAMES.BIDAN]) {
                const res = createResponse();
                const next = jest.fn();
                requireDoctorRole({ user: { id: 9, role, role_id: ROLE_IDS.ADMIN, is_superadmin: true } }, res, next);
                expect(res.status).toHaveBeenCalledWith(403);
                expect(next).not.toHaveBeenCalled();
            }
        });

        it('rejects a rewritten dokter claim when the canonical role id is non-doctor', () => {
            const res = createResponse();
            const next = jest.fn();
            requireDoctorRole({
                user: {
                    id: 9,
                    role: ROLE_NAMES.DOKTER,
                    role_id: ROLE_IDS.MANAGERIAL,
                    is_superadmin: true
                }
            }, res, next);
            expect(res.status).toHaveBeenCalledWith(403);
            expect(next).not.toHaveBeenCalled();
        });
    });
});

describe('optionalAuth', () => {
    it('skips when header missing', () => {
        const req = { headers: {} };
        const next = jest.fn();
        optionalAuth(req, {}, next);
        expect(next).toHaveBeenCalled();
        expect(req.user).toBeUndefined();
    });

    it('attaches decoded user when token present', () => {
        const token = jwt.sign({ id: 10, role: 'nurse' }, process.env.JWT_SECRET);
        const req = {
            headers: {
                authorization: `Bearer ${token}`
            }
        };
        const next = jest.fn();

        optionalAuth(req, {}, next);

        expect(req.user).toMatchObject({ id: 10, role: 'nurse' });
        expect(next).toHaveBeenCalled();
    });
});

describe('failed attempt tracking helpers', () => {
    const email = 'lock@test.com';

    afterEach(() => {
        clearFailedAttempts(email);
    });

    it('locks account after repeated failures', () => {
        for (let i = 0; i < 5; i++) {
            recordFailedAttempt(email);
        }

        expect(isAccountLocked(email)).toBe(true);
        clearFailedAttempts(email);
        expect(isAccountLocked(email)).toBe(false);
    });
});

describe('requirePermission', () => {
    let req;
    let res;
    let next;

    beforeEach(() => {
        req = {
            user: { id: 1, role: ROLE_NAMES.ADMIN, role_id: ROLE_IDS.ADMIN },
            context: { requestId: 'req-1' }
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        next = jest.fn();
        jest.clearAllMocks();
    });

    it('allows superadmin without querying DB', async () => {
        req.user.role = ROLE_NAMES.DOKTER;
        req.user.role_id = ROLE_IDS.DOKTER;
        const middleware = requirePermission('patients:read');

        await middleware(req, res, next);

        expect(db.query).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
    });

    it('allows when user has required permission', async () => {
        db.query.mockResolvedValueOnce([[{ name: 'patients:read' }]]);
        const middleware = requirePermission('patients:read');

        await middleware(req, res, next);

        expect(next).toHaveBeenCalled();
    });

    it('denies when user lacks permission', async () => {
        db.query.mockResolvedValueOnce([[]]);
        const middleware = requirePermission('patients:write');

        await middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
        expect(next).not.toHaveBeenCalled();
    });
});
