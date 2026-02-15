import "./styles.css";
import * as icon from "./icons.ts";
import { init, classModule, propsModule, styleModule, attributesModule, eventListenersModule, type VNode, fragment } from "snabbdom";
import { h } from "./h.ts";
import { tokenize } from "./parser.ts";

const env = import.meta.env;

const API_URL = env.VITE_API_URL;
if (env.DEV) console.log("env:", JSON.stringify(env));

type EvalStatus = null | "loading" | "ok" | "err" | "network-err";

type InputType = "asy" | "tex";
type OutputType = "svg" | "png" | "pdf";

type Config = {
    scroller: boolean;
}

type File = {
    name: string;
    code: string;
}

type Context = {
    code: string;
    files: File[];
    currentFile: number;

    cursorPosition: number;

    inputType: InputType;

    outputType: OutputType;
    svgText: string | null;
    pngUrl: string | null;
    pngBlob: Blob | null;
    pdfUrl: string | null;
    pdfBlob: Blob | null;

    status: EvalStatus;
    errorMessage: null | string;

    evalDebounce: boolean;

    copyUrlClicked: boolean;

    copyClicked: boolean;
    saveClicked: boolean;

    demoing: boolean;
};

const code = () => cx.files[cx.currentFile].code || "";
const writeCode = code => cx.files[cx.currentFile].code = code;

const displayInputType = (name: InputType) => ({
    tex: "LaTeX",
    asy: "Asymptote",
}[name]);


const onEditorKeydown = e => {
    if (e.ctrlKey && e.key === "Enter" && code().trim() !== "") { 
        sendEval();
        // event.preventDefault();
    } else if (e.key === 'Tab') {
        e.preventDefault();
        document.execCommand('insertText', false, '    ');
    } else if (e.key === 'Backspace') {
        // event.preventDefault();
    } else if (e.key == "Enter") {
        e.preventDefault()
        document.execCommand('insertLineBreak')
    }
};
const onEditorInput = e => {
    const changed = e.target.textContent || "";
    if (changed === code()) return;  // input called second time after update() hook
    writeCode(changed);
    if (cx.evalDebounce) startEvalDebouncer();
    redraw();
};
const numlines = () => {
    let n = 1;
    for (const c of code()) if (c === "\n") n++;
    return n;
}

const scroll = (el: string | any) => {
    if (typeof el === "string") el = document.querySelector(el)!;
    (el as HTMLElement).scrollIntoView({
        behavior: "smooth",
        block: "start",
    });
}

type TimerJob = number;
let demoTimer: TimerJob | null = null;
let demoCodeIdx = 0;
const demos: Record<InputType, string> = {
    asy: `\
size(10cm,0);
path a,b,c;
a = shift(1,0)*scale(2)*unitcircle;
b = rotate(120)*a;
c = rotate(120)*b;
fill(a, red);
fill(b, green);
fill(c, blue);
fill(buildcycle(a,b), red + green);
fill(buildcycle(b,c), green + blue);
fill(buildcycle(c,a), blue + red);
fill(buildcycle(a,b,c), white);
draw(a^^b^^c);`,

    tex: `\
\\documentclass{article}
\\usepackage[paperwidth=8cm, paperheight=2cm, margin=2mm]{geometry}
\\usepackage{amsmath}
\\usepackage[active,tightpage]{preview}
\\begin{document}
\\begin{preview}
\\Huge $Q(z) = \\sum q_n z^n/n!$
\\end{preview}
\\end{document}`,
}

const startDemo = () => {
    config.scroller && scroll(".editor");

    cancelEvalDebouncer();
    demoTimer = setTimeout(() => {
        const demoCode = demos[cx.inputType] as string;
        demoCodeIdx = 0;
        cx.demoing = true;
        cx.code = "";
        cx.outputType = "svg";
        redraw();
        const next = () => {
            if (demoCodeIdx < demoCode.length) {
                cx.code += demoCode[demoCodeIdx];
                redraw();
                demoCodeIdx++;
                const delay = 20;
                demoTimer = setTimeout(next, delay);
            } else {
                demoTimer = null;
                cx.demoing = false;
                redraw();
                sendEval();
                // (document.querySelector("#send-eval") as HTMLButtonElement).click();
            }
        };
        next();
    }, 20);
};

const contentType = () => {
    switch (cx.outputType) {
        case "svg":
            return "image/svg+xml";
        case "png":
            return "image/png";
        case "pdf":
            return "application/pdf";
        default:
            throw new Error("invalid type " + cx.outputType);
    }
};


const toggleAutoEval = e => {
    if (cx.evalDebounce) cancelEvalDebouncer();
    else startEvalDebouncer();
    cx.evalDebounce = !cx.evalDebounce;
    redraw();
};
const clearBlobUrls = () => {
    cx.pngUrl && URL.revokeObjectURL(cx.pngUrl);
    cx.pngUrl = null;
    cx.pdfUrl && URL.revokeObjectURL(cx.pdfUrl);
    cx.pdfUrl = null;
}

const onOuputTypeChange = (outputType: OutputType) => {
    cx.outputType = outputType;
    sendEval();
};
const onInputTypeChange = (inputType: InputType) => {
    cx.inputType = inputType;
    
    sendEval();
};

const doEvalRequest = async () => {
    let response;
    try {
        response = await fetch(`${API_URL}/eval?i=${cx.inputType}&o=${cx.outputType}`, {
            method: "POST",
            headers: {
                // Accept: contentType(),
            },
            body: code(),
        });
    } catch (exc) {
        cx.status = "network-err";
        cx.errorMessage = `I caught an exception while performing an HTTP request:\n${exc}`;
        return;
    }
    if (!response.ok) {
        cx.status = "network-err";
        cx.errorMessage = `HTTP request returned an error response. Status: ${response.status}, Response: ${await response.text() ?? ""}`;
        return;
    }

    const blob = await response.blob();
    if (response.headers.get("Content-Type") === "application/vnd.asy-compiler-error") {
        cx.status = "err";
        cx.errorMessage = await blob.text();
        return;
    }

    cx.status = "ok";
    switch (cx.outputType) {
        case "svg":
            const svgText = await blob.text();
            cx.svgText = svgText;
            break;
        case "png":
            const pngUrl = URL.createObjectURL(blob);
            cx.pngUrl = pngUrl;
            cx.pngBlob = blob;
            break;
        case "pdf":
            const pdfUrl = URL.createObjectURL(blob);
            cx.pdfUrl = pdfUrl;
            cx.pdfBlob = blob;
            break;
    }
};
const sendEval = async () => {
    if (code().trim() === "") return;

    cancelEvalDebouncer();

    cx.status = "loading" as EvalStatus;
    cx.errorMessage = null;
    redraw();

    clearBlobUrls();

    await doEvalRequest();
    redraw();
    if (cx.status === "ok") setTimeout(() => config.scroller && scroll("#output"), 30);
    else if (cx.status === "err") config.scroller && scroll(".compiler-error");
};

const downloadOutput = () => {
    cx.saveClicked = true;
    redraw();

    const downloadFromBlob = (blob: Blob, name: string): void => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
    switch (cx.outputType) {
        case "svg":
            downloadFromBlob(new Blob([cx.svgText!], { type: contentType() }), "asy.svg");
            break;
        case "png":
            downloadFromBlob(cx.pngBlob!, "asy.png");
            break;
        case "pdf":
            downloadFromBlob(cx.pdfBlob!, "asy.pdf"); 
            break;
    }
};

const copyOutputToClipboard = async () => {
    cx.copyClicked = true;
    redraw();

    try {
        switch (cx.outputType) {
            case "svg":
                await navigator.clipboard.writeText(cx.svgText!);
                break;
            case "png":
                await navigator.clipboard.write([
                    new ClipboardItem(
                        { [contentType()]: cx.pngBlob! 
                    })
                ]);
                break;
            case "pdf":
                await navigator.clipboard.write([
                    new ClipboardItem(
                        { [contentType()]: cx.pdfBlob! 
                    })
                ]);
                break;
        }
    } catch (e) {
        alert(e);
        throw e;
    }
};

let saveDebouncerInterval: TimerJob | null = null;
const saveDebouncerDelay = 3 * 1000;
const cancerSaveDebouncer = () => {
    if (saveDebouncerInterval !== null) {
        clearInterval(saveDebouncerInterval);
        saveDebouncerInterval = null;
    }
};
const startSaveDebouncer = () =>
    setInterval(() => {
        saveContext();
    }, saveDebouncerDelay);

let evalDebouncerTimer: TimerJob | null;
const evalDebouncerDelay = 2 * 1000;
const cancelEvalDebouncer = () => {
    if (evalDebouncerTimer !== null) {
        clearTimeout(evalDebouncerTimer);
        evalDebouncerTimer = null;
    }
};
const startEvalDebouncer = () => {
    cancelEvalDebouncer();

    evalDebouncerTimer = setTimeout(() => {
        sendEval();
    }, evalDebouncerDelay);
};

const renderOutput = () => {
    cx.copyClicked = cx.saveClicked = false;
    switch (cx.outputType) {
    case "svg": return h("div#output-impl", { props: { innerHTML: cx.svgText } });
    case "png": return h("img#output-impl", { props: { src: cx.pngUrl } });
    case "pdf": return h("embed#output-impl", { style: {"min-height": "1150px"}, props: { src: cx.pdfUrl, type: "application/pdf" } });
    }
};

const syHighlight = (code: string) => 
    tokenize(code, cx.inputType)
        .map(token => 
            h("span",  {attrs: {class: [`sy-${token.type}`] } }, token.value))
    ;

const editorTextareaInput = e => {
    writeCode(e.target.value);
    if (cx.evalDebounce) startEvalDebouncer();

    editorSyncScroll(e.target);
    redraw();
};

const onHotkey = (e: KeyboardEvent) => {
    const el = e.target as HTMLTextAreaElement;
    if (e.ctrlKey && e.key === "Enter" && code().trim() !== "") sendEval();
    else if (e.key == 'Enter') {
        //TODO: add indent
    }
    else if (e.key == "Escape") el.blur();
    else if (e.key == 'Tab') {
        e.preventDefault();
        document.execCommand('insertText', false, '    '); // muh deprecated need to updoot
        return;
        // // i have no idea why this is broken.
        // const start = el.selectionStart;
        // const end = el.selectionEnd;
        // const position = start + 4;
        // console.log("range:", start, end);

        // s.code = s.code.substring(0, start) + "    " + s.code.substring(end);
        // console.log("code1", s.code);

        // el.selectionStart = el.selectionEnd = position;
        // redraw();
        // console.log("code2", s.code);
    }
};

let editorContentRef: Element | null = null;
let gutterRef: Element | null = null;
const editorSyncScroll = (textarea: HTMLTextAreaElement) => {
    editorContentRef!.scrollTop = textarea.scrollTop;
    editorContentRef!.scrollLeft = textarea.scrollLeft ;
    gutterRef!.scrollTop = textarea.scrollTop;
}
const renderGutter = () => {
    let length = 1/*eob*/ + code().split("\n").length;
    return Array.from({length}, (_, i) => i < length-1 ? 
        h("div.editor-lnr", { key: i }, `${i+1}`)
        : h("div.editor-lnr.eob", { key: i }, `~`)
    );
}

const renderEditor = (): VNode => {
    return h("div.editor", {
            class: { [cx.status as string]: true },
        },
        h("div.editor-inner", [
            h("div.editor-gutter", {
                    hook: {
                        create: (_: VNode, vnode: VNode) => {
                            gutterRef = vnode.elm as Element;
                        },
                    }
                },
                renderGutter(),
            ),
            h("textarea.editor-textarea", {
                props: {
                    value: code(),
                },
                attrs: {
                    readonly: cx.demoing,
                    spellcheck: "false",
                },
                on: {
                    input: editorTextareaInput,
                    keydown: onHotkey,
                    click: e => config.scroller && scroll(e.target),
                    scroll: e => editorSyncScroll(e.target),
                },

            }),
            h("pre.editor-content", {
                hook: {
                    create: (_: VNode, vnode: VNode) => { 
                        editorContentRef = vnode.elm as Element; 
                    },
                },
            }, syHighlight(code())),
        ])
    )
}



const switchFile = name => {
    cx.currentFile = cx.files.findIndex(file => file.name === name);
};
const createFile = name => {
    cx.files.push({name, code: ""});
}
const deleteFile = name => {
    cx.files.splice(cx.files.findIndex(file => file.name === name), 1);
};
const render = (): VNode => {
    return h("div", [
        h("h1", {}, "Asymptote Evaluator"),

        h("a", { attrs: { href: "https://github.com/immanelg/asy-eval-server" } }, "View the source on GitHub ⭐"),

        false && [
            h("ul", cx.files.map((file, i) => 
                h("li", {
                    key: file.name,
                    on: {
                        click: e => {
                            switchFile(file.name);
                            redraw();
                        },
                    },
                }, file.name+(i===cx.currentFile ? "*" : "")))
            ),
            h("button", {
                on: {
                    click: e => {
                        const n = Date.now()+"new.asy"
                        createFile(n);
                        switchFile(n);
                        redraw();
                    },
                },
            }, "new file"),
        ],

        renderEditor(),

        !cx.demoing && h("div#eval-panel", [
            h("button#send-eval.btn", {
                attrs: { disabled: code().trim() === "" || cx.status === "loading" },
                on: { click: sendEval },
            }, cx.status === "loading" && "Evaluating..." || icon.pair(icon.Run, "Evaluate")),

            h("div.btn.typeswitch", [
                icon.render(icon.Read),
                [
                    h("div.menu-selected", h("span", cx.outputType.toUpperCase())),
                    h("div.menu-options", 
                        ["svg", "png", "pdf"].map(name => 
                            h("div.menu-option", {
                                on: { click: () => onOuputTypeChange(name as OutputType) }
                            }, name.toUpperCase())
                        )
                    ),
                ]
            ]),

            h("div.btn.typeswitch", [
                icon.render(icon.Write),
                [
                    h("div.menu-selected", displayInputType(cx.inputType)),
                    h("div.menu-options", 
                        ["asy", "tex"].map(name => 
                            h("div.menu-option", {
                                on: { click: () => onInputTypeChange(name as InputType) }
                            }, displayInputType(name as InputType))
                        )
                    ),
                ]
            ]),

            h("button.btn.autoEval", {
                class: { active: cx.evalDebounce },
                on: { click: toggleAutoEval },
            }, [
                icon.render(cx.evalDebounce ? icon.Watch : icon.Unwatch),
                "Auto-eval"
            ]),
            h("button#start-demo.btn", { on: { click: startDemo } }, icon.pair(icon.Gift, "Demo!")),
            h("button#copy-url.btn", { 
                on: { 
                    click: async () => {
                        const url = new URL(window.location.href);
                        url.hash = encodeURIComponent(code());
                        await navigator.clipboard.writeText(url.toString());
                        cx.copyUrlClicked = true;
                        redraw();
                        setTimeout(() => {
                            cx.copyUrlClicked = false;
                            redraw();
                        }, 2000); 
                    },
                } 
            }, cx.copyUrlClicked ? icon.pair(icon.Copied, "Copied!") : icon.pair(icon.Copy, "Share URL")),

        ]),

        cx.status === "network-err" && h("pre#network-err", cx.errorMessage),
        cx.status === "err" && [
              h("p", "Compiler errors:"),
              h("pre.compiler-error", {
                      on: {
                          click: e => config.scroller && scroll(e.target),
                      },
                  }, cx.errorMessage),
              h("p", [
                "You are really bad at this, aren't you? Can you even draw a square? Here's some random tutorial: ",
                h("a", { attrs: { href: "https://asymptote.sourceforge.io/asymptote_tutorial.pdf" } }, "Tutorial."),
            ]),
        ],

        cx.status == "ok" && h("div#output", {on: {click: (e: any) => config.scroller && scroll(e.target)}}, [
            renderOutput(),
            h("div#share-panel", [
                h("button#save.btn", { class: {clicked: cx.saveClicked}, on: { click: downloadOutput        } }, 
                    cx.saveClicked ? icon.pair(icon.Save, "Downloaded") : icon.pair(icon.Save, "Download")),
                h("button#copy.btn", { class: {clicked: cx.copyClicked}, on: { click: copyOutputToClipboard } }, 
                    cx.copyClicked ? icon.pair(icon.Copied, "Copied")   : icon.pair(icon.Copy, "Copy")),
            ])
        ])
    ]);
};

// initialize ...

const config: Config = {
    scroller: false,
};

const saveContext = () => {
    // TODO: saveable keys
    localStorage.setItem("state", JSON.stringify(cx));
};

const decodeHash = (): string | null => {
    const hash = window.location.hash.substring(1);
    if (!hash) return null;
    const code = decodeURIComponent(hash) || null;
    return code;
};

const SAVEABLE_KEYS: Array<keyof Context> = [
    "code", 
    "files",
    "currentFile",
    "inputType", "outputType", 
    "evalDebounce",
];
const restoreContext = () => {
    let defaults: Context = {
        code: "",
        files: null,
        currentFile: 0,
        inputType: "asy",
        outputType: "svg",

        svgText: null,
        pngUrl: null,
        pngBlob: null,
        pdfUrl: null,
        pdfBlob: null,

        status: null,
        errorMessage: null,

        evalDebounce: true,

        copyUrlClicked: false,
        copyClicked: false,
        saveClicked: false,

        demoing: false,

        cursorPosition: 0,
    };

    const codeFromHash = decodeHash();
    const fromUrl = codeFromHash ? { code: codeFromHash } : {};

    const saved = {};
    const stored = JSON.parse(localStorage.getItem("state") as any) || {};
    // horrible typescript (i do not care)
    for (const [k, v] of Object.entries(stored)) 
        if (SAVEABLE_KEYS.includes(k as keyof Context)) 
            (saved as any)[k] = v;
    return { ...defaults, ...saved, ...fromUrl };
}

const cx = restoreContext();
(window as any).cx = cx;

if (cx.files === null) {
    cx.files = [{ name: "main.asy", code: "" }];
    cx.currentFile = 0;
}

// window.addEventListener("hashchange", () => {
//     const code = decodeHash();
//     if (s.code !== code) {
//         s.code = code;
//         if (s.enableAutoEval) startAutoEval();
//         redraw();
//     }
// });
// 
const patch = init([classModule, propsModule, attributesModule, styleModule, eventListenersModule]);

let vnode: VNode | null = null;

const redraw = () => {
    if (env.DEV) { console.count("redraw"); }
    vnode = patch(vnode || document.getElementById("app")!, render());
};

// window.addEventListener('resize', () => redraw());

window.onunload = e => {
    saveContext();
};

redraw();

if (cx.evalDebounce) startEvalDebouncer();
startSaveDebouncer();


