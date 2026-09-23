package com.dokterdibya.patient.data.socket

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class SocketOptionsTest {
    @Test fun handshakeUsesJwtAndPollingOnly() {
        val options = authenticatedSocketOptions("synthetic-patient-jwt")
        assertEquals("synthetic-patient-jwt", options.auth["token"])
        assertArrayEquals(arrayOf("polling"), options.transports)
        assertFalse(options.upgrade)
    }

    @Test(expected = IllegalArgumentException::class)
    fun missingCredentialsCannotCreateAnonymousOptions() {
        authenticatedSocketOptions(" ")
    }
}
