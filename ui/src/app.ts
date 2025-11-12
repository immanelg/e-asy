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


type State = {
    code: string;
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

    enableAutoEval: boolean;

    copyUrlClicked: boolean;

    copyClicked: boolean;
    saveClicked: boolean;

    demoing: boolean;
};


const displayInputType = (name: InputType) => ({
    tex: "LaTeX",
    asy: "Asymptote",
}[name]);


const onEditorKeydown = e => {
    if (e.ctrlKey && e.key === "Enter" && s.code.trim() !== "") { 
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
    if (changed === s.code) return;  // input called second time after update() hook
    s.code = changed;
    if (s.enableAutoEval) startAutoEval();
    redraw();
};
const numlines = () => {
    let n = 1;
    for (const c of s.code) if (c === "\n") n++;
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
    scroll(".editor");

    cancelAutoEval();
    demoTimer = setTimeout(() => {
        const demoCode = demos[s.inputType] as string;
        demoCodeIdx = 0;
        s.demoing = true;
        s.code = "";
        s.outputType = "svg";
        redraw();
        const next = () => {
            if (demoCodeIdx < demoCode.length) {
                s.code += demoCode[demoCodeIdx];
                redraw();
                demoCodeIdx++;
                const delay = 20;
                demoTimer = setTimeout(next, delay);
            } else {
                demoTimer = null;
                s.demoing = false;
                redraw();
                sendEval();
                // (document.querySelector("#send-eval") as HTMLButtonElement).click();
            }
        };
        next();
    }, 20);
};

const contentType = () => {
    switch (s.outputType) {
        case "svg":
            return "image/svg+xml";
        case "png":
            return "image/png";
        case "pdf":
            return "application/pdf";
        default:
            throw new Error("invalid type " + s.outputType);
    }
};


const toggleAutoEval = e => {
    if (s.enableAutoEval) cancelAutoEval();
    else startAutoEval();
    s.enableAutoEval = !s.enableAutoEval;
    redraw();
};
const clearBlobUrls = () => {
    s.pngUrl && URL.revokeObjectURL(s.pngUrl);
    s.pngUrl = null;
    s.pdfUrl && URL.revokeObjectURL(s.pdfUrl);
    s.pdfUrl = null;
}

const onOuputTypeChange = (outputType: OutputType) => {
    s.outputType = outputType;
    sendEval();
};
const onInputTypeChange = (inputType: InputType) => {
    s.inputType = inputType;
    
    sendEval();
};

const doEvalRequest = async () => {
    let response;
    try {
        response = await fetch(`${API_URL}/eval?i=${s.inputType}&o=${s.outputType}`, {
            method: "POST",
            headers: {
                // Accept: contentType(),
            },
            body: s.code,
        });
    } catch (exc) {
        s.status = "network-err";
        s.errorMessage = `I caught an exception while performing an HTTP request:\n${exc}`;
        return;
    }
    if (!response.ok) {
        s.status = "network-err";
        s.errorMessage = `HTTP request returned an error response. Status: ${response.status}, Response: ${await response.text() ?? ""}`;
        return;
    }

    const blob = await response.blob();
    if (response.headers.get("Content-Type") === "application/vnd.asy-compiler-error") {
        s.status = "err";
        s.errorMessage = await blob.text();
        return;
    }

    s.status = "ok";
    switch (s.outputType) {
        case "svg":
            const svgText = await blob.text();
            s.svgText = svgText;
            break;
        case "png":
            const pngUrl = URL.createObjectURL(blob);
            s.pngUrl = pngUrl;
            s.pngBlob = blob;
            break;
        case "pdf":
            const pdfUrl = URL.createObjectURL(blob);
            s.pdfUrl = pdfUrl;
            s.pdfBlob = blob;
            break;
    }
};
const sendEval = async () => {
    if (s.code.trim() === "") return;

    cancelAutoEval();

    s.status = "loading" as EvalStatus;
    s.errorMessage = null;
    redraw();

    clearBlobUrls();

    await doEvalRequest();
    redraw();
    if (s.status === "ok") setTimeout(() => scroll("#output"), 30);
    else if (s.status === "err") scroll("#compiler-error");
};

const downloadOutput = () => {
    s.saveClicked = true;
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
    switch (s.outputType) {
        case "svg":
            downloadFromBlob(new Blob([s.svgText!], { type: contentType() }), "asy.svg");
            break;
        case "png":
            downloadFromBlob(s.pngBlob!, "asy.png");
            break;
        case "pdf":
            downloadFromBlob(s.pdfBlob!, "asy.pdf"); 
            break;
    }
};

const copyOutputToClipboard = async () => {
    s.copyClicked = true;
    redraw();

    try {
        switch (s.outputType) {
            case "svg":
                await navigator.clipboard.writeText(s.svgText!);
                break;
            case "png":
                await navigator.clipboard.write([
                    new ClipboardItem(
                        { [contentType()]: s.pngBlob! 
                    })
                ]);
                break;
            case "pdf":
                await navigator.clipboard.write([
                    new ClipboardItem(
                        { [contentType()]: s.pdfBlob! 
                    })
                ]);
                break;
        }
    } catch (e) {
        alert(e);
        throw e;
    }
};

let autosaveInterval: TimerJob | null = null;
const autosaveMs = 3 * 1000;
const cancelAutosave = () => {
    if (autosaveInterval !== null) {
        clearInterval(autosaveInterval);
        autosaveInterval = null;
    }
};
const startAutosave = () =>
    setInterval(() => {
        saveState();
    }, autosaveMs);

let autoEvalTimer: TimerJob | null;
const autoEvalDelay = 2 * 1000;
const cancelAutoEval = () => {
    if (autoEvalTimer !== null) {
        clearTimeout(autoEvalTimer);
        autoEvalTimer = null;
    }
};
const startAutoEval = () => {
    cancelAutoEval();

    autoEvalTimer = setTimeout(() => {
        sendEval();
    }, autoEvalDelay);
};

const renderOutput = () => {
    s.copyClicked = s.saveClicked = false;
    switch (s.outputType) {
    case "svg": return h("div#output-impl", { props: { innerHTML: s.svgText } });
    case "png": return h("img#output-impl", { props: { src: s.pngUrl } });
    case "pdf": return h("embed#output-impl", { style: {"min-height": "1150px"}, props: { src: s.pdfUrl, type: "application/pdf" } });
    }
};

const syHighlight = (code: string) => 
    tokenize(code, s.inputType)
        .map(token => 
            h("span",  {attrs: {class: [`sy-${token.type}`] } }, token.value))
    ;

const editorTextareaInput = e => {
    s.code = e.target.value;
    if (s.enableAutoEval) startAutoEval();

    editorSyncScroll(e.target);
    redraw();
};

const onHotkey = (e: KeyboardEvent) => {
    const el = e.target as HTMLTextAreaElement;
    if (e.ctrlKey && e.key === "Enter" && s.code.trim() !== "") sendEval();
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
const gutter = () => {
    let length = s.code.split("\n").length;
    length++; // eob
    return Array.from({length}, (_, i) => i < length-1 ? 
        h("div.editor-lnr", { key: i }, `${i+1}`)
        : h("div.editor-lnr.eob", { key: i }, `~`)
    );
}

const renderEditor = (): VNode => {
    return h("div.editor",

        h("div.editor-inner", [
            h("div.editor-gutter", {
                    hook: {
                        create: (_: VNode, vnode: VNode) => {
                            gutterRef = vnode.elm as Element;
                        },
                    }
                },
                gutter(),
            ),
            h("textarea.editor-textarea", {
                props: {
                    value: s.code,
                },
                attrs: {
                    readonly: s.demoing,
                    spellcheck: "false",
                },
                class: { [s.status as string]: true },
                on: {
                    input: editorTextareaInput,
                    keydown: onHotkey,
                    click: e => scroll(e.target),
                    scroll: e => editorSyncScroll(e.target),
                },

            }),
            h("pre.editor-content", {
                hook: {
                    create: (_: VNode, vnode: VNode) => { 
                        editorContentRef = vnode.elm as Element; 
                    },
                },
            }, syHighlight(s.code)),
        ])
    )
}



const render = (): VNode => {
    return h("div", [
        h("h1", {}, "Asymptote Evaluator"),

        h("a", { attrs: { href: "https://github.com/immanelg/asy-eval-server" } }, "View the source on GitHub ⭐"),

        renderEditor(),

        !s.demoing && h("div#eval-panel", [
            h("button#send-eval.btn", {
                attrs: { disabled: s.code.trim() === "" || s.status === "loading" },
                on: { click: sendEval },
            }, s.status === "loading" && "Evaluating..." || icon.pair(icon.Run, "Evaluate")),

            h("div.btn.typeswitch", [
                icon.render(icon.Read),
                [
                    h("div.menu-selected", h("span", s.outputType.toUpperCase())),
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
                    h("div.menu-selected", displayInputType(s.inputType)),
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
                class: { active: s.enableAutoEval },
                on: { click: toggleAutoEval },
            }, [
                icon.render(s.enableAutoEval ? icon.Watch : icon.Unwatch),
                "Auto-eval"
            ]),
            h("button#start-demo.btn", { on: { click: startDemo } }, icon.pair(icon.Gift, "Demo!")),
            h("button#copy-url.btn", { 
                on: { 
                    click: async () => {
                        await navigator.clipboard.writeText(window.location.href+encodeURIComponent(s.code));
                        s.copyUrlClicked = true;
                        redraw();
                        setTimeout(() => {
                            s.copyUrlClicked = false;
                            redraw();
                        }, 2000); 
                    },
                } 
            }, s.copyUrlClicked ? icon.pair(icon.Copied, "Copied!") : icon.pair(icon.Copy, "Share URL")),

        ]),

        s.status === "network-err" && h("pre#network-err", s.errorMessage),
        s.status === "err" && [
              h("p", "Compiler errors:"),
              h("pre#compiler-error", {
                      on: {
                          click: e => scroll(e.target),
                      },
                  }, s.errorMessage),
              h("p", [
                "You are really bad at this, aren't you? Can you even draw a square? Here's some random tutorial: ",
                h("a", { attrs: { href: "https://asymptote.sourceforge.io/asymptote_tutorial.pdf" } }, "Tutorial."),
            ]),
        ],

        s.status == "ok" && h("div#output", {on: {click: (e: any) => scroll(e.target)}}, [
            renderOutput(),
            h("div#share-panel", [
                h("button#save.btn", { class: {clicked: s.saveClicked}, on: { click: downloadOutput        } }, 
                    s.saveClicked ? icon.pair(icon.Save, "Downloaded") : icon.pair(icon.Save, "Download")),
                h("button#copy.btn", { class: {clicked: s.copyClicked}, on: { click: copyOutputToClipboard } }, 
                    s.copyClicked ? icon.pair(icon.Copied, "Copied")   : icon.pair(icon.Copy, "Copy")),
            ])
        ])
    ]);
};

// initialize ...

const saveState = () => {
    localStorage.setItem("state", JSON.stringify(s));
};

const decodeHash = (): string | null => {
    const hash = window.location.hash.substring(1);
    if (!hash) return null;
    const code = decodeURIComponent(hash) || null;
    return code;
};

const loadState = () => {
    let defaults: State = {
        code: "",
        inputType: "asy",
        outputType: "svg",

        svgText: null,
        pngUrl: null,
        pngBlob: null,
        pdfUrl: null,
        pdfBlob: null,

        status: null,
        errorMessage: null,

        enableAutoEval: true,

        copyUrlClicked: false,
        copyClicked: false,
        saveClicked: false,

        demoing: false,

        cursorPosition: 0,
    };

    const codeFromHash = decodeHash();
    const fromUrl = codeFromHash ? { code: codeFromHash } : {};

    const saved = JSON.parse(localStorage.getItem("state") as any) || {};
    return { ...defaults, ...saved, ...fromUrl };
}

const s = loadState();

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

redraw();

if (s.enableAutoEval) startAutoEval();
startAutosave();


