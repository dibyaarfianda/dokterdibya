package com.dokterdibya.patient.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokterdibya.patient.data.model.AppVersion
import com.dokterdibya.patient.data.repository.UpdateRepository
import com.dokterdibya.patient.data.service.UpdateService
import com.dokterdibya.patient.data.service.UpdateState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class UpdateViewModel @Inject constructor(
    private val updateRepository: UpdateRepository,
    private val updateService: UpdateService
) : ViewModel() {

    val updateState = updateService.updateState

    private val _showUpdateDialog = MutableStateFlow(false)
    val showUpdateDialog: StateFlow<Boolean> = _showUpdateDialog.asStateFlow()

    private val _availableVersion = MutableStateFlow<AppVersion?>(null)
    val availableVersion: StateFlow<AppVersion?> = _availableVersion.asStateFlow()

    fun checkForUpdate() {
        viewModelScope.launch {
            updateRepository.checkForUpdate().fold(
                onSuccess = { version ->
                    if (version != null) {
                        _availableVersion.value = version
                        _showUpdateDialog.value = true
                        updateService.setUpdateAvailable(version)
                    }
                },
                onFailure = {
                    // Silently fail - don't bother user if update check fails
                }
            )
        }
    }

    fun downloadUpdate() {
        _availableVersion.value?.let { version ->
            _showUpdateDialog.value = false
            updateService.downloadUpdate(version)
        }
    }

    fun installUpdate() {
        updateService.installUpdate()
    }

    fun dismissUpdate() {
        _showUpdateDialog.value = false
        updateService.dismissUpdate()
    }

    fun getCurrentVersionName(): String {
        return updateRepository.getCurrentVersionName()
    }

    fun isForceUpdate(): Boolean {
        return _availableVersion.value?.let {
            updateRepository.isUpdateRequired(it)
        } ?: false
    }
}
