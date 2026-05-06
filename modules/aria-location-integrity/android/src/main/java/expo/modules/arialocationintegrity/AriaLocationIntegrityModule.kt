package expo.modules.arialocationintegrity

import android.content.Context
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AriaLocationIntegrityModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AriaLocationIntegrity")

    Function("isMockLocationDeveloperSettingEnabled") {
      val ctx = appContext.reactContext ?: return@Function false
      isMockLocationDeveloperSettingEnabled(ctx)
    }

    AsyncFunction("isSoftwareSimulatedLocationAsync") {
      false
    }
  }

  private fun isMockLocationDeveloperSettingEnabled(context: Context): Boolean {
    return try {
      val cr = context.applicationContext.contentResolver
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
        @Suppress("DEPRECATION")
        Settings.Secure.getInt(cr, Settings.Secure.ALLOW_MOCK_LOCATION, 0) != 0
      } else {
        val mock = Settings.Secure.getString(cr, "mock_location")
        mock != null && mock.isNotEmpty() && mock != "0"
      }
    } catch (_: Throwable) {
      false
    }
  }
}
