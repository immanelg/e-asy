
type TokenType = 
    | "None"
    | "Ident"
    | "Keyword"
    | "String"
    | "Number"
    | "Operator"
    | "Punctuation"

type Token = {type: TokenType, value: string}

const lexdef = {
  operators: [
    "+", "-", "*", "/", "#", "%", "^", "**",
    "==", "!=", "<", "<=", ">", ">=",
    "&&", "||", "!",
    "&", "|",
    "=", "+=", "-=", "*=", "/=", "#=", "%=", "^=",
    "++", "--",
    "::", "..", "---", "^^",
    "<<", ">>", "$", "$$", "@", "@@", "~", "<>",
    "controls", "tension", "atleast", "curl"
  ],
  keywords: [
    "and",
    "controls",
    "tension",
    "atleast",
    "curl",
    "if",
    "else",
    "while",
    "for",
    "do",
    "return",
    "break",
    "continue",
    "struct",
    "typedef",
    "new",
    "access",
    "import",
    "unravel",
    "from",
    "include",
    "quote",
    "static",
    "public",
    "private",
    "restricted",
    "this",
    "explicit",
    "operator"
  ],
  punctuation: [
    ",", ":", ";", "(", ")", "[", "]", "{", "}", ".", "..."
  ],
  literals: [
    "true", "false", "null", "cycle", "newframe"
  ]
}

const isnum = (c: string): boolean => {
    const char = c.charCodeAt(0);
    return char > 47 && char < 58;
}
const isident = (c: string): boolean => {
    const char = c.charCodeAt(0);
    return c === "_" 
        || char > 64 && char < 91 
        || char > 96 && char < 123;
}
const isspace = (c: string): boolean => 
    c === " " || c === "\n" || c === "\r" || c === "\t";
const ispunc = (c: string): boolean => 
    c === "(" || c === ")" 
        || c === "=" || c === ";" 
        || c === "{" || c === "}"
        || c === "*" || c === "+"
        || c === "," || c === "." || c === ":" 
    ;

const keywordSet = new Set([
    "and", "controls", "tension", "atleast", "curl", "if", "else", "while", "for",
    "do", "return", "break", "continue", "struct", "typedef", "new", "access", "import",
    "unravel", "from", "include", "quote", "static", "public", "private", "restricted",
    "this", "explicit", "operator",
]);
const iskeyword = (word: string): boolean => keywordSet.has(word);

// TODO: normalize token stream. 
// - merge parts into one. 
// - split by \n (will be necessary for highlighting current line in editor because we need to split editor into line divs)
// - maybe add Call "token" if Ident is followed by (.


function tokenizeAsy(s: string) {
    const eof = i => i > s.length-1;
    let i = 0;
    let line = 1;
    const tokens: Token[] = [];
    main: while (true) {
        if (eof(i)) break main;
        if (s[i] === "'") {
            let token: Token = {type: "String", value: ""};

            token.value += s[i];
            i++;
            while (!eof(i) && s[i] !== "'") {
                if (s[i] === '\\' && !eof(i + 1)) {
                    token.value += s[i];
                    i++;
                    if (!eof(i)) {
                        token.value += s[i];
                        i++;
                    }
                    continue;
                }
                token.value += s[i];
                i++;
            }
            if (!eof(i)) { 
                token.value += s[i];
                i++;
            }

            tokens.push(token);
        } else if (s[i] === '"') {
            let token: Token = {type: "String", value: ""};

            token.value += s[i];
            i++;
            while (!eof(i) && s[i] !== '"') {
                if (s[i] === '\\' && !eof(i + 1)) {
                    token.value += s[i];
                    i++;
                    if (!eof(i)) {
                        token.value += s[i];
                        i++;
                    }
                    continue;
                }
                token.value += s[i];
                i++;
            }
            if (!eof(i)) { 
                token.value += s[i];
                i++;
            }
            tokens.push(token);
        } else if (isident(s[i])) {
            let token: Token = {type: "Ident", value: ""};
            let first = true;
            while (!eof(i) && ((!first && isnum(s[i]) || isident(s[i])))) {
                first = false;
                token.value += s[i];
                i++;
            }
            if (iskeyword(token.value)) token.type = "Keyword";
            tokens.push(token);
        } else if (isnum(s[i])) {
            let token: Token= {type: "Number", value: ""};
            while (!eof(i) && isnum(s[i])) {
                token.value += s[i];
                i++;
            }
            tokens.push(token);
        } else if (ispunc(s[i])) {
            let token: Token = {type: "Punctuation", value: s[i]};
            i++;
            tokens.push(token);
        } else if (isspace(s[i])) {
            let token: Token = {type: "None", value: ""};
            while (!eof(i) && isspace(s[i])) {
                token.value += s[i];
                i++;
            }
            tokens.push(token);
        } else {
            // console.debug("parser: unhandled char:", s[i]);
            let token: Token = {type: "None", value: s[i]};
            tokens.push(token);
            i++;
        }
    }
    return tokens;
}

function tokenizeTex(s: string): Token[] {
    return [{type: "None", value: s}];
}

export function tokenize(s: string, lang: "asy" | "tex" = "asy"): Token[] {
    switch (lang) {
    case "asy": return tokenizeAsy(s);
    case "tex": return tokenizeTex(s);
    default: return [{type: "None", value: s}]
    }
}

// const test = `
//     int x_0 = 12;
//     import triangles;
//     string x = "quote:\"\""
//     if (x == 1) return "abcd";
// `;

// for (const token of lex(test)) 
//     console.log(token);

