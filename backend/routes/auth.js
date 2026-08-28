// Authentication routes -- Phase 7.1
// Registration + email verification. Login/JWT lands in 7.1b.

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../db');
const { requireAuth, COOKIE_NAME } = require('../middleware/auth');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');

// Roles that must belong to an organization, and therefore must supply a
// valid invite code at registration. This is what prevents someone from
// self-claiming to be a verified hospital and filing fake critical requests.
const ORG_ROLES = ['hospital', 'bank', 'ngo'];
// 'admin' is deliberately NOT registerable -- admins are created directly
// in the database. Public admin signup would be an obvious security hole.
const PUBLIC_ROLES = ['hospital', 'bank', 'ngo', 'donor'];

const BCRYPT_ROUNDS = 10;
const TOKEN_TTL_HOURS = 24;
const RESET_TOKEN_TTL_MINUTES = 60;

// Cookie options shared between setting (login) and clearing (logout).
// secure/sameSite differ by environment because of a real browser rule:
// SameSite=None (needed for cross-origin requests, i.e. production, where
// frontend and backend are different domains) REQUIRES Secure (HTTPS-only).
// Localhost dev isn't HTTPS, so in dev we rely on the Vite proxy making
// requests same-origin instead, and use Lax there.
function cookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days, matches JWT_EXPIRES_IN default
    path: '/',
  };
}

