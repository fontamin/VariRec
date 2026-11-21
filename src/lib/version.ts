// Single source of truth for the app version. Read from package.json so a
// version bump updates the header badge, the footer and the exported
// filenames together.
import pkg from "../../package.json";

export const APP_VERSION: string = pkg.version;
