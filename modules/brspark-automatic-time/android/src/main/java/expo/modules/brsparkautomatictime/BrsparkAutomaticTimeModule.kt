package expo.modules.brsparkautomatictime

import android.content.Context
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BrsparkAutomaticTimeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BrsparkAutomaticTime")

    Function("isAutomaticDateTimeEnabled") {
      val ctx = appContext.reactContext ?: return@Function true
      isAutomaticDateTimeEnabled(ctx)
    }
  }

  private fun isAutomaticDateTimeEnabled(context: Context): Boolean {
    return try {
      val cr = context.applicationContext.contentResolver
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1) {
        val autoTime = Settings.Global.getInt(cr, Settings.Global.AUTO_TIME, 0) == 1
        val autoTz = Settings.Global.getInt(cr, Settings.Global.AUTO_TIME_ZONE, 0) == 1
        autoTime && autoTz
      } else {
        @Suppress("DEPRECATION")
        Settings.System.getInt(cr, Settings.System.AUTO_TIME, 0) == 1
      }
    } catch (_: Throwable) {
      true
    }
  }
}
