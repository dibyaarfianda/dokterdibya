/**
 * Unit tests for Auth middleware
 */

const jwt = require('jsonwebtoken');
const { verifyToken, requireRole } = require('../../middleware/auth');
const { AppError } = require('../../middleware/errorHandler');

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
                { expiresIn: '-1s' } // Already expired
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
                    role: 'doctor'
                }
            };
            res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };
            next = jest.fn();
        });

        it('should allow access when user has required role', () => {
            const middleware = requireRole('doctor', 'admin');
            
            middleware(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });

        it('should allow access when user is admin', () => {
            req.user.role = 'admin';
            const middleware = requireRole('superadmin');
            
            middleware(req, res, next);

            expect(next).toHaveBeenCalled();
        });

        it('should deny access when user does not have required role', () => {
            req.user.role = 'nurse';
            const middleware = requireRole('doctor', 'admin');
            
            middleware(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringContaining('Access denied')
                })
            );
            expect(next).not.toHaveBeenCalled();
        });

        it('should deny access when user role is not set', () => {
            delete req.user.role;
            const middleware = requireRole('doctor');
            
            middleware(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(next).not.toHaveBeenCalled();
        });
    });
});
