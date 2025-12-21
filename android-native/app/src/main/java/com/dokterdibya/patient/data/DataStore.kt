package com.dokterdibya.patient.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStore

// Shared DataStore for app preferences
val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "app_prefs")
