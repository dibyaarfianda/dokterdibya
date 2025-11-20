package com.dokterdibya.app.utils

import java.text.SimpleDateFormat
import java.util.*

object DateUtils {

    fun formatDate(dateString: String?, format: String = Constants.DATE_FORMAT_DISPLAY): String {
        if (dateString == null) return ""

        return try {
            val inputFormat = SimpleDateFormat(Constants.DATE_FORMAT_API, Locale("id", "ID"))
            val outputFormat = SimpleDateFormat(format, Locale("id", "ID"))
            val date = inputFormat.parse(dateString)
            date?.let { outputFormat.format(it) } ?: dateString
        } catch (e: Exception) {
            dateString
        }
    }

    fun formatTime(timeString: String?, format: String = Constants.TIME_FORMAT_DISPLAY): String {
        if (timeString == null) return ""

        return try {
            val inputFormat = SimpleDateFormat(Constants.TIME_FORMAT_API, Locale("id", "ID"))
            val outputFormat = SimpleDateFormat(format, Locale("id", "ID"))
            val time = inputFormat.parse(timeString)
            time?.let { outputFormat.format(it) } ?: timeString
        } catch (e: Exception) {
            timeString
        }
    }

    fun formatDateTime(dateTimeString: String?, format: String = Constants.DATETIME_FORMAT_DISPLAY): String {
        if (dateTimeString == null) return ""

        return try {
            val inputFormat = SimpleDateFormat(Constants.DATETIME_FORMAT_API, Locale("id", "ID"))
            val outputFormat = SimpleDateFormat(format, Locale("id", "ID"))
            val dateTime = inputFormat.parse(dateTimeString)
            dateTime?.let { outputFormat.format(it) } ?: dateTimeString
        } catch (e: Exception) {
            dateTimeString
        }
    }

    fun getCurrentDate(format: String = Constants.DATE_FORMAT_API): String {
        val formatter = SimpleDateFormat(format, Locale("id", "ID"))
        return formatter.format(Date())
    }

    fun getRelativeTimeSpan(dateString: String?): String {
        if (dateString == null) return ""

        return try {
            val inputFormat = SimpleDateFormat(Constants.DATETIME_FORMAT_API, Locale("id", "ID"))
            val date = inputFormat.parse(dateString) ?: return dateString

            val now = Date()
            val diff = now.time - date.time

            val seconds = diff / 1000
            val minutes = seconds / 60
            val hours = minutes / 60
            val days = hours / 24

            when {
                seconds < 60 -> "Baru saja"
                minutes < 60 -> "$minutes menit yang lalu"
                hours < 24 -> "$hours jam yang lalu"
                days < 7 -> "$days hari yang lalu"
                else -> formatDate(dateString)
            }
        } catch (e: Exception) {
            dateString
        }
    }

    fun getSessionName(session: Int): String {
        return when (session) {
            Constants.SESSION_MORNING -> "Pagi (09:00-11:30)"
            Constants.SESSION_AFTERNOON -> "Siang (12:00-14:30)"
            Constants.SESSION_EVENING -> "Sore (15:00-17:30)"
            else -> "Tidak diketahui"
        }
    }
}
