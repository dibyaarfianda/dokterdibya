const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const db = require('../db');

// JWT Secret - Should be in environment variable in production
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d';

// Google OAuth Client
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ message: 'Token tidak ditemukan' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Token tidak valid' });
    }
};

// Register with email
router.post('/register', async (req, res) => {
    try {
        const { fullname, email, phone, password } = req.body;
        
        // Validation
        if (!fullname || !email || !phone || !password) {
            return res.status(400).json({ message: 'Semua field harus diisi' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ message: 'Password minimal 6 karakter' });
        }
        
        // Check if email already exists
        const [existingUsers] = await db.query(
            'SELECT id FROM web_patients WHERE email = ?',
            [email]
        );
        
        if (existingUsers.length > 0) {
            return res.status(400).json({ message: 'Email sudah terdaftar' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Insert patient
        const [result] = await db.query(
            `INSERT INTO web_patients (fullname, email, phone, password, registration_date, status) 
             VALUES (?, ?, ?, ?, NOW(), 'active')`,
            [fullname, email, phone, hashedPassword]
        );
        
        const patientId = result.insertId;
        
        // Generate JWT token
        const token = jwt.sign(
            { 
                id: patientId, 
                email, 
                fullname,
                role: 'patient'
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );
        
        res.status(201).json({
            message: 'Registrasi berhasil',
            token,
            user: {
                id: patientId,
                fullname,
                email,
                phone,
                role: 'patient'
            }
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan saat registrasi' });
    }
});

// Login with email
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Validation
        if (!email || !password) {
            return res.status(400).json({ message: 'Email dan password harus diisi' });
        }
        
        // Find patient by email
        const [patients] = await db.query(
            'SELECT * FROM web_patients WHERE email = ? AND status = "active"',
            [email]
        );
        
        if (patients.length === 0) {
            return res.status(401).json({ message: 'Email atau password salah' });
        }
        
        const patient = patients[0];
        
        // Check if patient has a password (might be Google auth only)
        if (!patient.password) {
            return res.status(401).json({ message: 'Akun ini terdaftar dengan Google. Silakan login dengan Google.' });
        }
        
        // Verify password
        const isPasswordValid = await bcrypt.compare(password, patient.password);
        
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Email atau password salah' });
        }
        
        // Generate JWT token
        const token = jwt.sign(
            { 
                id: patient.id, 
                email: patient.email, 
                fullname: patient.fullname,
                role: 'patient'
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );
        
        res.json({
            message: 'Login berhasil',
            token,
            user: {
                id: patient.id,
                fullname: patient.fullname,
                email: patient.email,
                phone: patient.phone,
                role: 'patient'
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan saat login' });
    }
});

// Google OAuth Login/Register
router.post('/auth/google', async (req, res) => {
    try {
        const { credential } = req.body;
        
        // Verify Google token
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: GOOGLE_CLIENT_ID
        });
        
        const payload = ticket.getPayload();
        const { email, name, sub: googleId, picture } = payload;
        
        // Check if patient exists
        const [existingPatients] = await db.query(
            'SELECT * FROM web_patients WHERE email = ?',
            [email]
        );
        
        let patient;
        
        if (existingPatients.length > 0) {
            // Update Google ID if not set
            patient = existingPatients[0];
            if (!patient.google_id) {
                await db.query(
                    'UPDATE web_patients SET google_id = ?, photo_url = ? WHERE id = ?',
                    [googleId, picture, patient.id]
                );
            }
        } else {
            // Create new patient
            const [result] = await db.query(
                `INSERT INTO web_patients (fullname, email, google_id, photo_url, registration_date, status) 
                 VALUES (?, ?, ?, ?, NOW(), 'active')`,
                [name, email, googleId, picture]
            );
            
            patient = {
                id: result.insertId,
                fullname: name,
                email,
                phone: null,
                google_id: googleId,
                photo_url: picture
            };
        }
        
        // Generate JWT token
        const token = jwt.sign(
            { 
                id: patient.id, 
                email: patient.email, 
                fullname: patient.fullname,
                role: 'patient'
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );
        
        res.json({
            message: 'Login dengan Google berhasil',
            token,
            user: {
                id: patient.id,
                fullname: patient.fullname,
                email: patient.email,
                phone: patient.phone,
                photo_url: patient.photo_url,
                role: 'patient'
            }
        });
        
    } catch (error) {
        console.error('Google auth error:', error);
        res.status(401).json({ message: 'Autentikasi Google gagal' });
    }
});

// Verify token endpoint
router.get('/verify', verifyToken, (req, res) => {
    res.json({
        valid: true,
        user: req.user
    });
});

// Get current user profile
router.get('/profile', verifyToken, async (req, res) => {
    try {
        const [patients] = await db.query(
            'SELECT id, fullname, email, phone, photo_url, birth_date, age, registration_date, profile_completed FROM web_patients WHERE id = ?',
            [req.user.id]
        );
        
        if (patients.length === 0) {
            return res.status(404).json({ message: 'Pasien tidak ditemukan' });
        }
        
        res.json({ user: patients[0] });
        
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan' });
    }
});

// Update user profile
router.put('/profile', verifyToken, async (req, res) => {
    try {
        const { fullname, email, phone, birth_date, age } = req.body;
        
        // Validation
        if (!fullname || !email || !phone) {
            return res.status(400).json({ message: 'Nama, email, dan nomor telepon harus diisi' });
        }
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ message: 'Format email tidak valid' });
        }
        
        // Check if email is taken by another user
        const [existingUsers] = await db.query(
            'SELECT id FROM web_patients WHERE email = ? AND id != ?',
            [email, req.user.id]
        );
        
        if (existingUsers.length > 0) {
            return res.status(400).json({ message: 'Email sudah digunakan oleh pengguna lain' });
        }
        
        // Update patient data
        await db.query(
            `UPDATE web_patients 
             SET fullname = ?, email = ?, phone = ?, birth_date = ?, age = ?, updated_at = NOW()
             WHERE id = ?`,
            [fullname, email, phone, birth_date || null, age || null, req.user.id]
        );
        
        // Fetch updated profile
        const [updatedPatient] = await db.query(
            'SELECT id, fullname, email, phone, photo_url, birth_date, age, registration_date FROM web_patients WHERE id = ?',
            [req.user.id]
        );
        
        res.json({ 
            message: 'Profil berhasil diperbarui',
            user: updatedPatient[0]
        });
        
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan saat menyimpan profil' });
    }
});

// Complete profile (first-time setup)
router.post('/complete-profile', verifyToken, async (req, res) => {
    try {
        const { fullname, phone, birth_date, age } = req.body;
        
        // Validation
        if (!fullname || !phone || !birth_date) {
            return res.status(400).json({ message: 'Nama, nomor telepon, dan tanggal lahir harus diisi' });
        }
        
        // Validate phone format (Indonesian mobile)
        const phoneRegex = /^08\d{8,12}$/;
        if (!phoneRegex.test(phone)) {
            return res.status(400).json({ message: 'Format nomor telepon tidak valid. Harus dimulai dengan 08' });
        }
        
        // Update patient data and mark profile as completed
        await db.query(
            `UPDATE web_patients 
             SET fullname = ?, phone = ?, birth_date = ?, age = ?, profile_completed = 1, updated_at = NOW()
             WHERE id = ?`,
            [fullname, phone, birth_date, age || null, req.user.id]
        );
        
        // Fetch updated profile
        const [updatedPatient] = await db.query(
            'SELECT id, fullname, email, phone, photo_url, birth_date, age, registration_date, profile_completed FROM web_patients WHERE id = ?',
            [req.user.id]
        );
        
        res.json({ 
            message: 'Profil berhasil dilengkapi',
            user: updatedPatient[0]
        });
        
    } catch (error) {
        console.error('Complete profile error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan saat menyimpan profil' });
    }
});

module.exports = router;
