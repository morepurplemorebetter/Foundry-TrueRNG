import { Debug } from "./Debug.js";
import { RandomAPI } from "./RandomAPI.js";
import { Ref } from "./Types.js";
import { LocalStorage } from "./BrowserConfig.js";

/**
 * The main TrueRNG module class
 */
export class TrueRNGModule {
  static instance;

  constructor() {
    if (TrueRNGModule.instance) return TrueRNGModule.instance;
    TrueRNGModule.instance = this;

    // initialize state
    this.randomNumbers = [];
    this.randomGenerator = null;
    this.originalRandomFunction = Math.random;

    this.awaitingResponse = false;
    this.maxCachedNumbers = 50;
    this.updatePoint = 0.5;
    this.hasAlerted = false;
    this.enabled = true;
    this.lastRandomNumber = Math.random();
    this.quickToggleButton = null;

    this.preRNGEventHandler = null;
    this.postRNGEventHandler = null;
  }

  static init() {
    const mod = new TrueRNGModule();
    mod.registerSettings();
    mod.registerHooks();
  }

  registerSettings() {
    const register = (key, data) =>
      game.settings.register("truerng", key, data);

    register("APIKEY", {
      name: "Random.org API Key",
      hint: "Put your developer key from https://api.random.org/dashboard here",
      scope: "world",
      config: true,
      type: String,
      default: "",
      onChange: (value) => {
        Debug.WriteLine(`New API KEY: ${value}`);
        this.updateAPIKey(value);
      },
    });

    register("MAXCACHEDNUMBERS", {
      name: "Max Cached Numbers",
      hint: "Number of random numbers to pull in per client.",
      scope: "world",
      config: true,
      type: Number,
      range: { min: 5, max: 200, step: 1 },
      default: 10,
      onChange: (value) => {
        Debug.WriteLine(`New Max Cached Numbers: ${value}`);
        this.maxCachedNumbers = value;
      },
    });

    register("UPDATEPOINT", {
      name: "Update Point",
      hint: "Percentage of cached numbers before requesting more.",
      scope: "world",
      config: true,
      type: Number,
      range: { min: 1, max: 100, step: 1 },
      default: 50,
      onChange: (value) => {
        Debug.WriteLine(`New Update Point: ${value}`);
        this.updatePoint = parseFloat(value) * 0.01;
      },
    });

    register("DEBUG", {
      name: "Print Debug Messages",
      hint: "Print debug messages to console",
      scope: "client",
      config: true,
      type: Boolean,
      default: true,
      onChange: (value) => {
        Debug.WriteLine(`Debug mode: ${value}`);
      },
    });

    register("ENABLED", {
      name: "Enabled",
      hint: "Enable or disable TrueRNG",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: (value) => {
        Debug.WriteLine(`Enabled/Disabled: ${value}`);
        this.enabled = value;
      },
    });

    register("QUICKTOGGLE", {
      name: "Show Quick Toggle Button",
      hint: "Show button above chat box to toggle TrueRNG",
      scope: "client",
      config: true,
      type: Boolean,
      default: true,
      onChange: (value) => this.toggleQuickButton(value),
    });
  }

  registerHooks() {
    Hooks.once("init", () => this.onInit());
    Hooks.once("renderChatLog", () => this.onRenderChatLog());
  }

  onInit() {
    Debug.WriteLine(`TrueRNGModule initializing...`);
    this.originalRandomFunction = CONFIG.Dice.randomUniform;
    CONFIG.Dice.randomUniform = this.getRandomNumber.bind(this);

    // get settings
    this.enabled = game.settings.get("truerng", "ENABLED");
    this.maxCachedNumbers = parseInt(game.settings.get("truerng", "MAXCACHEDNUMBERS"));
    this.updatePoint = parseFloat(game.settings.get("truerng", "UPDATEPOINT")) * 0.01;

    // try to load api key
    let key = game.settings.get("truerng", "APIKEY");
    if (key && key.length) {
      LocalStorage.Set("TrueRNG.ApiKey", key);
      this.updateAPIKey(key);
    } else if (LocalStorage.Get("TrueRNG.ApiKey", null)) {
      let saved = LocalStorage.Get("TrueRNG.ApiKey");
      game.settings.set("truerng", "APIKEY", saved);
      this.updateAPIKey(saved);
    }
  }

  onRenderChatLog() {
    try {
      const show = game.settings.get("truerng", "QUICKTOGGLE");
      this.generateQuickToggleButton(show);
    } catch (e) {
      Debug.WriteLine(`Error showing quick toggle: ${e}`);
    }
  }

  updateAPIKey(key) {
    this.randomGenerator = new RandomAPI(key);
    this.updateRandomNumbers();
  }

  updateRandomNumbers() {
    if (!this.enabled) return;
    if (this.awaitingResponse) return;

    this.awaitingResponse = true;
    this.randomGenerator
      .GenerateDecimals({ decimalPlaces: 5, n: this.maxCachedNumbers })
      .then((response) => {
        Debug.WriteLine(`New numbers:`, response.data);
        this.randomNumbers = this.randomNumbers.concat(response.data);
      })
      .catch((err) => {
        Debug.WriteLine(`Error: ${err}`);
      })
      .finally(() => {
        this.awaitingResponse = false;
      });
  }

  getRandomNumber() {
    if (!this.enabled) return this.originalRandomFunction();
    if (!this.randomGenerator || !this.randomGenerator.ApiKey) {
      if (!this.hasAlerted) {
        this.hasAlerted = true;
        ui.notifications.warn("TrueRNG missing API key in settings.");
      }
      return this.originalRandomFunction();
    }
    if (!this.randomNumbers.length) {
      this.updateRandomNumbers();
      return this.originalRandomFunction();
    }

    let rngFuncRef = new Ref(this.popRandomNumber.bind(this));
    if (this.preRNGEventHandler) {
      if (this.preRNGEventHandler(this, rngFuncRef)) {
        rngFuncRef.Reference = this.originalRandomFunction;
      }
    }
    if (this.randomNumbers.length / this.maxCachedNumbers < this.updatePoint) {
      this.updateRandomNumbers();
    }
    let random = rngFuncRef.Reference();
    let randomRef = new Ref(random);
    if (this.postRNGEventHandler) {
      this.postRNGEventHandler(this, randomRef);
    }
    this.lastRandomNumber = randomRef.Reference;
    return this.lastRandomNumber;
  }

  popRandomNumber() {
    const ms = Date.now();
    const index = ms % this.randomNumbers.length;
    let rng = this.randomNumbers[index];
    if (rng <= Number.EPSILON) rng = Number.EPSILON;
    this.randomNumbers.splice(index, 1);
    return rng;
  }

  generateQuickToggleButton(show) {
    if (!game.user?.isGM || this.quickToggleButton) return;

    let style = document.createElement("style");
    style.innerHTML = `
      .trhidden { display: none; }
      .trvisible { display: initial; }
      .trquickbutton {
        flex: inherit;
        margin: auto auto;
        text-align: center;
        padding-right: 4px;
      }`;
    document.body.appendChild(style);

    let quickToggleButton = document.createElement("a");
    let chatControls = document.querySelector("#chat-controls");
    let firstChild = document.querySelector("#chat-controls > .chat-control-icon");

    quickToggleButton.id = "TrueRNGQuickToggleButton";
    quickToggleButton.title = "Toggle TrueRNG";
    quickToggleButton.classList.add("trquickbutton");
    quickToggleButton.classList.add(show ? "trvisible" : "trhidden");
    quickToggleButton.innerHTML = game.settings.get("truerng", "ENABLED") ? "ON" : "OFF";

    quickToggleButton.addEventListener("click", () => {
      let enabled = game.settings.get("truerng", "ENABLED");
      game.settings.set("truerng", "ENABLED", !enabled);
      quickToggleButton.innerHTML = !enabled ? "ON" : "OFF";
    });

    chatControls?.insertBefore(quickToggleButton, firstChild);
    this.quickToggleButton = quickToggleButton;
  }

  toggleQuickButton(show) {
    if (show) {
      this.quickToggleButton?.classList.remove("trhidden");
      this.quickToggleButton?.classList.add("trvisible");
    } else {
      this.quickToggleButton?.classList.add("trhidden");
      this.quickToggleButton?.classList.remove("trvisible");
    }
  }
}

// Initialize on Foundry init
Hooks.once("init", () => TrueRNGModule.init());
