import ExpoModulesCore

/// iOS não expõe API pública para «definir automaticamente» data/hora.
/// O módulo existe para autolinking; a política em iOS é complementada em JS (relógio vs servidor).
public class AriaAutomaticTimeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AriaAutomaticTime")

    Function("isAutomaticDateTimeEnabled") { () -> Bool in
      true
    }
  }
}
