/**
 * Global settings that can be configured via environment variables or command line arguments
 */

interface GlobalSettings {
  port?: number;
  browser?: string;
}

class Settings {
  private static instance: Settings;
  private settings: GlobalSettings = {};

  private constructor() {
    // Initialize from environment variables
    if (process.env.PORT) {
      const port = parseInt(process.env.PORT, 10);
      if (!isNaN(port)) {
        this.settings.port = port;
      }
    }

    if (process.env.BROWSER) {
      this.settings.browser = process.env.BROWSER;
    }
  }

  static getInstance(): Settings {
    if (!Settings.instance) {
      Settings.instance = new Settings();
    }
    return Settings.instance;
  }

  get port(): number | undefined {
    return this.settings.port;
  }

  set port(value: number | undefined) {
    this.settings.port = value;
  }

  get browser(): string | undefined {
    return this.settings.browser;
  }

  set browser(value: string | undefined) {
    this.settings.browser = value;
  }

  getAll(): GlobalSettings {
    return { ...this.settings };
  }
}

export const globalSettings = Settings.getInstance();
