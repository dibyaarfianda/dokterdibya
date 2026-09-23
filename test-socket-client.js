// Test Socket.IO broadcast
// Paste this in Node.js REPL or create test endpoint

const io = require('socket.io-client');

// Connect to server
if (!process.env.SOCKET_TEST_TOKEN) throw new Error('Provide SOCKET_TEST_TOKEN for an authenticated local test');
const socket = io('http://localhost:3000', {
    transports: ['polling'], upgrade: false,
    auth: { token: process.env.SOCKET_TEST_TOKEN }
});

socket.on('connect', () => {
    console.log('Test client connected:', socket.id);
    
    // Emit test event
    socket.emit('test_from_client', { message: 'Hello from test client' });
});

socket.on('test_event', (data) => {
    console.log('Test event received');
});

socket.on('revision_requested', (data) => {
    console.log('revision_requested received');
});

socket.on('disconnect', () => {
    console.log('Test client disconnected');
});
