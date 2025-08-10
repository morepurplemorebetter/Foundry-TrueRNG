import { Debug } from "./Debug.js";
import { RandomAPI } from "./RandomAPI.js";
import { Ref } from './Types.js';
import { LocalStorage } from './BrowserConfig.js';
export class TrueRNG {
    constructor() {
        this.RandomNumbers = [];
        this.RandomGenerator = null;
        this.OriginalRandomFunction = Math.random;
        this.PreRNGEventHandler = null;
        this.PostRNGEventHandler = null;
        this.AwaitingResponse = false;
        this.MaxCachedNumbers = 50;
        this.UpdatePoint = 0.5;
        this.HasAlerted = false;
        this.Enabled = true;
        this.LastRandomNumber = Math.random();
        this.QuickToggleButton = null;
    }
    UpdateAPIKey(key) {
        this.RandomGenerator = new RandomAPI(key);
        this.UpdateRandomNumbers();
    }
    GenerateQuickToggleButton(enabled) {
        if (!game.user || !game.user.isGM || this.QuickToggleButton)
            return;
        const style = document.createElement("style");
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
        const quickToggleButton = document.createElement("a");
        const outerDiv = document.querySelector("#chat-controls");
        const firstChild = outerDiv?.firstElementChild;
        quickToggleButton.id = "TrueRNGQuickToggleButton";
        quickToggleButton.title = "Toggle the TrueRNG module";
        quickToggleButton.classList.add("trquickbutton", enabled ? "trvisible" : "trhidden");
        quickToggleButton.innerHTML = game.settings.get("truerng", "ENABLED") ? "RndON" : "RndOFF";
        quickToggleButton.addEventListener("click", () => {
            const isEnabled = game.settings.get("truerng", "ENABLED");
            game.settings.set("truerng", "ENABLED", !isEnabled);
            quickToggleButton.innerHTML = isEnabled ? "RndOFF" : "RndON";
        });
        if (outerDiv) {
            outerDiv.insertBefore(quickToggleButton, firstChild);
        }
        this.QuickToggleButton = quickToggleButton;
    }
    UpdateRandomNumbers() {
        if (!this.Enabled || this.AwaitingResponse)
            return;
        this.AwaitingResponse = true;
        this.RandomGenerator.GenerateDecimals({ decimalPlaces: 5, n: this.MaxCachedNumbers })
            .then((response) => {
            this.RandomNumbers = this.RandomNumbers.concat(response.data);
            // Show seeds in chat if enabled
            if (game.settings.get("truerng", "SHOWSEEDS")) {
                const seedList = response.data.join(", ");
                const message = `<div style="border: 1px solid #444; padding: 8px; margin: 4px 0; background: rgba(0,0,0,0.1);">
                        <strong>🎲 TrueRNG Seeds Fetched:</strong><br>
                        <small style="font-family: monospace;">${seedList}</small><br>
                        <em style="color: #888; font-size: 11px;">Retrieved ${response.data.length} true random seeds from random.org</em>
                    </div>`;
                ChatMessage.create({
                    content: message,
                    whisper: game.users.filter(u => u.isGM).map(u => u.id),
                    speaker: { alias: "TrueRNG System" }
                });
            }
        })
            .catch((reason) => Debug.WriteLine(`Random.org error: ${reason}`))
            .finally(() => this.AwaitingResponse = false);
    }
    GetRandomNumber() {
        if (!this.Enabled || !this.RandomGenerator?.ApiKey) {
            if (!this.HasAlerted) {
                this.HasAlerted = true;
                new Dialog({
                    title: "WARNING MISSING API KEY",
                    content: "You must set an API key in Module Settings for TrueRNG to function.",
                    buttons: { ok: { label: "Ok" } },
                    default: "ok"
                }).render(true);
            }
            return this.OriginalRandomFunction();
        }
        if (!this.RandomNumbers.length) {
            this.UpdateRandomNumbers();
            return this.OriginalRandomFunction();
        }
        let rngFuncReference = new Ref(this.PopRandomNumber.bind(this));
        if (this.PreRNGEventHandler && this.PreRNGEventHandler(this, rngFuncReference)) {
            rngFuncReference.Reference = this.OriginalRandomFunction;
        }
        if ((this.RandomNumbers.length / this.MaxCachedNumbers) < this.UpdatePoint) {
            this.UpdateRandomNumbers();
        }
        let randomNumber = rngFuncReference.Reference();
        let randomNumberRef = new Ref(randomNumber);
        if (this.PostRNGEventHandler) {
            this.PostRNGEventHandler(this, randomNumberRef);
        }
        this.LastRandomNumber = randomNumberRef.Reference;
        return this.LastRandomNumber;
    }
    PopRandomNumber() {
        const ms = new Date().getTime();
        const index = ms % this.RandomNumbers.length;
        let rng = this.RandomNumbers[index];
        if (rng <= Number.EPSILON)
            rng = Number.EPSILON;
        this.RandomNumbers.splice(index, 1);
        return rng;
    }
}
var trueRNG = new TrueRNG();
globalThis.TrueRNG = trueRNG;
Hooks.once('init', () => {
    trueRNG.OriginalRandomFunction = CONFIG.Dice.randomUniform ?? Math.random;
    CONFIG.Dice.randomUniform = trueRNG.GetRandomNumber.bind(trueRNG);
    game.settings.register("truerng", "APIKEY", {
        name: "Random.org API Key",
        hint: "Put your developer key from https://api.random.org/dashboard here",
        scope: "world", config: true, type: String, default: "",
        onChange: value => trueRNG.UpdateAPIKey(value)
    });
    game.settings.register("truerng", "MAXCACHEDNUMBERS", {
        name: "Max Cached Numbers",
        hint: "Number of random numbers to cache per client.",
        scope: "world", config: true, type: Number,
        range: { min: 5, max: 200, step: 1 },
        default: 10,
        onChange: value => trueRNG.MaxCachedNumbers = value
    });
    game.settings.register("truerng", "UPDATEPOINT", {
        name: "Update Point",
        hint: "Percentage of cache to trigger refetch.",
        scope: "world", config: true, type: Number,
        range: { min: 1, max: 100, step: 1 },
        default: 50,
        onChange: value => trueRNG.UpdatePoint = value * 0.01
    });
    game.settings.register("truerng", "DEBUG", {
        name: "Print Debug Messages",
        hint: "Print debug messages to console",
        scope: "client", config: true, type: Boolean,
        default: true,
        onChange: value => Debug.WriteLine(`Debug: ${value}`)
    });
    game.settings.register("truerng", "ENABLED", {
        name: "Enabled",
        hint: "Enables/Disables the module",
        scope: "world", config: true, type: Boolean,
        default: true,
        onChange: value => trueRNG.Enabled = value
    });
    game.settings.register("truerng", "QUICKTOGGLE", {
        name: "Show Quick Toggle Button",
        hint: "Toggle ON/OFF above chat",
        scope: "client", config: true, type: Boolean,
        default: true,
        onChange: value => {
            if (value) {
                trueRNG.QuickToggleButton?.classList.remove("trhidden");
                trueRNG.QuickToggleButton?.classList.add("trvisible");
            }
            else {
                trueRNG.QuickToggleButton?.classList.add("trhidden");
                trueRNG.QuickToggleButton?.classList.remove("trvisible");
            }
        }
    });
    game.settings.register("truerng", "SHOWSEEDS", {
        name: "Show Seeds in Chat",
        hint: "Display fetched random seeds in chat when retrieved from random.org",
        scope: "world", config: true, type: Boolean,
        default: false
    });
    trueRNG.MaxCachedNumbers = parseInt(game.settings.get("truerng", "MAXCACHEDNUMBERS"));
    trueRNG.UpdatePoint = game.settings.get("truerng", "UPDATEPOINT") * 0.01;
    const currentKey = game.settings.get("truerng", "APIKEY");
    if (currentKey?.length) {
        LocalStorage.Set("TrueRNG.ApiKey", currentKey);
        trueRNG.UpdateAPIKey(currentKey);
    }
    else if (LocalStorage.Get("TrueRNG.ApiKey", null)) {
        const savedKey = LocalStorage.Get("TrueRNG.ApiKey");
        game.settings.set("truerng", "APIKEY", savedKey);
        trueRNG.UpdateAPIKey(savedKey);
    }
    trueRNG.Enabled = game.settings.get("truerng", "ENABLED");
});
Hooks.once("renderChatLog", () => {
    let enabled = true;
    try {
        enabled = game.settings.get("truerng", "QUICKTOGGLE");
    }
    catch (e) { }
    trueRNG.GenerateQuickToggleButton(enabled);
});
