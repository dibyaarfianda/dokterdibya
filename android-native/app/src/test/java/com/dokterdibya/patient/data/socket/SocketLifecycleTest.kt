package com.dokterdibya.patient.data.socket

import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

class SocketLifecycleTest {
    @Test fun cancelledCollectorCannotInstallSocket() {
        val lifecycle = SocketLifecycle()
        var oldGeneration = 0L
        var connected = false
        lifecycle.replace { oldGeneration = it }
        lifecycle.replace { connected = false }
        assertFalse(lifecycle.runIfCurrent(oldGeneration) { connected = true })
        assertFalse(connected)
    }

    @Test fun replacementAccountRejectsPreviousCollector() {
        val lifecycle = SocketLifecycle()
        var oldGeneration = 0L
        var newGeneration = 0L
        var principal: String? = null
        lifecycle.replace { oldGeneration = it }
        lifecycle.replace { newGeneration = it; principal = null }
        assertFalse(lifecycle.runIfCurrent(oldGeneration) { principal = "old-account" })
        assertTrue(lifecycle.runIfCurrent(newGeneration) { principal = "new-account" })
        assertEquals("new-account", principal)
    }

    @Test fun disconnectSerializesWithCollectorAlreadyInstalling() {
        val lifecycle = SocketLifecycle()
        var generation = 0L
        var connected = false
        lifecycle.replace { generation = it }
        val entered = CountDownLatch(1)
        val finishInstall = CountDownLatch(1)
        val disconnected = CountDownLatch(1)
        val collector = thread {
            lifecycle.runIfCurrent(generation) {
                entered.countDown()
                assertTrue(finishInstall.await(2, TimeUnit.SECONDS))
                connected = true
            }
        }
        assertTrue(entered.await(2, TimeUnit.SECONDS))
        val logout = thread { lifecycle.replace { connected = false }; disconnected.countDown() }
        finishInstall.countDown()
        assertTrue(disconnected.await(2, TimeUnit.SECONDS))
        collector.join(); logout.join()
        assertFalse(connected)
        assertFalse(lifecycle.runIfCurrent(generation) { connected = true })
    }
}
