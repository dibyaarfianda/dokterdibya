// Firebase initialization for AdminLTE app
// Tries to use window.__firebase_config if provided; falls back to known project config from index-asli.html

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

const fallbackConfig = {
    apiKey: 'AIzaSyA7lWAOBUI0X2l0PCtB6_EUlmX6sNQhgvg',
    authDomain: 'klinikprivatedrdibya.firebaseapp.com',
    databaseURL: 'https://klinikprivatedrdibya-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'klinikprivatedrdibya',
    storageBucket: 'klinikprivatedrdibya.appspot.com',
    messagingSenderId: '943850005223',
    appId: '1:943850005223:web:8ae5d5e2f63c298eb7b842'
};

const firebaseConfig = (typeof window !== 'undefined' && window.__firebase_config) ? JSON.parse(window.__firebase_config) : fallbackConfig;

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);


