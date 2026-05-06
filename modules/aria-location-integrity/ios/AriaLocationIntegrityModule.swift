import CoreLocation
import ExpoModulesCore

public class AriaLocationIntegrityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AriaLocationIntegrity")

    Function("isMockLocationDeveloperSettingEnabled") { () -> Bool in
      false
    }

    AsyncFunction("isSoftwareSimulatedLocationAsync") { () -> Bool in
      if #available(iOS 15.0, *) {
        let status = CLLocationManager.authorizationStatus
        guard status == .authorizedWhenInUse || status == .authorizedAlways else {
          return false
        }
        guard let location = CLLocationManager().location else {
          return false
        }
        return location.sourceInformation?.isSimulatedBySoftware == true
      }
      return false
    }
  }
}
